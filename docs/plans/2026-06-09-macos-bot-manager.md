# macOS Bot Manager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a native macOS app that can create, start, stop, inspect, and add new local robot instances without rewriting the existing Node/Python bot runtime.

**Architecture:** Keep the current bot runtime as the execution engine. Add a SwiftUI app for registry management and UX, plus a thin local service layer that wraps the existing launch / config / log commands. The app should generate per-bot config files, trigger lifecycle actions, and surface QR login and logs, while leaving message handling and protocol code in the existing repository.

**Tech Stack:** SwiftUI, Foundation, AppKit where needed, JSON file storage, existing Node.js bot entrypoints, Python bridge, macOS LaunchAgents.

---

### Task 1: Bot Registry Model

**Files:**
- Create: `macos/BotManagerApp/Models/BotRecord.swift`
- Create: `macos/BotManagerApp/Models/BotType.swift`
- Create: `macos/BotManagerApp/Services/BotRegistry.swift`
- Test: `macos/BotManagerAppTests/BotRegistryTests.swift`

**Step 1: Write the failing test**

Add tests that serialize and deserialize a bot list, preserve per-bot `stateDir` and `launchLabel`, and reject duplicate bot ids.

**Step 2: Run test to verify it fails**

Run the app test target or `swift test` equivalent and confirm missing type / model failures.

**Step 3: Write minimal implementation**

Implement codable bot records and a file-backed registry under the user’s support directory.

**Step 4: Run test to verify it passes**

Re-run the registry tests and confirm PASS.

### Task 2: Local Service Adapter

**Files:**
- Create: `macos/BotManagerApp/Services/BotServiceClient.swift`
- Create: `macos/BotManagerApp/Services/BotProcessCommands.swift`
- Test: `macos/BotManagerAppTests/BotServiceClientTests.swift`

**Step 1: Write the failing test**

Add tests for generating the same launch/start/stop/log commands the current shell scripts use, including a ClawBot QR trigger call.

**Step 2: Run test to verify it fails**

Run the service client tests and confirm the adapter does not exist yet.

**Step 3: Write minimal implementation**

Implement a thin process runner that shells out to the existing scripts first, with a test seam for command execution.

**Step 4: Run test to verify it passes**

Re-run the adapter tests and confirm PASS.

### Task 3: SwiftUI Bot List and Detail

**Files:**
- Create: `macos/BotManagerApp/BotManagerApp.swift`
- Create: `macos/BotManagerApp/Views/BotListView.swift`
- Create: `macos/BotManagerApp/Views/BotDetailView.swift`
- Create: `macos/BotManagerApp/ViewModels/BotListViewModel.swift`
- Create: `macos/BotManagerApp/ViewModels/BotDetailViewModel.swift`
- Test: `macos/BotManagerAppTests/BotListViewModelTests.swift`

**Step 1: Write the failing test**

Add tests for loading the registry into a list, selecting a bot, and showing its status and last log line.

**Step 2: Run test to verify it fails**

Run the view model tests and confirm missing model / binding failures.

**Step 3: Write minimal implementation**

Implement a split view with a bot list on the left and details on the right.

**Step 4: Run test to verify it passes**

Re-run the tests and confirm PASS.

### Task 4: Add Bot Flow

**Files:**
- Create: `macos/BotManagerApp/Views/AddBotSheet.swift`
- Create: `macos/BotManagerApp/ViewModels/AddBotViewModel.swift`
- Create: `macos/BotManagerApp/Services/BotTemplateWriter.swift`
- Test: `macos/BotManagerAppTests/BotTemplateWriterTests.swift`

**Step 1: Write the failing test**

Add tests that create a new Feishu / WeChat KF / ClawBot config file, assign a unique `stateDir`, and register the new bot.

**Step 2: Run test to verify it fails**

Run the template writer tests and confirm the config generator does not exist yet.

**Step 3: Write minimal implementation**

Implement template rendering and registry append behavior.

**Step 4: Run test to verify it passes**

Re-run the template writer tests and confirm PASS.

### Task 5: ClawBot QR and Runtime Wiring

**Files:**
- Create: `macos/BotManagerApp/Services/ClawBotLoginService.swift`
- Create: `macos/BotManagerApp/Views/QRCodeView.swift`
- Create: `macos/BotManagerAppTests/ClawBotLoginServiceTests.swift`
- Modify: `tools/clawbot_bridge.py`
- Modify: `tools/launchd_ctl.sh`

**Step 1: Write the failing test**

Add tests for starting a fresh ClawBot instance, receiving a QR payload, and surfacing the confirmed account id after scan.

**Step 2: Run test to verify it fails**

Run the ClawBot login tests and confirm the QR flow is not yet wired.

**Step 3: Write minimal implementation**

Implement a service call that starts the bot, listens for QR output, and updates the UI when the account becomes ready.

**Step 4: Run test to verify it passes**

Re-run the ClawBot login tests and confirm PASS.

### Task 6: Logs, Status, and Packaging

**Files:**
- Create: `macos/BotManagerApp/Services/LogTailService.swift`
- Create: `macos/BotManagerApp/Services/StatusRefreshService.swift`
- Create: `macos/BotManagerApp/Resources/Info.plist`
- Modify: `README.md`

**Step 1: Write the failing test**

Add tests for reading the last log lines and parsing service status for all configured bots.

**Step 2: Run test to verify it fails**

Run the log/status tests and confirm the adapters are missing.

**Step 3: Write minimal implementation**

Implement log tailing, status refresh, and a basic app bundle configuration.

**Step 4: Run test to verify it passes**

Re-run the tests and confirm PASS.

### Task 7: End-to-End Smoke Test

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-06-09-macos-app-bot-manager-design.md` if assumptions changed

**Step 1: Write the failing test**

Add a smoke checklist that exercises: add bot, start bot, QR login, receive message, and show logs.

**Step 2: Run test to verify it fails**

Run the app’s smoke flow and confirm at least one path still needs fixing.

**Step 3: Write minimal implementation**

Patch the remaining integration gaps until the smoke flow succeeds.

**Step 4: Run test to verify it passes**

Run the smoke flow again and confirm the app can manage multiple bots end to end.
