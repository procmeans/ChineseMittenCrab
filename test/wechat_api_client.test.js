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

  describe('getCustomers (nickname resolution + cache)', () => {
    function makeKfStub() {
      const calls = [];
      return {
        calls,
        sendTextMsg: async () => ({ errcode: 0 }),
        sendMediaMsg: async () => ({ errcode: 0 }),
        syncMsg: async () => ({ errcode: 0 }),
        transServiceState: async () => ({ errcode: 0 }),
        batchGetCustomers: async ({ externalUseridList }) => {
          calls.push(externalUseridList);
          return {
            errcode: 0,
            customer_list: externalUseridList.map((id) => ({
              external_userid: id,
              nickname: 'Nick_' + id,
              avatar: 'http://x/' + id,
              gender: 1,
            })),
          };
        },
      };
    }

    it('batch-fetches nicknames and returns a Map keyed by external_userid', async () => {
      const cache = fakeTokenCache('AT');
      const kfClient = makeKfStub();
      const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
      const result = await client.getCustomers(['wm_a', 'wm_b']);
      assert.strictEqual(result.get('wm_a').nickname, 'Nick_wm_a');
      assert.strictEqual(result.get('wm_b').nickname, 'Nick_wm_b');
      assert.strictEqual(kfClient.calls.length, 1);
      assert.deepStrictEqual(kfClient.calls[0], ['wm_a', 'wm_b']);
    });

    it('returns cached entries without re-fetching when fresh', async () => {
      const cache = fakeTokenCache('AT');
      const kfClient = makeKfStub();
      const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
      await client.getCustomers(['wm_a']);
      await client.getCustomers(['wm_a']);  // should hit cache
      await client.getCustomers(['wm_a']);
      assert.strictEqual(kfClient.calls.length, 1);
    });

    it('mixes cache hits + cache misses in one call', async () => {
      const cache = fakeTokenCache('AT');
      const kfClient = makeKfStub();
      const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
      await client.getCustomers(['wm_a']);
      const r = await client.getCustomers(['wm_a', 'wm_b', 'wm_c']);
      assert.strictEqual(r.get('wm_a').nickname, 'Nick_wm_a');
      assert.strictEqual(r.get('wm_b').nickname, 'Nick_wm_b');
      assert.strictEqual(r.get('wm_c').nickname, 'Nick_wm_c');
      // First call fetched [wm_a]; second only the misses [wm_b, wm_c]
      assert.strictEqual(kfClient.calls.length, 2);
      assert.deepStrictEqual(kfClient.calls[1], ['wm_b', 'wm_c']);
    });

    it('chunks calls to max 100 ids each', async () => {
      const cache = fakeTokenCache('AT');
      const kfClient = makeKfStub();
      const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
      const ids = [];
      for (let i = 0; i < 250; i++) ids.push('wm_' + i);
      await client.getCustomers(ids);
      assert.strictEqual(kfClient.calls.length, 3);
      assert.strictEqual(kfClient.calls[0].length, 100);
      assert.strictEqual(kfClient.calls[1].length, 100);
      assert.strictEqual(kfClient.calls[2].length, 50);
    });

    it('respects TTL — re-fetches after cache expiry', async () => {
      const cache = fakeTokenCache('AT');
      const kfClient = makeKfStub();
      let nowMs = 1000;
      const client = createWechatApiClient({
        accessTokenCache: cache, kfClient,
        customerTtlMs: 60_000,
        now: () => nowMs,
      });
      await client.getCustomers(['wm_a']);
      nowMs += 30_000; // still fresh
      await client.getCustomers(['wm_a']);
      assert.strictEqual(kfClient.calls.length, 1);
      nowMs += 60_000; // now expired
      await client.getCustomers(['wm_a']);
      assert.strictEqual(kfClient.calls.length, 2);
    });

    it('getNickname returns empty string for unresolvable IDs', async () => {
      const cache = fakeTokenCache('AT');
      const kfClient = {
        ...makeKfStub(),
        batchGetCustomers: async () => ({ errcode: 0, customer_list: [] }),  // nothing returned
      };
      const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
      const nick = await client.getNickname('wm_unknown');
      assert.strictEqual(nick, '');
    });

    it('getCachedNickname returns "" without making an HTTP call when not cached', async () => {
      const cache = fakeTokenCache('AT');
      const kfClient = makeKfStub();
      const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
      const nick = client.getCachedNickname('wm_never_seen');
      assert.strictEqual(nick, '');
      assert.strictEqual(kfClient.calls.length, 0, 'no HTTP call should have happened');
    });

    it('getCachedNickname returns the cached value after getCustomers has populated it', async () => {
      const cache = fakeTokenCache('AT');
      const kfClient = makeKfStub();
      const client = createWechatApiClient({ accessTokenCache: cache, kfClient });
      await client.getCustomers(['wm_a']);  // warm cache
      const nick = client.getCachedNickname('wm_a');
      assert.strictEqual(nick, 'Nick_wm_a');
    });
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
