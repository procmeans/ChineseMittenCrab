async function handleIncomingMessage(deps, rawEvent) {
  const {
    prepareRuntimeEvent,
    renderBotReply,
    statusStore,
    replyGateway,
    runClaudeExec,
    refreshFollowUpWindow,
    ensureChatState,
    followUpStates,
    claudeExecInput,
    persistState,
  } = deps;

  const { isFollowUpWindowOpen } = require('./follow_up_window');
  const { appendHistory, clearHistory, getHistory } = require('./thread_state');

  let event;

  try {
    event = await prepareRuntimeEvent(rawEvent);
  } catch (err) {
    statusStore.markError({ error: String(err.message || err) });
    throw err;
  }

  const taskKey = event.taskKey;
  statusStore.markBusy({ taskKey });

  let replyMessageId = null;

  try {
    // Send progress card so user sees feedback and we can update it while Claude runs
    try {
      const sent = await replyGateway.sendCardReply(event.messageId, buildProgressCard(0));
      replyMessageId = sent && sent.replyMessageId;
    } catch (_) {
      // best-effort: continue without progress card if it fails
    }
    const chatState = ensureChatState(followUpStates, taskKey);
    const windowOpen = isFollowUpWindowOpen(chatState);

    if (!windowOpen) {
      clearHistory(chatState);
    }

    const currentPrompt = buildPromptFromEvent(event);
    const history = getHistory(chatState);
    const prompt = history.length > 0
      ? buildPromptWithHistory(history, currentPrompt)
      : currentPrompt;

    // Create a per-message output directory so Claude writes files to an isolated location
    const fs = require('node:fs');
    const path = require('node:path');
    const outputDir = path.join('/tmp', 'cmr-out', event.messageId);
    try { fs.mkdirSync(outputDir, { recursive: true }); } catch (_) {}

    // Streaming progress: update the card every 4s as Claude produces output
    let accumulated = '';
    let lastCardUpdate = 0;
    const onChunk = (chunk) => {
      accumulated += chunk;
      const now = Date.now();
      if (replyMessageId && now - lastCardUpdate > 4000) {
        lastCardUpdate = now;
        replyGateway.patchCardReply(replyMessageId, buildProgressCard(accumulated.length)).catch(() => {});
      }
    };

    const result = await runClaudeExec(
      deps.claudeExecDeps || {},
      { ...claudeExecInput, prompt, outputDir, onChunk }
    );

    // Collect files Claude wrote to the output directory
    const SKIP_EXTS = new Set(['.lock', '.tmp', '.pid', '.sock', '.log']);
    const newTmpFiles = [];
    try {
      fs.readdirSync(outputDir).forEach(f => {
        const ext = path.extname(f).toLowerCase();
        if (SKIP_EXTS.has(ext) || f.startsWith('.')) return;
        newTmpFiles.push(path.join(outputDir, f));
      });
    } catch (_) {}

    // Final reply: patch the progress card in-place with the real answer
    const botReply = renderBotReply(result.replyText);
    const finalCard = botReply && botReply.card;
    const directiveFilePaths = (botReply && botReply.filePaths) || [];

    if (replyMessageId && finalCard) {
      await replyGateway.patchCardReply(replyMessageId, finalCard).catch(() =>
        replyGateway.sendReply(event.messageId, finalCard)
      );
    } else {
      await replyGateway.sendReply(event.messageId, finalCard || botReply);
    }

    // Send files: directive-specified + files Claude wrote to outputDir
    const allFilePaths = [...new Set([...directiveFilePaths, ...newTmpFiles])];
    for (const fp of allFilePaths) {
      if (typeof replyGateway.sendFileReply === 'function') {
        await replyGateway.sendFileReply(event.messageId, fp).catch(() => {});
      }
    }

    // Clean up the per-message output directory after sending
    try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch (_) {}

    appendHistory(chatState, currentPrompt, result.replyText);
    refreshFollowUpWindow(chatState);
    if (typeof persistState === 'function') persistState();

    statusStore.markIdle({ taskKey });

    return { event, result };
  } catch (err) {
    statusStore.markError({ taskKey, error: String(err.message || err) });
    const errMsg = `⚠️ ${err.message || err}`;
    try {
      if (replyMessageId) {
        await replyGateway.patchCardReply(replyMessageId, buildProgressCard(0, errMsg)).catch(() => {});
      } else {
        await replyGateway.sendTextReply(event.messageId, errMsg).catch(() => {});
      }
    } catch (_) {}
  }
}

function buildProgressCard(charCount, errorMsg) {
  const content = errorMsg
    ? errorMsg
    : charCount > 0
      ? `⏳ 处理中... 已生成 ${charCount} 字`
      : '⏳ 处理中...';
  return {
    config: { wide_screen_mode: true },
    elements: [{ tag: 'div', text: { tag: 'lark_md', content } }],
  };
}

function buildPromptFromEvent(event) {
  const parts = [];

  if (event.quotedText) {
    parts.push(`[Quoted message]: ${event.quotedText}`);
  }

  if (event.text) {
    parts.push(event.text);
  }

  for (const file of event.files || []) {
    parts.push(`[Attachment: ${file.filePath}]`);
  }

  return parts.join('\n');
}

function buildPromptWithHistory(history, currentPrompt) {
  const lines = ['[对话历史:]'];

  for (const turn of history) {
    lines.push(`用户: ${turn.user}`);
    lines.push(`助手: ${turn.assistant}`);
  }

  lines.push('');
  lines.push('[当前消息:]');
  lines.push(currentPrompt);

  return lines.join('\n');
}

module.exports = {
  handleIncomingMessage,
  buildPromptFromEvent,
  buildPromptWithHistory,
};
