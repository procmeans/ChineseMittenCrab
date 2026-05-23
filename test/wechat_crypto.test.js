const { describe, it } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const {
  verifySignature,
  decryptMessage,
  encryptMessage,
  parseCallbackBody,
  decodeAesKey,
} = require('../tools/lib/platform/wechat/crypto');

// Generate a valid 43-character EncodingAESKey for tests
// 32 random bytes → base64 (44 chars with trailing =) → remove trailing =
const testKey = crypto.randomBytes(32).toString('base64').replace(/=+$/, '');

const testAppId = 'wx1234567890abcdef';
const testToken = 'test_token_123';

describe('wechat/crypto', () => {
  describe('verifySignature', () => {
    it('returns true for a valid signature', () => {
      const timestamp = '1616461382';
      const nonce = 'abc123';
      const parts = [testToken, timestamp, nonce];
      parts.sort();
      const expected = crypto.createHash('sha1').update(parts.join('')).digest('hex');

      assert.strictEqual(verifySignature(testToken, timestamp, nonce, expected), true);
    });

    it('returns false for an invalid signature', () => {
      assert.strictEqual(verifySignature(testToken, '123', 'nonce', 'bad_sig'), false);
    });

    it('accepts the 4-arg form used by 微信客服 / 企业微信 (includes echostr/encrypt)', () => {
      const timestamp = '1616461382';
      const nonce = 'abc123';
      const echostr = 'someEncryptedEchostr';
      const parts = [testToken, timestamp, nonce, echostr];
      parts.sort();
      const expected = crypto.createHash('sha1').update(parts.join('')).digest('hex');

      assert.strictEqual(
        verifySignature(testToken, timestamp, nonce, expected, echostr),
        true
      );
    });

    it('still validates 3-arg form when caller forgets to pass encrypt', () => {
      const timestamp = '1616461382';
      const nonce = 'abc123';
      const parts = [testToken, timestamp, nonce];
      parts.sort();
      const expected = crypto.createHash('sha1').update(parts.join('')).digest('hex');

      // No 5th arg → falls back to 3-arg form
      assert.strictEqual(verifySignature(testToken, timestamp, nonce, expected), true);
    });
  });

  describe('decodeAesKey', () => {
    it('decodes a 43-char key into 32 bytes', () => {
      const key = decodeAesKey(testKey);
      assert.strictEqual(key.length, 32);
    });

    it('throws on invalid key length', () => {
      assert.throws(() => decodeAesKey('tooshort'), /Invalid EncodingAESKey length/);
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('decrypts what was encrypted', () => {
      const original = '你好，世界！Hello World!';
      const cipherText = encryptMessage(testKey, testAppId, original);
      const { message, appId } = decryptMessage(testKey, cipherText);

      assert.strictEqual(message, original);
      assert.strictEqual(appId, testAppId);
    });

    it('handles empty message', () => {
      const cipherText = encryptMessage(testKey, testAppId, '');
      const { message, appId } = decryptMessage(testKey, cipherText);

      assert.strictEqual(message, '');
      assert.strictEqual(appId, testAppId);
    });

    it('handles long message', () => {
      const long = 'A'.repeat(10000);
      const cipherText = encryptMessage(testKey, testAppId, long);
      const { message } = decryptMessage(testKey, cipherText);

      assert.strictEqual(message, long);
    });
  });

  describe('parseCallbackBody', () => {
    it('parses JSON body with encrypt field', () => {
      const original = '{"query":"hello","openid":"user1"}';
      const cipherText = encryptMessage(testKey, testAppId, original);
      const body = JSON.stringify({ encrypt: cipherText });

      const { message } = parseCallbackBody(body, testKey);
      assert.strictEqual(message, original);
    });

    it('parses object body with Encrypt field', () => {
      const original = 'test message';
      const cipherText = encryptMessage(testKey, testAppId, original);

      const { message } = parseCallbackBody({ Encrypt: cipherText }, testKey);
      assert.strictEqual(message, original);
    });

    it('throws when no encrypt field found', () => {
      assert.throws(
        () => parseCallbackBody('{"foo":"bar"}', testKey),
        /No encrypt field found/
      );
    });
  });
});
