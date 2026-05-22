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

    async downloadMessageResource(messageId, fileKey, type = 'image', destPath) {
      const resp = await client.im.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type },
      });
      // Lark SDK v1.x returns an object with writeFile / getReadableStream
      if (destPath && typeof resp.writeFile === 'function') {
        await resp.writeFile(destPath);
        return;
      }
      if (typeof resp.getReadableStream === 'function') {
        const stream = resp.getReadableStream();
        return new Promise((resolve, reject) => {
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on('end', () => resolve(Buffer.concat(chunks)));
          stream.on('error', reject);
        });
      }
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

    // Returns this bot's own open_id in its own app namespace, used by mention_filter to detect
    // whether incoming group messages are addressed to this bot. Lark SDK doesn't expose /bot/v3/info
    // as a typed call, so we hit the HTTP endpoint directly. Returns '' on failure (the filter
    // falls back to "accept everything" when self_open_id is empty so the bot doesn't go silent).
    async getBotOpenId() {
      const https = require('node:https');
      const post = (path, body) => new Promise((resolve, reject) => {
        const data = JSON.stringify(body || {});
        const headers = { 'Content-Type': 'application/json', 'Content-Length': data.length };
        const req = https.request({ host: 'open.feishu.cn', path, method: 'POST', headers }, (res) => {
          let chunks = '';
          res.on('data', (c) => { chunks += c; });
          res.on('end', () => { try { resolve(JSON.parse(chunks)); } catch (e) { reject(e); } });
        });
        req.on('error', reject); req.write(data); req.end();
      });
      const get = (path, token) => new Promise((resolve, reject) => {
        const req = https.request({ host: 'open.feishu.cn', path, method: 'GET', headers: { Authorization: 'Bearer ' + token } }, (res) => {
          let chunks = '';
          res.on('data', (c) => { chunks += c; });
          res.on('end', () => { try { resolve(JSON.parse(chunks)); } catch (e) { reject(e); } });
        });
        req.on('error', reject); req.end();
      });
      try {
        const tokenResp = await post('/open-apis/auth/v3/tenant_access_token/internal', { app_id: appId, app_secret: appSecret });
        const token = tokenResp && tokenResp.tenant_access_token;
        if (!token) return '';
        const info = await get('/open-apis/bot/v3/info', token);
        return (info && info.bot && info.bot.open_id) || '';
      } catch (_) {
        return '';
      }
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
