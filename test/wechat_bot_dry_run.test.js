const { describe, it } = require('node:test');
const assert = require('node:assert');
const { prepareRuntimeEvent, renderBotReply, readArg } = require('../tools/wechat_bot');

describe('wechat_bot', () => {
  describe('readArg', () => {
    it('returns fallback when arg not present', () => {
      const original = process.argv;
      process.argv = ['node', 'script.js'];
      assert.strictEqual(readArg('--port', '8080'), '8080');
      process.argv = original;
    });
  });

  describe('prepareRuntimeEvent', () => {
    it('normalizes a WeChat payload into runtime event shape', () => {
      const event = prepareRuntimeEvent({
        query: '你好',
        openid: 'oUser1',
        msg_id: 'msg_001',
        timestamp: 1710000000,
      });

      assert.strictEqual(event.messageId, 'msg_001');
      assert.strictEqual(event.senderId, 'oUser1');
      assert.strictEqual(event.text, '你好');
      assert.strictEqual(event.chatType, 'p2p');
      assert.deepStrictEqual(event.files, []);
      assert.strictEqual(event.quotedText, '');
    });
  });

  describe('renderBotReply', () => {
    it('renders plain text reply', () => {
      const result = renderBotReply('Hello **world**');
      assert.strictEqual(result.mode, 'text');
      assert.strictEqual(result.text, 'Hello world');
      assert.deepStrictEqual(result.filePaths, []);
    });

    it('extracts SEND_FILE directives', () => {
      const result = renderBotReply('回复内容\n[SEND_FILE:/tmp/report.csv]');
      assert.ok(!result.text.includes('SEND_FILE'));
      assert.deepStrictEqual(result.filePaths, ['/tmp/report.csv']);
    });
  });
});
