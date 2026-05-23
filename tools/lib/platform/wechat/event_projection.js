const { getIncomingWechatMessage } = require('./incoming_event');

/**
 * Normalize a WeChat callback message into the standard event shape expected by message_handler.
 * WeChat Dialog Open Platform is always 1:1 (no group chats), so taskKey = senderId.
 *
 * Carries from/channel/appId through so the reply path can push back via the same channel
 * with the right appid, and so the runtime can skip from!==0 (bot echo / human agent).
 */
function normalizeIncomingWechatEvent(payload) {
  const msg = getIncomingWechatMessage(payload);
  // Isolate task queue + thread state per kf account: same external_userid talking to
  // different kf accounts must not share history (different bot personas, possibly different
  // engines). When openKfId is empty (legacy aispeech path), fall back to bare senderId.
  const taskKey = msg.openKfId ? `${msg.openKfId}::${msg.fromUser}` : msg.fromUser;

  return {
    taskKey,
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
    from: msg.from,
    channel: msg.channel,
    appId: msg.appId,
    event: msg.event,
    openKfId: msg.openKfId,
  };
}

module.exports = {
  normalizeIncomingWechatEvent,
};
