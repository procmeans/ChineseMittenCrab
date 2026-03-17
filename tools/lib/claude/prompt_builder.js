function buildClaudePrompt(input = {}) {
  return String(input.prompt || '').trim();
}

module.exports = {
  buildClaudePrompt,
};
