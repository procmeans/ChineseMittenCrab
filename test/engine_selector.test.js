const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveEngine } = require('../tools/lib/runtime/engine_selector');
const { runClaudeExec } = require('../tools/lib/claude/exec_service');
const { runCodexExec } = require('../tools/lib/codex/exec_service');

test('resolveEngine defaults to claude when engine field is absent', () => {
  const engine = resolveEngine({});
  assert.equal(engine.name, 'claude');
  assert.equal(engine.bin, 'claude');
  assert.equal(engine.runExec, runClaudeExec);
});

test('resolveEngine selects codex when engine="codex"', () => {
  const engine = resolveEngine({ engine: 'codex' });
  assert.equal(engine.name, 'codex');
  assert.equal(engine.bin, 'codex');
  assert.equal(engine.runExec, runCodexExec);
});

test('resolveEngine throws on unknown engine', () => {
  assert.throws(
    () => resolveEngine({ engine: 'gemini' }),
    /unknown engine "gemini"/
  );
});

test('buildInput for claude carries model and account', () => {
  const engine = resolveEngine({ engine: 'claude' });
  const input = engine.buildInput({
    config: { model: 'claude-opus-4-6' },
    accountName: 'alice',
  });
  assert.equal(input.model, 'claude-opus-4-6');
  assert.equal(input.account, 'alice');
});

test('buildInput for codex extracts codex.* block fields and snake_case aliases', () => {
  const engine = resolveEngine({ engine: 'codex' });
  const input = engine.buildInput({
    config: {
      engine: 'codex',
      codex: {
        bin: '/usr/local/bin/codex',
        model: 'gpt-5.4',
        cwd: '/tmp/work',
        add_dirs: ['/tmp/a', '/tmp/b'],
        sandbox: 'workspace-write',
        approval_policy: 'on-failure',
        profile: 'fast',
        reasoning_effort: 'high',
        api_key: 'sk-xyz',
        timeout_sec: 300,
      },
    },
    accountName: 'bob',
  });
  assert.equal(input.bin, '/usr/local/bin/codex');
  assert.equal(input.model, 'gpt-5.4');
  assert.equal(input.account, 'bob');
  assert.equal(input.cwd, '/tmp/work');
  assert.deepEqual(input.addDirs, ['/tmp/a', '/tmp/b']);
  assert.equal(input.sandbox, 'workspace-write');
  assert.equal(input.approvalPolicy, 'on-failure');
  assert.equal(input.profile, 'fast');
  assert.equal(input.reasoningEffort, 'high');
  assert.equal(input.apiKey, 'sk-xyz');
  assert.equal(input.timeoutMs, 300_000);
});
