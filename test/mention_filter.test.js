const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldIgnoreMessage } = require('../tools/lib/runtime/mention_filter');

const SELF = 'ou_self_open_id';
const OTHER_BOT = 'ou_other_bot_open_id';

function groupEvent(overrides = {}) {
  return {
    chatType: 'group',
    taskKey: 'chat-1::user-1',
    mentions: [],
    ...overrides,
  };
}

test('p2p messages are never ignored', () => {
  const event = { chatType: 'p2p', taskKey: 'user-1', mentions: [] };
  assert.equal(shouldIgnoreMessage(event, { selfOpenId: SELF }), false);
});

test('group message @ self is not ignored', () => {
  const event = groupEvent({
    mentions: [{ id: { open_id: SELF }, name: '我自己', mentioned_type: 'bot' }],
  });
  assert.equal(shouldIgnoreMessage(event, { selfOpenId: SELF }), false);
});

test('group message @ another bot is ignored', () => {
  const event = groupEvent({
    mentions: [{ id: { open_id: OTHER_BOT }, name: '别的机器人', mentioned_type: 'bot' }],
  });
  assert.equal(shouldIgnoreMessage(event, { selfOpenId: SELF }), true);
});

test('group message with no mentions is ignored when no follow-up window', () => {
  const event = groupEvent({ mentions: [] });
  assert.equal(shouldIgnoreMessage(event, { selfOpenId: SELF }), true);
});

test('group message without mention but inside follow-up window is not ignored', () => {
  const followUpStates = new Map([
    ['chat-1::user-1', { expiresAt: Date.now() + 60_000 }],
  ]);
  const event = groupEvent({ mentions: [] });
  assert.equal(
    shouldIgnoreMessage(event, { selfOpenId: SELF, followUpStates }),
    false
  );
});

test('expired follow-up window does not save an un-addressed message', () => {
  const followUpStates = new Map([
    ['chat-1::user-1', { expiresAt: Date.now() - 1000 }],
  ]);
  const event = groupEvent({ mentions: [] });
  assert.equal(
    shouldIgnoreMessage(event, { selfOpenId: SELF, followUpStates }),
    true
  );
});

test('empty selfOpenId disables the filter (fallback to legacy accept-all behavior)', () => {
  const event = groupEvent({ mentions: [] });
  assert.equal(shouldIgnoreMessage(event, { selfOpenId: '' }), false);
});

test('ignoreUnmentioned=false disables the filter even when selfOpenId is set', () => {
  const event = groupEvent({ mentions: [] });
  assert.equal(
    shouldIgnoreMessage(event, { selfOpenId: SELF, ignoreUnmentioned: false }),
    false
  );
});

test('mention without id.open_id is safely skipped', () => {
  const event = groupEvent({
    mentions: [{ key: '@_user_1', name: '某人' }],
  });
  assert.equal(shouldIgnoreMessage(event, { selfOpenId: SELF }), true);
});
