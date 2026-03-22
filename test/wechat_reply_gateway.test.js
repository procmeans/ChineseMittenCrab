const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createWechatReplyGateway } = require('../tools/lib/platform/wechat/reply_gateway');

describe('wechat/reply_gateway', () => {
  function makeStubs() {
    const calls = [];
    const apiClient = {
      pushTextMessage(openid, text) {
        calls.push({ method: 'pushTextMessage', openid, text });
        return Promise.resolve({ replyMessageId: null });
      },
    };
    const openidMap = new Map([['msg_001', 'oUser123']]);
    return { calls, apiClient, openidMap };
  }

  it('sendTextReply delegates to apiClient.pushTextMessage', async () => {
    const { calls, apiClient, openidMap } = makeStubs();
    const gw = createWechatReplyGateway(apiClient, openidMap);
    await gw.sendTextReply('msg_001', 'hello');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].openid, 'oUser123');
    assert.strictEqual(calls[0].text, 'hello');
  });

  it('sendTextReply returns null when openid not found', async () => {
    const { apiClient, openidMap } = makeStubs();
    const gw = createWechatReplyGateway(apiClient, openidMap);
    const result = await gw.sendTextReply('unknown_msg', 'hello');
    assert.strictEqual(result.replyMessageId, null);
  });

  it('sendCardReply returns null replyMessageId (no-op)', async () => {
    const gw = createWechatReplyGateway(null, null);
    const result = await gw.sendCardReply('msg_001', { elements: [] });
    assert.strictEqual(result.replyMessageId, null);
  });

  it('patchCardReply is a no-op', async () => {
    const gw = createWechatReplyGateway(null, null);
    const result = await gw.patchCardReply('msg_001', {});
    assert.strictEqual(result, undefined);
  });

  it('sendReply routes to sendTextReply', async () => {
    const { calls, apiClient, openidMap } = makeStubs();
    const gw = createWechatReplyGateway(apiClient, openidMap);
    await gw.sendReply('msg_001', { mode: 'text', text: '回复' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].text, '回复');
  });

  it('sendFileReply sends a text note about the file', async () => {
    const { calls, apiClient, openidMap } = makeStubs();
    const gw = createWechatReplyGateway(apiClient, openidMap);
    await gw.sendFileReply('msg_001', '/tmp/report.csv');
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].text.includes('report.csv'));
  });
});
