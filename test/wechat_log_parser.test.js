const test = require('node:test');
const assert = require('node:assert/strict');

const { parseWechatLog } = require('../tools/lib/monitor/wechat_log_parser');

const SAMPLE = [
  'ENGINE_SELECTED account=default engine=claude',
  'HTTP_HIT POST /?msg_signature=abc&timestamp=1779532444',
  'MSG_RECV payload={"ToUserName":"ww245950","CreateTime":"1779532444","MsgType":"event"}',
  'KF_SYNC_NEEDED openKfId=wk_X token=Y',
  'KF_SYNC_OK count=2 has_more=0',
  'KF_USER_MSG userid=wm_AAA nickname="小草爷爷" openKfId=wk_X msgid=M1 msgtype=text text="你好"',
  'KF_SKIP_ORIGIN origin=4 msgid=X',
  'KF_SEND msgtype=text touser=wm_AAA nickname="小草爷爷" openKfId=wk_X ok=true text="⏳ 收到" resp={"errcode":0}',
  'KF_USER_MSG userid=wm_BBB nickname="bravefanfan👍" openKfId=wk_X msgid=M2 msgtype=text text="怎么样了"',
  'MSG_RECV payload={"ToUserName":"ww245950","CreateTime":"1779532500"}',
  'KF_USER_MSG userid=wm_AAA nickname="小草爷爷" openKfId=wk_X msgid=M3 msgtype=text text="你是谁"',
  'KF_SEND msgtype=text touser=wm_AAA nickname="小草爷爷" openKfId=wk_X ok=false text="ignored failure" resp={"errcode":99}',
].join('\n');

test('parseWechatLog extracts user and bot events with batch timestamps', () => {
  const parsed = parseWechatLog(SAMPLE);
  assert.equal(parsed.events.length, 4); // 3 user + 1 successful bot send (failed bot is dropped)
  assert.equal(parsed.stats.userMessages, 3);
  assert.equal(parsed.stats.botReplies, 1);
  assert.equal(parsed.stats.uniqueUsers, 2);

  const firstUser = parsed.events[0];
  assert.equal(firstUser.type, 'user');
  assert.equal(firstUser.userid, 'wm_AAA');
  assert.equal(firstUser.nickname, '小草爷爷');
  assert.equal(firstUser.text, '你好');
  assert.equal(firstUser.approxTimeMs, 1779532444 * 1000);

  const bot = parsed.events.find((e) => e.type === 'bot');
  assert.equal(bot.touser, 'wm_AAA');
  assert.equal(bot.text, '⏳ 收到');
  assert.equal(bot.ok, true);

  const m3 = parsed.events.find((e) => e.msgid === 'M3');
  assert.equal(m3.approxTimeMs, 1779532500 * 1000); // picked up new batch timestamp
});

test('parseWechatLog handles emoji nicknames and ignores non-conversation lines', () => {
  const parsed = parseWechatLog(SAMPLE);
  const fan = parsed.events.find((e) => e.userid === 'wm_BBB');
  assert.equal(fan.nickname, 'bravefanfan👍');
  assert.equal(fan.text, '怎么样了');
});

test('parseWechatLog handles empty input', () => {
  const parsed = parseWechatLog('');
  assert.deepEqual(parsed.events, []);
  assert.equal(parsed.stats.uniqueUsers, 0);
});

test('parseWechatLog trims to maxEvents (keeps newest)', () => {
  const lines = [];
  for (let i = 0; i < 10; i += 1) {
    lines.push('KF_USER_MSG userid=wm_X openKfId=wk_X msgid=M' + i + ' msgtype=text text="t' + i + '"');
  }
  const parsed = parseWechatLog(lines.join('\n'), { maxEvents: 3 });
  assert.equal(parsed.events.length, 3);
  assert.equal(parsed.events[0].msgid, 'M7');
  assert.equal(parsed.events[2].msgid, 'M9');
});
