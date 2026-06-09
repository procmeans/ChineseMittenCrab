# macOS Bot Manager App Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a native macOS app that can manage multiple local robot instances, add new bots, start/stop them, trigger QR login, and show logs and status without rewriting the existing bot runtime.

**Architecture:** Keep the current Node/Python bot runtime as the execution layer. Add a macOS app on top that manages bot records, writes per-bot config files, and delegates process control to a local service layer. The app owns UX, bot registry, and lifecycle actions; the existing repository keeps ownership of message handling, engine routing, QR login, and reply logic.

**Tech Stack:** SwiftUI, AppKit where needed for process/terminal integration, local JSON config files, existing Node.js bot entrypoints, Python bridge for ClawBot, macOS LaunchAgents or a small local daemon.

---

## Product Shape

The app is a local control panel for multiple robots running on the same Mac.

It should support:

- creating a new bot
- choosing the bot type
- configuring engine and state directory
- starting and stopping that bot
- showing live status and recent logs
- triggering ClawBot QR login when needed

The app is not a new bot runtime. It is an operator surface over the existing runtime.

## Core Constraint

Each robot must remain isolated.

- separate config file
- separate state directory
- separate launch label or process identity
- separate logs
- separate login session

That isolation is what makes multiple WeChat / ClawBot accounts safe to run at the same time.

## Proposed Components

### 1. Bot Registry

Stores the list of managed bots in a local file, for example:

- `id`
- `name`
- `type`
- `engine`
- `account`
- `configPath`
- `stateDir`
- `launchLabel`
- `enabled`

This registry is the source of truth for the UI list.

### 2. Local Bot Service Layer

This layer performs the actual work currently done by shell scripts and launchd:

- install or remove per-bot launch jobs
- start / stop / restart one bot
- read logs
- report status
- trigger QR generation
- expose a small local API for the app

The first version can wrap the existing scripts and processes instead of replacing them.

### 3. macOS UI

Main screens:

- bot list
- bot detail
- add bot sheet
- log viewer

The detail view should expose:

- online / offline
- current engine
- account id
- last heartbeat
- recent log tail
- QR login action for ClawBot

### 4. Bot Template System

The app should generate bot configs from templates.

Examples:

- Feishu template
- WeChat KF template
- ClawBot template

When the user adds a new bot, the app writes a new config file and updates the registry.

## Data Flow

1. User clicks `Add Bot`.
2. App asks for bot type, name, engine, and optional account settings.
3. App writes a new config file and registry entry.
4. App asks the service layer to install or start the new bot.
5. If the bot is ClawBot and not logged in, the service layer emits a QR link.
6. UI displays the QR or a scan-ready state.
7. Once the bot is running, the app polls or subscribes to status and log updates.

## Login and Account Handling

ClawBot is the special case.

- each ClawBot bot instance has its own config and state directory
- a fresh instance can generate a fresh QR login flow
- already logged-in instances should resume without forcing re-login
- the UI must make it clear which bot the QR belongs to

Feishu and WeChat KF keep their existing auth models, but the same app shell should still manage them as independent records.

## Process Management Strategy

Recommended first implementation:

- keep using launchd for persistence
- let the app write plist or config changes when bots are added or removed
- let the app call existing start / stop / restart commands
- reuse the current bot logs in `~/Library/Logs/cmr`

This avoids a full rewrite of service supervision.

## Testing Strategy

The app layer should be tested in layers:

- registry serialization
- bot template generation
- launch command generation
- status parsing
- QR login flow wiring
- log tail rendering

The bot runtime itself should keep its current `node:test` and Python checks.

## Risks

The main risks are operational, not conceptual:

- duplicate bot identity if configs are not isolated
- launchd install / uninstall churn
- QR login confusion if the UI does not clearly label instances
- mixing app state with bot runtime state
- overcoupling the UI to shell commands

The first release should keep the backend simple and avoid smart orchestration logic inside the UI.

## Recommended Delivery Order

1. Define the registry format and bot template format.
2. Build the service layer adapter over the existing scripts.
3. Build the bot list and detail UI.
4. Add ClawBot QR login and status display.
5. Add edit / delete / reinstall flows.

This sequence keeps the UI useful early while limiting risk.
