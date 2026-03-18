function createFeishuSdkClient({ appId, appSecret, Lark }) {
  const lark = Lark || require('@larksuiteoapi/node-sdk');
  const client = new lark.Client({ appId, appSecret });

  return {
    async replyText(messageId, text) {
      return client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
    },

    async replyCard(messageId, card) {
      return client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'interactive',
          content: JSON.stringify(card),
        },
      });
    },

    async getMessageContent(messageId) {
      const resp = await client.im.message.get({
        path: { message_id: messageId },
      });
      const body = resp?.data?.items?.[0] || resp?.data || {};
      const content = body.body?.content || body.content || '';

      try {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        return parsed.text || '';
      } catch (_) {
        return String(content);
      }
    },

    async downloadMessageResource(messageId, fileKey) {
      const resp = await client.im.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
      });
      return resp;
    },

    createWsDispatcher(handlers) {
      const eventDispatcher = new lark.EventDispatcher({});

      for (const [eventType, handler] of Object.entries(handlers)) {
        eventDispatcher.register(eventType, handler);
      }

      const wsClient = new lark.WSClient({
        appId,
        appSecret,
      });

      return {
        start() {
          return wsClient.start({ eventDispatcher });
        },
      };
    },
  };
}

module.exports = {
  createFeishuSdkClient,
};
