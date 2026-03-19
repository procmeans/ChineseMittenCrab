const test = require('node:test');
const assert = require('node:assert/strict');

const { createFeishuSdkClient } = require('../tools/lib/platform/feishu/sdk_client');

function createMockLark() {
  const calls = [];

  class Client {
    constructor(opts) {
      calls.push({ method: 'Client.constructor', opts });
      this.im = {
        message: {
          reply: async (params) => {
            calls.push({ method: 'im.message.reply', params });
            return { code: 0 };
          },
          get: async (params) => {
            calls.push({ method: 'im.message.get', params });
            return {
              data: {
                items: [
                  {
                    body: {
                      content: JSON.stringify({ text: 'quoted content' }),
                    },
                  },
                ],
              },
            };
          },
        },
        messageResource: {
          get: async (params) => {
            calls.push({ method: 'im.messageResource.get', params });
            return Buffer.from('file-content');
          },
        },
      };
    }
  }

  class EventDispatcher {
    constructor() {
      this.handlers = {};
    }
    register(handles) {
      Object.assign(this.handlers, handles);
      calls.push({ method: 'EventDispatcher.register', handles });
    }
  }

  class WSClient {
    constructor(opts) {
      calls.push({ method: 'WSClient.constructor', opts });
    }
    start() {
      calls.push({ method: 'WSClient.start' });
    }
  }

  return { Client, EventDispatcher, WSClient, calls };
}

test('replyText calls im.message.reply with msg_type text', async () => {
  const mockLark = createMockLark();
  const client = createFeishuSdkClient({
    appId: 'app1',
    appSecret: 'secret1',
    Lark: mockLark,
  });

  await client.replyText('msg-123', 'hello');

  const replyCall = mockLark.calls.find((c) => c.method === 'im.message.reply');
  assert.ok(replyCall);
  assert.equal(replyCall.params.path.message_id, 'msg-123');
  assert.equal(replyCall.params.data.msg_type, 'text');
  assert.deepEqual(JSON.parse(replyCall.params.data.content), { text: 'hello' });
});

test('replyCard calls im.message.reply with msg_type interactive', async () => {
  const mockLark = createMockLark();
  const client = createFeishuSdkClient({
    appId: 'app1',
    appSecret: 'secret1',
    Lark: mockLark,
  });

  const card = { header: {}, elements: [] };
  await client.replyCard('msg-456', card);

  const replyCall = mockLark.calls.find((c) => c.method === 'im.message.reply');
  assert.equal(replyCall.params.data.msg_type, 'interactive');
  assert.deepEqual(JSON.parse(replyCall.params.data.content), card);
});

test('downloadMessageResource calls im.messageResource.get', async () => {
  const mockLark = createMockLark();
  const client = createFeishuSdkClient({
    appId: 'app1',
    appSecret: 'secret1',
    Lark: mockLark,
  });

  const result = await client.downloadMessageResource('msg-789', 'file-key-1');

  const getCall = mockLark.calls.find((c) => c.method === 'im.messageResource.get');
  assert.ok(getCall);
  assert.equal(getCall.params.path.message_id, 'msg-789');
  assert.equal(getCall.params.path.file_key, 'file-key-1');
  assert.ok(Buffer.isBuffer(result));
});

test('getMessageContent fetches and parses quoted message text', async () => {
  const mockLark = createMockLark();
  const client = createFeishuSdkClient({
    appId: 'app1',
    appSecret: 'secret1',
    Lark: mockLark,
  });

  const text = await client.getMessageContent('msg-parent');

  const getCall = mockLark.calls.find((c) => c.method === 'im.message.get');
  assert.ok(getCall);
  assert.equal(getCall.params.path.message_id, 'msg-parent');
  assert.equal(text, 'quoted content');
});

test('createWsDispatcher registers handlers and returns startable', () => {
  const mockLark = createMockLark();
  const client = createFeishuSdkClient({
    appId: 'app1',
    appSecret: 'secret1',
    Lark: mockLark,
  });

  const handler = () => {};
  const dispatcher = client.createWsDispatcher({
    'im.message.receive_v1': handler,
  });

  const registerCall = mockLark.calls.find(
    (c) => c.method === 'EventDispatcher.register'
  );
  assert.ok(registerCall);
  assert.equal(typeof registerCall.handles['im.message.receive_v1'], 'function');

  dispatcher.start();

  const startCall = mockLark.calls.find((c) => c.method === 'WSClient.start');
  assert.ok(startCall);
});
