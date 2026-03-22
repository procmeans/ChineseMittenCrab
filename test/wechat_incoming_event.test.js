const { describe, it } = require('node:test');
const assert = require('node:assert');
const { getIncomingWechatMessage } = require('../tools/lib/platform/wechat/incoming_event');

describe('wechat/incoming_event', () => {
  it('parses standard text message payload', () => {
    const payload = {
      query: '你好',
      openid: 'oUser123',
      msg_id: 'msg_001',
      timestamp: 1710000000,
    };
    const msg = getIncomingWechatMessage(payload);
    assert.strictEqual(msg.messageId, 'msg_001');
    assert.strictEqual(msg.fromUser, 'oUser123');
    assert.strictEqual(msg.text, '你好');
    assert.strictEqual(msg.msgType, 'text');
    assert.strictEqual(msg.createTime, 1710000000000); // normalized to ms
  });

  it('parses JSON string input', () => {
    const json = '{"query":"hello","openid":"u1","msg_id":"m1","timestamp":1710000000}';
    const msg = getIncomingWechatMessage(json);
    assert.strictEqual(msg.text, 'hello');
    assert.strictEqual(msg.fromUser, 'u1');
  });

  it('handles alternative field names', () => {
    const payload = {
      Content: '测试',
      FromUserName: 'user_alt',
      MsgId: 'alt_001',
      CreateTime: 1710000,
      MsgType: 'voice',
    };
    const msg = getIncomingWechatMessage(payload);
    assert.strictEqual(msg.text, '测试');
    assert.strictEqual(msg.fromUser, 'user_alt');
    assert.strictEqual(msg.messageId, 'alt_001');
    assert.strictEqual(msg.msgType, 'voice');
    assert.strictEqual(msg.createTime, 1710000000); // seconds → ms
  });

  it('handles missing fields gracefully', () => {
    const msg = getIncomingWechatMessage({});
    assert.strictEqual(msg.messageId, '');
    assert.strictEqual(msg.fromUser, '');
    assert.strictEqual(msg.text, '');
    assert.strictEqual(msg.msgType, 'text');
    assert.strictEqual(msg.createTime, 0);
  });

  it('preserves millisecond timestamps as-is', () => {
    const msg = getIncomingWechatMessage({ timestamp: 1710000000000 });
    assert.strictEqual(msg.createTime, 1710000000000);
  });
});
