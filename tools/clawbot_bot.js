#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { applyReplyDirectives } = require('./lib/platform/feishu/reply_directives');
const { renderWechatReply } = require('./lib/platform/wechat/reply_rendering');
const { createRuntimeStatusStore } = require('./lib/monitor/runtime_status_store');
const { createTaskQueue } = require('./lib/runtime/task_queue');
const { refreshFollowUpWindow } = require('./lib/runtime/follow_up_window');
const { ensureChatState, saveStates, loadStates } = require('./lib/runtime/thread_state');
const { resolveEngine } = require('./lib/runtime/engine_selector');
const { resolvePresetConfig } = require('./lib/config/preset_resolver');
const { handleIncomingMessage } = require('./lib/runtime/message_handler');
const { normalizeIncomingClawbotEvent } = require('./lib/platform/clawbot/event_projection');
const { createClawbotReplyGateway } = require('./lib/platform/clawbot/reply_gateway');
const { createClawbotBridgeProcess } = require('./lib/platform/clawbot/bridge_process');

function readArg(name, fallbackValue) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) return fallbackValue;
  return process.argv[index + 1];
}

function loadAccountConfig(accountName) {
  const configPath = path.join('config', 'clawbot', `${accountName}.json`);
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function prepareRuntimeEvent(event) {
  return normalizeIncomingClawbotEvent(event);
}

function renderBotReply(text) {
  const { text: cleanText, filePaths } = applyReplyDirectives(text);
  return { ...renderWechatReply(cleanText), filePaths };
}

function checkPython(pythonBin) {
  try {
    execFileSync(pythonBin, ['--version'], { timeout: 5000, stdio: 'ignore' });
    return 'python=ready';
  } catch (_) {
    return 'python=NOT_FOUND';
  }
}

function checkSdk(pythonBin) {
  try {
    execFileSync(pythonBin, ['-c', 'import wechat_clawbot_sdk'], { timeout: 5000, stdio: 'ignore' });
    return 'sdk=ready';
  } catch (_) {
    return 'sdk=NOT_INSTALLED';
  }
}

function checkEngine(engine) {
  try {
    execFileSync(engine.bin, ['--version'], { timeout: 5000, stdio: 'ignore' });
    return `${engine.name}=ready`;
  } catch (_) {
    return `${engine.name}=NOT_FOUND`;
  }
}

function createBotRuntime(deps) {
  const { taskQueue, statusStore, bridge, routingMap } = deps;
  let shuttingDown = false;
  const seenMessageIds = new Set();
  const startTime = Date.now();

  return {
    onMessage(rawEvent) {
      if (shuttingDown) return;
      const normalized = normalizeIncomingClawbotEvent(rawEvent);

      if (normalized.createTime && normalized.createTime < startTime) {
        console.log('CLAWBOT_STALE_SKIP messageId=' + normalized.messageId);
        return;
      }

      if (normalized.messageId && seenMessageIds.has(normalized.messageId)) {
        console.log('CLAWBOT_DEDUP_SKIP messageId=' + normalized.messageId);
        return;
      }
      if (normalized.messageId) {
        seenMessageIds.add(normalized.messageId);
        if (seenMessageIds.size > 1000) {
          seenMessageIds.delete(seenMessageIds.values().next().value);
        }
      }

      routingMap.set(normalized.messageId, {
        accountId: normalized.accountId,
        userId: normalized.userId,
      });

      if (bridge && typeof bridge.sendTyping === 'function') {
        bridge.sendTyping({
          accountId: normalized.accountId,
          userId: normalized.userId,
          status: 1,
        }).catch(() => {});
      }

      taskQueue.enqueue(normalized.taskKey, () =>
        handleIncomingMessage(deps, rawEvent)
      ).catch((err) => {
        console.error('CLAWBOT_TASK_ERROR taskKey=' + normalized.taskKey, err.message);
      });
    },

    getStatus() {
      return statusStore.getSnapshot();
    },

    shutdown() {
      shuttingDown = true;
      if (bridge && typeof bridge.stop === 'function') bridge.stop();
    },

    get isShuttingDown() {
      return shuttingDown;
    },
  };
}

function main() {
  const accountName = readArg('--account', 'default');
  const accountConfig = loadAccountConfig(accountName);
  const config = resolvePresetConfig({ defaults: {}, account: accountConfig });
  const pythonBin = readArg('--python', process.env.CLAWBOT_PYTHON || config.python_bin || config.pythonBin || 'python3');
  const bridgePath = readArg('--bridge', path.join(__dirname, 'clawbot_bridge.py'));
  const engine = resolveEngine(config);

  if (process.argv.includes('--dry-run')) {
    const configPath = path.join('config', 'clawbot', `${accountName}.json`);
    const checks = [
      fs.existsSync(configPath) ? 'config=ready' : 'config=default',
      checkPython(pythonBin),
      checkSdk(pythonBin),
      checkEngine(engine).replace(`${engine.name}=`, 'engine='),
    ];
    console.log(`CLAWBOT_DRY_RUN account=${accountName} ${checks.join(' ')}`);
    return;
  }

  console.log(`ENGINE_SELECTED account=${accountName} engine=${engine.name}`);

  const bridge = createClawbotBridgeProcess({
    pythonBin,
    bridgePath,
    account: accountName,
    stateDir: config.state_dir || config.stateDir,
    debug: Boolean(config.debug),
  });

  bridge.on('stderr', (line) => process.stderr.write(line));
  bridge.on('error', (err) => console.error('CLAWBOT_BRIDGE_ERROR ' + err.message));
  bridge.on('exit', ({ code, signal }) => {
    console.log(`CLAWBOT_BRIDGE_EXIT code=${code} signal=${signal || ''}`);
  });

  const routingMap = new Map();
  const replyGateway = createClawbotReplyGateway(bridge, routingMap);
  const statusStore = createRuntimeStatusStore({ account: accountName });
  const taskQueue = createTaskQueue();
  const followUpStates = loadStates('clawbot-' + accountName);

  const runtime = createBotRuntime({
    bridge,
    routingMap,
    prepareRuntimeEvent,
    renderBotReply,
    statusStore,
    replyGateway,
    taskQueue,
    followUpStates,
    runExec: engine.runExec,
    refreshFollowUpWindow,
    ensureChatState,
    execInput: engine.buildInput({ config, accountName }),
    persistState: () => saveStates(followUpStates, 'clawbot-' + accountName),
  });

  bridge.on('message', (event) => {
    if (event.type === 'message') {
      console.log('CLAWBOT_USER_MSG user=' + event.user_id + ' message=' + event.message_id);
      runtime.onMessage(event);
      return;
    }
    if (event.type === 'login_qr') {
      console.log('CLAWBOT_LOGIN_QR ' + (event.qrcode_image_content || event.qrcode_url || event.qrcode || ''));
      return;
    }
    if (event.type === 'ready') {
      console.log('CLAWBOT_READY account=' + (event.account_id || accountName));
      return;
    }
    if (event.type === 'error') {
      console.error('CLAWBOT_ERROR ' + (event.error || 'unknown'));
    }
  });

  console.log(`CLAWBOT_BOT_START account=${accountName}`);

  function onShutdownSignal(signal) {
    if (runtime.isShuttingDown) return;
    runtime.shutdown();
    console.log(`CLAWBOT_BOT_STOP account=${accountName} signal=${signal}`);
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
