const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isFollowUpWindowOpen,
  refreshFollowUpWindow,
} = require('../tools/lib/runtime/follow_up_window');

test('successful final reply refreshes the follow-up window', () => {
  const now = Date.parse('2026-03-17T11:00:00.000Z');
  const state = {};

  refreshFollowUpWindow(state, {
    now,
    ttlMs: 60000,
  });

  assert.equal(state.expiresAt > now, true);
  assert.equal(isFollowUpWindowOpen(state, now + 1), true);
});
