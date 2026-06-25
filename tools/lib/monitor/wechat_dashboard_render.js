function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  );
}

function renderWechatDashboard(parsed, meta = {}) {
  const events = (parsed && parsed.events) || [];
  const stats = (parsed && parsed.stats) || {};
  const refreshSeconds = meta.refreshSeconds || 10;
  const logPath = meta.logPath || '';
  const logMtime = meta.logMtime || null;
  const generatedAt = meta.generatedAt || Date.now();

  const ordered = events.slice().reverse();

  const rows = ordered.map((ev) => {
    const isUser = ev.type === 'user';
    const cls = isUser ? 'msg user' : 'msg bot';
    const who = isUser
      ? (ev.nickname || ev.userid || '(unknown)')
      : 'bot → ' + (ev.nickname || ev.touser || '(unknown)');
    const idChip = isUser
      ? '<code class="id">' + escapeHtml(ev.userid || '') + '</code>'
      : '<code class="id">' + escapeHtml(ev.touser || '') + '</code>';
    const typeChip = ev.msgtype
      ? '<span class="chip">' + escapeHtml(ev.msgtype) + '</span>'
      : '';
    const timeStr = formatTime(ev.approxTimeMs);
    const body = ev.text || '(no text)';
    return [
      '<div class="' + cls + '">',
      '<div class="meta">',
      '<span class="time">' + escapeHtml(timeStr) + '</span>',
      '<span class="who">' + escapeHtml(who) + '</span>',
      idChip,
      typeChip,
      '</div>',
      '<div class="body">' + escapeHtml(body) + '</div>',
      '</div>',
    ].join('');
  }).join('\n');

  const empty = events.length === 0
    ? '<p class="empty">日志里还没有消息。等微信用户发条消息再刷新。</p>'
    : '';

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta http-equiv="refresh" content="' + refreshSeconds + '">',
    '<title>CMR 微信客服监控</title>',
    '<style>',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;',
    '  background:#0f1115;color:#e6e6e6;margin:0;padding:24px;max-width:920px;margin:0 auto;}',
    'header{border-bottom:1px solid #2a2d34;padding-bottom:12px;margin-bottom:18px;}',
    'h1{margin:0 0 8px 0;font-size:18px;font-weight:600;color:#fff;}',
    '.stats{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:#9aa0aa;}',
    '.stats b{color:#e6e6e6;font-weight:600;}',
    '.msg{padding:10px 12px;margin:6px 0;border-radius:8px;border:1px solid #2a2d34;}',
    '.msg.user{background:#11161d;}',
    '.msg.bot{background:#0d1a14;border-color:#1f3a2b;}',
    '.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:#7d8794;margin-bottom:6px;}',
    '.time{font-variant-numeric:tabular-nums;}',
    '.who{font-weight:600;color:#cfd6df;}',
    '.msg.bot .who{color:#7fdca0;}',
    '.id{font-size:10px;color:#5d6571;background:#1a1e26;padding:1px 5px;border-radius:3px;}',
    '.chip{font-size:10px;color:#5d6571;background:#1a1e26;padding:1px 5px;border-radius:3px;}',
    '.body{font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#e6e6e6;}',
    '.empty{color:#7d8794;font-style:italic;}',
    'footer{margin-top:24px;font-size:11px;color:#5d6571;}',
    '</style>',
    '</head>',
    '<body>',
    '<header>',
    '<h1>微信客服会话监控</h1>',
    '<div class="stats">',
    '<span>消息 <b>' + (stats.userMessages || 0) + '</b></span>',
    '<span>回复 <b>' + (stats.botReplies || 0) + '</b></span>',
    '<span>不同用户 <b>' + (stats.uniqueUsers || 0) + '</b></span>',
    '<span>每 ' + refreshSeconds + 's 自动刷新</span>',
    '</div>',
    '</header>',
    empty,
    rows,
    '<footer>',
    'log: <code>' + escapeHtml(logPath) + '</code>',
    logMtime ? ' · 日志更新于 ' + escapeHtml(formatTime(logMtime)) : '',
    ' · 页面生成于 ' + escapeHtml(formatTime(generatedAt)),
    '</footer>',
    '</body>',
    '</html>',
  ].join('\n');
}

module.exports = {
  renderWechatDashboard,
};
