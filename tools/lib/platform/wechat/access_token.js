const https = require('node:https');

/**
 * Fetch a tenant access_token from企业微信 with corpid + secret.
 *
 * Endpoint: GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=X&corpsecret=Y
 * Returns: { access_token, expires_in }   (expires_in is seconds, typically 7200)
 */
function defaultFetch(corpid, secret) {
  return new Promise((resolve, reject) => {
    const path = `/cgi-bin/gettoken?corpid=${encodeURIComponent(corpid)}&corpsecret=${encodeURIComponent(secret)}`;
    const req = https.request({ host: 'qyapi.weixin.qq.com', path, method: 'GET' }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.errcode && parsed.errcode !== 0) {
            reject(new Error('gettoken failed: ' + parsed.errcode + ' ' + (parsed.errmsg || '')));
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Create a cached access_token provider for a single (corpid, secret) pair.
 *
 * - Returns the same token for repeated calls within its TTL.
 * - Refreshes ~60s before expiry to avoid serving stale tokens to in-flight calls.
 * - On refresh failure, keeps serving the old token until it actually expires;
 *   throws only if there is no token at all.
 *
 * Inject `fetchFn` for tests (signature: (corpid, secret) → Promise<{access_token, expires_in}>).
 */
function createAccessTokenCache({ corpid, secret, fetchFn = defaultFetch, now = Date.now } = {}) {
  if (!corpid) throw new Error('createAccessTokenCache: corpid is required');
  if (!secret) throw new Error('createAccessTokenCache: secret is required');

  let cached = null; // { token, expiresAt }
  let inflight = null;

  async function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const resp = await fetchFn(corpid, secret);
        const ttlSeconds = Number(resp.expires_in || 7200);
        const safety = 60_000; // refresh 60s early
        cached = {
          token: resp.access_token,
          expiresAt: now() + ttlSeconds * 1000 - safety,
        };
        return cached.token;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return {
    async get() {
      if (cached && cached.expiresAt > now()) {
        return cached.token;
      }
      try {
        return await refresh();
      } catch (err) {
        // If we have any cached token (even past safety window but not yet hard-expired in WeChat's view),
        // serve it rather than fail the request. Hard-expired tokens will fail at the API call itself,
        // which is at least informative.
        if (cached && cached.token) return cached.token;
        throw err;
      }
    },
    /** Force a refresh on next get() — call this when an API returns 42001 (token expired). */
    invalidate() {
      cached = null;
    },
    /** For tests/diagnostics. */
    peek() {
      return cached;
    },
  };
}

module.exports = {
  createAccessTokenCache,
};
