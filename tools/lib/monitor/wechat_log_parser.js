// Parse cmr wechat bot log text into a chronological list of conversation events.
// Recognized line types:
//   MSG_RECV payload={"...","CreateTime":"1779532444",...}     -> updates current batch timestamp
//   KF_USER_MSG userid=... nickname="..." openKfId=... msgid=... msgtype=... text="..."
//   KF_SEND msgtype=... touser=... nickname="..." openKfId=... ok=true text="..." resp={...}
// All other lines are ignored. text= values are JSON-quoted and may contain newlines/emoji/CJK.

const JSON_STRING_RE = /"(?:[^"\\]|\\.)*"/.source;

function captureBare(line, key) {
  const m = line.match(new RegExp('(?:^|\\s)' + key + '=(\\S+)'));
  return m ? m[1] : null;
}

function captureJsonString(line, key) {
  const m = line.match(new RegExp('(?:^|\\s)' + key + '=(' + JSON_STRING_RE + ')'));
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function captureTrailingText(line) {
  // text= is JSON-quoted and runs to end-of-line on user lines.
  const m = line.match(new RegExp('\\stext=(' + JSON_STRING_RE + ')\\s*$'));
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function parseMsgRecvTimestamp(line) {
  // CreateTime is a Unix timestamp in seconds, quoted as a JSON string.
  const m = line.match(/"CreateTime":"(\d+)"/);
  if (!m) return null;
  const seconds = Number(m[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds * 1000;
}

function parseUserLine(line, approxTimeMs) {
  const userid = captureBare(line, 'userid');
  if (!userid) return null;
  const nickname = captureJsonString(line, 'nickname') || '';
  const openKfId = captureBare(line, 'openKfId');
  const msgid = captureBare(line, 'msgid');
  const msgtype = captureBare(line, 'msgtype');
  const text = captureTrailingText(line);
  return {
    type: 'user',
    userid,
    nickname,
    openKfId,
    msgid,
    msgtype,
    text,
    approxTimeMs,
  };
}

function parseBotLine(line, approxTimeMs) {
  const msgtype = captureBare(line, 'msgtype');
  const touser = captureBare(line, 'touser');
  if (!touser) return null;
  const nickname = captureJsonString(line, 'nickname') || '';
  const openKfId = captureBare(line, 'openKfId');
  const okRaw = captureBare(line, 'ok');
  // Strip ` resp={...}` (may itself contain text=) before extracting our text=.
  const respIdx = line.indexOf(' resp=');
  const beforeResp = respIdx >= 0 ? line.slice(0, respIdx) : line;
  const text = captureTrailingText(beforeResp);
  return {
    type: 'bot',
    msgtype,
    touser,
    nickname,
    openKfId,
    ok: okRaw === 'true',
    text,
    approxTimeMs,
  };
}

function parseWechatLog(text, options = {}) {
  const maxEvents = options.maxEvents || 200;
  const lines = String(text || '').split(/\r?\n/);
  const events = [];
  let currentBatchTimeMs = null;

  for (const line of lines) {
    if (line.startsWith('MSG_RECV ')) {
      const ts = parseMsgRecvTimestamp(line);
      if (ts) currentBatchTimeMs = ts;
      continue;
    }
    if (line.startsWith('KF_USER_MSG ')) {
      const ev = parseUserLine(line, currentBatchTimeMs);
      if (ev) events.push(ev);
      continue;
    }
    if (line.startsWith('KF_SEND ')) {
      const ev = parseBotLine(line, currentBatchTimeMs);
      if (ev && ev.ok) events.push(ev);
      continue;
    }
  }

  const trimmed = events.length > maxEvents ? events.slice(-maxEvents) : events;
  const userCount = trimmed.filter((e) => e.type === 'user').length;
  const botCount = trimmed.filter((e) => e.type === 'bot').length;
  const uniqueUsers = new Set(
    trimmed.filter((e) => e.type === 'user').map((e) => e.userid)
  );

  return {
    events: trimmed,
    stats: {
      totalEvents: trimmed.length,
      userMessages: userCount,
      botReplies: botCount,
      uniqueUsers: uniqueUsers.size,
    },
  };
}

module.exports = {
  parseWechatLog,
};
