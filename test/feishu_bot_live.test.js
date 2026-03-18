const test = require('node:test');
const assert = require('node:assert/strict');

const { createBotRuntime } = require('../tools/feishu_ws_bot');
const { createTaskQueue } = require('../tools/lib/runtime/task_queue');
const { createRuntimeStatusStore } = require('../tools/lib/monitor/runtime_status_store');
const { createReplyGateway } = require('../tools/lib/platform/feishu/reply_gateway');
const { createDelayedWaitNotice } = require('../tools/lib/runtime/lightweight_wait_hint');
const { refreshFollowUpWindow } = require('../tools/lib/runtime/follow_up_window');
const { ensureChatState } = require('../tools/lib/runtime/thread_state');
const { prepareRuntimeEvent, renderBotReply } = require('../tools/feishu_ws_bot');

function createFixtureEvent(overrides = {}) {
  return {
    event: {
      message: {
        message_id: overrides.messageId || 'msg-200',
        chat_id: overrides.chatId || 'chat-10',
        chat_type: overrides.chatType || 'group',
        content: JSON.stringify({ text: overrides.text || 'test message' }),
      },
      sender: {
        sender_id: { open_id: overrides.senderId || 'user-10' },
      },
    },
  };
}

test('createBotRuntime processes event through full pipeline', async () => {
  const calls = [];
  const client = {
    replyText: async (messageId, text) => {
      calls.push({ method: 'replyText', messageId, text });
    },
    replyCard: async (messageId, card) => {
      calls.push({ method: 'replyCard', messageId, card });
    },
  };

  const runtime = createBotRuntime({
    prepareRuntimeEvent,
    renderBotReply,
    statusStore: createRuntimeStatusStore({ account: 'test' }),
    replyGateway: createReplyGateway(client),
    taskQueue: createTaskQueue(),
    followUpStates: new Map(),
    runClaudeExec: async () => ({
      replyText: '# Hello\nWorld',
      raw: '# Hello\nWorld',
      stderr: '',
    }),
    createDelayedWaitNotice,
    refreshFollowUpWindow,
    ensureChatState,
    claudeExecInput: {},
    setTimeout: (fn, ms) => 'timer',
    clearTimeout: () => {},
    waitHintDelayMs: 3000,
    waitHintMessage: 'Thinking...',
  });

  const event = createFixtureEvent();
  await runtime.onMessage(event);

  // Card reply should have been sent (markdown with # header triggers interactive mode)
  const cardCall = calls.find((c) => c.method === 'replyCard');
  assert.ok(cardCall);
  assert.equal(cardCall.messageId, 'msg-200');
});

test('createBotRuntime getStatus returns snapshot', () => {
  const statusStore = createRuntimeStatusStore({ account: 'test' });

  const runtime = createBotRuntime({
    statusStore,
    taskQueue: createTaskQueue(),
  });

  const snapshot = runtime.getStatus();
  assert.equal(snapshot.status, 'idle');
  assert.equal(snapshot.account, 'test');
});

test('createBotRuntime serializes same-scope events via taskQueue', async () => {
  const order = [];

  const runtime = createBotRuntime({
    prepareRuntimeEvent,
    renderBotReply,
    statusStore: createRuntimeStatusStore({ account: 'test' }),
    replyGateway: createReplyGateway(null),
    taskQueue: createTaskQueue(),
    followUpStates: new Map(),
    runClaudeExec: async () => {
      order.push('exec');
      return { replyText: 'ok', raw: 'ok', stderr: '' };
    },
    createDelayedWaitNotice,
    refreshFollowUpWindow,
    ensureChatState,
    claudeExecInput: {},
    setTimeout: (fn, ms) => 'timer',
    clearTimeout: () => {},
    waitHintDelayMs: 3000,
    waitHintMessage: 'Thinking...',
  });

  // Same chat+user → same taskKey → serialized
  const event1 = createFixtureEvent({ text: 'first' });
  const event2 = createFixtureEvent({ text: 'second' });

  await Promise.all([
    runtime.onMessage(event1),
    runtime.onMessage(event2),
  ]);

  assert.equal(order.length, 2);
});

test('shutdown prevents new messages from being processed', async () => {
  let execCount = 0;

  const runtime = createBotRuntime({
    prepareRuntimeEvent,
    renderBotReply,
    statusStore: createRuntimeStatusStore({ account: 'test' }),
    replyGateway: createReplyGateway(null),
    taskQueue: createTaskQueue(),
    followUpStates: new Map(),
    runClaudeExec: async () => {
      execCount++;
      return { replyText: 'ok', raw: 'ok', stderr: '' };
    },
    createDelayedWaitNotice,
    refreshFollowUpWindow,
    ensureChatState,
    claudeExecInput: {},
    setTimeout: (fn, ms) => 'timer',
    clearTimeout: () => {},
    waitHintDelayMs: 3000,
    waitHintMessage: 'Thinking...',
  });

  assert.equal(runtime.isShuttingDown, false);

  runtime.shutdown();
  assert.equal(runtime.isShuttingDown, true);

  await runtime.onMessage(createFixtureEvent({ text: 'ignored' }));
  assert.equal(execCount, 0);
});
