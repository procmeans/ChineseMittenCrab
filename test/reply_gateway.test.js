const test = require('node:test');
const assert = require('node:assert/strict');

const { createReplyGateway } = require('../tools/lib/platform/feishu/reply_gateway');

test('sendTextReply delegates to client.replyText', async () => {
  const calls = [];
  const client = {
    replyText: async (messageId, text) => {
      calls.push({ method: 'replyText', messageId, text });
      return { code: 0 };
    },
    replyCard: async () => {},
  };

  const gw = createReplyGateway(client);
  await gw.sendTextReply('msg-1', 'hello');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].messageId, 'msg-1');
  assert.equal(calls[0].text, 'hello');
});

test('sendCardReply delegates to client.replyCard', async () => {
  const calls = [];
  const client = {
    replyText: async () => {},
    replyCard: async (messageId, card) => {
      calls.push({ method: 'replyCard', messageId, card });
      return { code: 0 };
    },
  };

  const gw = createReplyGateway(client);
  const card = { header: {}, elements: [] };
  await gw.sendCardReply('msg-2', card);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].messageId, 'msg-2');
  assert.deepEqual(calls[0].card, card);
});

test('sendReply routes interactive mode to sendCardReply', async () => {
  const calls = [];
  const client = {
    replyText: async (messageId, text) => {
      calls.push({ method: 'replyText', messageId, text });
    },
    replyCard: async (messageId, card) => {
      calls.push({ method: 'replyCard', messageId, card });
    },
  };

  const gw = createReplyGateway(client);
  const card = { header: {}, elements: [] };
  await gw.sendReply('msg-3', { mode: 'interactive', card });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'replyCard');
  assert.deepEqual(calls[0].card, card);
});

test('sendReply routes text mode to sendTextReply', async () => {
  const calls = [];
  const client = {
    replyText: async (messageId, text) => {
      calls.push({ method: 'replyText', messageId, text });
    },
    replyCard: async () => {},
  };

  const gw = createReplyGateway(client);
  await gw.sendReply('msg-4', { mode: 'text', text: 'plain reply' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'replyText');
  assert.equal(calls[0].text, 'plain reply');
});

test('sendTextReply returns stub when no client provided', async () => {
  const gw = createReplyGateway(null);
  const result = await gw.sendTextReply('msg-5', 'hello');

  assert.deepEqual(result, { replyMessageId: null });
});

test('sendCardReply returns stub when no client provided', async () => {
  const gw = createReplyGateway(null);
  const card = { header: {} };
  const result = await gw.sendCardReply('msg-6', card);

  assert.equal(result.messageId, 'msg-6');
  assert.deepEqual(result.card, card);
});
