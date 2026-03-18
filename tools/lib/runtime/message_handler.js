async function handleIncomingMessage(deps, rawEvent) {
  const {
    prepareRuntimeEvent,
    renderBotReply,
    statusStore,
    replyGateway,
    runClaudeExec,
    createDelayedWaitNotice,
    refreshFollowUpWindow,
    ensureChatState,
    followUpStates,
    claudeExecInput,
  } = deps;

  let event;

  try {
    event = await prepareRuntimeEvent(rawEvent);
  } catch (err) {
    statusStore.markError({ error: String(err.message || err) });
    throw err;
  }

  const taskKey = event.taskKey;
  statusStore.markBusy({ taskKey });

  const notice = createDelayedWaitNotice(
    {
      setTimeout: deps.setTimeout || setTimeout,
      clearTimeout: deps.clearTimeout || clearTimeout,
      sendNotice: async (payload) => {
        await replyGateway.sendTextReply(event.messageId, payload.message);
      },
    },
    {
      delayMs: deps.waitHintDelayMs || 3000,
      message: deps.waitHintMessage || 'Thinking...',
    }
  );

  try {
    const prompt = buildPromptFromEvent(event);
    const result = await runClaudeExec(
      deps.claudeExecDeps || {},
      { ...claudeExecInput, prompt }
    );

    notice.dismiss();

    const rendered = renderBotReply(result.replyText);
    await replyGateway.sendReply(event.messageId, rendered);

    const chatState = ensureChatState(followUpStates, taskKey);
    refreshFollowUpWindow(chatState);

    statusStore.markIdle({ taskKey });

    return { event, result, rendered };
  } catch (err) {
    notice.dismiss();
    statusStore.markError({ taskKey, error: String(err.message || err) });

    try {
      await replyGateway.sendTextReply(
        event.messageId,
        `Error: ${err.message || err}`
      );
    } catch (_) {
      // best-effort error reply
    }

    throw err;
  }
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

module.exports = {
  handleIncomingMessage,
  buildPromptFromEvent,
};
