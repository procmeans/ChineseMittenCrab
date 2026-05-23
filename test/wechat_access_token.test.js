const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createAccessTokenCache } = require('../tools/lib/platform/wechat/access_token');

describe('wechat/access_token', () => {
  it('throws if corpid or secret missing', () => {
    assert.throws(() => createAccessTokenCache({ secret: 's' }), /corpid is required/);
    assert.throws(() => createAccessTokenCache({ corpid: 'c' }), /secret is required/);
  });

  it('caches token for subsequent calls within TTL', async () => {
    let calls = 0;
    const cache = createAccessTokenCache({
      corpid: 'c1',
      secret: 's1',
      fetchFn: async () => {
        calls++;
        return { access_token: 'tok_' + calls, expires_in: 7200 };
      },
    });
    const a = await cache.get();
    const b = await cache.get();
    assert.strictEqual(a, 'tok_1');
    assert.strictEqual(b, 'tok_1');
    assert.strictEqual(calls, 1);
  });

  it('refreshes when token expires', async () => {
    let calls = 0;
    let nowMs = 1000;
    const cache = createAccessTokenCache({
      corpid: 'c1',
      secret: 's1',
      fetchFn: async () => {
        calls++;
        return { access_token: 'tok_' + calls, expires_in: 7200 };
      },
      now: () => nowMs,
    });
    await cache.get();
    nowMs += 7200_000; // hard expire
    await cache.get();
    assert.strictEqual(calls, 2);
  });

  it('coalesces concurrent refreshes into one HTTP call', async () => {
    let calls = 0;
    let release;
    const cache = createAccessTokenCache({
      corpid: 'c1',
      secret: 's1',
      fetchFn: () => new Promise((resolve) => {
        calls++;
        release = () => resolve({ access_token: 'tok_only', expires_in: 7200 });
      }),
    });
    const p1 = cache.get();
    const p2 = cache.get();
    const p3 = cache.get();
    release();
    const [a, b, c] = await Promise.all([p1, p2, p3]);
    assert.strictEqual(calls, 1);
    assert.strictEqual(a, 'tok_only');
    assert.strictEqual(b, 'tok_only');
    assert.strictEqual(c, 'tok_only');
  });

  it('invalidate() forces refresh on next get', async () => {
    let calls = 0;
    const cache = createAccessTokenCache({
      corpid: 'c1',
      secret: 's1',
      fetchFn: async () => {
        calls++;
        return { access_token: 'tok_' + calls, expires_in: 7200 };
      },
    });
    await cache.get();
    cache.invalidate();
    const after = await cache.get();
    assert.strictEqual(calls, 2);
    assert.strictEqual(after, 'tok_2');
  });

  it('keeps serving stale token if refresh fails', async () => {
    let calls = 0;
    let nowMs = 1000;
    const cache = createAccessTokenCache({
      corpid: 'c1',
      secret: 's1',
      fetchFn: async () => {
        calls++;
        if (calls === 1) return { access_token: 'tok_old', expires_in: 7200 };
        throw new Error('temporary failure');
      },
      now: () => nowMs,
    });
    await cache.get();
    nowMs += 7200_000; // expire so it tries to refresh
    const after = await cache.get();
    // refresh failed, but we serve the stale token rather than throwing
    assert.strictEqual(after, 'tok_old');
  });

  it('throws on fetch failure when no token cached at all', async () => {
    const cache = createAccessTokenCache({
      corpid: 'c1',
      secret: 's1',
      fetchFn: async () => { throw new Error('boom'); },
    });
    await assert.rejects(() => cache.get(), /boom/);
  });
});
