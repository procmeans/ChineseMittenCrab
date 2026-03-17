function parseMessageContent(content) {
  if (!content) {
    return {};
  }

  if (typeof content === 'object') {
    return content;
  }

  return JSON.parse(content);
}

function getIncomingFeishuMessage(event) {
  const message = event.event?.message || {};
  const senderId = event.event?.sender?.sender_id?.open_id || '';
  const content = parseMessageContent(message.content);

  return {
    messageId: message.message_id || '',
    chatId: message.chat_id || '',
    chatType: message.chat_type || '',
    senderId,
    text: content.text || '',
    mentions: message.mentions || [],
  };
}

module.exports = {
  getIncomingFeishuMessage,
};
