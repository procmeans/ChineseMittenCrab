const crypto = require('node:crypto');

/**
 * Verify a WeChat callback signature.
 *
 * Supports both signature schemes used across the WeChat ecosystem:
 *   - 4-arg form: SHA1(sort([token, timestamp, nonce, encrypt])) — used by 微信客服
 *     (kf.weixin.qq.com) and 企业微信. `encrypt` is the GET `echostr` for URL verification
 *     or the POST body's `encrypt` field for message delivery.
 *   - 3-arg form: SHA1(sort([token, timestamp, nonce])) — used by 公众号 server URL
 *     verification when there is no echostr in the signature payload.
 *
 * We try the 4-arg form first (the modern, stricter spec) and fall back to the 3-arg form
 * so that both 公众号 and 客服 callbacks work without per-platform branching at the caller.
 */
function verifySignature(token, timestamp, nonce, msgSignature, encrypt) {
  const tryHash = (parts) => {
    const sorted = [...parts].sort();
    return crypto.createHash('sha1').update(sorted.join('')).digest('hex');
  };

  const t = String(token || '');
  const ts = String(timestamp || '');
  const n = String(nonce || '');
  const e = String(encrypt || '');

  if (tryHash([t, ts, n, e]) === msgSignature) return true;
  if (tryHash([t, ts, n]) === msgSignature) return true;
  return false;
}

/**
 * Decode the 43-character EncodingAESKey into a 32-byte Buffer (AES key).
 * The IV is the first 16 bytes of the key.
 */
function decodeAesKey(encodingAesKey) {
  const key = Buffer.from(encodingAesKey + '=', 'base64');
  if (key.length !== 32) {
    throw new Error('Invalid EncodingAESKey length: expected 32 bytes, got ' + key.length);
  }
  return key;
}

/**
 * Remove PKCS#7 padding from decrypted buffer.
 */
function removePkcs7Padding(buf) {
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) return buf;
  return buf.subarray(0, buf.length - pad);
}

/**
 * Add PKCS#7 padding to a buffer (block size = 32).
 */
function addPkcs7Padding(buf) {
  const blockSize = 32;
  const pad = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(pad, pad)]);
}

/**
 * Decrypt a base64-encoded ciphertext using AES-256-CBC.
 * Returns { message, appId } parsed from the plaintext structure:
 *   [16 random bytes][4-byte msg length (big-endian)][message][appId]
 */
function decryptMessage(encodingAesKey, cipherText) {
  const key = decodeAesKey(encodingAesKey);
  const iv = key.subarray(0, 16);
  const encrypted = Buffer.from(cipherText, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const unpadded = removePkcs7Padding(decrypted);

  // Skip 16 random bytes, read 4-byte big-endian message length
  const msgLen = unpadded.readUInt32BE(16);
  const message = unpadded.subarray(20, 20 + msgLen).toString('utf8');
  const appId = unpadded.subarray(20 + msgLen).toString('utf8');

  return { message, appId };
}

/**
 * Encrypt a plaintext message using AES-256-CBC.
 * Returns a base64-encoded ciphertext string.
 */
function encryptMessage(encodingAesKey, appId, plainText) {
  const key = decodeAesKey(encodingAesKey);
  const iv = key.subarray(0, 16);

  const random = crypto.randomBytes(16);
  const msgBuf = Buffer.from(plainText, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(msgBuf.length, 0);
  const appIdBuf = Buffer.from(appId, 'utf8');

  const raw = Buffer.concat([random, lenBuf, msgBuf, appIdBuf]);
  const padded = addPkcs7Padding(raw);

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

  return encrypted.toString('base64');
}

/**
 * Parse and decrypt the callback request body.
 * Supports JSON body with an "encrypt" field.
 */
function parseCallbackBody(body, encodingAesKey) {
  let parsed;
  if (typeof body === 'string') {
    parsed = JSON.parse(body);
  } else {
    parsed = body;
  }

  const cipherText = parsed.encrypt || parsed.Encrypt;
  if (!cipherText) {
    throw new Error('No encrypt field found in callback body');
  }

  return decryptMessage(encodingAesKey, cipherText);
}

module.exports = {
  verifySignature,
  decryptMessage,
  encryptMessage,
  parseCallbackBody,
  decodeAesKey,
};
