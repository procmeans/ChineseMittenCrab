import Foundation
import SwiftUI

/// 全局应用状态：机器人列表、各自状态、定时刷新。
@MainActor
final class AppModel: ObservableObject {
    @Published var bots: [BotRecord] = []
    @Published var statuses: [String: BotStatus] = [:]   // key = bot.name
    @Published var selection: String?                    // 选中的 bot.name
    @Published var repoRoot: String = RepoPaths.resolveRoot()
    @Published var busy: Set<String> = []                // 正在执行操作的 bot.name
    @Published var lastError: String?

    private var service: LaunchctlService
    private var timer: Timer?

    init() {
        service = LaunchctlService(repoRoot: RepoPaths.resolveRoot())
    }

    var selectedBot: BotRecord? {
        guard let selection else { return nil }
        return bots.first { $0.name == selection }
    }

    func onAppear() {
        reloadBots()
        startTimer()
    }

    func setRepoRoot(_ path: String) {
        RepoPaths.saveRoot(path)
        repoRoot = path
        service = LaunchctlService(repoRoot: path)
        reloadBots()
    }

    func reloadBots() {
        let svc = service
        Task.detached {
            let discovered = svc.discover()
            await MainActor.run {
                self.bots = discovered
                if self.selection == nil { self.selection = discovered.first?.name }
            }
            await self.refreshStatuses()
        }
    }

    func refreshStatuses() async {
        let svc = service
        let current = bots
        let results: [(String, BotStatus)] = await Task.detached {
            current.map { ($0.name, svc.status($0)) }
        }.value
        await MainActor.run {
            for (name, st) in results { self.statuses[name] = st }
        }
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 4.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { await self.refreshStatuses() }
        }
    }

    // MARK: - 操作

    func perform(_ action: BotAction, on bot: BotRecord) {
        busy.insert(bot.name)
        lastError = nil
        let svc = service
        Task.detached {
            let res: Shell.Result
            switch action {
            case .start:   res = svc.start(bot)
            case .stop:    res = svc.stop(bot)
            case .restart: res = svc.restart(bot)
            }
            await MainActor.run {
                self.busy.remove(bot.name)
                if !res.ok {
                    let msg = res.stderr.isEmpty ? res.stdout : res.stderr
                    self.lastError = "\(action.label)失败：\(msg.trimmingCharacters(in: .whitespacesAndNewlines))"
                }
            }
            await self.refreshStatuses()
        }
    }

    func installAll() {
        runScript("install")
    }

    func uninstallAll() {
        runScript("uninstall")
    }

    private func runScript(_ verb: String) {
        lastError = nil
        let svc = service
        Task.detached {
            let res = verb == "install" ? svc.installScope("all") : svc.uninstallScope("all")
            await MainActor.run {
                if !res.ok {
                    self.lastError = "\(verb) 失败：\(res.stderr.isEmpty ? res.stdout : res.stderr)"
                }
            }
            await self.refreshStatuses()
        }
    }

    func status(for bot: BotRecord) -> BotStatus {
        statuses[bot.name] ?? .unknown
    }
}

enum BotAction {
    case start, stop, restart
    var label: String {
        switch self {
        case .start: return "启动"
        case .stop: return "停止"
        case .restart: return "重启"
        }
    }
}
