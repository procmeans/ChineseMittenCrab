const test = require('node:test');
const assert = require('node:assert/strict');

const { runClaudeExec } = require('../tools/lib/claude/exec_service');

test('runClaudeExec returns parsed stdout text', async () => {
  const calls = [];
  const deps = {
    execFile: async (bin, args, options) => {
      calls.push({ bin, args, options });
      return { stdout: 'hello\n', stderr: '' };
    },
  };

  const result = await runClaudeExec(deps, {
    accountName: 'default',
    baseDir: '/tmp/cmr',
    bin: 'claude',
    cwd: '/tmp/project',
    prompt: 'Say hello',
  });

  assert.equal(result.replyText, 'hello');
  assert.equal(result.raw, 'hello\n');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, 'claude');
  assert.equal(calls[0].options.cwd, '/tmp/project');
  assert.equal(calls[0].options.env.CLAUDE_HOME, '/tmp/cmr/claude/default');
});
