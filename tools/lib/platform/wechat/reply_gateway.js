/**
 * Create a reply gateway for WeChat that matches the interface expected by message_handler.js.
 *
 * Key design: sendCardReply returns { replyMessageId: null } so the message_handler's
 * progress card logic naturally degrades — it skips all patch calls and sends the final
 * reply directly via sendReply.
 *
 * @param {object} apiClient - WeChat API client with pushTextMessage method
 * @param {Map} openidMap - Maps messageId → { openid, channel, appid } for routing replies
 */
function createWechatReplyGateway(apiClient, openidMap) {
  function lookupRouting(messageId) {
    const v = openidMap && openidMap.get(messageId);
    if (!v) return null;
    if (typeof v === 'string') return { openid: v };  // legacy callers passed bare openid
    return v;
  }

  return {
    async sendTextReply(messageId, text) {
      const routing = lookupRouting(messageId);
      if (!routing || !routing.openid || !apiClient) return { replyMessageId: null };
      // 微信客服 path: needs openKfId to know which kf account is sending.
      // If openKfId is missing, the routing entry came from a pre-kf code path
      // (e.g., the legacy aispeech mode) and we can't deliver — just return null.
      if (!routing.openKfId) return { replyMessageId: null };
      return apiClient.sendText({
        touser: routing.openid,
        openKfId: routing.openKfId,
        text,
      });
    },

    async sendCardReply(_messageId, _card) {
      // WeChat has no interactive card concept — return null to skip progress card
      return { replyMessageId: null };
    },

    async patchCardReply(_replyMessageId, _card) {
      // WeChat does not support message patching — no-op
    },

    async sendReply(messageId, rendered) {
      const text = rendered && (rendered.text || '');
      return this.sendTextReply(messageId, text);
    },

    async sendFileReply(messageId, filePath) {
      // WeChat Dialog Open Platform may not support file push.
      // Send a text note instead.
      const path = require('node:path');
      const fileName = path.basename(filePath);
      return this.sendTextReply(messageId, `[文件: ${fileName}]`);
    },
  };
}

module.exports = {
  createWechatReplyGateway,
};
