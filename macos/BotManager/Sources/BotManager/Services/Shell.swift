import Foundation

/// 同步执行外部命令并捕获输出。所有调用都应放在后台队列，避免阻塞 UI。
struct Shell {
    struct Result {
        let exitCode: Int32
        let stdout: String
        let stderr: String
        var ok: Bool { exitCode == 0 }
    }

    @discardableResult
    static func run(_ launchPath: String, _ args: [String], cwd: String? = nil) -> Result {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: launchPath)
        proc.arguments = args
        if let cwd { proc.currentDirectoryURL = URL(fileURLWithPath: cwd) }

        // launchd / GUI app 不继承 shell PATH，补齐常见路径，确保能找到 node/claude/codex。
        var env = ProcessInfo.processInfo.environment
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let extra = "\(home)/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["PATH"] = (env["PATH"].map { "\($0):\(extra)" }) ?? extra
        proc.environment = env

        let outPipe = Pipe()
        let errPipe = Pipe()
        proc.standardOutput = outPipe
        proc.standardError = errPipe

        do {
            try proc.run()
        } catch {
            return Result(exitCode: -1, stdout: "", stderr: "无法启动进程: \(error.localizedDescription)")
        }

        let outData = outPipe.fileHandleForReading.readDataToEndOfFile()
        let errData = errPipe.fileHandleForReading.readDataToEndOfFile()
        proc.waitUntilExit()

        return Result(
            exitCode: proc.terminationStatus,
            stdout: String(data: outData, encoding: .utf8) ?? "",
            stderr: String(data: errData, encoding: .utf8) ?? ""
        )
    }

    /// 通过 /bin/bash -lc 执行一行命令（用于带管道/脚本的复杂调用）。
    @discardableResult
    static func bash(_ command: String, cwd: String? = nil) -> Result {
        run("/bin/bash", ["-lc", command], cwd: cwd)
    }
}
