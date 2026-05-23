const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createWechatApiClient } = require('../tools/lib/platform/wechat/api_client');

function fakeTokenCache(initial = 'tokA') {
  let val = initial;
  let invalidated = 0;
  return {
    async get() { return val; },
    invalidate() { invalidated++; val = val + '_v' + (invalidated + 1); },
    _state: () => ({ val, invalidated }),
  };
}

describe('wechat/api_client', () => {
  it('throws if no accessTokenCache provided', () => {
    assert.throws(() => createWechatApiClient({}), /accessTokenCache required/);
  });

  it('sendText calls kfClient.sendTextMsg with token from cache + routing fields', async () => {
    const calls = [];
    const cache = fakeTokenCache('tokA');
    const kfClient = {
      sendTextMsg: async (args) => { calls.push(args); return { errcode: 0, msgid: 'sent_1' }; },
      syncMsg: async () => ({ errcode: 0, msg_list: [] }),
    };
    const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
    const r = await client.sendText({ touser: 'wmUser', openKfId: 'wk_kf', text: '你好' });
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], {
      accessToken: 'tokA', touser: 'wmUser', openKfId: 'wk_kf', text: '你好',
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.replyMessageId, 'sent_1');
  });

  it('sendText retries once on errcode 42001 (token expired) with refreshed token', async () => {
    const calls = [];
    const cache = fakeTokenCache('stale');
    const kfClient = {
      sendTextMsg: async (args) => {
        calls.push(args);
        if (calls.length === 1) return { errcode: 42001, errmsg: 'access_token expired' };
        return { errcode: 0, msgid: 'sent_after_retry' };
      },
      syncMsg: async () => ({ errcode: 0 }),
    };
    const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
    const r = await client.sendText({ touser: 'u', openKfId: 'k', text: 'x' });
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].accessToken, 'stale');
    assert.notStrictEqual(calls[1].accessToken, 'stale');  // cache invalidated, new token
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.replyMessageId, 'sent_after_retry');
  });

  it('sendText reports ok=false on non-zero non-42001 errcode (e.g., 48002 forbidden)', async () => {
    const cache = fakeTokenCache();
    const kfClient = {
      sendTextMsg: async () => ({ errcode: 48002, errmsg: 'api forbidden' }),
      syncMsg: async () => ({}),
    };
    const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
    const r = await client.sendText({ touser: 'u', openKfId: 'k', text: 'x' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.resp.errcode, 48002);
  });

  it('syncQueue forwards token + cursor + openKfId to kfClient.syncMsg', async () => {
    let captured;
    const cache = fakeTokenCache('AT');
    const kfClient = {
      sendTextMsg: async () => ({}),
      syncMsg: async (args) => { captured = args; return { errcode: 0, msg_list: [{ msgid: 'm1' }] }; },
    };
    const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
    const r = await client.syncQueue({ token: 'sync_T', openKfId: 'wk_k', cursor: 'curX' });
    assert.deepStrictEqual(captured, {
      accessToken: 'AT', token: 'sync_T', openKfId: 'wk_k', cursor: 'curX',
    });
    assert.deepStrictEqual(r.msg_list, [{ msgid: 'm1' }]);
  });
});
