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
  const attachments = [];

  if (content.file_key) {
    attachments.push({
      type: message.message_type || 'file',
      fileKey: content.file_key,
      fileName: content.file_name || `${content.file_key}.bin`,
    });
  }

  if (content.image_key) {
    attachments.push({
      type: 'image',
      fileKey: content.image_key,
      fileName: content.image_name || `${content.image_key}.image`,
    });
  }

  if (content.audio_file_key) {
    attachments.push({
      type: 'audio',
      fileKey: content.audio_file_key,
      fileName: content.audio_file_name || `${content.audio_file_key}.audio`,
    });
  }

  return {
    messageId: message.message_id || '',
    chatId: message.chat_id || '',
    chatType: message.chat_type || '',
    senderId,
    text: content.text || '',
    mentions: message.mentions || [],
    attachments,
    parentId: message.parent_id || '',
    rootId: message.root_id || '',
  };
}

module.exports = {
  getIncomingFeishuMessage,
};
