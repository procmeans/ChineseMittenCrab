#!/usr/bin/env node

const { normalizeIncomingFeishuEvent } = require('./lib/platform/feishu/event_projection');
const { downloadFileToTempFile } = require('./lib/platform/feishu/file_gateway');

function readArg(name, fallbackValue) {
  const index = process.argv.indexOf(name);

  if (index === -1 || index === process.argv.length - 1) {
    return fallbackValue;
  }

  return process.argv[index + 1];
}

function main() {
  const accountName = readArg('--account', 'default');

  if (process.argv.includes('--dry-run')) {
    console.log(`FEISHU_WS_DRY_RUN account=${accountName} claude=ready feishu=ready`);
    return;
  }

  console.log(`FEISHU_WS_BOT_START account=${accountName}`);
}

async function prepareRuntimeEvent(event, deps = {}) {
  const normalized = normalizeIncomingFeishuEvent(event);
  const download = deps.downloadFileToTempFile || downloadFileToTempFile;
  const fileClient = deps.fileClient || {};
  const files = [];

  for (const attachment of normalized.attachments || []) {
    files.push(
      await download(fileClient, normalized.messageId, attachment.fileKey, {
        fileName: attachment.fileName,
      })
    );
  }

  return {
    ...normalized,
    files,
  };
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  prepareRuntimeEvent,
  readArg,
};
