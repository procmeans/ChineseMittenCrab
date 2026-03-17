# ChineseMittenCrab

Standalone Feishu bot project for running Claude Code CLI locally.

## Quickstart

Run the local dry-run check:

```bash
npm test
node tools/feishu_ws_bot.js --account default --dry-run
```

Start the local monitor:

```bash
node tools/feishu_monitor_server.js
```

## Configuration

- Copy `config/secrets/local.example.yaml` to `config/secrets/local.yaml`
- Copy `config/feishu/default.example.json` to your account-specific config
- Point the bot at a local Claude Code CLI install and working directory

## Supported Phase-One Features

- Feishu bot dry-run entrypoint
- Claude CLI execution helpers
- Runtime thread state, task queue, wait hint, and follow-up window primitives
- Feishu event normalization for group mentions and file attachments
- Multimodal file download to local temp paths
- Rich Feishu markdown reply rendering
- Local monitor HTTP server and LaunchAgent plist rendering

## Operations

Render a LaunchAgent plist for the default account:

```bash
bash tools/install_feishu_launchagents.sh install default
```

Check the lightweight LaunchAgent status output:

```bash
bash tools/install_feishu_launchagents.sh status default
```
