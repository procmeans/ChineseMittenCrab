const test = require('node:test');
const assert = require('node:assert/strict');

const fixture = require('./fixtures/feishu/group-at.json');
const {
  normalizeIncomingFeishuEvent,
} = require('../tools/lib/platform/feishu/event_projection');

test('group mention fixture becomes a normalized runtime event', () => {
  const normalized = normalizeIncomingFeishuEvent(fixture);

  assert.equal(normalized.taskKey, 'oc_group::ou_user');
  assert.equal(normalized.chatId, 'oc_group');
  assert.equal(normalized.senderId, 'ou_user');
  assert.equal(normalized.messageId, 'om_message');
  assert.equal(normalized.text, '@CMR hello from group');
});
