const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  downloadFileToTempFile,
} = require('../tools/lib/platform/feishu/file_gateway');
const { prepareRuntimeEvent } = require('../tools/feishu_ws_bot');
const fileFixture = require('./fixtures/feishu/file-message.json');
const replyFixture = require('./fixtures/feishu/reply-message.json');

test('file event downloads to a temp path for Claude consumption', async () => {
  const tempDir = fs.mkdtempSync(path.join('/tmp/', 'cmr-file-'));

  const result = await downloadFileToTempFile(
    {
      downloadMessageResource: async (messageId, fileKey) => {
        assert.equal(messageId, 'om_file_message');
        assert.equal(fileKey, 'file_123');
        return Buffer.from('hello world');
      },
    },
    'om_file_message',
    'file_123',
    {
      tmpDir: tempDir,
      fileName: 'brief.txt',
    }
  );

  assert.match(result.filePath, /\/tmp\//);
  assert.equal(result.fileName, 'brief.txt');
  assert.equal(fs.readFileSync(result.filePath, 'utf8'), 'hello world');
});

test('bot preparation includes downloaded files for multimodal inputs', async () => {
  const result = await prepareRuntimeEvent(fileFixture, {
    fileClient: {},
    downloadFileToTempFile: async () => ({
      filePath: path.join(os.tmpdir(), 'brief.txt'),
      fileName: 'brief.txt',
    }),
  });

  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].fileName, 'brief.txt');
});

test('prepareRuntimeEvent fetches quoted message when parentId present', async () => {
  const result = await prepareRuntimeEvent(replyFixture, {
    fileClient: {
      getMessageMeta: async (messageId) => {
        assert.equal(messageId, 'om_parent');
        return { msgType: 'text', parsed: {} };
      },
      getMessageContent: async (messageId) => {
        assert.equal(messageId, 'om_parent');
        return 'the original message';
      },
    },
  });

  assert.equal(result.parentId, 'om_parent');
  assert.equal(result.quotedText, 'the original message');
});

test('prepareRuntimeEvent returns empty quotedText without client', async () => {
  const result = await prepareRuntimeEvent(replyFixture, {
    fileClient: {},
  });

  assert.equal(result.quotedText, '');
});
