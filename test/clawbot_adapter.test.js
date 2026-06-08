const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeIncomingClawbotEvent,
} = require('../tools/lib/platform/clawbot/event_projection');
const {
  createClawbotReplyGateway,
} = require('../tools/lib/platform/clawbot/reply_gateway');

test('normalizes ClawBot bridge messages into runtime events', () => {
  const event = normalizeIncomingClawbotEvent({
    account_id: 'acct_1',
    user_id: 'user_1',
    message_id: 'msg_1',
    text: '你好',
    timestamp: 1710000000,
    media: [{ type: 'image', file_path: '/tmp/a.jpg' }],
  });

  assert.equal(event.taskKey, 'acct_1::user_1');
  assert.equal(event.chatId, 'user_1');
  assert.equal(event.senderId, 'user_1');
  assert.equal(event.messageId, 'msg_1');
  assert.equal(event.text, '你好');
  assert.equal(event.chatType, 'p2p');
  assert.equal(event.createTime, 1710000000000);
  assert.deepEqual(event.files, [{ type: 'image', filePath: '/tmp/a.jpg' }]);
  assert.equal(event.quotedText, '');
});

test('ClawBot reply gateway routes text and files through the bridge', async () => {
  const calls = [];
  const bridge = {
    sendText: async (payload) => {
      calls.push(['text', payload]);
      return { replyMessageId: 'reply_1' };
    },
    sendFile: async (payload) => {
      calls.push(['file', payload]);
      return { replyMessageId: 'reply_2' };
    },
  };
  const routing = new Map([
    ['msg_1', { accountId: 'acct_1', userId: 'user_1' }],
  ]);
  const gateway = createClawbotReplyGateway(bridge, routing);

  const textResp = await gateway.sendReply('msg_1', { text: 'hello' });
  const fileResp = await gateway.sendFileReply('msg_1', '/tmp/report.csv');

  assert.equal(textResp.replyMessageId, 'reply_1');
  assert.equal(fileResp.replyMessageId, 'reply_2');
  assert.deepEqual(calls, [
    ['text', { accountId: 'acct_1', userId: 'user_1', text: 'hello' }],
    ['file', { accountId: 'acct_1', userId: 'user_1', filePath: '/tmp/report.csv' }],
  ]);
});
