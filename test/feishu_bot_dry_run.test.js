const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const util = require('node:util');
const path = require('node:path');

const execFile = util.promisify(childProcess.execFile);

test('feishu bot dry-run reports Claude and Feishu readiness', async () => {
  const toolPath = path.join(process.cwd(), 'tools/feishu_ws_bot.js');
  const { stdout } = await execFile(process.execPath, [
    toolPath,
    '--account',
    'default',
    '--dry-run',
  ]);

  assert.match(stdout, /FEISHU_WS_DRY_RUN/);
});
