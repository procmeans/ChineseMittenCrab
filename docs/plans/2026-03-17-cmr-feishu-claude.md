# ChineseMittenCrab Feishu + Claude Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Feishu bot project that uses Claude Code CLI as the local execution engine and grows in phases toward SunCodexClaw-level workflow coverage.

**Architecture:** Keep Feishu integration, Claude execution, runtime workflow, monitoring, and config handling in separate modules from day one. Deliver the system in phases: first the text execution spine, then group workflow and multimodal inputs, then richer reply/monitoring features.

**Tech Stack:** Node.js, `node:test`, Feishu/Lark OpenAPI SDK, Claude Code CLI, LaunchAgents, vanilla HTML for the local monitor

---

### Task 1: Bootstrap the new repository

**Files:**
- Create: `package.json`
- Create: `README.md`
- Create: `config/secrets/local.example.yaml`
- Create: `config/feishu/default.example.json`
- Create: `.gitignore`

**Step 1: Write the failing repo-shape test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('project bootstrap files exist', () => {
  assert.equal(fs.existsSync('package.json'), true);
  assert.equal(fs.existsSync('README.md'), true);
  assert.equal(fs.existsSync('config/secrets/local.example.yaml'), true);
  assert.equal(fs.existsSync('config/feishu/default.example.json'), true);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/bootstrap.test.js`
Expected: FAIL because the bootstrap files do not exist yet.

**Step 3: Write the minimal project bootstrap**

```json
{
  "name": "chinese-mitten-crab",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --test test/*.test.js"
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/bootstrap.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json README.md config/secrets/local.example.yaml config/feishu/default.example.json .gitignore test/bootstrap.test.js
git commit -m "chore: bootstrap CMR repository"
```

### Task 2: Add config loading and preset resolution

**Files:**
- Create: `tools/lib/config/local_secret_store.js`
- Create: `tools/lib/config/preset_resolver.js`
- Test: `test/preset_resolver.test.js`

**Step 1: Write the failing preset tests**

```js
test('resolvePresetConfig merges defaults, preset, and account override', () => {
  assert.deepEqual(resolvePresetConfig(input), expected);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/preset_resolver.test.js`
Expected: FAIL because resolver functions are missing.

**Step 3: Write the minimal resolver and local secret loader**

```js
function resolvePresetConfig(input) {
  return mergedConfig;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/preset_resolver.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/lib/config/local_secret_store.js tools/lib/config/preset_resolver.js test/preset_resolver.test.js
git commit -m "feat: add CMR preset config resolution"
```

### Task 3: Add the Claude CLI runner

**Files:**
- Create: `tools/lib/claude/claude_home.js`
- Create: `tools/lib/claude/exec_service.js`
- Create: `tools/lib/claude/prompt_builder.js`
- Test: `test/claude_home.test.js`
- Test: `test/claude_exec_service.test.js`

**Step 1: Write the failing runner tests**

```js
test('resolveClaudeHome derives a per-account path', () => {
  assert.match(resolveClaudeHome({ accountName: 'default' }), /claude\/default$/);
});

test('runClaudeExec returns parsed stdout text', async () => {
  const result = await runClaudeExec(deps, input);
  assert.equal(result.replyText, 'hello');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/claude_home.test.js test/claude_exec_service.test.js`
Expected: FAIL because the runner does not exist.

**Step 3: Write the minimal Claude home and exec services**

```js
async function runClaudeExec(deps, input) {
  return { replyText: text, raw: stdout };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/claude_home.test.js test/claude_exec_service.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/lib/claude/claude_home.js tools/lib/claude/exec_service.js tools/lib/claude/prompt_builder.js test/claude_home.test.js test/claude_exec_service.test.js
git commit -m "feat: add Claude CLI execution services"
```

### Task 4: Add runtime thread and queue primitives

**Files:**
- Create: `tools/lib/runtime/thread_state.js`
- Create: `tools/lib/runtime/task_queue.js`
- Test: `test/thread_state.test.js`
- Test: `test/task_queue.test.js`

**Step 1: Write the failing runtime tests**

```js
test('thread state preserves active thread info', () => {
  assert.equal(getCurrentThread(state).id, 't1');
});

test('task queue runs same-scope work sequentially', async () => {
  assert.deepEqual(order, ['a', 'b']);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/thread_state.test.js test/task_queue.test.js`
Expected: FAIL

**Step 3: Write the minimal runtime primitives**

```js
function ensureChatState(states, key) {
  return state;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/thread_state.test.js test/task_queue.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/lib/runtime/thread_state.js tools/lib/runtime/task_queue.js test/thread_state.test.js test/task_queue.test.js
git commit -m "feat: add CMR runtime thread and queue state"
```

### Task 5: Add lightweight wait hints and follow-up windows

**Files:**
- Create: `tools/lib/runtime/lightweight_wait_hint.js`
- Create: `tools/lib/runtime/follow_up_window.js`
- Test: `test/lightweight_wait_hint.test.js`
- Test: `test/follow_up_window.test.js`

**Step 1: Write the failing UX tests**

```js
test('simple question schedules a delayed wait hint', async () => {
  assert.equal(notice.sent, true);
});

test('successful final reply refreshes the follow-up window', () => {
  assert.equal(state.expiresAt > now, true);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/lightweight_wait_hint.test.js test/follow_up_window.test.js`
Expected: FAIL

**Step 3: Write the minimal wait and follow-up helpers**

```js
function createDelayedWaitNotice(deps) {
  return { dismiss };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/lightweight_wait_hint.test.js test/follow_up_window.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/lib/runtime/lightweight_wait_hint.js tools/lib/runtime/follow_up_window.js test/lightweight_wait_hint.test.js test/follow_up_window.test.js
git commit -m "feat: add CMR wait hints and follow-up windows"
```

### Task 6: Add Feishu platform adapters

**Files:**
- Create: `tools/lib/platform/feishu/event_projection.js`
- Create: `tools/lib/platform/feishu/incoming_event.js`
- Create: `tools/lib/platform/feishu/reply_gateway.js`
- Test: `test/feishu_event_replay.test.js`
- Test: `test/fixtures/feishu/group-at.json`

**Step 1: Write the failing replay test**

```js
test('group mention fixture becomes a normalized runtime event', () => {
  assert.equal(normalized.taskKey, 'oc_group::ou_user');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/feishu_event_replay.test.js`
Expected: FAIL

**Step 3: Write the minimal Feishu projection and reply gateway**

```js
function normalizeIncomingFeishuEvent(event, deps) {
  return normalized;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/feishu_event_replay.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/lib/platform/feishu/event_projection.js tools/lib/platform/feishu/incoming_event.js tools/lib/platform/feishu/reply_gateway.js test/feishu_event_replay.test.js test/fixtures/feishu/group-at.json
git commit -m "feat: add Feishu event adapters for CMR"
```

### Task 7: Wire the first runnable bot entrypoint

**Files:**
- Create: `tools/feishu_ws_bot.js`
- Modify: `package.json`
- Test: `test/feishu_bot_dry_run.test.js`

**Step 1: Write the failing dry-run test**

```js
test('feishu bot dry-run reports Claude and Feishu readiness', async () => {
  assert.match(output, /FEISHU_WS_DRY_RUN/);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/feishu_bot_dry_run.test.js`
Expected: FAIL

**Step 3: Write the minimal bot entrypoint**

```js
if (process.argv.includes('--dry-run')) {
  console.log('FEISHU_WS_DRY_RUN');
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/feishu_bot_dry_run.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/feishu_ws_bot.js package.json test/feishu_bot_dry_run.test.js
git commit -m "feat: add CMR Feishu bot entrypoint"
```

### Task 8: Add file, image, and audio pipelines

**Files:**
- Create: `tools/lib/platform/feishu/file_gateway.js`
- Modify: `tools/feishu_ws_bot.js`
- Test: `test/file_gateway.test.js`
- Test: `test/feishu_event_replay.test.js`

**Step 1: Write the failing multimodal tests**

```js
test('file event downloads to a temp path for Claude consumption', async () => {
  assert.match(result.filePath, /tmp/);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/file_gateway.test.js test/feishu_event_replay.test.js`
Expected: FAIL

**Step 3: Write the minimal file/image/audio gateways**

```js
async function downloadFileToTempFile(client, messageId, fileKey) {
  return { filePath, fileName };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/file_gateway.test.js test/feishu_event_replay.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/lib/platform/feishu/file_gateway.js tools/feishu_ws_bot.js test/file_gateway.test.js test/feishu_event_replay.test.js
git commit -m "feat: add multimodal input handling for CMR"
```

### Task 9: Add runtime status snapshots and the local monitor

**Files:**
- Create: `tools/lib/monitor/runtime_status_store.js`
- Create: `tools/lib/monitor/monitor_snapshot.js`
- Create: `tools/feishu_monitor_server.js`
- Test: `test/runtime_status_store.test.js`
- Test: `test/feishu_monitor_server.test.js`

**Step 1: Write the failing monitor tests**

```js
test('status store writes heartbeat snapshots', () => {
  assert.equal(snapshot.account, 'default');
});

test('monitor server serves health and dashboard routes', async () => {
  assert.equal(response.statusCode, 200);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/runtime_status_store.test.js test/feishu_monitor_server.test.js`
Expected: FAIL

**Step 3: Write the minimal monitor services**

```js
function createRuntimeStatusStore(opts) {
  return { markIdle, markBusy, markError };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/runtime_status_store.test.js test/feishu_monitor_server.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/lib/monitor/runtime_status_store.js tools/lib/monitor/monitor_snapshot.js tools/feishu_monitor_server.js test/runtime_status_store.test.js test/feishu_monitor_server.test.js
git commit -m "feat: add CMR runtime monitoring"
```

### Task 10: Add LaunchAgent install scripts and operational docs

**Files:**
- Create: `tools/install_feishu_launchagents.sh`
- Modify: `README.md`
- Test: `test/install_launchagents_smoke.test.js`

**Step 1: Write the failing operational test**

```js
test('launchagent installer renders a plist for an account', async () => {
  assert.match(output, /plist/);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/install_launchagents_smoke.test.js`
Expected: FAIL

**Step 3: Write the minimal installer and docs**

```bash
case "$1" in
  install) ;;
  status) ;;
esac
```

**Step 4: Run test to verify it passes**

Run: `node --test test/install_launchagents_smoke.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/install_feishu_launchagents.sh README.md test/install_launchagents_smoke.test.js
git commit -m "docs: add CMR operations and launchagent setup"
```

### Task 11: Add rich reply features

**Files:**
- Create: `tools/lib/platform/feishu/reply_rendering.js`
- Create: `tools/lib/platform/feishu/reply_directives.js`
- Modify: `tools/feishu_ws_bot.js`
- Test: `test/reply_rendering.test.js`

**Step 1: Write the failing rich reply tests**

```js
test('markdown replies render as Feishu cards', async () => {
  assert.equal(result.mode, 'interactive');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/reply_rendering.test.js`
Expected: FAIL

**Step 3: Write the minimal card and directive rendering helpers**

```js
function shouldRenderFeishuMarkdown(text) {
  return true;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test test/reply_rendering.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tools/lib/platform/feishu/reply_rendering.js tools/lib/platform/feishu/reply_directives.js tools/feishu_ws_bot.js test/reply_rendering.test.js
git commit -m "feat: add rich Feishu reply rendering for CMR"
```

### Task 12: Final integration sweep

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-17-cmr-feishu-claude-design.md`
- Modify: `docs/plans/2026-03-17-cmr-feishu-claude.md`
- Test: `test/*.test.js`

**Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS

**Step 2: Run the bot dry-run**

Run: `node tools/feishu_ws_bot.js --account default --dry-run`
Expected: PASS and prints readiness details for Claude and Feishu.

**Step 3: Review docs and usage examples**

```md
Update README quickstart, config examples, and supported features.
```

**Step 4: Re-run verification**

Run: `npm test && node tools/feishu_ws_bot.js --account default --dry-run`
Expected: PASS

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-03-17-cmr-feishu-claude-design.md docs/plans/2026-03-17-cmr-feishu-claude.md
git commit -m "chore: finalize CMR phase-one delivery plan"
```
