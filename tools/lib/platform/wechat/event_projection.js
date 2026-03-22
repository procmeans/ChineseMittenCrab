const { getIncomingWechatMessage } = require('./incoming_event');

/**
 * Normalize a WeChat message into the standard event shape expected by message_handler.
 * WeChat Dialog Open Platform is always 1:1 (no group chats), so taskKey = senderId.
 */
function normalizeIncomingWechatEvent(payload) {
  const msg = getIncomingWechatMessage(payload);

  return {
    taskKey: msg.fromUser,
    chatId: msg.fromUser,
    senderId: msg.fromUser,
    messageId: msg.messageId,
    text: msg.text,
    chatType: 'p2p',
    attachments: [],
    parentId: '',
    rootId: '',
    createTime: msg.createTime,
    mentions: [],
  };
}

module.exports = {
  normalizeIncomingWechatEvent,
};
