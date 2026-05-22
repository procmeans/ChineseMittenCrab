#!/usr/bin/env node

const { normalizeIncomingWechatEvent } = require('./lib/platform/wechat/event_projection');
const { applyReplyDirectives } = require('./lib/platform/feishu/reply_directives');
const { renderWechatReply } = require('./lib/platform/wechat/reply_rendering');
const { createWechatApiClient } = require('./lib/platform/wechat/api_client');
const { createWechatReplyGateway } = require('./lib/platform/wechat/reply_gateway');
const { createCallbackServer } = require('./lib/platform/wechat/callback_server');
const { createRuntimeStatusStore } = require('./lib/monitor/runtime_status_store');
const { createTaskQueue } = require('./lib/runtime/task_queue');
const { refreshFollowUpWindow } = require('./lib/runtime/follow_up_window');
const { ensureChatState, saveStates, loadStates } = require('./lib/runtime/thread_state');
const { resolveEngine } = require('./lib/runtime/engine_selector');
const { loadLocalSecrets } = require('./lib/config/local_secret_store');
const { resolvePresetConfig } = require('./lib/config/preset_resolver');
const { handleIncomingMessage } = require('./lib/runtime/message_handler');

function readArg(name, fallbackValue) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) return fallbackValue;
  return process.argv[index + 1];
}

function createBotRuntime(deps) {
  const { taskQueue, statusStore } = deps;
  let shuttingDown = false;
  const seenMessageIds = new Set();
  const startTime = Date.now();

  return {
    onMessage(rawEvent) {
      if (shuttingDown) return;

      const normalized = normalizeIncomingWechatEvent(rawEvent);
      const messageId = normalized.messageId;

      if (normalized.createTime && normalized.createTime < startTime) {
        console.log('STALE_SKIP messageId=' + messageId);
        return;
      }

      if (messageId && seenMessageIds.has(messageId)) {
        console.log('DEDUP_SKIP messageId=' + messageId);
        return;
      }
      if (messageId) {
        seenMessageIds.add(messageId);
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

function prepareRuntimeEvent(event) {
  const normalized = normalizeIncomingWechatEvent(event);
  return {
    ...normalized,
    files: [],
    quotedText: '',
  };
}

function renderBotReply(text) {
  const { text: cleanText, filePaths } = applyReplyDirectives(text);
  return { ...renderWechatReply(cleanText), filePaths };
}

function main() {
  const accountName = readArg('--account', 'default');
  const portArg = readArg('--port', null);

  if (process.argv.includes('--dry-run')) {
    const checks = [];

    // 1. Secrets check
    try {
      const secrets = loadLocalSecrets();
      const wechatSecrets = secrets.wechat || {};
      checks.push(wechatSecrets.app_id && wechatSecrets.token && wechatSecrets.encoding_aes_key
        ? 'wechat=ready' : 'wechat=NO_CREDENTIALS');
    } catch (e) {
      checks.push('wechat=ERROR:' + e.message);
    }

    // 2. Account config check
    const fs = require('node:fs');
    const path = require('node:path');
    const configPath = path.join('config', 'wechat', `${accountName}.json`);
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
    console.log(`WECHAT_DRY_RUN account=${accountName} ${checks.join(' ')}`);
    if (!allReady) process.exitCode = 1;
    return;
  }

  // Load secrets
  const secrets = loadLocalSecrets();
  const wechatSecrets = secrets.wechat || {};
  const appId = wechatSecrets.app_id;
  const token = wechatSecrets.token;
  const encodingAesKey = wechatSecrets.encoding_aes_key;

  if (!appId || !token) {
    console.error('ERROR: Missing app_id or token in config/secrets/local.yaml (wechat section)');
    process.exitCode = 1;
    return;
  }

  // Load config
  const fs = require('node:fs');
  const path = require('node:path');
  const configPath = path.join('config', 'wechat', `${accountName}.json`);
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

  const port = Number(portArg || config.port || 8080);

  // Create API client and reply infrastructure
  const apiClient = createWechatApiClient({ appId, token, encodingAesKey });
  const openidMap = new Map(); // messageId → openid, populated by onMessage
  const replyGateway = createWechatReplyGateway(apiClient, openidMap);
  const statusStore = createRuntimeStatusStore({ account: accountName });
  const taskQueue = createTaskQueue();
  const followUpStates = loadStates(accountName);
  console.log(`LOADED_STATE threads=${followUpStates.size}`);

  // Create bot runtime
  const runtime = createBotRuntime({
    prepareRuntimeEvent: (event) => {
      const prepared = prepareRuntimeEvent(event);
      // Store openid mapping so reply gateway can find the user
      openidMap.set(prepared.messageId, prepared.senderId);
      return prepared;
    },
    renderBotReply,
    statusStore,
    replyGateway,
    taskQueue,
    followUpStates,
    runExec: engine.runExec,
    refreshFollowUpWindow,
    ensureChatState,
    execInput: engine.buildInput({ config, accountName }),
    persistState: () => saveStates(followUpStates, accountName),
  });

  // Create and start callback server
  const callbackServer = createCallbackServer({
    token,
    encodingAesKey,
    appId,
    onMessage: (payload) => {
      console.log('RAW_EVENT:', JSON.stringify(payload, null, 2));
      return runtime.onMessage(payload);
    },
    port,
  });

  callbackServer.start();
  console.log(`WECHAT_BOT_START account=${accountName} port=${port}`);

  // Graceful shutdown
  function onShutdownSignal(signal) {
    if (runtime.isShuttingDown) return;
    runtime.shutdown();
    callbackServer.stop();
    console.log(`WECHAT_BOT_STOP account=${accountName} signal=${signal}`);
  }

  process.on('SIGTERM', () => onShutdownSignal('SIGTERM'));
  process.on('SIGINT', () => onShutdownSignal('SIGINT'));
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
