const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runCodexExec, shouldBypassCodexSandbox } = require('../tools/lib/codex/exec_service');

function createBaseDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cmr-codex-test-'));
}

test('runCodexExec returns parsed reply from --output-last-message file', async () => {
  const baseDir = createBaseDir();
  const calls = [];
  const deps = {
    spawn: async (bin, args, options) => {
      calls.push({ bin, args, options });
      // Simulate codex writing its final message to the --output-last-message path
      const outputIdx = args.indexOf('--output-last-message');
      const outputPath = args[outputIdx + 1];
      fs.writeFileSync(outputPath, 'hello from codex', 'utf8');
      return { stdout: '{"type":"thread.started","thread_id":"t1"}\n', stderr: '', code: 0 };
    },
  };

  const result = await runCodexExec(deps, {
    accountName: 'default',
    baseDir,
    bin: 'codex',
    cwd: '/tmp/project',
    prompt: 'Say hello',
  });

  assert.equal(result.replyText, 'hello from codex');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, 'codex');
  assert.equal(calls[0].options.cwd, '/tmp/project');
  assert.equal(calls[0].options.env.CODEX_HOME, path.join(baseDir, 'codex', 'default'));
  assert.ok(calls[0].args.includes('exec'));
  assert.ok(calls[0].args.includes('--skip-git-repo-check'));
  assert.ok(calls[0].args.includes('--output-last-message'));

  fs.rmSync(baseDir, { recursive: true, force: true });
});

test('runCodexExec passes engine knobs (model, sandbox, approval, add-dirs) through to args', async () => {
  const baseDir = createBaseDir();
  let captured;
  const deps = {
    spawn: async (bin, args, options) => {
      captured = { bin, args, options };
      const outputIdx = args.indexOf('--output-last-message');
      fs.writeFileSync(args[outputIdx + 1], 'ok', 'utf8');
      return { stdout: '', stderr: '', code: 0 };
    },
  };

  await runCodexExec(deps, {
    accountName: 'default',
    baseDir,
    cwd: '/tmp/project',
    prompt: 'go',
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
    profile: 'fast',
    sandbox: 'workspace-write',
    approvalPolicy: 'on-failure',
    addDirs: ['/tmp/extra', ''],
  });

  // Spot-check that flags landed
  const argsStr = captured.args.join(' ');
  assert.ok(argsStr.includes('-m gpt-5.4'));
  assert.ok(argsStr.includes('-s workspace-write'));
  assert.ok(argsStr.includes('-p fast'));
  assert.ok(argsStr.includes('--add-dir /tmp/extra'));
  // Empty addDirs entries are skipped
  assert.equal((captured.args.filter(a => a === '--add-dir')).length, 1);
  // reasoning_effort + approval_policy are config overrides
  assert.ok(captured.args.some(a => a.includes('model_reasoning_effort=')));
  assert.ok(captured.args.some(a => a.includes('approval_policy=')));

  fs.rmSync(baseDir, { recursive: true, force: true });
});

test('runCodexExec uses --dangerously-bypass when sandbox=danger-full-access + approval=never', async () => {
  const baseDir = createBaseDir();
  let captured;
  const deps = {
    spawn: async (bin, args, options) => {
      captured = { bin, args, options };
      const outputIdx = args.indexOf('--output-last-message');
      fs.writeFileSync(args[outputIdx + 1], 'ok', 'utf8');
      return { stdout: '', stderr: '', code: 0 };
    },
  };

  await runCodexExec(deps, {
    accountName: 'default',
    baseDir,
    prompt: 'go',
    sandbox: 'danger-full-access',
    approvalPolicy: 'never',
  });

  assert.ok(captured.args.includes('--dangerously-bypass-approvals-and-sandbox'));
  // When bypassing, -s and approval_policy flags are NOT passed redundantly
  assert.ok(!captured.args.includes('-s'));

  fs.rmSync(baseDir, { recursive: true, force: true });
});

test('runCodexExec propagates apiKey via OPENAI_API_KEY and CODEX_API_KEY env', async () => {
  const baseDir = createBaseDir();
  let captured;
  const deps = {
    spawn: async (bin, args, options) => {
      captured = { bin, args, options };
      const outputIdx = args.indexOf('--output-last-message');
      fs.writeFileSync(args[outputIdx + 1], 'ok', 'utf8');
      return { stdout: '', stderr: '', code: 0 };
    },
  };

  await runCodexExec(deps, {
    accountName: 'default',
    baseDir,
    prompt: 'go',
    apiKey: 'sk-test',
  });

  assert.equal(captured.options.env.OPENAI_API_KEY, 'sk-test');
  assert.equal(captured.options.env.CODEX_API_KEY, 'sk-test');

  fs.rmSync(baseDir, { recursive: true, force: true });
});

test('runCodexExec rejects with the stderr details when codex exits non-zero', async () => {
  const baseDir = createBaseDir();
  const deps = {
    spawn: async () => ({ stdout: '', stderr: 'authentication failed', code: 1 }),
  };

  await assert.rejects(
    runCodexExec(deps, { accountName: 'default', baseDir, prompt: 'go' }),
    /codex exec failed: authentication failed/
  );

  fs.rmSync(baseDir, { recursive: true, force: true });
});

test('shouldBypassCodexSandbox returns true only for danger-full-access + never', () => {
  assert.equal(shouldBypassCodexSandbox('danger-full-access', 'never'), true);
  assert.equal(shouldBypassCodexSandbox('workspace-write', 'never'), false);
  assert.equal(shouldBypassCodexSandbox('danger-full-access', 'on-failure'), false);
  assert.equal(shouldBypassCodexSandbox('', ''), false);
});
