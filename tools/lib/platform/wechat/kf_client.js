const https = require('node:https');

function defaultPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = https.request({
      host: 'qyapi.weixin.qq.com',
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch (e) {
          resolve({ raw: buf, _parseError: e.message });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Pull real user messages out of the kf "notify + pull" sync queue.
 *
 * Triggered by kf_msg_or_event callbacks: the platform tells us a fresh batch is waiting
 * under a Token, we call /cgi-bin/kf/sync_msg to drain it.
 *
 * Returns the parsed response — caller is responsible for paging (has_more / next_cursor).
 * Empty msg_list with errcode=0 is normal when the Token has already been drained.
 *
 * Docs: /document/path/94670 (synced sync_msg)
 */
async function syncMsg({ accessToken, token, openKfId, cursor = '', limit = 1000, postFn }) {
  if (!accessToken) throw new Error('syncMsg: accessToken required');
  if (!token) throw new Error('syncMsg: token required (passed via kf_msg_or_event callback)');
  const post = postFn || defaultPost;
  const body = { token, limit };
  if (cursor) body.cursor = cursor;
  if (openKfId) body.open_kfid = openKfId;
  const path = `/cgi-bin/kf/sync_msg?access_token=${encodeURIComponent(accessToken)}`;
  return post(path, body);
}

/**
 * Look up customer profiles (nickname / avatar / gender / unionid) for one or more
 * external_userid values. Max 100 per call.
 *
 * Endpoint: POST /cgi-bin/kf/customer/batchget?access_token=AT
 * Returns: { customer_list: [{ external_userid, nickname, avatar, gender, unionid }] }
 *
 * Used to turn opaque wm_xxx IDs into human-readable names in conversation logs.
 */
async function batchGetCustomers({ accessToken, externalUseridList, needEnterSessionContext = 0, postFn }) {
  if (!accessToken) throw new Error('batchGetCustomers: accessToken required');
  if (!Array.isArray(externalUseridList) || externalUseridList.length === 0) {
    throw new Error('batchGetCustomers: externalUseridList must be a non-empty array');
  }
  if (externalUseridList.length > 100) {
    throw new Error('batchGetCustomers: max 100 ids per call');
  }
  const post = postFn || defaultPost;
  const path = `/cgi-bin/kf/customer/batchget?access_token=${encodeURIComponent(accessToken)}`;
  return post(path, {
    external_userid_list: externalUseridList,
    need_enter_session_context: needEnterSessionContext,
  });
}

/**
 * Get the current service_state for a (kf, user) conversation.
 * Used to decide whether we need to call trans before sending.
 *
 * service_state values:
 *   0 = unhandled (default for new conversations)
 *   1 = handled by smart assistant (our bot — this is the state we want)
 *   2 = waiting for human agent
 *   3 = being handled by human agent
 *   4 = ended
 */
async function getServiceState({ accessToken, openKfId, externalUserid, postFn }) {
  const post = postFn || defaultPost;
  const path = `/cgi-bin/kf/service_state/get?access_token=${encodeURIComponent(accessToken)}`;
  return post(path, { open_kfid: openKfId, external_userid: externalUserid });
}

/**
 * Transition a conversation to a new service_state.
 * To put a conversation in "smart assistant" mode (our bot replying), pass serviceState=1.
 * servicerUserid is required only when transitioning to state=3 (human agent).
 */
async function transServiceState({ accessToken, openKfId, externalUserid, serviceState, servicerUserid, postFn }) {
  const post = postFn || defaultPost;
  const path = `/cgi-bin/kf/service_state/trans?access_token=${encodeURIComponent(accessToken)}`;
  const body = {
    open_kfid: openKfId,
    external_userid: externalUserid,
    service_state: serviceState,
  };
  if (servicerUserid) body.servicer_userid = servicerUserid;
  return post(path, body);
}

/**
 * Push a text reply to a user from a kf account.
 * touser    = external_userid from the synced inbound message
 * openKfId  = open_kfid from the inbound message (which kf account is sending)
 *
 * Docs: /document/path/94677
 */
async function sendTextMsg({ accessToken, touser, openKfId, text, postFn }) {
  if (!accessToken) throw new Error('sendTextMsg: accessToken required');
  if (!touser) throw new Error('sendTextMsg: touser required');
  if (!openKfId) throw new Error('sendTextMsg: openKfId required');
  const post = postFn || defaultPost;
  const body = {
    touser,
    open_kfid: openKfId,
    msgtype: 'text',
    text: { content: String(text || '') },
  };
  const path = `/cgi-bin/kf/send_msg?access_token=${encodeURIComponent(accessToken)}`;
  return post(path, body);
}

/**
 * Push a media reply (file / image / voice / video) from a kf account to a user.
 * media_id comes from uploadMedia() — it identifies a file previously uploaded to wechat's
 * media storage, valid for 3 days.
 *
 * msgtype is one of: file | image | voice | video. The body field that wraps media_id
 * uses the same word as msgtype (so msgtype=file → body.file = { media_id }, etc.).
 */
async function sendMediaMsg({ accessToken, touser, openKfId, msgtype, mediaId, postFn }) {
  if (!accessToken) throw new Error('sendMediaMsg: accessToken required');
  if (!touser) throw new Error('sendMediaMsg: touser required');
  if (!openKfId) throw new Error('sendMediaMsg: openKfId required');
  if (!mediaId) throw new Error('sendMediaMsg: mediaId required');
  if (!['file', 'image', 'voice', 'video'].includes(msgtype)) {
    throw new Error('sendMediaMsg: unsupported msgtype ' + msgtype);
  }
  const post = postFn || defaultPost;
  const body = {
    touser,
    open_kfid: openKfId,
    msgtype,
    [msgtype]: { media_id: mediaId },
  };
  const path = `/cgi-bin/kf/send_msg?access_token=${encodeURIComponent(accessToken)}`;
  return post(path, body);
}

/**
 * Normalize a single kf sync_msg entry into the runtime event shape used by message_handler.
 *
 * Only `origin === 3` (user) entries are real customer messages; origin 4 is our own bot push
 * echo and origin 5 is human agent — both should be filtered upstream.
 *
 * kf msgtype values: text / image / voice / video / file / location / link / etc.
 * For non-text we stash a short placeholder so the downstream prompt is still meaningful,
 * but image/voice/file binaries are not pulled here (they need separate /cgi-bin/media/get).
 */
function normalizeKfMessage(msg) {
  if (!msg) return null;
  const msgtype = String(msg.msgtype || '');
  let text = '';
  if (msgtype === 'text') {
    text = (msg.text && msg.text.content) || '';
  } else if (msgtype === 'image') {
    text = '[图片]';
  } else if (msgtype === 'voice') {
    text = '[语音]';
  } else if (msgtype === 'video') {
    text = '[视频]';
  } else if (msgtype === 'file') {
    text = '[文件]';
  } else if (msgtype === 'location') {
    text = `[位置: ${(msg.location && msg.location.name) || ''}]`;
  } else if (msgtype === 'link') {
    text = `[链接: ${(msg.link && msg.link.title) || ''}]`;
  } else if (msgtype === 'event') {
    text = `[事件: ${(msg.event && msg.event.event_type) || ''}]`;
  } else {
    text = `[${msgtype || '未知消息类型'}]`;
  }

  const externalUserid = String(msg.external_userid || '');
  const openKfId = String(msg.open_kfid || '');
  const sendTime = Number(msg.send_time || 0);

  return {
    taskKey: externalUserid,
    chatId: externalUserid,
    senderId: externalUserid,
    messageId: String(msg.msgid || ''),
    text,
    chatType: 'p2p',
    attachments: [],
    parentId: '',
    rootId: '',
    createTime: sendTime > 1e12 ? sendTime : sendTime * 1000,
    mentions: [],
    from: 0,           // sync_msg only returns user-direction unless origin says otherwise
    channel: 9,        // 微信客服 channel
    appId: openKfId,
    openKfId,
    msgtype,
    origin: Number(msg.origin || 0),
    rawMsg: msg,
  };
}

module.exports = {
  syncMsg,
  sendTextMsg,
  sendMediaMsg,
  batchGetCustomers,
  getServiceState,
  transServiceState,
  normalizeKfMessage,
};
