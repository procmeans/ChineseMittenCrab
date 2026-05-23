const { sendTextMsg, syncMsg, transServiceState, normalizeKfMessage } = require('./kf_client');

/**
 * High-level WeChat client wired to a 企业微信 微信客服 self-built app.
 *
 * Wraps the low-level kf endpoints with:
 *   - access_token retrieval (via the injected cache)
 *   - one-shot retry on 42001 (token expired) so a stale token from cold start doesn't fail
 *     the user's first reply
 *
 * Consumers (reply_gateway, the sync-pull loop) talk to this, not to qyapi directly.
 */
function createWechatApiClient({ accessTokenCache, kfClient = { sendTextMsg, syncMsg, transServiceState } }) {
  if (!accessTokenCache) throw new Error('createWechatApiClient: accessTokenCache required');

  async function withTokenRetry(fn) {
    const token = await accessTokenCache.get();
    const resp = await fn(token);
    if (resp && resp.errcode === 42001) {
      // Token expired on the server side while still in our cache — flush and retry once.
      accessTokenCache.invalidate();
      const fresh = await accessTokenCache.get();
      return fn(fresh);
    }
    return resp;
  }

  return {
    /**
     * Send a text reply from a kf account to a user.
     *
     * The kf platform refuses to deliver via send_msg unless the conversation is in
     * service_state=1 (smart assistant) or 3 (human agent). New conversations default to
     * state=0, so we proactively trans → 1 once on the 95018 error and retry. The retry path
     * is the bot-takeover handshake — after which send_msg accepts subsequent messages too.
     */
    async sendText({ touser, openKfId, text }) {
      async function doSend(accessToken) {
        return kfClient.sendTextMsg({ accessToken, touser, openKfId, text });
      }
      let resp = await withTokenRetry(doSend);

      if (resp && resp.errcode === 95018) {
        // Conversation isn't in a send-allowed state. Take it over as smart-assistant (state=1).
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
        resp = await withTokenRetry(doSend);
      }

      const ok = resp && (resp.errcode === 0 || resp.errcode === undefined);
      console.log('KF_SEND touser=' + touser + ' openKfId=' + openKfId + ' ok=' + ok
        + ' resp=' + JSON.stringify(resp).slice(0, 200));
      return { replyMessageId: resp && resp.msgid ? String(resp.msgid) : null, ok, resp };
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

    /** Re-export normalize so the bot doesn't have to dig into kf_client itself. */
    normalizeKfMessage,
  };
}

module.exports = {
  createWechatApiClient,
};
