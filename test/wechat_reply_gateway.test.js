const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createWechatReplyGateway } = require('../tools/lib/platform/wechat/reply_gateway');

describe('wechat/reply_gateway', () => {
  function makeStubs() {
    const calls = [];
    const apiClient = {
      sendText(args) {
        calls.push({ method: 'sendText', ...args });
        return Promise.resolve({ replyMessageId: 'sent_1', ok: true });
      },
    };
    const openidMap = new Map([
      ['msg_001', { openid: 'wmUser', openKfId: 'wk_kfid', channel: 9 }],
    ]);
    return { calls, apiClient, openidMap };
  }

  it('sendTextReply calls apiClient.sendText with touser + openKfId + text', async () => {
    const { calls, apiClient, openidMap } = makeStubs();
    const gw = createWechatReplyGateway(apiClient, openidMap);
    await gw.sendTextReply('msg_001', 'hello');
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], {
      method: 'sendText',
      touser: 'wmUser',
      openKfId: 'wk_kfid',
      text: 'hello',
    });
  });

  it('sendTextReply returns null when messageId not in routing map', async () => {
    const { apiClient, openidMap } = makeStubs();
    const gw = createWechatReplyGateway(apiClient, openidMap);
    const r = await gw.sendTextReply('unknown_msg', 'hello');
    assert.strictEqual(r.replyMessageId, null);
  });

  it('sendTextReply returns null when routing has openid but no openKfId (legacy/aispeech entry)', async () => {
    const openidMap = new Map([
      ['legacy_msg', { openid: 'oU', channel: 0 }],  // no openKfId
    ]);
    let called = false;
    const apiClient = { sendText: () => { called = true; return Promise.resolve({}); } };
    const gw = createWechatReplyGateway(apiClient, openidMap);
    const r = await gw.sendTextReply('legacy_msg', 'x');
    assert.strictEqual(r.replyMessageId, null);
    assert.strictEqual(called, false);
  });

  it('sendCardReply returns null replyMessageId (so message_handler skips card patching)', async () => {
    const gw = createWechatReplyGateway(null, null);
    const r = await gw.sendCardReply('msg_001', { elements: [] });
    assert.strictEqual(r.replyMessageId, null);
  });

  it('patchCardReply is a no-op', async () => {
    const gw = createWechatReplyGateway(null, null);
    const r = await gw.patchCardReply('msg_001', {});
    assert.strictEqual(r, undefined);
  });

  it('sendReply pulls text out of the rendered object and routes to sendTextReply', async () => {
    const { calls, apiClient, openidMap } = makeStubs();
    const gw = createWechatReplyGateway(apiClient, openidMap);
    await gw.sendReply('msg_001', { mode: 'text', text: '回复' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].text, '回复');
  });

  it('sendFileReply sends a text note about the file (kf does not push files inline)', async () => {
    const { calls, apiClient, openidMap } = makeStubs();
    const gw = createWechatReplyGateway(apiClient, openidMap);
    await gw.sendFileReply('msg_001', '/tmp/report.csv');
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].text.includes('report.csv'));
  });
});
