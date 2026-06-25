import Foundation

/// 机器人类型。每种类型对应一个 Node 入口脚本（cloudflared 例外，是隧道）。
enum BotType: String, Codable, CaseIterable {
    case feishu
    case wechat
    case clawbot
    case cloudflared

    /// 侧边栏展示名。
    var displayName: String {
        switch self {
        case .feishu: return "飞书"
        case .wechat: return "微信客服"
        case .clawbot: return "ClawBot 扫码微信"
        case .cloudflared: return "Cloudflared 隧道"
        }
    }

    /// SF Symbol 图标名。
    var symbolName: String {
        switch self {
        case .feishu: return "bird"
        case .wechat: return "message.fill"
        case .clawbot: return "qrcode"
        case .cloudflared: return "cloud.fill"
        }
    }

    /// 对应的 Node 入口脚本（相对仓库根），cloudflared 无脚本。
    var entryScript: String? {
        switch self {
        case .feishu: return "tools/feishu_ws_bot.js"
        case .wechat: return "tools/wechat_bot.js"
        case .clawbot: return "tools/clawbot_bot.js"
        case .cloudflared: return nil
        }
    }

    /// 该类型的账号配置目录（相对仓库根）。
    var configDir: String? {
        switch self {
        case .feishu: return "config/feishu"
        case .wechat: return "config/wechat"
        case .clawbot: return "config/clawbot"
        case .cloudflared: return nil
        }
    }
}
