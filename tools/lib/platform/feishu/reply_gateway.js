function createReplyGateway(client) {
  return {
    async sendTextReply(messageId, text) {
      if (!client || typeof client.replyText !== 'function') {
        return {
          messageId,
          text,
        };
      }

      return client.replyText(messageId, text);
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
  };
}

module.exports = {
  createReplyGateway,
};
