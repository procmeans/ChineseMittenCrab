const { createMonitorSnapshot } = require('./monitor_snapshot');

function createRuntimeStatusStore(options = {}) {
  const account = options.account || 'default';
  const now = options.now || Date.now;
  let snapshot = createMonitorSnapshot({
    account,
    status: 'idle',
    updatedAt: now(),
  });

  function update(nextFields) {
    snapshot = createMonitorSnapshot({
      ...snapshot,
      ...nextFields,
      account,
      updatedAt: now(),
    });

    return snapshot;
  }

  return {
    markIdle(input = {}) {
      return update({
        status: 'idle',
        taskKey: input.taskKey || null,
        error: null,
      });
    },
    markBusy(input = {}) {
      return update({
        status: 'busy',
        taskKey: input.taskKey || null,
        error: null,
      });
    },
    markError(input = {}) {
      return update({
        status: 'error',
        taskKey: input.taskKey || null,
        error: input.error || 'unknown',
      });
    },
    getSnapshot() {
      return snapshot;
    },
  };
}

module.exports = {
  createRuntimeStatusStore,
};
