const os = require('node:os');
const path = require('node:path');

function resolveClaudeHome(input = {}) {
  const baseDir = input.baseDir || path.join(os.homedir(), '.chinese-mitten-crab');
  const accountName = input.accountName || 'default';

  return path.join(baseDir, 'claude', accountName);
}

module.exports = {
  resolveClaudeHome,
};
