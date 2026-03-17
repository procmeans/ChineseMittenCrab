const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createFeishuMonitorServer } = require('../tools/feishu_monitor_server');

function request(port, route) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: route,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body,
          });
        });
      }
    );

    req.on('error', reject);
  });
}

test('monitor server serves health and dashboard routes', async (t) => {
  const server = createFeishuMonitorServer({
    statusStore: {
      getSnapshot: () => ({
        account: 'default',
        status: 'idle',
        updatedAt: 1700000000000,
      }),
    },
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const health = await request(port, '/health');
  const dashboard = await request(port, '/');

  assert.equal(health.statusCode, 200);
  assert.match(health.body, /ok/);
  assert.equal(dashboard.statusCode, 200);
  assert.match(dashboard.body, /default/);
});
