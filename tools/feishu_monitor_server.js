const http = require('node:http');

const {
  renderMonitorDashboard,
} = require('./lib/monitor/monitor_snapshot');

function createFeishuMonitorServer(options = {}) {
  const statusStore = options.statusStore || {
    getSnapshot() {
      return {
        account: 'default',
        status: 'idle',
        updatedAt: Date.now(),
      };
    },
  };

  return http.createServer((req, res) => {
    const snapshot = statusStore.getSnapshot();

    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, status: snapshot.status }));
      return;
    }

    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderMonitorDashboard(snapshot));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });
}

module.exports = {
  createFeishuMonitorServer,
};
