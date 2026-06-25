import Foundation

/// 读写 config/sandbox/deny.json —— 机器人被 seatbelt 沙箱禁止读/写的文件夹清单。
/// 与 tools/sandbox_profile.sh 读取的是同一个文件。
struct SandboxConfig {
    let repoRoot: String

    var denyJsonPath: String { "\(repoRoot)/config/sandbox/deny.json" }

    func load() -> [String] {
        guard let data = FileManager.default.contents(atPath: denyJsonPath) else { return [] }
        return SandboxConfig.parse(data)
    }

    /// 解析 deny.json（纯函数，便于测试）。兼容 `{"denyPaths":[...]}` 和裸数组 `[...]`。
    static func parse(_ data: Data) -> [String] {
        guard let obj = try? JSONSerialization.jsonObject(with: data) else { return [] }
        if let dict = obj as? [String: Any], let arr = dict["denyPaths"] as? [String] {
            return arr
        }
        if let arr = obj as? [String] {
            return arr
        }
        return []
    }

    /// 序列化为带 denyPaths 键的 JSON（纯函数，便于测试）。
    static func serialize(_ paths: [String]) -> Data {
        let obj = ["denyPaths": paths]
        return (try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]))
            ?? Data("{\"denyPaths\":[]}".utf8)
    }

    func save(_ paths: [String]) throws {
        let dir = "\(repoRoot)/config/sandbox"
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try SandboxConfig.serialize(paths).write(to: URL(fileURLWithPath: denyJsonPath))
    }
}
