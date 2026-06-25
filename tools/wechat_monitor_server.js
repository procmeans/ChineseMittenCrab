const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseWechatLog } = require('./lib/monitor/wechat_log_parser');
const { renderWechatDashboard } = require('./lib/monitor/wechat_dashboard_render');

const DEFAULT_LOG_PATH = path.join(
  os.homedir(),
  'Library', 'Logs', 'cmr', 'cmr.wechat-default.log'
);

function readLogSafely(logPath) {
  try {
    const stat = fs.statSync(logPath);
    const text = fs.readFileSync(logPath, 'utf8');
    return { text, mtimeMs: stat.mtimeMs, exists: true };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { text: '', mtimeMs: null, exists: false };
    }
    throw err;
  }
}

function createWechatMonitorServer(options = {}) {
  const logPath = options.logPath || DEFAULT_LOG_PATH;
  const refreshSeconds = options.refreshSeconds || 10;
  const maxEvents = options.maxEvents || 200;
  const reader = options.reader || (() => readLogSafely(logPath));

  return http.createServer((req, res) => {
    if (req.url === '/health') {
      const { exists, mtimeMs } = reader();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: exists, logPath, mtimeMs }));
      return;
    }

    if (req.url === '/' || req.url.startsWith('/?')) {
      const { text, mtimeMs, exists } = reader();
      const parsed = exists
        ? parseWechatLog(text, { maxEvents })
        : { events: [], stats: { totalEvents: 0, userMessages: 0, botReplies: 0, uniqueUsers: 0 } };
      const html = renderWechatDashboard(parsed, {
        refreshSeconds,
        logPath,
        logMtime: mtimeMs,
        generatedAt: Date.now(),
      });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });
}

function parseCliArgs(argv) {
  const args = { port: 3001, logPath: DEFAULT_LOG_PATH };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--port' && argv[i + 1]) { args.port = Number(argv[++i]); }
    else if (a === '--log' && argv[i + 1]) { args.logPath = argv[++i]; }
  }
  return args;
}

if (require.main === module) {
  const args = parseCliArgs(process.argv);
  const server = createWechatMonitorServer({ logPath: args.logPath });
  server.listen(args.port, '127.0.0.1', () => {
    console.log('WECHAT_MONITOR_LISTENING port=' + args.port + ' log=' + args.logPath);
  });
}

module.exports = {
  createWechatMonitorServer,
  parseCliArgs,
  DEFAULT_LOG_PATH,
};
