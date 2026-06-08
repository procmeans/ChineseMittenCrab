const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const path = require('node:path');

const { handleIncomingMessage } = require('../tools/lib/runtime/message_handler');
const { prepareRuntimeEvent, renderBotReply, readArg, parseEngineCommand, createBotRuntime, resolveClawbotEngine } = require('../tools/clawbot_bot');
const { createTaskQueue } = require('../tools/lib/runtime/task_queue');
const { createRuntimeStatusStore } = require('../tools/lib/monitor/runtime_status_store');
const { ensureChatState } = require('../tools/lib/runtime/thread_state');
const { normalizeIncomingClawbotEvent } = require('../tools/lib/platform/clawbot/event_projection');

test('clawbot readArg returns fallback when arg is missing', () => {
  const original = process.argv;
  process.argv = ['node', 'tools/clawbot_bot.js'];
  try {
    assert.equal(readArg('--account', 'default'), 'default');
  } finally {
    process.argv = original;
  }
});

test('clawbot prepareRuntimeEvent normalizes bridge message', () => {
  const event = prepareRuntimeEvent({
    account_id: 'acct_1',
    user_id: 'user_1',
    message_id: 'msg_1',
    text: '你好',
    timestamp: 1710000000,
  });

  assert.equal(event.taskKey, 'acct_1::user_1');
  assert.equal(event.messageId, 'msg_1');
  assert.equal(event.senderId, 'user_1');
  assert.equal(event.text, '你好');
  assert.deepEqual(event.files, []);
});

test('clawbot renderBotReply extracts file directives', () => {
  const rendered = renderBotReply('回复\n[SEND_FILE:/tmp/a.txt]');
  assert.equal(rendered.mode, 'text');
  assert.equal(rendered.text, '回复');
  assert.deepEqual(rendered.filePaths, ['/tmp/a.txt']);
});

test('clawbot parses shorthand engine commands', () => {
  assert.deepEqual(parseEngineCommand('/codex'), { type: 'set_engine', engineName: 'codex' });
  assert.deepEqual(parseEngineCommand('/claude'), { type: 'set_engine', engineName: 'claude' });
  assert.deepEqual(parseEngineCommand('/engine'), { type: 'query_engine' });
  assert.deepEqual(parseEngineCommand('/engine codex'), { type: 'set_engine', engineName: 'codex' });
});

test('clawbot engine selection prefers per-user choice over default', () => {
  const selected = resolveClawbotEngine({
    engine: 'claude',
    accountName: 'default',
    codex: { bin: 'codex', cwd: '/tmp/codex', model: 'o3' },
  }, { engineName: 'codex' });

  assert.equal(selected.engineName, 'codex');
  assert.equal(selected.execInput.bin, 'codex');
  assert.equal(selected.execInput.model, 'o3');
});

test('clawbot /codex switches current user and next message uses codex', async () => {
  const calls = [];
  const followUpStates = new Map();
  const statusStore = createRuntimeStatusStore({ account: 'test' });
  const taskQueue = createTaskQueue();

  const runtime = createBotRuntime({
    taskQueue,
    statusStore,
    bridge: {
      sendTyping: async () => {},
    },
    routingMap: new Map(),
    prepareRuntimeEvent: async (raw) => ({
      ...normalizeIncomingClawbotEvent(raw),
      files: [],
    }),
    renderBotReply: () => ({ mode: 'text', text: 'done', filePaths: [], card: { ok: true } }),
    replyGateway: {
      sendCardReply: async () => ({ replyMessageId: 'reply-1' }),
      patchCardReply: async () => {},
      sendReply: async () => {},
      sendTextReply: async (_messageId, text) => {
        calls.push({ method: 'sendTextReply', text });
      },
      sendFileReply: async () => {},
    },
    runExec: async (_deps, input) => {
      calls.push({ method: 'runExec', bin: input.bin, model: input.model });
      return { replyText: 'done', raw: 'done', stderr: '' };
    },
    followUpStates,
    refreshFollowUpWindow: () => {},
    ensureChatState,
    execInput: { bin: 'claude', model: 'sonnet' },
    followUpTtlMs: 24 * 60 * 60 * 1000,
    persistState: () => {},
    selectEngineForChatState: ({ chatState }) => resolveClawbotEngine({
      engine: 'claude',
      accountName: 'default',
      codex: { bin: 'codex', cwd: '/tmp/codex', model: 'o3' },
    }, chatState),
    defaultEngineName: 'claude',
  });

  runtime.onMessage({
    account_id: 'acct-1',
    user_id: 'user-1',
    message_id: 'msg-switch',
    text: '/codex',
    timestamp: Date.now(),
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(calls, [{ method: 'sendTextReply', text: '已切换到 codex' }]);
  const chatState = followUpStates.get('acct-1::user-1');
  assert.equal(chatState.engineName, 'codex');
});

test('clawbot selected engine drives message execution', async () => {
  const calls = [];
  const followUpStates = new Map();
  const chatState = ensureChatState(followUpStates, 'acct-1::user-1');
  chatState.engineName = 'codex';

  await handleIncomingMessage({
    followUpStates,
    statusStore: createRuntimeStatusStore({ account: 'test' }),
    prepareRuntimeEvent: async (raw) => ({
      ...normalizeIncomingClawbotEvent(raw),
      files: [],
    }),
    renderBotReply: () => ({ mode: 'text', text: 'done', filePaths: [], card: { ok: true } }),
    replyGateway: {
      sendCardReply: async () => ({ replyMessageId: 'reply-1' }),
      patchCardReply: async () => {},
      sendReply: async () => {},
      sendTextReply: async () => {},
      sendFileReply: async () => {},
    },
    refreshFollowUpWindow: () => {},
    ensureChatState,
    execInput: { bin: 'claude', model: 'sonnet' },
    followUpTtlMs: 24 * 60 * 60 * 1000,
    persistState: () => {},
    selectEngineForChatState: () => ({
      runExec: async (_deps, input) => {
        calls.push({ method: 'runExec', bin: input.bin, model: input.model });
        return { replyText: 'done', raw: 'done', stderr: '' };
      },
      execInput: { bin: 'codex', model: 'o3' },
    }),
  }, {
    account_id: 'acct-1',
    user_id: 'user-1',
    message_id: 'msg-next',
    text: '继续帮我处理',
    timestamp: Date.now(),
  });

  assert.ok(calls.find((call) => call.method === 'runExec'));
  assert.equal(calls.find((call) => call.method === 'runExec').bin, 'codex');
});

test('clawbot dry-run reports config and python checks', () => {
  const toolPath = path.join(process.cwd(), 'tools/clawbot_bot.js');
  const result = childProcess.spawnSync(process.execPath, [
    toolPath, '--account', 'default', '--dry-run',
  ], { encoding: 'utf8', timeout: 10000 });

  assert.match(result.stdout, /CLAWBOT_DRY_RUN account=default/);
  assert.match(result.stdout, /config=/);
  assert.match(result.stdout, /python=/);
  assert.match(result.stdout, /sdk=/);
  assert.match(result.stdout, /engine=/);
});
