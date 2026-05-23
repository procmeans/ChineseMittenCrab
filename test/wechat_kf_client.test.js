const { describe, it } = require('node:test');
const assert = require('node:assert');
const { syncMsg, sendTextMsg, normalizeKfMessage } = require('../tools/lib/platform/wechat/kf_client');

describe('wechat/kf_client', () => {
  describe('syncMsg', () => {
    it('throws when accessToken or token missing', async () => {
      await assert.rejects(() => syncMsg({ token: 't' }), /accessToken required/);
      await assert.rejects(() => syncMsg({ accessToken: 'at' }), /token required/);
    });

    it('POSTs to /cgi-bin/kf/sync_msg with token in body and access_token in query', async () => {
      let captured;
      await syncMsg({
        accessToken: 'AT123',
        token: 'sync_token_xyz',
        openKfId: 'wk_kfid',
        postFn: (path, body) => {
          captured = { path, body };
          return Promise.resolve({ errcode: 0, msg_list: [] });
        },
      });
      assert.match(captured.path, /\/cgi-bin\/kf\/sync_msg\?access_token=AT123/);
      assert.strictEqual(captured.body.token, 'sync_token_xyz');
      assert.strictEqual(captured.body.open_kfid, 'wk_kfid');
      assert.strictEqual(captured.body.limit, 1000);
    });

    it('omits cursor and open_kfid from body when not provided', async () => {
      let captured;
      await syncMsg({
        accessToken: 'AT',
        token: 'T',
        postFn: (path, body) => { captured = body; return Promise.resolve({ errcode: 0 }); },
      });
      assert.strictEqual(captured.cursor, undefined);
      assert.strictEqual(captured.open_kfid, undefined);
    });
  });

  describe('sendTextMsg', () => {
    it('throws when required params missing', async () => {
      await assert.rejects(() => sendTextMsg({ touser: 'u', openKfId: 'k', text: 'x' }), /accessToken required/);
      await assert.rejects(() => sendTextMsg({ accessToken: 'AT', openKfId: 'k', text: 'x' }), /touser required/);
      await assert.rejects(() => sendTextMsg({ accessToken: 'AT', touser: 'u', text: 'x' }), /openKfId required/);
    });

    it('POSTs to /cgi-bin/kf/send_msg with msgtype=text and the right body shape', async () => {
      let captured;
      await sendTextMsg({
        accessToken: 'AT',
        touser: 'wmExternalId',
        openKfId: 'wk_kfid',
        text: '你好世界',
        postFn: (path, body) => { captured = { path, body }; return Promise.resolve({ errcode: 0, msgid: 'sent_001' }); },
      });
      assert.match(captured.path, /\/cgi-bin\/kf\/send_msg\?access_token=AT/);
      assert.deepStrictEqual(captured.body, {
        touser: 'wmExternalId',
        open_kfid: 'wk_kfid',
        msgtype: 'text',
        text: { content: '你好世界' },
      });
    });

    it('coerces null/undefined text to empty string (caller bug must not crash the call)', async () => {
      let captured;
      await sendTextMsg({
        accessToken: 'AT', touser: 'u', openKfId: 'k', text: undefined,
        postFn: (path, body) => { captured = body; return Promise.resolve({ errcode: 0 }); },
      });
      assert.strictEqual(captured.text.content, '');
    });
  });

  describe('sendMediaMsg', () => {
    const { sendMediaMsg } = require('../tools/lib/platform/wechat/kf_client');

    it('throws when required fields are missing', async () => {
      await assert.rejects(() => sendMediaMsg({ touser: 'u', openKfId: 'k', msgtype: 'file', mediaId: 'M' }), /accessToken required/);
      await assert.rejects(() => sendMediaMsg({ accessToken: 'AT', openKfId: 'k', msgtype: 'file', mediaId: 'M' }), /touser required/);
      await assert.rejects(() => sendMediaMsg({ accessToken: 'AT', touser: 'u', msgtype: 'file', mediaId: 'M' }), /openKfId required/);
      await assert.rejects(() => sendMediaMsg({ accessToken: 'AT', touser: 'u', openKfId: 'k', mediaId: 'M' }), /unsupported msgtype/);
      await assert.rejects(() => sendMediaMsg({ accessToken: 'AT', touser: 'u', openKfId: 'k', msgtype: 'file' }), /mediaId required/);
    });

    it('rejects unsupported msgtypes', async () => {
      await assert.rejects(
        () => sendMediaMsg({ accessToken: 'AT', touser: 'u', openKfId: 'k', msgtype: 'text', mediaId: 'M' }),
        /unsupported msgtype text/
      );
    });

    it('builds the right body shape for each media type (file/image/voice/video)', async () => {
      for (const msgtype of ['file', 'image', 'voice', 'video']) {
        let captured;
        await sendMediaMsg({
          accessToken: 'AT', touser: 'u', openKfId: 'k', msgtype, mediaId: 'MID',
          postFn: (path, body) => { captured = { path, body }; return Promise.resolve({ errcode: 0, msgid: 'm1' }); },
        });
        assert.match(captured.path, /\/cgi-bin\/kf\/send_msg\?access_token=AT/);
        assert.strictEqual(captured.body.touser, 'u');
        assert.strictEqual(captured.body.open_kfid, 'k');
        assert.strictEqual(captured.body.msgtype, msgtype);
        // The wrapper field is named the same as the msgtype
        assert.deepStrictEqual(captured.body[msgtype], { media_id: 'MID' });
      }
    });
  });

  describe('normalizeKfMessage', () => {
    it('maps a text message to runtime event shape with channel=9 and openKfId set', () => {
      const msg = {
        msgid: 'wm_msg_001',
        open_kfid: 'wk_bO_open_kf',
        external_userid: 'wm_user_abc',
        send_time: 1710000000,
        origin: 3,
        msgtype: 'text',
        text: { content: '你好' },
      };
      const e = normalizeKfMessage(msg);
      assert.strictEqual(e.text, '你好');
      assert.strictEqual(e.senderId, 'wm_user_abc');
      assert.strictEqual(e.taskKey, 'wm_user_abc');
      assert.strictEqual(e.messageId, 'wm_msg_001');
      assert.strictEqual(e.chatType, 'p2p');
      assert.strictEqual(e.channel, 9);
      assert.strictEqual(e.openKfId, 'wk_bO_open_kf');
      assert.strictEqual(e.createTime, 1710000000000);
      assert.strictEqual(e.origin, 3);
    });

    it('returns null for falsy input', () => {
      assert.strictEqual(normalizeKfMessage(null), null);
      assert.strictEqual(normalizeKfMessage(undefined), null);
    });

    it('emits placeholder text for image/voice/file so prompt is non-empty', () => {
      assert.strictEqual(normalizeKfMessage({ msgtype: 'image' }).text, '[图片]');
      assert.strictEqual(normalizeKfMessage({ msgtype: 'voice' }).text, '[语音]');
      assert.strictEqual(normalizeKfMessage({ msgtype: 'file' }).text, '[文件]');
    });

    it('surfaces origin so caller can filter out bot-echo (origin=4) and agent (origin=5)', () => {
      const userMsg = normalizeKfMessage({ msgtype: 'text', text: {content: 'hi'}, origin: 3 });
      const botEcho = normalizeKfMessage({ msgtype: 'text', text: {content: 'hi'}, origin: 4 });
      const agentMsg = normalizeKfMessage({ msgtype: 'text', text: {content: 'hi'}, origin: 5 });
      assert.strictEqual(userMsg.origin, 3);
      assert.strictEqual(botEcho.origin, 4);
      assert.strictEqual(agentMsg.origin, 5);
    });
  });
});
