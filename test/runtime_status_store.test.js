const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRuntimeStatusStore,
} = require('../tools/lib/monitor/runtime_status_store');

test('status store writes heartbeat snapshots', () => {
  const store = createRuntimeStatusStore({
    account: 'default',
    now: () => 1700000000000,
  });

  store.markBusy({ taskKey: 'oc_group::ou_user' });
  const snapshot = store.getSnapshot();

  assert.equal(snapshot.account, 'default');
  assert.equal(snapshot.status, 'busy');
  assert.equal(snapshot.taskKey, 'oc_group::ou_user');
  assert.equal(snapshot.updatedAt, 1700000000000);
});
