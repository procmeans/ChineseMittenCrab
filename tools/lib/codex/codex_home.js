const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CODEX_AUTH_BOOTSTRAP_FILES = ['auth.json', 'config.toml'];

function resolveCodexHome(input = {}) {
  const baseDir = input.baseDir || path.join(os.homedir(), '.chinese-mitten-crab');
  const accountName = input.accountName || 'default';

  return path.join(baseDir, 'codex', accountName);
}

function bootstrapCodexHomeAuth({
  codexHome = '',
  sharedCodexHome = path.resolve(os.homedir(), '.codex'),
  refreshExistingAuth = false,
} = {}) {
  const targetHome = String(codexHome || '').trim();
  const sourceHome = String(sharedCodexHome || '').trim();

  if (!targetHome || !sourceHome) return [];
  if (targetHome === sourceHome) return [];
  if (!fs.existsSync(sourceHome)) return [];

  fs.mkdirSync(targetHome, { recursive: true });

  const copied = [];
  for (const fileName of CODEX_AUTH_BOOTSTRAP_FILES) {
    const sourceFile = path.join(sourceHome, fileName);
    const targetFile = path.join(targetHome, fileName);
    if (!fs.existsSync(sourceFile)) continue;

    if (fs.existsSync(targetFile)) {
      // Refresh auth.json when it drifts from the shared login (e.g., user re-logged in)
      if (refreshExistingAuth && fileName === 'auth.json') {
        const source = fs.readFileSync(sourceFile);
        const target = fs.readFileSync(targetFile);
        if (!source.equals(target)) {
          fs.copyFileSync(sourceFile, targetFile);
          copied.push(fileName);
        }
      }
      continue;
    }

    fs.copyFileSync(sourceFile, targetFile);
    copied.push(fileName);
  }

  return copied;
}

module.exports = {
  resolveCodexHome,
  bootstrapCodexHomeAuth,
};
