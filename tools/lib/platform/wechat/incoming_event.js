/**
 * Parse a decrypted WeChat Dialog Open Platform message into a normalized shape.
 *
 * The decrypted JSON from the platform typically looks like:
 *   { query: "user text", openid: "oXXX", msg_id: "123", timestamp: 1234567890, ... }
 *
 * Some variants may use different field names; we handle common alternatives.
 */
function getIncomingWechatMessage(payload) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

  const messageId = String(data.msg_id || data.msgid || data.MsgId || '');
  const fromUser = data.openid || data.FromUserName || '';
  const text = data.query || data.Content || data.content || '';
  const msgType = data.msgtype || data.MsgType || 'text';
  const createTime = Number(data.timestamp || data.CreateTime || 0);

  return {
    messageId,
    fromUser,
    text,
    msgType,
    createTime: createTime > 1e12 ? createTime : createTime * 1000, // normalize to ms
  };
}

module.exports = {
  getIncomingWechatMessage,
};
