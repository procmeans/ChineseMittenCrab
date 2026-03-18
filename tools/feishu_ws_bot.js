#!/usr/bin/env node

const { normalizeIncomingFeishuEvent } = require('./lib/platform/feishu/event_projection');
const { downloadFileToTempFile } = require('./lib/platform/feishu/file_gateway');
const { applyReplyDirectives } = require('./lib/platform/feishu/reply_directives');
const { renderFeishuReply } = require('./lib/platform/feishu/reply_rendering');
const { createFeishuSdkClient } = require('./lib/platform/feishu/sdk_client');
const { createReplyGateway } = require('./lib/platform/feishu/reply_gateway');
const { createRuntimeStatusStore } = require('./lib/monitor/runtime_status_store');
const { createTaskQueue } = require('./lib/runtime/task_queue');
const { createDelayedWaitNotice } = require('./lib/runtime/lightweight_wait_hint');
const { refreshFollowUpWindow } = require('./lib/runtime/follow_up_window');
const { ensureChatState } = require('./lib/runtime/thread_state');
const { runClaudeExec } = require('./lib/claude/exec_service');
const { loadLocalSecrets } = require('./lib/config/local_secret_store');
const { resolvePresetConfig } = require('./lib/config/preset_resolver');
const { handleIncomingMessage } = require('./lib/runtime/message_handler');

function readArg(name, fallbackValue) {
  const index = process.argv.indexOf(name);

  if (index === -1 || index === process.argv.length - 1) {
    return fallbackValue;
  }

  return process.argv[index + 1];
}

function createBotRuntime(deps) {
  const { taskQueue, statusStore } = deps;
  let shuttingDown = false;

  return {
    async onMessage(rawEvent) {
      if (shuttingDown) {
        return;
      }

      const normalized = normalizeIncomingFeishuEvent(rawEvent);
      const taskKey = normalized.taskKey;

      await taskQueue.enqueue(taskKey, () =>
        handleIncomingMessage(deps, rawEvent)
      );
    },

    getStatus() {
      return statusStore.getSnapshot();
    },

    shutdown() {
      shuttingDown = true;
    },

    get isShuttingDown() {
      return shuttingDown;
    },
  };
}

function main() {
  const accountName = readArg('--account', 'default');

  if (process.argv.includes('--dry-run')) {
    console.log(`FEISHU_WS_DRY_RUN account=${accountName} claude=ready feishu=ready`);
    return;
  }

  // Load secrets
  const secrets = loadLocalSecrets();
  const appId = secrets.app_id;
  const appSecret = secrets.app_secret;

  if (!appId || !appSecret) {
    console.error('ERROR: Missing app_id or app_secret in config/secrets/local.yaml');
    process.exitCode = 1;
    return;
  }

  // Load config
  const fs = require('node:fs');
  const path = require('node:path');
  const configPath = path.join('config', 'feishu', `${accountName}.json`);
  let accountConfig = {};

  if (fs.existsSync(configPath)) {
    accountConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  const config = resolvePresetConfig({
    defaults: {},
    account: accountConfig,
  });

  // Create SDK client
  const sdkClient = createFeishuSdkClient({ appId, appSecret });

  // Create runtime infrastructure
  const replyGateway = createReplyGateway(sdkClient);
  const statusStore = createRuntimeStatusStore({ account: accountName });
  const taskQueue = createTaskQueue();
  const followUpStates = new Map();

  // Create bot runtime
  const runtime = createBotRuntime({
    prepareRuntimeEvent,
    renderBotReply,
    statusStore,
    replyGateway,
    taskQueue,
    followUpStates,
    runClaudeExec,
    createDelayedWaitNotice,
    refreshFollowUpWindow,
    ensureChatState,
    claudeExecInput: {
      model: config.model,
      account: accountName,
    },
  });

  // Wire WS dispatcher
  const dispatcher = sdkClient.createWsDispatcher({
    'im.message.receive_v1': async (data) => {
      await runtime.onMessage(data);
    },
  });

  // Start WebSocket connection
  dispatcher.start();
  console.log(`FEISHU_WS_BOT_START account=${accountName}`);

  // Graceful shutdown
  function onShutdownSignal(signal) {
    if (runtime.isShuttingDown) {
      return;
    }

    runtime.shutdown();
    console.log(`FEISHU_WS_BOT_STOP account=${accountName} signal=${signal}`);
  }

  process.on('SIGTERM', () => onShutdownSignal('SIGTERM'));
  process.on('SIGINT', () => onShutdownSignal('SIGINT'));
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

  let quotedText = '';

  if (normalized.parentId && fileClient && typeof fileClient.getMessageContent === 'function') {
    try {
      quotedText = await fileClient.getMessageContent(normalized.parentId);
    } catch (_) {
      // best-effort: if fetching quoted message fails, continue without it
    }
  }

  return {
    ...normalized,
    files,
    quotedText,
  };
}

function renderBotReply(text) {
  return renderFeishuReply(applyReplyDirectives(text));
}

if (require.main === module) {
  main();
}

module.exports = {
  createBotRuntime,
  main,
  prepareRuntimeEvent,
  readArg,
  renderBotReply,
};
