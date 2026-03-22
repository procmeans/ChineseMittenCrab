const MAX_LENGTH = 2048;

function convertToPlainText(text) {
  return String(text || '')
    // Remove markdown headings syntax, keep text
    .replace(/^#{1,6}\s+(.+)$/gm, '$1')
    // Remove bold/italic markers
    .replace(/\*{1,3}(.+?)\*{1,3}/g, '$1')
    .replace(/_{1,3}(.+?)_{1,3}/g, '$1')
    // Convert code fences to plain content
    .replace(/```[\s\S]*?```/g, (match) => {
      const lines = match.split('\n');
      // Remove first line (```lang) and last line (```)
      return lines.slice(1, -1).join('\n');
    })
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Convert markdown tables to readable format
    .replace(/^\|(.+)\|$/gm, (_, row) =>
      row.split('|').map(cell => cell.trim()).filter(Boolean).join(' | ')
    )
    // Remove table separator rows
    .replace(/^\|?[\s\-:|]+\|[\s\-:|]*\|?\s*$/gm, '')
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderWechatReply(text) {
  let cleaned = convertToPlainText(text);

  if (cleaned.length > MAX_LENGTH) {
    cleaned = cleaned.slice(0, MAX_LENGTH - 20) + '\n...(内容过长，已截断)';
  }

  return { mode: 'text', text: cleaned };
}

module.exports = {
  renderWechatReply,
};
