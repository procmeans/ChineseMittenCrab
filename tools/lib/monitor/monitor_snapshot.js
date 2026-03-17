function createMonitorSnapshot(input = {}) {
  return {
    account: input.account || 'default',
    status: input.status || 'idle',
    taskKey: input.taskKey || null,
    error: input.error || null,
    updatedAt: input.updatedAt || Date.now(),
  };
}

function renderMonitorDashboard(snapshot) {
  return [
    '<!doctype html>',
    '<html>',
    '<head><title>CMR Monitor</title></head>',
    '<body>',
    `<h1>ChineseMittenCrab Monitor</h1>`,
    `<p>account: ${snapshot.account}</p>`,
    `<p>status: ${snapshot.status}</p>`,
    `<p>updatedAt: ${snapshot.updatedAt}</p>`,
    '</body>',
    '</html>',
  ].join('');
}

module.exports = {
  createMonitorSnapshot,
  renderMonitorDashboard,
};
