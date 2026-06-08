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

function parseEngineCommand(text) {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === '/codex') {
    return { type: 'set_engine', engineName: 'codex' };
  }

  if (normalized === '/claude') {
    return { type: 'set_engine', engineName: 'claude' };
  }

  if (normalized === '/engine') {
    return { type: 'query_engine' };
  }

  const parts = normalized.split(/\s+/);
  if (parts.length === 2 && parts[0] === '/engine' && (parts[1] === 'codex' || parts[1] === 'claude')) {
    return { type: 'set_engine', engineName: parts[1] };
  }

  return null;
}

function resolveClawbotEngine(config, chatState) {
  const engineName = String((chatState && chatState.engineName) || config.engine || 'claude').trim().toLowerCase();
  const engine = resolveEngine({ ...config, engine: engineName });
  return {
    engineName: engine.name,
    runExec: engine.runExec,
    execInput: engine.buildInput({ config, accountName: config.accountName || 'default' }),
  };
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
  const defaultEngineName = String(deps.defaultEngineName || 'claude').trim().toLowerCase();

  async function handleEngineCommand(normalized) {
    const chatState = deps.ensureChatState(deps.followUpStates, normalized.taskKey);
    const command = parseEngineCommand(normalized.text);
    if (!command) return false;

    statusStore.markBusy({ taskKey: normalized.taskKey });
    try {
      if (command.type === 'query_engine') {
        const currentEngine = chatState.engineName || defaultEngineName;
        await deps.replyGateway.sendTextReply(normalized.messageId, `当前引擎：${currentEngine}`);
        statusStore.markIdle({ taskKey: normalized.taskKey });
        return true;
      }

      chatState.engineName = command.engineName;
      if (deps.refreshFollowUpWindow) {
        deps.refreshFollowUpWindow(chatState, { ttlMs: deps.followUpTtlMs });
      }
      if (typeof deps.persistState === 'function') deps.persistState();
      await deps.replyGateway.sendTextReply(normalized.messageId, `已切换到 ${command.engineName}`);
      statusStore.markIdle({ taskKey: normalized.taskKey });
      return true;
    } catch (err) {
      statusStore.markError({ taskKey: normalized.taskKey, error: String(err.message || err) });
      try {
        await deps.replyGateway.sendTextReply(normalized.messageId, `⚠️ ${err.message || err}`);
      } catch (_) {}
      return true;
    }
  }

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

      if (parseEngineCommand(normalized.text)) {
        taskQueue.enqueue(normalized.taskKey, () => handleEngineCommand(normalized)).catch((err) => {
          console.error('CLAWBOT_TASK_ERROR taskKey=' + normalized.taskKey, err.message);
        });
        return;
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
    followUpTtlMs: Number(config.follow_up_ttl_hours || config.followUpTtlHours || 24) * 60 * 60 * 1000,
    omitTextReplyWhenFiles: true,
    preferPdfOnlyWhenFiles: true,
    persistState: () => saveStates(followUpStates, 'clawbot-' + accountName),
    selectEngineForChatState: ({ chatState }) => {
      const selected = resolveClawbotEngine({ ...config, accountName }, chatState);
      return {
        runExec: selected.runExec,
        execInput: selected.execInput,
      };
    },
    defaultEngineName: engine.name,
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
  parseEngineCommand,
  prepareRuntimeEvent,
  readArg,
  renderBotReply,
  resolveClawbotEngine,
};
