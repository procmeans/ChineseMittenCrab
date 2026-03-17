const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const util = require('node:util');
const path = require('node:path');

const execFile = util.promisify(childProcess.execFile);

test('launchagent installer renders a plist for an account', async () => {
  const scriptPath = path.join(process.cwd(), 'tools/install_feishu_launchagents.sh');
  const { stdout } = await execFile('bash', [scriptPath, 'install', 'default']);

  assert.match(stdout, /plist/);
  assert.match(stdout, /ChineseMittenCrab.default/);
});
