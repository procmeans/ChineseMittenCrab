const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const path = require('node:path');

const { prepareRuntimeEvent, renderBotReply, readArg } = require('../tools/clawbot_bot');

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
