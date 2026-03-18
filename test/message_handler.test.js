const test = require('node:test');
const assert = require('node:assert/strict');

const { handleIncomingMessage, buildPromptFromEvent } = require('../tools/lib/runtime/message_handler');

function createFixtureEvent(overrides = {}) {
  return {
    event: {
      message: {
        message_id: overrides.messageId || 'msg-100',
        chat_id: overrides.chatId || 'chat-1',
        chat_type: overrides.chatType || 'group',
        content: JSON.stringify({ text: overrides.text || 'hello Claude' }),
      },
      sender: {
        sender_id: { open_id: overrides.senderId || 'user-1' },
      },
    },
  };
}

function createStubDeps(overrides = {}) {
  const calls = [];
  const { normalizeIncomingFeishuEvent } = require('../tools/lib/platform/feishu/event_projection');
  const { applyReplyDirectives } = require('../tools/lib/platform/feishu/reply_directives');
  const { renderFeishuReply } = require('../tools/lib/platform/feishu/reply_rendering');
  const { createRuntimeStatusStore } = require('../tools/lib/monitor/runtime_status_store');
  const { createDelayedWaitNotice } = require('../tools/lib/runtime/lightweight_wait_hint');
  const { refreshFollowUpWindow } = require('../tools/lib/runtime/follow_up_window');
  const { ensureChatState } = require('../tools/lib/runtime/thread_state');

  const statusStore = createRuntimeStatusStore({ account: 'test' });

  return {
    calls,
    statusStore,
    followUpStates: new Map(),
    prepareRuntimeEvent: overrides.prepareRuntimeEvent || (async (raw) => {
      const normalized = normalizeIncomingFeishuEvent(raw);
      return { ...normalized, files: [] };
    }),
    renderBotReply: overrides.renderBotReply || ((text) => {
      return renderFeishuReply(applyReplyDirectives(text));
    }),
    replyGateway: overrides.replyGateway || {
      sendTextReply: async (messageId, text) => {
        calls.push({ method: 'sendTextReply', messageId, text });
      },
      sendCardReply: async (messageId, card) => {
        calls.push({ method: 'sendCardReply', messageId, card });
      },
      sendReply: async (messageId, rendered) => {
        calls.push({ method: 'sendReply', messageId, rendered });
      },
    },
    runClaudeExec: overrides.runClaudeExec || (async () => ({
      replyText: 'Claude says hi',
      raw: 'Claude says hi',
      stderr: '',
    })),
    createDelayedWaitNotice,
    refreshFollowUpWindow,
    ensureChatState,
    claudeExecInput: overrides.claudeExecInput || {},
    setTimeout: (fn, ms) => {
      calls.push({ method: 'setTimeout', ms });
      return 'timer-1';
    },
    clearTimeout: () => {
      calls.push({ method: 'clearTimeout' });
    },
    waitHintDelayMs: 3000,
    waitHintMessage: 'Thinking...',
  };
}

test('happy path: event → Claude → reply sent, status idle→busy→idle', async () => {
  const deps = createStubDeps();
  const event = createFixtureEvent();

  const result = await handleIncomingMessage(deps, event);

  assert.equal(result.event.text, 'hello Claude');
  assert.equal(result.result.replyText, 'Claude says hi');
  assert.equal(deps.statusStore.getSnapshot().status, 'idle');

  const sendReplyCall = deps.calls.find((c) => c.method === 'sendReply');
  assert.ok(sendReplyCall);
  assert.equal(sendReplyCall.messageId, 'msg-100');
});

test('Claude error: error reply sent, status → error', async () => {
  const deps = createStubDeps({
    runClaudeExec: async () => {
      throw new Error('claude crashed');
    },
  });
  const event = createFixtureEvent();

  await assert.rejects(
    () => handleIncomingMessage(deps, event),
    { message: 'claude crashed' }
  );

  assert.equal(deps.statusStore.getSnapshot().status, 'error');

  const errorReply = deps.calls.find(
    (c) => c.method === 'sendTextReply' && c.text.includes('claude crashed')
  );
  assert.ok(errorReply);
});

test('wait hint is scheduled with configured delay', async () => {
  const deps = createStubDeps();
  const event = createFixtureEvent();

  await handleIncomingMessage(deps, event);

  const timerCall = deps.calls.find((c) => c.method === 'setTimeout');
  assert.ok(timerCall);
  assert.equal(timerCall.ms, 3000);
});

test('wait hint is dismissed when Claude responds', async () => {
  const deps = createStubDeps();
  const event = createFixtureEvent();

  await handleIncomingMessage(deps, event);

  const clearCall = deps.calls.find((c) => c.method === 'clearTimeout');
  assert.ok(clearCall);
});

test('with attachments: file paths included in prompt', () => {
  const event = {
    text: 'analyze this',
    files: [{ filePath: '/tmp/image.png', fileName: 'image.png' }],
  };

  const prompt = buildPromptFromEvent(event);
  assert.ok(prompt.includes('analyze this'));
  assert.ok(prompt.includes('[Attachment: /tmp/image.png]'));
});

test('follow-up window is refreshed after reply', async () => {
  const deps = createStubDeps();
  const event = createFixtureEvent();

  await handleIncomingMessage(deps, event);

  const taskKey = 'chat-1::user-1';
  const chatState = deps.followUpStates.get(taskKey);
  assert.ok(chatState);
  assert.ok(chatState.expiresAt > Date.now());
});
