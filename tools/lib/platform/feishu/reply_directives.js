const SEND_FILE_RE = /\[SEND_FILE:([^\]]+)\]/g;

function applyReplyDirectives(text) {
  const src = String(text || '');
  const filePaths = [];
  let match;

  SEND_FILE_RE.lastIndex = 0;
  while ((match = SEND_FILE_RE.exec(src)) !== null) {
    filePaths.push(match[1].trim());
  }

  const cleanText = src.replace(/\[SEND_FILE:[^\]]+\]\n?/g, '').trim();

  return { text: cleanText, filePaths };
}

module.exports = {
  applyReplyDirectives,
};
