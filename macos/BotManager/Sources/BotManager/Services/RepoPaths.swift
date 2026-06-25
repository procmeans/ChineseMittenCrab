import Foundation

/// 解析仓库根目录。优先级：
/// 1. 环境变量 `CMR_ROOT`
/// 2. `~/.chinese-mitten-crab/manager.json` 里的 `repoRoot`
/// 3. 编译时写入的默认值（build_app.sh 生成 GeneratedConfig.swift）
/// 4. `~/Documents/robot/ChineseMittenCrab`（兜底）
enum RepoPaths {
    static let userDefaultsKey = "cmr.repoRoot"

    static var managerConfigPath: String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.chinese-mitten-crab/manager.json"
    }

    static func resolveRoot() -> String {
        if let env = ProcessInfo.processInfo.environment["CMR_ROOT"], !env.isEmpty {
            return env
        }
        if let saved = UserDefaults.standard.string(forKey: userDefaultsKey),
           !saved.isEmpty,
           FileManager.default.fileExists(atPath: saved) {
            return saved
        }
        if let fromFile = readRootFromManagerConfig() {
            return fromFile
        }
        if FileManager.default.fileExists(atPath: GeneratedConfig.defaultRepoRoot) {
            return GeneratedConfig.defaultRepoRoot
        }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/Documents/robot/ChineseMittenCrab"
    }

    static func saveRoot(_ path: String) {
        UserDefaults.standard.set(path, forKey: userDefaultsKey)
    }

    private static func readRootFromManagerConfig() -> String? {
        guard let data = FileManager.default.contents(atPath: managerConfigPath),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let root = obj["repoRoot"] as? String,
              !root.isEmpty else {
            return nil
        }
        return root
    }

    static var launchScript: String {
        "\(resolveRoot())/tools/launchd_ctl.sh"
    }
}
