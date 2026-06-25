const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createWechatMonitorServer } = require('../tools/wechat_monitor_server');

function request(port, route) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: route }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

test('wechat monitor serves dashboard and health from injected log reader', async (t) => {
  const fakeLog = [
    'MSG_RECV payload={"CreateTime":"1779532444"}',
    'KF_USER_MSG userid=wm_AAA nickname="小草爷爷" openKfId=wk_X msgid=M1 msgtype=text text="你好"',
    'KF_SEND msgtype=text touser=wm_AAA nickname="小草爷爷" openKfId=wk_X ok=true text="收到" resp={"errcode":0}',
  ].join('\n');

  const server = createWechatMonitorServer({
    logPath: '/fake/path.log',
    reader: () => ({ text: fakeLog, mtimeMs: 1779532500000, exists: true }),
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const port = server.address().port;

  const health = await request(port, '/health');
  assert.equal(health.statusCode, 200);
  assert.match(health.body, /"ok":true/);

  const dashboard = await request(port, '/');
  assert.equal(dashboard.statusCode, 200);
  assert.match(dashboard.body, /小草爷爷/);
  assert.match(dashboard.body, /你好/);
  assert.match(dashboard.body, /收到/);
  assert.match(dashboard.body, /微信客服会话监控/);

  const notFound = await request(port, '/nope');
  assert.equal(notFound.statusCode, 404);
});

test('wechat monitor shows empty state when log is missing', async (t) => {
  const server = createWechatMonitorServer({
    logPath: '/missing.log',
    reader: () => ({ text: '', mtimeMs: null, exists: false }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const health = await request(port, '/health');
  assert.match(health.body, /"ok":false/);

  const dashboard = await request(port, '/');
  assert.match(dashboard.body, /日志里还没有消息/);
});
