const { describe, it } = require('node:test');
const assert = require('node:assert');
const { normalizeIncomingWechatEvent } = require('../tools/lib/platform/wechat/event_projection');

describe('wechat/event_projection', () => {
  it('normalizes a text message into standard event shape', () => {
    const payload = {
      query: '你好',
      openid: 'oUser123',
      msg_id: 'msg_001',
      timestamp: 1710000000,
    };
    const event = normalizeIncomingWechatEvent(payload);
    assert.strictEqual(event.taskKey, 'oUser123');
    assert.strictEqual(event.chatId, 'oUser123');
    assert.strictEqual(event.senderId, 'oUser123');
    assert.strictEqual(event.messageId, 'msg_001');
    assert.strictEqual(event.text, '你好');
    assert.strictEqual(event.chatType, 'p2p');
    assert.deepStrictEqual(event.attachments, []);
    assert.strictEqual(event.parentId, '');
    assert.strictEqual(event.createTime, 1710000000000);
  });

  it('taskKey equals senderId for all messages', () => {
    const event = normalizeIncomingWechatEvent({ openid: 'userX', query: 'hi' });
    assert.strictEqual(event.taskKey, event.senderId);
  });
});
