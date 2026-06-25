# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChineseMittenCrab (CMR) is a macOS-local chat AI bot. Inference engine is pluggable per account: Claude Code CLI (`claude --print`, default) or Codex CLI (`codex exec --json`). Supports Feishu (via WebSocket) and WeChat Dialog Open Platform (via HTTP callback). Written in plain CommonJS Node.js (no transpilation, no TypeScript).

## Commands

```bash
npm install                                    # install dependencies
npm test                                       # run all tests (Node.js built-in test runner)
node --test test/reply_rendering.test.js       # run a single test file
node tools/feishu_ws_bot.js --account default  # start Feishu bot
node tools/feishu_ws_bot.js --account default --dry-run  # validate Feishu config
node tools/wechat_bot.js --account default     # start WeChat bot (HTTP callback on :8080)
node tools/wechat_bot.js --account default --dry-run     # validate WeChat config
node tools/wechat_bot.js --account default --port 9090   # custom port
node tools/feishu_monitor_server.js            # start monitor HTTP server on :3000
node tools/wechat_monitor_server.js            # start wechat conversation viewer on :3001
node tools/wechat_monitor_server.js --port 3002 --log /path/to/other.log  # custom port/log
```

## Architecture

**Entry points**:
- `tools/feishu_ws_bot.js` — Feishu bot via WebSocket, wires DI, handles dedup and cold-start filtering
- `tools/wechat_bot.js` — WeChat bot via HTTP callback server, same DI pattern, immediate ack + async push reply

**Core pipeline** (all in `tools/lib/`):

- `platform/feishu/` — Feishu-specific: SDK client wrapper (`sdk_client.js`), event normalization (`event_projection.js`, `incoming_event.js`), file download (`file_gateway.js`), reply sending/patching (`reply_gateway.js`), Markdown-to-Feishu-card rendering (`reply_rendering.js`), file-path extraction from reply text (`reply_directives.js` — also used by WeChat)
- `platform/wechat/` — WeChat Dialog Open Platform: AES crypto + signature verification (`crypto.js`), event parsing (`incoming_event.js`, `event_projection.js`), HTTP callback server (`callback_server.js`), push API client (`api_client.js`), reply gateway with card no-ops (`reply_gateway.js`), markdown-to-plaintext rendering (`reply_rendering.js`)
- `runtime/` — Platform-agnostic runtime: message handler orchestration (`message_handler.js`), engine selector (`engine_selector.js`), per-taskKey serial queue (`task_queue.js`), conversation history with 5-min TTL and disk persistence (`thread_state.js`), follow-up window logic (`follow_up_window.js`), typing indicator (`lightweight_wait_hint.js`)
- `claude/` — Claude CLI engine adapter: spawns `claude --print` with model/system-prompt/output-dir args (`exec_service.js`), resolves `CLAUDE_HOME` per account (`claude_home.js`), builds prompt text (`prompt_builder.js`)
- `codex/` — Codex CLI engine adapter: spawns `codex exec --json` with model/sandbox/approval/add-dir args (`exec_service.js`), resolves `CODEX_HOME` per account and bootstraps auth from shared `~/.codex` (`codex_home.js`), prepends CODEX.md system prompt + output-dir hint (`prompt_builder.js`)
- `config/` — Loads `config/secrets/local.yaml` (`local_secret_store.js`), merges defaults/preset/account config (`preset_resolver.js`)
- `monitor/` — Runtime status snapshots for the health endpoint (`runtime_status_store.js`, `monitor_snapshot.js`)

**Key design patterns**:
- Dependency injection throughout — `handleIncomingMessage`, `runExec` (claude or codex), etc. accept a `deps` object, making all side effects mockable in tests.
- Engine adapters share a `(deps, input) → { replyText, raw, stderr }` contract. `message_handler.js` is engine-agnostic; the bot entry points call `resolveEngine(config)` to pick `runClaudeExec` or `runCodexExec`. Account config field `engine: "claude" | "codex"` selects (default: `claude`); codex-specific knobs live under a `codex: { ... }` block.
- `taskKey = chatId::senderId` (Feishu groups) or `senderId` (WeChat/Feishu P2P) ensures per-user serial execution.
- Streaming progress: Feishu sends a "processing" card patched every 4s then replaced with final reply. WeChat skips progress (no message patching) — `sendCardReply` returns null, causing `message_handler.js` to naturally degrade to a single final reply via push API.
- Per-message output isolation: the engine writes files to `/tmp/cmr-out/{messageId}/`, which are uploaded then cleaned up. Claude is told via `--append-system-prompt`; codex is told via prompt prefix (no equivalent flag).

## Configuration

- `config/secrets/local.yaml` — Feishu and WeChat credentials (gitignored)
- `config/feishu/{account}.json` — per-account Feishu config (engine, model, presets; for codex engine also a `codex: {...}` block)
- `config/wechat/{account}.json` — per-account WeChat config (engine, model, port)
- `~/.chinese-mitten-crab/claude/{account}/.claude/CLAUDE.md` — claude engine system prompt
- `~/.chinese-mitten-crab/claude/{account}/.claude/settings.json` — Claude permissions
- `~/.chinese-mitten-crab/codex/{account}/.codex/CODEX.md` — codex engine system prompt (optional)
- `~/.chinese-mitten-crab/codex/{account}/{auth.json,config.toml}` — auto-bootstrapped from `~/.codex/` on startup
- `~/.chinese-mitten-crab/state/{account}/threads.json` — persisted conversation history (engine-agnostic)

## Testing

Tests use Node.js built-in `node:test` and `node:assert` — no external test framework. All tests are in `test/` with `.test.js` suffix. Tests rely heavily on dependency injection stubs rather than mocking frameworks. Test fixtures are in `test/fixtures/feishu/` and `test/fixtures/wechat/`.

## Language

The codebase comments, log messages, and bot prompts are in Chinese. The README is in Chinese. Code identifiers and module names are in English.
