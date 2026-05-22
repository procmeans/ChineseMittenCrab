const childProcess = require('node:child_process');

const { resolveClaudeHome } = require('./claude_home');
const { buildClaudePrompt } = require('./prompt_builder');

function spawnClaude(bin, args, options) {
  const { onChunk, timeoutMs, ...spawnOptions } = options;

  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn(bin, args, {
      ...spawnOptions,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          proc.kill('SIGKILL');
          reject(new Error(`claude --print timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs)
      : null;

    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (onChunk) onChunk(chunk.toString());
    });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

async function runClaudeExec(deps = {}, input = {}) {
  const spawn = deps.spawn || spawnClaude;
  const prompt = buildClaudePrompt(input);
  const claudeHome = resolveClaudeHome(input);
  const bin = input.bin || 'claude';
  const fs = require('node:fs');
  const path = require('node:path');

  const args = [];

  if (input.model) {
    args.push('--model', input.model);
  }

  // Load system prompt from CLAUDE_HOME/.claude/CLAUDE.md if it exists
  const claudeMdPath = path.join(claudeHome, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    args.push('--system-prompt', fs.readFileSync(claudeMdPath, 'utf8').trim());
  }

  // Per-message output directory — Claude is told to write files here
  if (input.outputDir) {
    args.push('--append-system-prompt', `如果需要生成文件，将所有文件写入 ${input.outputDir}/ 目录（不要写到其他位置）。`);
  }

  args.push('--dangerously-skip-permissions', '--print', prompt);

  const result = await spawn(bin, args, {
    cwd: input.cwd,
    env: {
      ...process.env,
      CLAUDE_HOME: claudeHome,
    },
    onChunk: input.onChunk,
    timeoutMs: input.timeoutMs,
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
