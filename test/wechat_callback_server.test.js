const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const { createCallbackServer } = require('../tools/lib/platform/wechat/callback_server');
const { encryptMessage } = require('../tools/lib/platform/wechat/crypto');

const testToken = 'test_token_abc';
const testAesKey = crypto.randomBytes(32).toString('base64').replace(/=+$/, '');
const testAppId = 'wx_test_app';

function makeSignature(token, timestamp, nonce) {
  const parts = [token, timestamp, nonce];
  parts.sort();
  return crypto.createHash('sha1').update(parts.join('')).digest('hex');
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('wechat/callback_server', () => {
  let serverHandle;

  afterEach(async () => {
    if (serverHandle) {
      await serverHandle.stop();
      serverHandle = null;
    }
  });

  it('GET verification returns echostr on valid signature', async () => {
    serverHandle = createCallbackServer({
      token: testToken,
      encodingAesKey: null,  // plaintext mode for simplicity
      appId: testAppId,
      onMessage: null,
      port: 0, // random port
    });

    // Use port 0 and get assigned port
    await new Promise((resolve) => {
      serverHandle.server.listen(0, resolve);
    });
    const port = serverHandle.server.address().port;

    const timestamp = '1710000000';
    const nonce = 'nonce123';
    const sig = makeSignature(testToken, timestamp, nonce);
    const echostr = 'echo_test_string';

    const resp = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: `/?msg_signature=${sig}&timestamp=${timestamp}&nonce=${nonce}&echostr=${echostr}`,
      method: 'GET',
    });

    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(resp.body, echostr);
  });

  it('GET verification returns 403 on invalid signature', async () => {
    serverHandle = createCallbackServer({
      token: testToken,
      encodingAesKey: null,
      appId: testAppId,
      onMessage: null,
      port: 0,
    });

    await new Promise((resolve) => {
      serverHandle.server.listen(0, resolve);
    });
    const port = serverHandle.server.address().port;

    const resp = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: `/?msg_signature=bad_sig&timestamp=123&nonce=abc&echostr=test`,
      method: 'GET',
    });

    assert.strictEqual(resp.statusCode, 403);
  });

  it('POST message calls onMessage with parsed payload (plaintext mode)', async () => {
    let received = null;
    const onMessage = (payload) => { received = payload; };

    serverHandle = createCallbackServer({
      token: testToken,
      encodingAesKey: null,
      appId: testAppId,
      onMessage,
      port: 0,
    });

    await new Promise((resolve) => {
      serverHandle.server.listen(0, resolve);
    });
    const port = serverHandle.server.address().port;

    const payload = { query: '你好', openid: 'user1', msg_id: 'm1' };

    const resp = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, JSON.stringify(payload));

    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(resp.body, 'success');

    // Give async handler a moment
    await new Promise((r) => setTimeout(r, 50));
    assert.deepStrictEqual(received, payload);
  });

  it('POST returns 200 immediately even for encrypted messages', async () => {
    let received = null;
    const onMessage = (payload) => { received = payload; };

    const timestamp = '1710000000';
    const nonce = 'nonce456';
    const sig = makeSignature(testToken, timestamp, nonce);

    serverHandle = createCallbackServer({
      token: testToken,
      encodingAesKey: testAesKey,
      appId: testAppId,
      onMessage,
      port: 0,
    });

    await new Promise((resolve) => {
      serverHandle.server.listen(0, resolve);
    });
    const port = serverHandle.server.address().port;

    const innerPayload = { query: '加密消息', openid: 'user2', msg_id: 'm2' };
    const encrypted = encryptMessage(testAesKey, testAppId, JSON.stringify(innerPayload));
    const body = JSON.stringify({ encrypt: encrypted });

    const resp = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: `/?msg_signature=${sig}&timestamp=${timestamp}&nonce=${nonce}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, body);

    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(resp.body, 'success');

    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(received.query, '加密消息');
    assert.strictEqual(received.openid, 'user2');
  });
});
