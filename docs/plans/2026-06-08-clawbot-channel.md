# ClawBot Channel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a standalone ClawBot WeChat channel without replacing the existing official WeChat customer-service channel.

**Architecture:** Keep the current Node runtime as the source of truth for queueing, Claude/Codex execution, thread state, and reply formatting. Add a Python JSONL bridge that owns ClawBot login, polling, typing, and media send APIs, while Node maps bridge messages into the existing `message_handler.js` contract.

**Tech Stack:** Node.js CommonJS, `node:test`, Python 3.11+, `wechat_clawbot_sdk`, macOS LaunchAgent.

---

### Task 1: ClawBot Platform Adapter

**Files:**
- Create: `tools/lib/platform/clawbot/event_projection.js`
- Create: `tools/lib/platform/clawbot/reply_gateway.js`
- Test: `test/clawbot_adapter.test.js`

**Steps:**
1. Write failing tests for message normalization and reply routing.
2. Run `node --test test/clawbot_adapter.test.js` and confirm module-not-found failures.
3. Implement minimal event projection and reply gateway.
4. Re-run the adapter tests and confirm PASS.

### Task 2: Bridge Process Wrapper

**Files:**
- Create: `tools/lib/platform/clawbot/bridge_process.js`
- Test: `test/clawbot_bridge_process.test.js`

**Steps:**
1. Write failing tests for JSONL event parsing and send command serialization.
2. Run `node --test test/clawbot_bridge_process.test.js` and confirm failure.
3. Implement the child-process wrapper with injectable `spawn` for tests.
4. Re-run the bridge tests and confirm PASS.

### Task 3: Bot Entrypoint

**Files:**
- Create: `tools/clawbot_bot.js`
- Create: `tools/clawbot_bridge.py`
- Create: `config/clawbot/default.example.json`
- Test: `test/clawbot_bot.test.js`

**Steps:**
1. Write failing tests for `prepareRuntimeEvent`, `renderBotReply`, and `--dry-run`.
2. Implement the Node bot entrypoint using the bridge wrapper and existing runtime.
3. Implement the Python bridge with `wechat_clawbot_sdk` import guarded by a clear runtime error.
4. Re-run ClawBot tests and confirm PASS.

### Task 4: Operations Wiring

**Files:**
- Modify: `package.json`
- Modify: `tools/launchd_ctl.sh`
- Modify: `README.md`

**Steps:**
1. Add `npm run clawbot:bot`.
2. Add LaunchAgent service `cmr.clawbot-default`.
3. Document first-run install, QR login, and dependency install.
4. Run `npm test`.
