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
const { ensureChatState, saveStates, loadStates } = require('./lib/runtime/thread_state');
const { resolveEngine } = require('./lib/runtime/engine_selector');
const { loadLocalSecrets } = require('./lib/config/local_secret_store');
const { resolvePresetConfig } = require('./lib/config/preset_resolver');
const { handleIncomingMessage } = require('./lib/runtime/message_handler');

// Per-account Feishu credentials lookup. Supports two layouts:
//   feishu: { app_id, app_secret }                            ← single-account (default)
//   feishu: { app_id, app_secret, <account>: { app_id, ... } } ← multi-account, nested per account
// For account="default" the top-level fields are used. For other accounts, the nested block wins
// when it carries an app_id, otherwise falls through to the top-level credentials.
function resolveFeishuSecrets(secrets, accountName) {
  const root = (secrets && secrets.feishu) || secrets || {};
  const nested = root && typeof root === 'object' ? root[accountName] : null;
  if (nested && typeof nested === 'object' && nested.app_id) {
    return nested;
  }
  return root;
}

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
  const seenMessageIds = new Set();
  const startTime = Date.now();

  return {
    onMessage(rawEvent) {
      if (shuttingDown) {
        return;
      }

      const normalized = normalizeIncomingFeishuEvent(rawEvent);
      const messageId = normalized.messageId;

      // Skip messages created before this bot instance started
      if (normalized.createTime && normalized.createTime < startTime) {
        console.log('STALE_SKIP messageId=' + messageId + ' createTime=' + normalized.createTime);
        return;
      }

      if (messageId && seenMessageIds.has(messageId)) {
        console.log('DEDUP_SKIP messageId=' + messageId);
        return;
      }
      if (messageId) {
        seenMessageIds.add(messageId);
        // 防止内存泄漏：只保留最近 1000 条
        if (seenMessageIds.size > 1000) {
          seenMessageIds.delete(seenMessageIds.values().next().value);
        }
      }

      const taskKey = normalized.taskKey;

      taskQueue.enqueue(taskKey, () =>
        handleIncomingMessage(deps, rawEvent)
      ).catch((err) => {
        console.error('TASK_ERROR taskKey=' + taskKey, err.message);
      });
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

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED_REJECTION:', reason);
});

function main() {
  const accountName = readArg('--account', 'default');

  if (process.argv.includes('--dry-run')) {
    const checks = [];

    // 1. Secrets check (per-account first, fallback to top-level for backward compat)
    try {
      const secrets = loadLocalSecrets();
      const feishuSecrets = resolveFeishuSecrets(secrets, accountName);
      checks.push(feishuSecrets.app_id && feishuSecrets.app_secret
        ? 'feishu=ready' : 'feishu=NO_CREDENTIALS');
    } catch (e) {
      checks.push('feishu=ERROR:' + e.message);
    }

    // 2. Account config check
    const fs = require('node:fs');
    const path = require('node:path');
    const configPath = path.join('config', 'feishu', `${accountName}.json`);
    const configReady = fs.existsSync(configPath);
    checks.push(configReady ? 'config=ready' : 'config=MISSING');

    // 3. Engine binary check — picked from the account config (defaults to claude)
    let engineName = 'claude';
    let engineBin = 'claude';
    try {
      const accountConfig = configReady
        ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
        : {};
      const engine = resolveEngine(accountConfig);
      engineName = engine.name;
      engineBin = engine.bin;
    } catch (e) {
      checks.push(`engine=ERROR:${e.message}`);
    }
    try {
      const { execFileSync } = require('node:child_process');
      execFileSync(engineBin, ['--version'], { timeout: 5000 });
      checks.push(`${engineName}=ready`);
    } catch (e) {
      checks.push(`${engineName}=NOT_FOUND`);
    }

    const allReady = checks.every(c => c.endsWith('=ready'));
    console.log(`FEISHU_WS_DRY_RUN account=${accountName} ${checks.join(' ')}`);
    if (!allReady) process.exitCode = 1;
    return;
  }

  // Load secrets (per-account first, fallback to top-level for backward compat)
  const secrets = loadLocalSecrets();
  const feishuSecrets = resolveFeishuSecrets(secrets, accountName);
  const appId = feishuSecrets.app_id;
  const appSecret = feishuSecrets.app_secret;

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

  // Engine selection — pick claude or codex based on account config
  const engine = resolveEngine(config);
  console.log(`ENGINE_SELECTED account=${accountName} engine=${engine.name}`);

  // Create SDK client
  const sdkClient = createFeishuSdkClient({ appId, appSecret });

  // Create runtime infrastructure
  const replyGateway = createReplyGateway(sdkClient);
  const statusStore = createRuntimeStatusStore({ account: accountName });
  const taskQueue = createTaskQueue();
  // Load persisted conversation history (only threads still within 5-min TTL)
  const followUpStates = loadStates(accountName);
  console.log(`LOADED_STATE threads=${followUpStates.size}`);

  // Create bot runtime
  const runtime = createBotRuntime({
    prepareRuntimeEvent: (event) => prepareRuntimeEvent(event, { fileClient: sdkClient }),
    renderBotReply,
    statusStore,
    replyGateway,
    taskQueue,
    followUpStates,
    runExec: engine.runExec,
    createDelayedWaitNotice,
    refreshFollowUpWindow,
    ensureChatState,
    execInput: engine.buildInput({ config, accountName }),
    persistState: () => saveStates(followUpStates, accountName),
  });

  // Wire WS dispatcher
  const dispatcher = sdkClient.createWsDispatcher({
    'im.message.receive_v1': async (data) => {
      console.log('RAW_EVENT:', JSON.stringify(data, null, 2));
      try {
        await runtime.onMessage(data);
      } catch (err) {
        console.error('MESSAGE_HANDLER_ERROR:', err.message, err.stack);
      }
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

  if (normalized.parentId && fileClient && typeof fileClient.getMessageMeta === 'function') {
    try {
      const { msgType, parsed } = await fileClient.getMessageMeta(normalized.parentId);
      console.log('QUOTED_META parentId=' + normalized.parentId + ' msgType=' + msgType);

      if (msgType === 'file' && parsed.file_key) {
        // Quoted message is a file — download it and attach
        const fileName = parsed.file_name || ('quoted_file_' + parsed.file_key);
        const tempPath = require('node:path').join('/tmp', fileName);
        try {
          const result = await fileClient.downloadMessageResource(normalized.parentId, parsed.file_key, 'file', tempPath);
          if (result && Buffer.isBuffer(result)) {
            require('node:fs').writeFileSync(tempPath, result);
          }
          files.push({ filePath: tempPath, fileName });
          quotedText = '[引用文件: ' + fileName + ']';
          console.log('QUOTED_FILE downloaded=' + tempPath);
        } catch (dlErr) {
          console.log('QUOTED_FILE_DL_ERROR err=' + dlErr.message);
          quotedText = '[引用文件: ' + fileName + ' (下载失败)]';
        }
      } else if (msgType === 'image' && parsed.image_key) {
        // Quoted message is an image — download it
        const imageName = 'quoted_image_' + parsed.image_key + '.jpg';
        const tempPath = '/tmp/' + imageName;
        try {
          const result = await fileClient.downloadMessageResource(normalized.parentId, parsed.image_key, 'image', tempPath);
          if (result && Buffer.isBuffer(result)) {
            require('node:fs').writeFileSync(tempPath, result);
          }
          files.push({ filePath: tempPath, fileName: imageName });
          quotedText = '[引用图片: ' + imageName + ']';
          console.log('QUOTED_IMAGE downloaded=' + tempPath);
        } catch (dlErr) {
          console.log('QUOTED_IMAGE_DL_ERROR err=' + dlErr.message);
        }
      } else {
        // Text or card — extract text content
        quotedText = await fileClient.getMessageContent(normalized.parentId);
        console.log('QUOTED_TEXT result=' + JSON.stringify(quotedText).slice(0, 200));
      }
    } catch (err) {
      console.log('QUOTED_META_ERROR parentId=' + normalized.parentId + ' err=' + err.message);
    }
  }

  return {
    ...normalized,
    files,
    quotedText,
  };
}

function renderBotReply(text) {
  const { text: cleanText, filePaths } = applyReplyDirectives(text);
  return { card: renderFeishuReply(cleanText), filePaths };
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
