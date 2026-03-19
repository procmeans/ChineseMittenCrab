const test = require('node:test');
const assert = require('node:assert/strict');

const { handleIncomingMessage, buildPromptFromEvent } = require('../tools/lib/runtime/message_handler');
const { createBotRuntime } = require('../tools/feishu_ws_bot');
const { createTaskQueue } = require('../tools/lib/runtime/task_queue');
const { createRuntimeStatusStore } = require('../tools/lib/monitor/runtime_status_store');

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
        return { replyMessageId: 'reply-msg-1' };
      },
      patchTextReply: async (replyMessageId, text) => {
        calls.push({ method: 'patchTextReply', replyMessageId, text });
      },
      sendCardReply: async (messageId, card) => {
        calls.push({ method: 'sendCardReply', messageId, card });
        return { replyMessageId: 'reply-msg-1' };
      },
      patchCardReply: async (replyMessageId, card) => {
        calls.push({ method: 'patchCardReply', replyMessageId, card });
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
    refreshFollowUpWindow,
    ensureChatState,
    claudeExecInput: overrides.claudeExecInput || {},
  };
}

test('happy path: event → Claude → reply sent, status idle→busy→idle', async () => {
  const deps = createStubDeps();
  const event = createFixtureEvent();

  const result = await handleIncomingMessage(deps, event);

  assert.equal(result.event.text, 'hello Claude');
  assert.equal(result.result.replyText, 'Claude says hi');
  assert.equal(deps.statusStore.getSnapshot().status, 'idle');

  // Initial progress card sent immediately
  const initialReply = deps.calls.find((c) => c.method === 'sendCardReply');
  assert.ok(initialReply);
  assert.equal(initialReply.messageId, 'msg-100');

  // Final response patches the progress card in-place
  const finalPatch = deps.calls.find((c) => c.method === 'patchCardReply');
  assert.ok(finalPatch);
});

test('Claude error: error reply sent, status → error', async () => {
  const deps = createStubDeps({
    runClaudeExec: async () => {
      throw new Error('claude crashed');
    },
  });
  const event = createFixtureEvent();

  await handleIncomingMessage(deps, event);

  assert.equal(deps.statusStore.getSnapshot().status, 'error');

  const errorReply = deps.calls.find(
    (c) => (c.method === 'patchCardReply' || c.method === 'sendTextReply') &&
      JSON.stringify(c).includes('claude crashed')
  );
  assert.ok(errorReply);
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

test('quoted text is prepended to prompt', () => {
  const event = {
    text: 'what does this mean?',
    quotedText: 'the original message content',
    files: [],
  };

  const prompt = buildPromptFromEvent(event);
  assert.ok(prompt.startsWith('[Quoted message]: the original message content'));
  assert.ok(prompt.includes('what does this mean?'));
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

test('onMessage returns immediately without waiting for task to complete', async () => {
  let taskStarted = false;
  let taskResolve;
  const taskPromise = new Promise((resolve) => { taskResolve = resolve; });

  const taskQueue = createTaskQueue();
  const statusStore = createRuntimeStatusStore({ account: 'test' });

  const runtime = createBotRuntime({
    taskQueue,
    statusStore,
    prepareRuntimeEvent: async (raw) => {
      const { normalizeIncomingFeishuEvent } = require('../tools/lib/platform/feishu/event_projection');
      const normalized = normalizeIncomingFeishuEvent(raw);
      return { ...normalized, files: [] };
    },
    renderBotReply: () => ({ card: {}, filePaths: [] }),
    replyGateway: {
      sendCardReply: async () => ({ replyMessageId: 'r1' }),
      patchCardReply: async () => {},
      sendReply: async () => {},
    },
    runClaudeExec: async () => {
      taskStarted = true;
      await taskPromise;
      return { replyText: 'done', raw: 'done', stderr: '' };
    },
    followUpStates: new Map(),
    refreshFollowUpWindow: () => {},
    ensureChatState: () => ({ history: [] }),
    claudeExecInput: {},
    persistState: () => {},
  });

  const event = createFixtureEvent();
  // onMessage should return synchronously (fire-and-forget)
  const result = runtime.onMessage(event);
  assert.equal(result, undefined, 'onMessage should return undefined (not a promise)');

  // Give the microtask queue a tick for the enqueue to start
  await new Promise((r) => setTimeout(r, 50));

  // The task should have started but not completed
  assert.ok(taskStarted, 'task should have started');

  // Clean up: resolve the pending task
  taskResolve();
});
