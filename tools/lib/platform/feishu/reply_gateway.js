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
  };
}

module.exports = {
  createReplyGateway,
};
