#!/usr/bin/env node

const { normalizeIncomingWechatEvent } = require('./lib/platform/wechat/event_projection');
const { applyReplyDirectives } = require('./lib/platform/feishu/reply_directives');
const { renderWechatReply } = require('./lib/platform/wechat/reply_rendering');
const { createWechatApiClient } = require('./lib/platform/wechat/api_client');
const { createWechatReplyGateway } = require('./lib/platform/wechat/reply_gateway');
const { createCallbackServer } = require('./lib/platform/wechat/callback_server');
const { createAccessTokenCache } = require('./lib/platform/wechat/access_token');
const { normalizeKfMessage } = require('./lib/platform/wechat/kf_client');
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

async function dispatchKfSyncMessages({ apiClient, syncToken, openKfId, dispatchOne }) {
  const resp = await apiClient.syncQueue({ token: syncToken, openKfId });
  if (resp && resp.errcode && resp.errcode !== 0) {
    console.error('KF_SYNC_FAIL errcode=' + resp.errcode + ' errmsg=' + resp.errmsg);
    return;
  }
  const list = (resp && resp.msg_list) || [];
  console.log('KF_SYNC_OK count=' + list.length + ' has_more=' + (resp && resp.has_more));
  for (const msg of list) {
    // origin 3 = user; 4 = bot push echo; 5 = human agent. Reply path must not re-process our own.
    if (Number(msg.origin) !== 3) {
      console.log('KF_SKIP_ORIGIN origin=' + msg.origin + ' msgid=' + msg.msgid);
      continue;
    }
    const norm = normalizeKfMessage(msg);
    if (!norm || !norm.senderId) continue;
    // Repack as a callback-shaped raw event so the runtime's standard onMessage path picks it up
    // (dedup, stale check, prepareRuntimeEvent, task_queue, message_handler, reply_gateway).
    const fakeRaw = {
      msgid: norm.messageId,
      userid: norm.senderId,
      content: norm.text,
      from: 0,
      channel: norm.channel,
      createtime: Math.floor(norm.createTime / 1000),
      appid: norm.appId,
      open_kfid: norm.openKfId,
    };
    dispatchOne(fakeRaw);
  }
  // Page through if has_more — recursive call with new cursor.
  if (resp && resp.has_more === 1 && resp.next_cursor) {
    return dispatchKfSyncMessages({
      apiClient,
      syncToken,
      openKfId,
      dispatchOne,
    });
  }
}

function createBotRuntime(deps) {
  const { taskQueue, statusStore, apiClient } = deps;
  let shuttingDown = false;
  const seenMessageIds = new Set();
  const startTime = Date.now();

  const runtime = {
    onMessage(rawEvent) {
      if (shuttingDown) return;

      // 微信客服 (kf.weixin.qq.com / 企业微信联合版) uses a "notify + pull" model:
      // the callback only carries a sync Token + OpenKfId, NOT the user's text. The actual
      // message must be fetched via /cgi-bin/kf/sync_msg using access_token + Token, then
      // each real user message is re-dispatched as a fake callback through this same onMessage.
      if (rawEvent && rawEvent.MsgType === 'event') {
        if (rawEvent.Event === 'kf_msg_or_event') {
          console.log('KF_SYNC_NEEDED openKfId=' + rawEvent.OpenKfId + ' token=' + rawEvent.Token);
          if (apiClient && typeof apiClient.syncQueue === 'function') {
            dispatchKfSyncMessages({
              apiClient,
              syncToken: rawEvent.Token,
              openKfId: rawEvent.OpenKfId,
              dispatchOne: (raw) => runtime.onMessage(raw),
            }).catch((err) => console.error('KF_DISPATCH_ERROR', err.message));
          } else {
            console.log('KF_SYNC_SKIPPED apiClient_unavailable');
          }
        } else {
          // Other kf system events (kf_account_auth_change, customer_msg_send_fail, etc.):
          // log for visibility but don't process — they're metadata about the account/agent
          // state, not user messages we should reply to.
          console.log('KF_EVENT_IGNORED event=' + rawEvent.Event + ' openKfId=' + (rawEvent.AuthAddOpenKfId || rawEvent.OpenKfId || ''));
        }
        return;
      }

      const normalized = normalizeIncomingWechatEvent(rawEvent);
      const messageId = normalized.messageId;

      // Drop non-user messages early: from=1 is our own bot push echo, from=2 is human agent.
      // Replying to those would feedback-loop or hijack a human agent's chat.
      if (typeof normalized.from === 'number' && normalized.from !== 0) {
        console.log('IGNORE_NON_USER from=' + normalized.from + ' messageId=' + messageId);
        return;
      }

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
  return runtime;
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
      // token + AESKey are the minimum needed for callback URL verification.
      // app_id is only used by the legacy 对话开放平台 push path; 微信客服 mode doesn't need it.
      checks.push(wechatSecrets.token && wechatSecrets.encoding_aes_key
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
  // Schema:
  //   wechat:
  //     token: <callback verification token, configured in kf.weixin.qq.com 开发配置>
  //     encoding_aes_key: <43-char AES key from same page>
  //     kf:
  //       corpid: <ww... from 企业微信 管理后台>
  //       secret: <自建应用 secret, authorized to 微信客服 API>
  //   The legacy aispeech `app_id` field is no longer used by the kf code path.
  const secrets = loadLocalSecrets();
  const wechatSecrets = secrets.wechat || {};
  const token = wechatSecrets.token;
  const encodingAesKey = wechatSecrets.encoding_aes_key;
  const kfSecrets = wechatSecrets.kf || {};
  const corpid = kfSecrets.corpid;
  const corpsecret = kfSecrets.secret;

  if (!token || !encodingAesKey) {
    console.error('ERROR: Missing wechat.token or wechat.encoding_aes_key in config/secrets/local.yaml');
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

  // Create API client (kf send_msg + sync_msg via cached access_token) and reply infrastructure.
  // apiClient may be null if kf credentials are missing — bot still starts and can verify the
  // callback URL, but reply path will no-op (sendTextReply returns { replyMessageId: null }).
  const defaultChannel = Number(config.channel || 9);
  let apiClient = null;
  if (corpid && corpsecret) {
    const tokenCache = createAccessTokenCache({ corpid, secret: corpsecret });
    apiClient = createWechatApiClient({ accessTokenCache: tokenCache });
    console.log('KF_API_READY corpid=' + corpid);
  } else {
    console.warn('KF_API_DISABLED reason=missing_kf_corpid_or_secret (callbacks verify but replies will no-op)');
  }
  const openidMap = new Map(); // messageId → { openid, openKfId, channel, appid } routing entry
  const replyGateway = createWechatReplyGateway(apiClient, openidMap);
  const statusStore = createRuntimeStatusStore({ account: accountName });
  const taskQueue = createTaskQueue();
  const followUpStates = loadStates(accountName);
  console.log(`LOADED_STATE threads=${followUpStates.size}`);

  // Create bot runtime
  const runtime = createBotRuntime({
    apiClient,
    prepareRuntimeEvent: (event) => {
      const prepared = prepareRuntimeEvent(event);
      // Store routing info so the reply gateway can push back via the same kf account
      openidMap.set(prepared.messageId, {
        openid: prepared.senderId,
        openKfId: prepared.openKfId,
        channel: typeof prepared.channel === 'number' ? prepared.channel : defaultChannel,
        appid: prepared.appId,
      });
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
