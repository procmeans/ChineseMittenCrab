function shouldRenderFeishuMarkdown(text) {
  return /(^#|\n#|^- |\n- |```)/m.test(String(text || ''));
}

function renderFeishuReply(text) {
  if (shouldRenderFeishuMarkdown(text)) {
    return {
      mode: 'interactive',
      card: {
        header: {
          title: {
            tag: 'plain_text',
            content: 'ChineseMittenCrab',
          },
        },
        elements: [
          {
            tag: 'markdown',
            content: text,
          },
        ],
      },
    };
  }

  return {
    mode: 'text',
    text,
  };
}

module.exports = {
  renderFeishuReply,
  shouldRenderFeishuMarkdown,
};
