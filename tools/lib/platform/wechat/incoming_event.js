/**
 * Parse a decrypted WeChat Dialog Open Platform callback message into a normalized shape.
 *
 * The current 第三方客服 (third-party customer service) callback format is:
 *   { userid, appid, content, from, channel, createtime, event?, msgid? }
 * where:
 *   - userid:     end user openid (in the bound channel's namespace)
 *   - appid:      bound channel app id (公众号 / 小程序 / 微信客服)
 *   - content:    user text (or rich object — we stringify if non-string)
 *   - from:       0=user, 1=bot, 2=human agent. ONLY 0 is a real inbound from the user;
 *                 1 and 2 echo our own pushes or human handoff and must be ignored upstream.
 *   - channel:    0=公众号 1=小程序 5=公众号H5 6=小程序插件 7=网页H5 9=微信客服
 *   - createtime: unix seconds
 *
 * For backward compatibility we still accept the older field names (query/openid/msg_id/timestamp).
 */
function getIncomingWechatMessage(payload) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

  const messageId = String(data.msgid || data.msg_id || data.MsgId || '');
  const fromUser = data.userid || data.openid || data.FromUserName || '';
  const rawContent = data.content || data.query || data.Content || '';
  const text = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
  const msgType = data.msgtype || data.MsgType || 'text';
  const createTime = Number(data.createtime || data.timestamp || data.CreateTime || 0);
  const from = Number(data.from || 0);
  const channel = Number(data.channel || 0);
  const appId = String(data.appid || data.AppID || '');
  const event = String(data.event || '');
  // open_kfid carries kf-account identity from sync_msg → fake raw events; reply path needs
  // this back to know which kf account to send from.
  const openKfId = String(data.open_kfid || data.OpenKfId || '');

  return {
    messageId,
    fromUser,
    text,
    msgType,
    createTime: createTime > 1e12 ? createTime : createTime * 1000, // normalize to ms
    from,
    channel,
    appId,
    event,
    openKfId,
  };
}

module.exports = {
  getIncomingWechatMessage,
};
