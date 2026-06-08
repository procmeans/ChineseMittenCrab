function createClawbotReplyGateway(bridge, routingMap) {
  function lookupRouting(messageId) {
    const route = routingMap && routingMap.get(messageId);
    if (!route) return null;
    return route;
  }

  return {
    async sendTextReply(messageId, text) {
      const route = lookupRouting(messageId);
      if (!route || !bridge || typeof bridge.sendText !== 'function') {
        return { replyMessageId: null };
      }
      return bridge.sendText({
        accountId: route.accountId,
        userId: route.userId,
        text,
      });
    },

    async sendCardReply(_messageId, _card) {
      return { replyMessageId: null };
    },

    async patchCardReply(_replyMessageId, _card) {
      // ClawBot has no message patching; final replies are sent as new messages.
    },

    async sendReply(messageId, rendered) {
      const text = rendered && (rendered.text || '');
      return this.sendTextReply(messageId, text);
    },

    async sendFileReply(messageId, filePath) {
      const route = lookupRouting(messageId);
      if (!route || !bridge || typeof bridge.sendFile !== 'function') {
        return { replyMessageId: null };
      }
      return bridge.sendFile({
        accountId: route.accountId,
        userId: route.userId,
        filePath,
      });
    },
  };
}

module.exports = {
  createClawbotReplyGateway,
};
