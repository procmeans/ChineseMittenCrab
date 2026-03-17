const { getIncomingFeishuMessage } = require('./incoming_event');

function normalizeIncomingFeishuEvent(event) {
  const message = getIncomingFeishuMessage(event);
  const taskKey =
    message.chatType === 'group'
      ? `${message.chatId}::${message.senderId}`
      : message.senderId;

  return {
    taskKey,
    chatId: message.chatId,
    senderId: message.senderId,
    messageId: message.messageId,
    text: message.text,
    chatType: message.chatType,
    mentions: message.mentions,
  };
}

module.exports = {
  normalizeIncomingFeishuEvent,
};
