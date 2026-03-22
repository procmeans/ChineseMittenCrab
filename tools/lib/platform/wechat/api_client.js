const https = require('node:https');
const http = require('node:http');

/**
 * Make an HTTPS POST request with JSON body.
 */
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.request(parsed, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (chunk) => { buf += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch (_) {
          resolve({ raw: buf });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Create a WeChat Dialog Open Platform API client.
 *
 * The push API endpoint is used to send async replies to users.
 * Docs: https://developers.weixin.qq.com/doc/aispeech/
 */
function createWechatApiClient({ appId, token, encodingAesKey, postFn }) {
  const post = postFn || postJson;

  return {
    /**
     * Push a text message to a user via the platform's proactive push API.
     * If the platform doesn't support push, this will fail gracefully.
     */
    async pushTextMessage(openid, text) {
      const url = `https://chatbot.weixin.qq.com/openapi/sendmsg/${appId}`;
      const resp = await post(url, {
        appid: appId,
        openid,
        msg: text,
      });

      console.log('WECHAT_PUSH openid=' + openid + ' resp=' + JSON.stringify(resp).slice(0, 200));
      return { replyMessageId: null };
    },

    /**
     * Get the app ID for this client.
     */
    getAppId() {
      return appId;
    },
  };
}

module.exports = {
  createWechatApiClient,
};
