const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureChatState,
  getCurrentThread,
  setCurrentThread,
} = require('../tools/lib/runtime/thread_state');

test('thread state preserves active thread info', () => {
  const states = new Map();
  const state = ensureChatState(states, 'oc_group::ou_user');

  setCurrentThread(state, { id: 't1', accountName: 'default' });

  assert.equal(states.get('oc_group::ou_user'), state);
  assert.equal(getCurrentThread(state).id, 't1');
  assert.equal(getCurrentThread(state).accountName, 'default');
});
