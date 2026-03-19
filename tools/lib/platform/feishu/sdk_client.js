function createFeishuSdkClient({ appId, appSecret, Lark }) {
  const lark = Lark || require('@larksuiteoapi/node-sdk');
  const client = new lark.Client({ appId, appSecret });

  return {
    async replyText(messageId, text) {
      const resp = await client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
      return { replyMessageId: resp?.data?.message_id };
    },

    async patchText(messageId, text) {
      return client.im.message.patch({
        path: { message_id: messageId },
        data: {
          content: JSON.stringify({ text }),
        },
      });
    },

    async patchCard(messageId, card) {
      return client.im.message.patch({
        path: { message_id: messageId },
        data: {
          content: JSON.stringify(card),
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
        // Text message
        if (parsed.text) return parsed.text;

        // Interactive card fetched back: elements is array-of-arrays of {tag,text} objects
        const rawElements = parsed.elements || parsed.card?.elements || [];
        const flat = rawElements.flat(Infinity);
        const textParts = flat
          .filter(el => el && el.tag === 'text' && el.text)
          .map(el => el.text);
        if (textParts.length > 0) return textParts.join('');

        // Fallback: markdown element (sent format)
        const mdElement = flat.find(el => el && el.tag === 'markdown');
        if (mdElement && mdElement.content) return mdElement.content;

        return '';
      } catch (e) {
        return String(content);
      }
    },

    async getMessageMeta(messageId) {
      const resp = await client.im.message.get({
        path: { message_id: messageId },
      });
      const body = resp?.data?.items?.[0] || resp?.data || {};
      const msgType = body.msg_type || '';
      const content = body.body?.content || body.content || '';
      let parsed = {};
      try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content;
      } catch (_) {}
      return { msgType, parsed };
    },

    async downloadMessageResource(messageId, fileKey, type = 'image') {
      const resp = await client.im.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type },
      });
      // The SDK may return a stream or a Buffer-like object; normalise to Buffer
      if (Buffer.isBuffer(resp)) {
        return resp;
      }
      const stream = resp && resp.data ? resp.data : resp;
      return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    },

    async uploadFile(filePath, fileName, fileType) {
      const fs = require('node:fs');
      const path = require('node:path');
      const ext = path.extname(fileName || filePath).toLowerCase().replace('.', '');
      const validTypes = new Set(['opus', 'mp4', 'pdf', 'doc', 'xls', 'ppt', 'stream']);
      const type = validTypes.has(ext) ? ext : 'stream';
      const resp = await client.im.file.create({
        data: {
          file_type: type,
          file_name: fileName || path.basename(filePath),
          file: fs.createReadStream(filePath),
        },
      });
      return resp && (resp.file_key || (resp.data && resp.data.file_key));
    },

    async uploadImage(imagePath) {
      const fs = require('node:fs');
      const resp = await client.im.image.create({
        data: {
          image_type: 'message',
          image: fs.createReadStream(imagePath),
        },
      });
      return resp && (resp.image_key || (resp.data && resp.data.image_key));
    },

    async sendFileMessage(messageId, fileKey) {
      const resp = await client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'file',
          content: JSON.stringify({ file_key: fileKey }),
        },
      });
      return { replyMessageId: resp && resp.data && resp.data.message_id };
    },

    async sendImageMessage(messageId, imageKey) {
      const resp = await client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'image',
          content: JSON.stringify({ image_key: imageKey }),
        },
      });
      return { replyMessageId: resp && resp.data && resp.data.message_id };
    },

    createWsDispatcher(handlers) {
      const eventDispatcher = new lark.EventDispatcher({});

      eventDispatcher.register(handlers);

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
