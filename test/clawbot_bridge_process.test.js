const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createClawbotBridgeProcess } = require('../tools/lib/platform/clawbot/bridge_process');

test('bridge process emits parsed JSONL events from stdout', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {} };

  const bridge = createClawbotBridgeProcess({
    spawnFn: () => child,
    pythonBin: 'python3',
    bridgePath: 'bridge.py',
    account: 'default',
  });

  const seen = new Promise((resolve) => bridge.once('message', resolve));
  child.stdout.emit('data', Buffer.from('{"type":"message","message_id":"m1"}\n'));

  assert.deepEqual(await seen, { type: 'message', message_id: 'm1' });
});

test('bridge process serializes send_text commands as JSONL', async () => {
  const writes = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write(chunk) { writes.push(chunk); } };

  const bridge = createClawbotBridgeProcess({
    spawnFn: () => child,
    pythonBin: 'python3',
    bridgePath: 'bridge.py',
    account: 'default',
  });

  await bridge.sendText({ accountId: 'acct_1', userId: 'user_1', text: 'hello' });

  assert.equal(writes.length, 1);
  const command = JSON.parse(writes[0]);
  assert.equal(command.type, 'send_text');
  assert.equal(command.account_id, 'acct_1');
  assert.equal(command.user_id, 'user_1');
  assert.equal(command.text, 'hello');
  assert.match(command.request_id, /^req_/);
});
