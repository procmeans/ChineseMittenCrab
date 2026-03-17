# ChineseMittenCrab

Standalone Feishu bot project for running Claude Code CLI locally.

## Quickstart

Run the local dry-run check:

```bash
npm test
node tools/feishu_ws_bot.js --account default --dry-run
```

## Configuration

- Copy `config/secrets/local.example.yaml` to `config/secrets/local.yaml`
- Copy `config/feishu/default.example.json` to your account-specific config
- Point the bot at a local Claude Code CLI install and working directory

## Operations

Render a LaunchAgent plist for the default account:

```bash
bash tools/install_feishu_launchagents.sh install default
```
