/**
 * Create a reply gateway for WeChat that matches the interface expected by message_handler.js.
 *
 * Key design: sendCardReply returns { replyMessageId: null } so the message_handler's
 * progress card logic naturally degrades — it skips all patch calls and sends the final
 * reply directly via sendReply.
 *
 * @param {object} apiClient - WeChat API client with pushTextMessage method
 * @param {Map} openidMap - Maps messageId → openid for routing replies
 */
function createWechatReplyGateway(apiClient, openidMap) {
  return {
    async sendTextReply(messageId, text) {
      const openid = openidMap && openidMap.get(messageId);
      if (!openid || !apiClient) return { replyMessageId: null };
      return apiClient.pushTextMessage(openid, text);
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
