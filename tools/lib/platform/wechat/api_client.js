const { sendTextMsg, sendMediaMsg, syncMsg, transServiceState, batchGetCustomers, normalizeKfMessage } = require('./kf_client');
const { uploadMedia, guessMediaType } = require('./media');

/**
 * High-level WeChat client wired to a 企业微信 微信客服 self-built app.
 *
 * Wraps the low-level kf endpoints with:
 *   - access_token retrieval (via the injected cache)
 *   - one-shot retry on 42001 (token expired) or 95012 (stale wecom-takeover state) so a
 *     cached token from before the latest authorization sync doesn't permanently break sends
 *   - one-shot service_state→1 transition + retry on 95018 (conversation not in send-allowed
 *     state); applies to every outbound msgtype, not just text
 *
 * Consumers (reply_gateway, the sync-pull loop) talk to this, not to qyapi directly.
 */
function createWechatApiClient({
  accessTokenCache,
  kfClient = { sendTextMsg, sendMediaMsg, syncMsg, transServiceState, batchGetCustomers },
  mediaClient = { uploadMedia, guessMediaType },
  customerTtlMs = 24 * 60 * 60 * 1000,
  now = Date.now,
}) {
  if (!accessTokenCache) throw new Error('createWechatApiClient: accessTokenCache required');

  // In-memory cache of external_userid → { nickname, avatar, fetchedAt }.
  // 24h TTL is generous — nicknames change rarely; expire just to handle the cold-start case
  // after a long downtime. Process-local; restart flushes it (acceptable for our scale).
  const customerCache = new Map();
  function getCachedCustomer(externalUserid) {
    const entry = customerCache.get(externalUserid);
    if (!entry) return null;
    if ((now() - entry.fetchedAt) > customerTtlMs) return null;
    return entry;
  }

  async function withTokenRetry(fn) {
    const token = await accessTokenCache.get();
    const resp = await fn(token);
    // 42001 = access_token expired (standard refresh case)
    // 95012 = "not use in wecom" — the token was issued before the wecom-takeover authorization
    //   propagated, so it carries stale privileges. Empirically, flushing + retrying with a
    //   fresh token recovers once the backend catches up.
    if (resp && (resp.errcode === 42001 || resp.errcode === 95012)) {
      accessTokenCache.invalidate();
      const fresh = await accessTokenCache.get();
      return fn(fresh);
    }
    return resp;
  }

  /**
   * Run a kf send_msg call with full self-healing: token retry + on-demand service_state
   * transition. `sender(accessToken)` returns the platform response. Returns the same shape
   * as the underlying API: { errcode, errmsg, msgid? }.
   */
  async function sendWithRetry({ touser, openKfId, sender }) {
    let resp = await withTokenRetry(sender);

    if (resp && resp.errcode === 95018) {
      // Conversation isn't in a send-allowed state. Take it over as smart-assistant (state=1)
      // and retry once. New conversations default to state=0; this handshake is needed before
      // the bot can reply.
      console.log('KF_TRANS_STATE touser=' + touser + ' openKfId=' + openKfId + ' to=1');
      const transResp = await withTokenRetry((accessToken) =>
        kfClient.transServiceState({
          accessToken,
          openKfId,
          externalUserid: touser,
          serviceState: 1,
        })
      );
      console.log('KF_TRANS_RESP ' + JSON.stringify(transResp).slice(0, 200));
      resp = await withTokenRetry(sender);
    }

    return resp;
  }

  function wrapSendResult(resp, msgtype, touser, openKfId, contentPreview) {
    const ok = resp && (resp.errcode === 0 || resp.errcode === undefined);
    const previewPart = contentPreview ? ' text=' + JSON.stringify(String(contentPreview).slice(0, 500)) : '';
    const cached = getCachedCustomer(touser);
    const nicknamePart = cached && cached.nickname ? ' nickname=' + JSON.stringify(cached.nickname) : '';
    console.log('KF_SEND msgtype=' + msgtype + ' touser=' + touser + nicknamePart
      + ' openKfId=' + openKfId + ' ok=' + ok + previewPart
      + ' resp=' + JSON.stringify(resp).slice(0, 200));
    return { replyMessageId: resp && resp.msgid ? String(resp.msgid) : null, ok, resp };
  }

  return {
    /**
     * Send a text reply from a kf account to a user.
     */
    async sendText({ touser, openKfId, text }) {
      const resp = await sendWithRetry({
        touser,
        openKfId,
        sender: (accessToken) => kfClient.sendTextMsg({ accessToken, touser, openKfId, text }),
      });
      return wrapSendResult(resp, 'text', touser, openKfId, text);
    },

    /**
     * Send a file from a local path: upload bytes to wechat media storage first, then
     * call kf/send_msg with the returned media_id. Type defaults to 'file' but can be
     * overridden ('image' / 'voice' / 'video') — guessMediaType picks based on extension
     * when type is omitted.
     */
    async sendFile({ touser, openKfId, filePath, type }) {
      const accessToken = await accessTokenCache.get();
      const resolvedType = type || mediaClient.guessMediaType(filePath);
      const uploadResp = await mediaClient.uploadMedia({
        accessToken,
        filePath,
        type: resolvedType,
      });

      if (!uploadResp || !uploadResp.media_id) {
        console.log('KF_MEDIA_UPLOAD_FAIL filePath=' + filePath + ' resp=' + JSON.stringify(uploadResp).slice(0, 200));
        // If upload itself failed because of a stale token, refresh and retry once
        if (uploadResp && (uploadResp.errcode === 42001 || uploadResp.errcode === 95012)) {
          accessTokenCache.invalidate();
          const fresh = await accessTokenCache.get();
          const retryResp = await mediaClient.uploadMedia({ accessToken: fresh, filePath, type: resolvedType });
          if (!retryResp || !retryResp.media_id) {
            return wrapSendResult(retryResp, resolvedType, touser, openKfId, filePath);
          }
          uploadResp.media_id = retryResp.media_id;
        } else {
          return wrapSendResult(uploadResp, resolvedType, touser, openKfId, filePath);
        }
      }

      const mediaId = uploadResp.media_id;
      console.log('KF_MEDIA_UPLOAD_OK media_id=' + mediaId + ' type=' + resolvedType + ' file=' + filePath);

      const resp = await sendWithRetry({
        touser,
        openKfId,
        sender: (at) => kfClient.sendMediaMsg({ accessToken: at, touser, openKfId, msgtype: resolvedType, mediaId }),
      });
      return wrapSendResult(resp, resolvedType, touser, openKfId, filePath);
    },

    /**
     * Drain the kf sync queue for a notify-token. Returns the parsed sync_msg response.
     * Caller iterates msg_list and dispatches each into the runtime.
     */
    async syncQueue({ token, openKfId, cursor = '' }) {
      return withTokenRetry((accessToken) =>
        kfClient.syncMsg({ accessToken, token, openKfId, cursor })
      );
    },

    /**
     * Resolve one or more external_userid → customer profile (mainly nickname).
     *
     * Reads from cache when fresh, batch-fetches the rest via /cgi-bin/kf/customer/batchget
     * (max 100 per call), populates the cache, then returns a Map<userid, {nickname, avatar, ...}>.
     * Always returns the Map — entries simply absent for IDs we couldn't resolve.
     */
    async getCustomers(externalUserids) {
      const result = new Map();
      const toFetch = [];
      const seen = new Set();
      for (const id of externalUserids || []) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const cached = getCachedCustomer(id);
        if (cached) {
          result.set(id, cached);
        } else {
          toFetch.push(id);
        }
      }

      // batchget accepts max 100 ids per call
      for (let i = 0; i < toFetch.length; i += 100) {
        const chunk = toFetch.slice(i, i + 100);
        const resp = await withTokenRetry((accessToken) =>
          kfClient.batchGetCustomers({ accessToken, externalUseridList: chunk })
        );
        if (resp && resp.errcode === 0 && Array.isArray(resp.customer_list)) {
          const fetchedAt = now();
          for (const c of resp.customer_list) {
            const entry = {
              nickname: c.nickname || '',
              avatar: c.avatar || '',
              gender: c.gender,
              unionid: c.unionid || '',
              fetchedAt,
            };
            customerCache.set(c.external_userid, entry);
            result.set(c.external_userid, entry);
          }
        } else if (resp && resp.errcode) {
          console.log('KF_CUSTOMER_LOOKUP_FAIL errcode=' + resp.errcode + ' errmsg=' + (resp.errmsg || '').slice(0, 100));
        }
      }
      return result;
    },

    /** Convenience: resolve a single userid → nickname string (empty if not resolvable). */
    async getNickname(externalUserid) {
      const map = await this.getCustomers([externalUserid]);
      const entry = map.get(externalUserid);
      return entry ? entry.nickname : '';
    },

    /**
     * Synchronous cache-only nickname lookup — no HTTP. Returns '' if not yet cached.
     * Used on the hot path (per-message log lines) so dispatch doesn't await a network call
     * before sending the thinking placeholder. Pair with a fire-and-forget getCustomers()
     * earlier in the batch so misses self-heal for subsequent messages.
     */
    getCachedNickname(externalUserid) {
      const entry = getCachedCustomer(externalUserid);
      return entry ? entry.nickname : '';
    },

    /** Re-export normalize so the bot doesn't have to dig into kf_client itself. */
    normalizeKfMessage,
  };
}

module.exports = {
  createWechatApiClient,
};
