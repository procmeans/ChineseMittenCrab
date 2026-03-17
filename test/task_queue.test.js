const test = require('node:test');
const assert = require('node:assert/strict');

const { createTaskQueue } = require('../tools/lib/runtime/task_queue');

test('task queue runs same-scope work sequentially', async () => {
  const queue = createTaskQueue();
  const order = [];
  let releaseFirst;
  const firstReady = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.enqueue('scope-a', async () => {
    await firstReady;
    order.push('a');
  });

  const second = queue.enqueue('scope-a', async () => {
    order.push('b');
  });

  releaseFirst();
  await Promise.all([first, second]);

  assert.deepEqual(order, ['a', 'b']);
});
