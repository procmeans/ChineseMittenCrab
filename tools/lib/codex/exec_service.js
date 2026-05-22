const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveCodexHome, bootstrapCodexHomeAuth } = require('./codex_home');
const { buildCodexPrompt } = require('./prompt_builder');

function compactText(raw, maxLength = 1200) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...(已截断)`;
}

function shouldBypassCodexSandbox(sandbox, approvalPolicy) {
  return String(sandbox || '').trim() === 'danger-full-access'
    && String(approvalPolicy || '').trim() === 'never';
}

function spawnCodex(bin, args, options) {
  const { onChunk, timeoutMs, prompt, ...spawnOptions } = options;

  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn(bin, args, {
      ...spawnOptions,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          proc.kill('SIGKILL');
          reject(new Error(`codex exec timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs)
      : null;

    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (onChunk) onChunk(chunk.toString());
    });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code, signal });
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(err);
    });

    proc.stdin.write(prompt || '');
    proc.stdin.end();
  });
}

async function runCodexExec(deps = {}, input = {}) {
  const spawn = deps.spawn || spawnCodex;
  const prompt = buildCodexPrompt(input);
  const codexHome = resolveCodexHome(input);
  const bin = input.bin || 'codex';

  // Prepare CODEX_HOME and bootstrap auth from the shared ~/.codex login (best-effort)
  try {
    fs.mkdirSync(codexHome, { recursive: true });
    bootstrapCodexHomeAuth({ codexHome, refreshExistingAuth: true });
  } catch (_) {
    // best-effort: continue without bootstrap if it fails
  }

  // Write final reply to a temp file (codex --output-last-message); used as the canonical reply text
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmr-codex-'));
  const outputFile = path.join(tempDir, 'last-message.txt');

  const sandbox = input.sandbox || 'danger-full-access';
  const approvalPolicy = input.approvalPolicy || 'never';
  const bypassSandbox = shouldBypassCodexSandbox(sandbox, approvalPolicy);

  const args = ['exec', '--skip-git-repo-check', '--json'];
  if (bypassSandbox) args.push('--dangerously-bypass-approvals-and-sandbox');
  if (input.model) args.push('-m', input.model);
  if (input.reasoningEffort) args.push('-c', `model_reasoning_effort="${input.reasoningEffort}"`);
  if (input.profile) args.push('-p', input.profile);
  if (input.cwd) args.push('-C', input.cwd);
  for (const dir of input.addDirs || []) {
    if (!String(dir || '').trim()) continue;
    args.push('--add-dir', dir);
  }
  if (sandbox && !bypassSandbox) args.push('-s', sandbox);
  if (approvalPolicy && !bypassSandbox) args.push('-c', `approval_policy="${approvalPolicy}"`);
  for (const imagePath of input.imagePaths || []) {
    if (!String(imagePath || '').trim()) continue;
    args.push('-i', imagePath);
  }
  args.push('--output-last-message', outputFile);
  args.push('-');

  const childEnv = { ...process.env, CODEX_HOME: codexHome };
  const resolvedApiKey = String(input.apiKey || '').trim();
  if (resolvedApiKey) {
    childEnv.OPENAI_API_KEY = resolvedApiKey;
    childEnv.CODEX_API_KEY = resolvedApiKey;
  }

  let result;
  try {
    // codex --json's stdout is JSON event noise (thread.started, reasoning frames, etc.), not the
    // user-visible reply (which lands in --output-last-message). Forwarding it to onChunk would
    // make the progress card show misleading "已生成 X 字" counts that don't match the final reply.
    // Skip onChunk for codex — the progress card stays at "⏳ 处理中..." until the final reply
    // replaces it, matching claude's user-perceived simplicity.
    result = await spawn(bin, args, {
      cwd: input.cwd,
      env: childEnv,
      timeoutMs: input.timeoutMs,
      prompt,
    });
  } catch (err) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    throw err;
  }

  if (result.code !== 0) {
    const details = compactText(result.stderr || result.stdout || `exit=${result.code}`);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    throw new Error(`codex exec failed: ${details}`);
  }

  let replyText = '';
  try {
    replyText = fs.readFileSync(outputFile, 'utf8');
  } catch (_) {
    // Fall back to stdout if codex didn't write the output file (unusual but safe)
    replyText = String(result.stdout || '');
  }
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

  return {
    replyText: String(replyText || '').trim(),
    raw: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

module.exports = {
  runCodexExec,
  shouldBypassCodexSandbox,
};
