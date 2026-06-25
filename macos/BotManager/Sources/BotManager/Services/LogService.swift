import Foundation

/// 读取日志尾部 + 从 ClawBot 日志里提取登录二维码。
struct LogService {
    /// 读取文件最后 `lines` 行。大文件只读末尾一段，避免全量载入。
    static func tail(path: String, lines: Int = 200) -> String {
        guard let handle = FileHandle(forReadingAtPath: path) else {
            return ""
        }
        defer { try? handle.close() }

        let size = (try? handle.seekToEnd()) ?? 0
        // 估算：平均每行 200 字节，多读一点冗余。
        let chunk = UInt64(min(Int(size), max(64_000, lines * 300)))
        let start = size > chunk ? size - chunk : 0
        try? handle.seek(toOffset: start)
        let data = (try? handle.readToEnd()) ?? Data()
        let text = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)

        let allLines = text.split(separator: "\n", omittingEmptySubsequences: false)
        let tailLines = allLines.suffix(lines)
        return tailLines.joined(separator: "\n")
    }

    /// 从日志文本中提取最近一次的 ClawBot 登录二维码内容。
    /// clawbot_bot.js 以 `CLAWBOT_LOGIN_QR <content>` 形式打印。
    /// 返回 nil 表示日志里没有二维码（可能已登录或尚未触发）。
    static func extractLoginQR(fromLog text: String) -> String? {
        let marker = "CLAWBOT_LOGIN_QR "
        var found: String?
        for line in text.split(separator: "\n") {
            if let range = line.range(of: marker) {
                let content = String(line[range.upperBound...]).trimmingCharacters(in: .whitespaces)
                if !content.isEmpty {
                    found = content   // 保留最后一次出现的
                }
            }
        }
        return found
    }
}
