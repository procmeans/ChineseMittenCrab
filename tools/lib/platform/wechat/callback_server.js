const http = require('node:http');
const { URL } = require('node:url');
const { verifySignature, decryptMessage, encryptMessage } = require('./crypto');

/**
 * Create an HTTP callback server for the WeChat Dialog Open Platform.
 *
 * - GET requests: URL verification (echostr challenge)
 * - POST requests: message reception → immediate 200 ack → async onMessage
 */
function createCallbackServer({ token, encodingAesKey, appId, onMessage, port }) {
  const listenPort = port || 8080;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${listenPort}`);
    const msgSignature = url.searchParams.get('msg_signature') || url.searchParams.get('signature') || '';
    const timestamp = url.searchParams.get('timestamp') || '';
    const nonce = url.searchParams.get('nonce') || '';

    if (req.method === 'GET') {
      handleVerification(req, res, { token, encodingAesKey, msgSignature, timestamp, nonce, url });
      return;
    }

    if (req.method === 'POST') {
      handleMessage(req, res, { token, encodingAesKey, appId, msgSignature, timestamp, nonce, onMessage });
      return;
    }

    res.writeHead(405);
    res.end('Method Not Allowed');
  });

  return {
    server,
    start() {
      return new Promise((resolve) => {
        server.listen(listenPort, () => {
          console.log(`WECHAT_CALLBACK_SERVER port=${listenPort}`);
          resolve();
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        server.close(resolve);
      });
    },
  };
}

/**
 * Handle GET request for URL verification.
 * WeChat sends: ?msg_signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx
 * We verify the signature, decrypt echostr, and return the plaintext.
 */
function handleVerification(req, res, { token, encodingAesKey, msgSignature, timestamp, nonce, url }) {
  const echostr = url.searchParams.get('echostr') || '';

  if (!verifySignature(token, timestamp, nonce, msgSignature)) {
    console.log('VERIFY_FAIL signature mismatch');
    res.writeHead(403);
    res.end('Signature verification failed');
    return;
  }

  // echostr may be encrypted or plain depending on platform config
  let plainEchostr = echostr;
  if (encodingAesKey && echostr) {
    try {
      const { message } = decryptMessage(encodingAesKey, echostr);
      plainEchostr = message;
    } catch (_) {
      // If decryption fails, the echostr might be plain text
      plainEchostr = echostr;
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(plainEchostr);
  console.log('VERIFY_OK echostr returned');
}

/**
 * Handle POST request for incoming messages.
 * Immediately responds with 200 to avoid timeout, then calls onMessage async.
 */
function handleMessage(req, res, { token, encodingAesKey, appId, msgSignature, timestamp, nonce, onMessage }) {
  let body = '';

  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    // Respond immediately to avoid WeChat's 5-second timeout
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('success');

    try {
      let payload;

      if (encodingAesKey && msgSignature) {
        // Encrypted mode: verify signature and decrypt
        if (!verifySignature(token, timestamp, nonce, msgSignature)) {
          console.log('MSG_VERIFY_FAIL signature mismatch');
          return;
        }

        const parsed = typeof body === 'string' ? JSON.parse(body) : body;
        const cipherText = parsed.encrypt || parsed.Encrypt;

        if (cipherText) {
          const { message } = decryptMessage(encodingAesKey, cipherText);
          payload = JSON.parse(message);
        } else {
          // Body might already be decrypted (plaintext mode)
          payload = parsed;
        }
      } else {
        // Plaintext mode
        payload = JSON.parse(body);
      }

      console.log('MSG_RECV payload=' + JSON.stringify(payload).slice(0, 300));

      if (typeof onMessage === 'function') {
        // Fire-and-forget: don't await, errors are caught by the caller's task queue
        Promise.resolve(onMessage(payload)).catch((err) => {
          console.error('MSG_HANDLER_ERROR:', err.message);
        });
      }
    } catch (err) {
      console.error('MSG_PARSE_ERROR:', err.message);
    }
  });
}

module.exports = {
  createCallbackServer,
};
