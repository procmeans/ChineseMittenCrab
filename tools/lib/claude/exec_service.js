const childProcess = require('node:child_process');
const util = require('node:util');

const { resolveClaudeHome } = require('./claude_home');
const { buildClaudePrompt } = require('./prompt_builder');

async function runClaudeExec(deps = {}, input = {}) {
  const execFile = deps.execFile || util.promisify(childProcess.execFile);
  const prompt = buildClaudePrompt(input);
  const claudeHome = resolveClaudeHome(input);
  const bin = input.bin || 'claude';
  const args = ['--print', prompt];

  if (input.model) {
    args.unshift(input.model);
    args.unshift('--model');
  }

  const result = await execFile(bin, args, {
    cwd: input.cwd,
    env: {
      ...process.env,
      CLAUDE_HOME: claudeHome,
    },
  });

  return {
    replyText: String(result.stdout || '').trim(),
    raw: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

module.exports = {
  runClaudeExec,
};
