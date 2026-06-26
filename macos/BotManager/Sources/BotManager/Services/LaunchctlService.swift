import Foundation

/// 机器人发现 + launchd 生命周期控制。
///
/// 与 `tools/launchd_ctl.sh` 的服务表保持一致：
///   固定服务：feishu-default / feishu-xiaocao / wechat-default / cloudflared
///   ClawBot：从 config/clawbot/*.json 动态发现（排除 *.example.json）
struct LaunchctlService {
    let repoRoot: String

    init(repoRoot: String = RepoPaths.resolveRoot()) {
        self.repoRoot = repoRoot
    }

    private var uid: String { String(getuid()) }
    private func domainTarget(_ label: String) -> String { "gui/\(uid)/\(label)" }

    // MARK: - 发现

    /// 与 launchd_ctl.sh 固定服务表一致。
    static let fixedRecords: [BotRecord] = [
        BotRecord(name: "feishu-default", type: .feishu, account: "default"),
        BotRecord(name: "feishu-xiaocao", type: .feishu, account: "xiaocao"),
        BotRecord(name: "wechat-default", type: .wechat, account: "default"),
        BotRecord(name: "cloudflared", type: .cloudflared, account: nil)
    ]

    /// 从 config/clawbot 目录下的文件名解析出 ClawBot 账号（纯函数，便于测试）。
    /// 排除 *.example.json，只取 *.json。
    static func clawbotAccounts(fromFilenames filenames: [String]) -> [String] {
        filenames
            .filter { $0.hasSuffix(".json") && !$0.hasSuffix(".example.json") }
            .map { String($0.dropLast(".json".count)) }
            .sorted()
    }

    func discover() -> [BotRecord] {
        var records = LaunchctlService.fixedRecords

        let clawbotDir = "\(repoRoot)/config/clawbot"
        let files = (try? FileManager.default.contentsOfDirectory(atPath: clawbotDir)) ?? []
        for account in LaunchctlService.clawbotAccounts(fromFilenames: files) {
            records.append(BotRecord(name: "clawbot-\(account)", type: .clawbot, account: account))
        }
        return records
    }

    // MARK: - 状态

    /// 解析 `launchctl print` 输出（纯函数，便于测试）。
    static func parseStatus(fromLaunchctlPrint text: String, exitOK: Bool) -> BotStatus {
        guard exitOK, !text.isEmpty else {
            return BotStatus(installed: false, running: false, pid: nil, lastExit: nil)
        }
        var pid: Int?
        var lastExit: Int?
        var running = false

        for rawLine in text.split(separator: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("pid = ") {
                pid = Int(line.replacingOccurrences(of: "pid = ", with: "").trimmingCharacters(in: .whitespaces))
            } else if line.hasPrefix("last exit code = ") {
                let v = line.replacingOccurrences(of: "last exit code = ", with: "").trimmingCharacters(in: .whitespaces)
                lastExit = Int(v)
            } else if line.hasPrefix("state = ") {
                let v = line.replacingOccurrences(of: "state = ", with: "").trimmingCharacters(in: .whitespaces)
                running = (v == "running")
            }
        }
        // 已加载即 installed；有 pid 或 state=running 视为运行中。
        return BotStatus(installed: true, running: running || pid != nil, pid: pid, lastExit: lastExit)
    }

    func status(_ record: BotRecord) -> BotStatus {
        let res = Shell.run("/bin/launchctl", ["print", domainTarget(record.label)])
        return LaunchctlService.parseStatus(fromLaunchctlPrint: res.stdout, exitOK: res.ok)
    }

    // MARK: - 单实例生命周期

    /// 启动（加载）：若 plist 存在则 bootstrap。
    @discardableResult
    func start(_ record: BotRecord) -> Shell.Result {
        if FileManager.default.fileExists(atPath: record.plistPath) {
            return Shell.run("/bin/launchctl", ["bootstrap", "gui/\(uid)", record.plistPath])
        }
        // 未安装 plist：用脚本安装对应 scope。
        return installScope(scopeFor(record))
    }

    /// 停止（卸载）：bootout，但保留磁盘上的 plist，便于再次启动。
    @discardableResult
    func stop(_ record: BotRecord) -> Shell.Result {
        Shell.run("/bin/launchctl", ["bootout", domainTarget(record.label)])
    }

    /// 重启：kickstart -k。
    @discardableResult
    func restart(_ record: BotRecord) -> Shell.Result {
        Shell.run("/bin/launchctl", ["kickstart", "-k", domainTarget(record.label)])
    }

    /// 卸载单个服务并删除其 plist —— 删账号时用，只动这一个，不影响其它 ClawBot 账号。
    @discardableResult
    func removeService(_ record: BotRecord) -> Shell.Result {
        let res = Shell.run("/bin/launchctl", ["bootout", domainTarget(record.label)])
        try? FileManager.default.removeItem(atPath: record.plistPath)
        return res
    }

    // MARK: - 批量（复用 launchd_ctl.sh）

    private func scopeFor(_ record: BotRecord) -> String {
        record.type == .clawbot ? "clawbot" : "all"
    }

    @discardableResult
    func installScope(_ scope: String) -> Shell.Result {
        Shell.run("/bin/bash", [RepoPaths.launchScript, "install", scope], cwd: repoRoot)
    }

    @discardableResult
    func uninstallScope(_ scope: String) -> Shell.Result {
        Shell.run("/bin/bash", [RepoPaths.launchScript, "uninstall", scope], cwd: repoRoot)
    }
}
