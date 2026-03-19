const path = require('node:path');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

function createReplyGateway(client) {
  return {
    async sendTextReply(messageId, text) {
      if (!client || typeof client.replyText !== 'function') {
        return { replyMessageId: null };
      }

      return client.replyText(messageId, text);
    },

    async patchTextReply(replyMessageId, text) {
      if (!client || typeof client.patchText !== 'function') {
        return;
      }

      return client.patchText(replyMessageId, text);
    },

    async patchCardReply(replyMessageId, card) {
      if (!client || typeof client.patchCard !== 'function') return;
      return client.patchCard(replyMessageId, card);
    },

    async sendCardReply(messageId, card) {
      if (!client || typeof client.replyCard !== 'function') {
        return {
          messageId,
          card,
        };
      }

      return client.replyCard(messageId, card);
    },

    async sendReply(messageId, rendered) {
      if (rendered.mode === 'interactive') {
        return this.sendCardReply(messageId, rendered.card);
      }

      return this.sendTextReply(messageId, rendered.text);
    },

    async sendFileReply(messageId, filePath) {
      if (!client) return;
      const ext = path.extname(filePath).toLowerCase();
      if (IMAGE_EXTS.has(ext)) {
        if (typeof client.uploadImage !== 'function') return;
        const imageKey = await client.uploadImage(filePath);
        return client.sendImageMessage(messageId, imageKey);
      } else {
        if (typeof client.uploadFile !== 'function') return;
        const fileName = path.basename(filePath);
        const fileType = ext.replace('.', '') || 'stream';
        const fileKey = await client.uploadFile(filePath, fileName, fileType);
        return client.sendFileMessage(messageId, fileKey);
      }
    },
  };
}

module.exports = {
  createReplyGateway,
};
