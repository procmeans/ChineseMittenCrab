import Foundation

/// 一个受管理的机器人实例。
///
/// `name` 是 launchd 短名（如 `clawbot-default`），与 launchd_ctl.sh 的命名一致；
/// `label` 是完整 launchd 标签 `cmr.<name>`，也是日志文件名前缀。
struct BotRecord: Identifiable, Hashable, Codable {
    let name: String          // e.g. "clawbot-default"
    let type: BotType
    let account: String?      // e.g. "default"（cloudflared 为 nil）

    var id: String { name }
    var label: String { "cmr.\(name)" }

    /// 侧边栏显示名：类型 + 账号。
    var displayName: String {
        if let account, !account.isEmpty {
            return "\(type.displayName) · \(account)"
        }
        return type.displayName
    }

    /// 该实例的日志文件路径（与 launchd_ctl.sh 写入位置一致）。
    var logPath: String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/Library/Logs/cmr/\(label).log"
    }

    /// 该实例的 LaunchAgent plist 路径。
    var plistPath: String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/Library/LaunchAgents/\(label).plist"
    }
}

/// launchctl 报告的运行状态。
struct BotStatus: Equatable {
    var installed: Bool   // plist 是否已加载到 launchd
    var running: Bool
    var pid: Int?
    var lastExit: Int?

    static let unknown = BotStatus(installed: false, running: false, pid: nil, lastExit: nil)
}
