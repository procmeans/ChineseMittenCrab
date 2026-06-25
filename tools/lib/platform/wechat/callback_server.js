const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { verifySignature, decryptMessage, encryptMessage } = require('./crypto');

/** Directory for static files (tools/public/) */
const STATIC_DIR = path.join(__dirname, '..', '..', '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.txt':  'text/plain; charset=utf-8',
};

/**
 * Try to serve a static file from STATIC_DIR. Returns true if served, false otherwise.
 */
function tryServeStatic(req, res, pathname) {
  // Only serve GET/HEAD for static files
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  // Prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(STATIC_DIR, safePath);

  // If requesting '/' serve index.html
  if (safePath === '/' || safePath === '' || safePath === '.') {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  // Ensure resolved path is within STATIC_DIR
  if (!filePath.startsWith(STATIC_DIR)) return false;

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': content.length });
    if (req.method === 'HEAD') { res.end(); } else { res.end(content); }
    console.log('STATIC_SERVE path=' + pathname + ' file=' + path.basename(filePath) + ' size=' + content.length);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Extract a single XML element's text content. Supports both CDATA-wrapped and bare values.
 * Returns '' if the tag isn't present. Sufficient for the flat <xml>...</xml> shape WeChat uses
 * (no nested children, no namespaces). Avoids pulling in xml2js for a single one-level need.
 */
function extractCdataTag(xml, tagName) {
  const re = new RegExp(`<${tagName}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${tagName}>`);
  const m = xml.match(re);
  if (!m) return '';
  return (m[1] !== undefined ? m[1] : m[2]) || '';
}

/**
 * Parse a flat <xml>...</xml> blob into a JS object. Each top-level child becomes a key.
 * Numeric strings (CreateTime, MsgId, AgentID) stay as strings — downstream code coerces.
 */
function parseFlatXml(xml) {
  const obj = {};
  const re = /<([A-Za-z_][A-Za-z0-9_]*)>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*<\/\1>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] === 'xml') continue;
    obj[m[1]] = (m[2] !== undefined ? m[2] : m[3]) || '';
  }
  return obj;
}

/**
 * Parse the decrypted callback message. Aispeech sends JSON; 微信客服/公众号 sends XML.
 * Always returns a plain object so downstream parsers can read fields uniformly.
 */
function parseDecryptedMessage(plaintext) {
  const trimmed = String(plaintext || '').trimStart();
  if (trimmed.startsWith('<')) return parseFlatXml(trimmed);
  try { return JSON.parse(trimmed); } catch (_) { return { _raw: trimmed }; }
}

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

    // Catch-all access log so we can tell "platform didn't push" from "platform pushed but X".
    console.log('HTTP_HIT ' + req.method + ' ' + req.url + ' ua="' + (req.headers['user-agent'] || '') + '"');

    // 企业微信 trusted-domain verification: platform GETs /WW_verify_<TOKEN>.txt and expects
    // the response body to be just the <TOKEN> part. Serve this without needing the user to
    // upload an actual file to the web root — handy for tunneled dev setups.
    const wwMatch = req.method === 'GET' && url.pathname.match(/^\/WW_verify_([A-Za-z0-9]+)\.txt$/);
    if (wwMatch) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(wwMatch[1]);
      console.log('WW_VERIFY served path=' + url.pathname + ' body=' + wwMatch[1]);
      return;
    }

    // WeChat verification (GET with msg_signature/echostr)
    if (req.method === 'GET' && msgSignature && url.searchParams.has('echostr')) {
      handleVerification(req, res, { token, encodingAesKey, msgSignature, timestamp, nonce, url });
      return;
    }

    if (req.method === 'POST') {
      handleMessage(req, res, { token, encodingAesKey, appId, msgSignature, timestamp, nonce, onMessage });
      return;
    }

    // Static file serving (GET/HEAD without WeChat callback params → try public/ folder)
    if (tryServeStatic(req, res, url.pathname)) return;

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

  // 微信客服 / 企业微信 mix echostr into the signature; 公众号 doesn't.
  // verifySignature tries both forms so this works for either spec without per-platform code.
  if (!verifySignature(token, timestamp, nonce, msgSignature, echostr)) {
    console.log('VERIFY_FAIL signature mismatch token=' + (token || '').slice(0, 4) + ' ts=' + timestamp + ' nonce=' + nonce);
    res.writeHead(403);
    res.end('Signature verification failed');
    return;
  }

  // echostr is base64 ciphertext for 微信客服/企业微信; for 公众号 it may be plaintext.
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
  console.log('VERIFY_OK echostr returned len=' + plainEchostr.length);
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
        // Encrypted mode. Body comes in two shapes across the WeChat ecosystem:
        //   - 微信客服 / 企业微信 / 公众号: XML — `<xml><Encrypt><![CDATA[...]]></Encrypt>...</xml>`
        //   - 对话开放平台 (aispeech): JSON — `{ "encrypt": "..." }`
        // Detect by leading character; extract `Encrypt` either way.
        const trimmed = String(body || '').trimStart();
        let cipherText = '';
        let parsedOuter = null;
        if (trimmed.startsWith('<')) {
          cipherText = extractCdataTag(trimmed, 'Encrypt');
        } else {
          parsedOuter = JSON.parse(trimmed);
          cipherText = parsedOuter.encrypt || parsedOuter.Encrypt || '';
        }

        if (!verifySignature(token, timestamp, nonce, msgSignature, cipherText || '')) {
          console.log('MSG_VERIFY_FAIL signature mismatch');
          return;
        }

        if (cipherText) {
          const { message } = decryptMessage(encodingAesKey, cipherText);
          // Decrypted plaintext is XML for 微信客服/公众号, JSON for aispeech.
          payload = parseDecryptedMessage(message);
        } else {
          // Body was plaintext-mode JSON (no encryption configured on platform side)
          payload = parsedOuter || {};
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
