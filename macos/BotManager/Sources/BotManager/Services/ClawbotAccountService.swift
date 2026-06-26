import Foundation

/// 新建 / 删除 ClawBot 账号 —— 只负责磁盘上的配置文件与人设/状态目录，
/// launchd 生命周期（安装、bootout、删 plist）仍由 `LaunchctlService` 负责。
///
/// 一个 ClawBot 账号 = `config/clawbot/<account>.json` 一个文件；
/// `launchd_ctl.sh` 与 `LaunchctlService.discover()` 都靠扫这个目录发现账号。
struct ClawbotAccountService {
    let repoRoot: String

    init(repoRoot: String = RepoPaths.resolveRoot()) {
        self.repoRoot = repoRoot
    }

    enum Engine: String, CaseIterable, Identifiable {
        case claude
        case codex
        var id: String { rawValue }
        var displayName: String {
            switch self {
            case .claude: return "Claude"
            case .codex: return "Codex"
            }
        }
    }

    /// 新建账号的输入。`codexCwd` / `codexModel` 仅 codex 引擎使用。
    struct Spec {
        var account: String
        var engine: Engine = .claude
        var codexCwd: String = ""
        var codexModel: String = "gpt-5.4"
    }

    enum ServiceError: LocalizedError {
        case invalidName(String)
        case alreadyExists(String)
        case notFound(String)
        case io(String)

        var errorDescription: String? {
            switch self {
            case .invalidName(let n): return "账号名「\(n)」不合法（只能用字母、数字、- 和 _，不能叫 example）"
            case .alreadyExists(let n): return "账号「\(n)」已存在"
            case .notFound(let n): return "账号「\(n)」不存在"
            case .io(let m): return m
            }
        }
    }

    // MARK: - 校验（纯函数，便于测试）

    /// 合法账号名：字母/数字开头，其后可含字母数字 - _；不允许空、保留字 example、过长。
    static func isValidAccountName(_ name: String) -> Bool {
        guard name.count <= 40, name != "example" else { return false }
        let pattern = "^[A-Za-z0-9][A-Za-z0-9_-]*$"
        return name.range(of: pattern, options: .regularExpression) != nil
    }

    /// 默认状态目录名。与现有约定一致：default 用 `.clawbot-state`，其余用 `.clawbot-state-<account>`。
    static func defaultStateDir(for account: String) -> String {
        account == "default" ? ".clawbot-state" : ".clawbot-state-\(account)"
    }

    /// 生成账号配置 JSON（纯函数，便于测试）。键序固定（sortedKeys），方便断言。
    static func configJSON(for spec: Spec) -> String {
        let stateDir = defaultStateDir(for: spec.account)
        var dict: [String: Any] = [
            "engine": spec.engine.rawValue,
            "python_bin": ".venv-clawbot/bin/python",
            "state_dir": stateDir,
            "follow_up_ttl_hours": 24,
        ]
        switch spec.engine {
        case .claude:
            dict["model"] = ""
        case .codex:
            dict["codex"] = [
                "bin": "codex",
                "model": spec.codexModel.isEmpty ? "gpt-5.4" : spec.codexModel,
                "reasoning_effort": "medium",
                "cwd": spec.codexCwd,
                "sandbox": "danger-full-access",
                "approval_policy": "never",
                "timeout_sec": 0,
            ]
        }
        guard let data = try? JSONSerialization.data(
            withJSONObject: dict,
            options: [.prettyPrinted, .sortedKeys]
        ), let text = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return text + "\n"
    }

    // MARK: - 路径

    var configDir: String { "\(repoRoot)/config/clawbot" }
    func configPath(_ account: String) -> String { "\(configDir)/\(account).json" }

    /// codex 人设目录 `~/.chinese-mitten-crab/codex/<account>/.codex/CODEX.md`。
    func codexPersonaPath(_ account: String) -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.chinese-mitten-crab/codex/\(account)/.codex/CODEX.md"
    }

    func accountExists(_ account: String) -> Bool {
        FileManager.default.fileExists(atPath: configPath(account))
    }

    // MARK: - 新建

    /// 写入 `config/clawbot/<account>.json`；codex 引擎再补一份默认人设 CODEX.md（已存在则不覆盖）。
    /// 不触碰 launchd —— 调用方在写完后用 `LaunchctlService.installScope("clawbot")` 注册并启动。
    func create(_ spec: Spec) throws {
        guard ClawbotAccountService.isValidAccountName(spec.account) else {
            throw ServiceError.invalidName(spec.account)
        }
        guard !accountExists(spec.account) else {
            throw ServiceError.alreadyExists(spec.account)
        }

        let fm = FileManager.default
        do {
            try fm.createDirectory(atPath: configDir, withIntermediateDirectories: true)
            try ClawbotAccountService.configJSON(for: spec)
                .write(toFile: configPath(spec.account), atomically: true, encoding: .utf8)
        } catch {
            throw ServiceError.io("写入配置失败：\(error.localizedDescription)")
        }

        if spec.engine == .codex {
            writeDefaultCodexPersonaIfAbsent(account: spec.account)
        }
    }

    /// codex 默认人设。已存在则保留用户改过的版本，不覆盖。
    private func writeDefaultCodexPersonaIfAbsent(account: String) {
        let path = codexPersonaPath(account)
        guard !FileManager.default.fileExists(atPath: path) else { return }
        let dir = (path as NSString).deletingLastPathComponent
        let persona = """
        你是 "\(account)"，通过微信和用户交流。

        ## 行为准则
        - 默认用中文回复
        - 直接回答用户问题，不要复述用户原话
        - 回答简洁、可执行，不要不必要的免责声明

        ## 文件生成
        当需要给用户生成文件时，把文件写到运行时指定的输出目录（消息会告知具体路径），然后在回复里说明你写了哪些文件。

        """
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try? persona.write(toFile: path, atomically: true, encoding: .utf8)
    }

    // MARK: - 删除

    /// 删除账号的配置文件与状态目录。launchd 服务的 bootout + 删 plist 由调用方先做。
    /// 保留 codex 人设目录（可能是手工调过的），不连带删除。
    func delete(account: String) throws {
        guard accountExists(account) else {
            throw ServiceError.notFound(account)
        }
        let fm = FileManager.default

        // 删状态目录前先从配置里读 state_dir，兼容 default 的 `.clawbot-state`（无后缀）。
        let stateDir = stateDirFromConfig(account) ?? ClawbotAccountService.defaultStateDir(for: account)
        let statePath = "\(repoRoot)/\(stateDir)"

        do {
            try fm.removeItem(atPath: configPath(account))
        } catch {
            throw ServiceError.io("删除配置失败：\(error.localizedDescription)")
        }
        if fm.fileExists(atPath: statePath) {
            try? fm.removeItem(atPath: statePath)
        }
    }

    /// 从账号配置里读出 state_dir 字段；读不到返回 nil。
    func stateDirFromConfig(_ account: String) -> String? {
        guard let data = FileManager.default.contents(atPath: configPath(account)),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let dir = obj["state_dir"] as? String, !dir.isEmpty else {
            return nil
        }
        return dir
    }
}
