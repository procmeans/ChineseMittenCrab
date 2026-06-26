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

    // MARK: - 新建 / 删除 ClawBot 账号

    @Published var creatingAccount = false

    /// 新建一个 ClawBot 账号：写 config/clawbot/<account>.json（codex 再补人设），
    /// 然后 install clawbot 注册并启动该 launchd 服务，最后刷新列表并选中它。
    /// completion 在主线程回调，error 为 nil 表示成功。
    func createClawbotAccount(_ spec: ClawbotAccountService.Spec, completion: @escaping (String?) -> Void) {
        creatingAccount = true
        lastError = nil
        let svc = service
        let accounts = ClawbotAccountService(repoRoot: repoRoot)
        let newName = "clawbot-\(spec.account)"
        Task.detached {
            let err: String? = {
                do {
                    try accounts.create(spec)
                } catch {
                    return error.localizedDescription
                }
                // install clawbot：注册新账号的 plist 并启动（与「启动」未安装实例时同款行为）。
                let res = svc.installScope("clawbot")
                if !res.ok {
                    return "配置已写入，但注册服务失败：\(res.stderr.isEmpty ? res.stdout : res.stderr)"
                }
                return nil
            }()
            let discovered = svc.discover()
            await MainActor.run {
                self.creatingAccount = false
                self.lastError = err
                self.bots = discovered
                if err == nil { self.selection = newName }
                completion(err)
            }
            await self.refreshStatuses()
        }
    }

    /// 删除一个 ClawBot 账号：先 bootout 并删该服务 plist（只动这一个），
    /// 再删 config 与状态目录，最后刷新列表。仅对 clawbot 类型有效。
    func deleteClawbotAccount(_ bot: BotRecord) {
        guard bot.type == .clawbot, let account = bot.account else { return }
        busy.insert(bot.name)
        lastError = nil
        let svc = service
        let accounts = ClawbotAccountService(repoRoot: repoRoot)
        Task.detached {
            svc.removeService(bot)               // bootout + 删 plist（单个）
            let err: String? = {
                do {
                    try accounts.delete(account: account)
                    return nil
                } catch {
                    return error.localizedDescription
                }
            }()
            let discovered = svc.discover()
            await MainActor.run {
                self.busy.remove(bot.name)
                self.lastError = err
                self.bots = discovered
                if self.selection == bot.name { self.selection = discovered.first?.name }
                self.statuses[bot.name] = nil
            }
            await self.refreshStatuses()
        }
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
