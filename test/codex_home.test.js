const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveCodexHome, bootstrapCodexHomeAuth } = require('../tools/lib/codex/codex_home');

test('resolveCodexHome derives a per-account path', () => {
  assert.equal(
    resolveCodexHome({
      accountName: 'default',
      baseDir: '/tmp/cmr',
    }),
    '/tmp/cmr/codex/default'
  );
});

test('resolveCodexHome defaults to ~/.chinese-mitten-crab/codex/default', () => {
  const expected = path.join(os.homedir(), '.chinese-mitten-crab', 'codex', 'default');
  assert.equal(resolveCodexHome({}), expected);
});

test('bootstrapCodexHomeAuth copies auth.json and config.toml from shared codex home', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cmr-bootstrap-'));
  const sharedCodexHome = path.join(tmpRoot, 'shared');
  const codexHome = path.join(tmpRoot, 'account');
  fs.mkdirSync(sharedCodexHome, { recursive: true });
  fs.writeFileSync(path.join(sharedCodexHome, 'auth.json'), '{"token":"abc"}', 'utf8');
  fs.writeFileSync(path.join(sharedCodexHome, 'config.toml'), 'profile = "default"', 'utf8');

  const copied = bootstrapCodexHomeAuth({ codexHome, sharedCodexHome });

  assert.deepEqual(copied.sort(), ['auth.json', 'config.toml']);
  assert.equal(fs.readFileSync(path.join(codexHome, 'auth.json'), 'utf8'), '{"token":"abc"}');
  assert.equal(fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8'), 'profile = "default"');

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('bootstrapCodexHomeAuth refreshes auth.json when source differs and refreshExistingAuth=true', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cmr-refresh-'));
  const sharedCodexHome = path.join(tmpRoot, 'shared');
  const codexHome = path.join(tmpRoot, 'account');
  fs.mkdirSync(sharedCodexHome, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(sharedCodexHome, 'auth.json'), 'NEW', 'utf8');
  fs.writeFileSync(path.join(codexHome, 'auth.json'), 'OLD', 'utf8');

  const copied = bootstrapCodexHomeAuth({
    codexHome,
    sharedCodexHome,
    refreshExistingAuth: true,
  });

  assert.deepEqual(copied, ['auth.json']);
  assert.equal(fs.readFileSync(path.join(codexHome, 'auth.json'), 'utf8'), 'NEW');

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('bootstrapCodexHomeAuth is a no-op when shared codex home is missing', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cmr-missing-'));
  const codexHome = path.join(tmpRoot, 'account');
  const sharedCodexHome = path.join(tmpRoot, 'does-not-exist');

  const copied = bootstrapCodexHomeAuth({ codexHome, sharedCodexHome });

  assert.deepEqual(copied, []);
  assert.equal(fs.existsSync(path.join(codexHome, 'auth.json')), false);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
