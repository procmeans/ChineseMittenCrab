function convertToLarkMd(text) {
  return String(text || '')
    // Convert ### h3 → **h3**
    .replace(/^#{1,6}\s+(.+)$/gm, '**$1**')
    // Convert markdown tables to plain text (strip pipe syntax)
    .replace(/^\|(.+)\|$/gm, (_, row) =>
      row.split('|').map(cell => cell.trim()).filter(Boolean).join('　·　')
    )
    // Remove table separator rows (e.g. |---|---|)
    .replace(/^\|?[\s\-:|]+\|[\s\-:|]*\|?\s*$/gm, '')
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderFeishuReply(text) {
  return {
    mode: 'interactive',
    card: {
      header: {
        title: {
          tag: 'plain_text',
          content: 'cmr',
        },
      },
      elements: [
        {
          tag: 'markdown',
          content: convertToLarkMd(text),
        },
      ],
    },
  };
}

module.exports = {
  renderFeishuReply,
};
