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

    @Published var denyPaths: [String] = []              // 禁止机器人访问的文件夹
    @Published var applyingSandbox = false

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
        loadDenyPaths()
        startTimer()
    }

    // MARK: - 沙箱：禁止访问的文件夹

    func loadDenyPaths() {
        denyPaths = SandboxConfig(repoRoot: repoRoot).load()
    }

    func addDenyPath(_ path: String) {
        let p = path.trimmingCharacters(in: .whitespaces)
        guard !p.isEmpty, !denyPaths.contains(p) else { return }
        denyPaths.append(p)
    }

    func removeDenyPath(_ path: String) {
        denyPaths.removeAll { $0 == path }
    }

    /// 写入 deny.json 并重装所有服务（生成 seatbelt profile 并用 sandbox-exec 包住机器人）。
    func applySandbox() {
        applyingSandbox = true
        lastError = nil
        let svc = service
        let cfg = SandboxConfig(repoRoot: repoRoot)
        let paths = denyPaths
        Task.detached {
            let err: String? = {
                do {
                    try cfg.save(paths)
                    let res = svc.installScope("all")
                    return res.ok ? nil : "重装失败：\(res.stderr.isEmpty ? res.stdout : res.stderr)"
                } catch {
                    return "写入 deny.json 失败：\(error.localizedDescription)"
                }
            }()
            await MainActor.run {
                self.applyingSandbox = false
                self.lastError = err
            }
            await self.refreshStatuses()
        }
    }

    func setRepoRoot(_ path: String) {
        RepoPaths.saveRoot(path)
        repoRoot = path
        service = LaunchctlService(repoRoot: path)
        reloadBots()
        loadDenyPaths()
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
