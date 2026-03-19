const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const path = require('node:path');

const toolPath = path.join(process.cwd(), 'tools/feishu_ws_bot.js');

test('dry-run outputs FEISHU_WS_DRY_RUN with check results', async () => {
  const result = childProcess.spawnSync(process.execPath, [
    toolPath, '--account', 'default', '--dry-run',
  ], { encoding: 'utf8', timeout: 10000 });

  assert.match(result.stdout, /FEISHU_WS_DRY_RUN account=default/);
  // Should report feishu, config, and claude status
  assert.match(result.stdout, /feishu=/);
  assert.match(result.stdout, /config=/);
  assert.match(result.stdout, /claude=/);
});

test('dry-run exits non-zero when a check fails', async () => {
  // Use a nonexistent account so config=MISSING
  const result = childProcess.spawnSync(process.execPath, [
    toolPath, '--account', 'nonexistent_account_xyz', '--dry-run',
  ], { encoding: 'utf8', timeout: 10000 });

  assert.match(result.stdout, /FEISHU_WS_DRY_RUN account=nonexistent_account_xyz/);
  assert.match(result.stdout, /config=MISSING/);
  assert.equal(result.status, 1);
});
