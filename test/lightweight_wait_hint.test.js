const test = require('node:test');
const assert = require('node:assert/strict');

const { createDelayedWaitNotice } = require('../tools/lib/runtime/lightweight_wait_hint');

test('simple question schedules a delayed wait hint', async () => {
  const timers = [];
  const sentMessages = [];

  const notice = createDelayedWaitNotice(
    {
      setTimeout: (fn, delayMs) => {
        timers.push({ fn, delayMs });
        return 'timer-1';
      },
      clearTimeout: () => {},
      sendNotice: async (payload) => {
        sentMessages.push(payload);
      },
    },
    {
      delayMs: 1500,
      message: 'Thinking...',
    }
  );

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delayMs, 1500);

  await timers[0].fn();

  assert.equal(notice.sent, true);
  assert.equal(sentMessages[0].message, 'Thinking...');
});
