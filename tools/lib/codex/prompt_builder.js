const fs = require('node:fs');
const path = require('node:path');

const { resolveCodexHome } = require('./codex_home');

function buildCodexPrompt(input = {}) {
  const userPrompt = String(input.prompt || '').trim();
  const parts = [];

  // System prompt: ${CODEX_HOME}/.codex/CODEX.md (parallels claude's ${CLAUDE_HOME}/.claude/CLAUDE.md)
  const codexHome = resolveCodexHome(input);
  const codexMdPath = path.join(codexHome, '.codex', 'CODEX.md');
  if (fs.existsSync(codexMdPath)) {
    const sys = fs.readFileSync(codexMdPath, 'utf8').trim();
    if (sys) parts.push(sys);
  }

  // Per-message output directory hint — codex has no equivalent of --append-system-prompt, so inline it
  if (input.outputDir) {
    parts.push(`如果需要生成文件，将所有文件写入 ${input.outputDir}/ 目录（不要写到其他位置）。`);
  }

  if (userPrompt) parts.push(userPrompt);

  return parts.join('\n\n');
}

module.exports = {
  buildCodexPrompt,
};
