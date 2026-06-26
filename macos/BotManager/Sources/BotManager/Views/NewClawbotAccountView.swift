import SwiftUI

/// 新建 ClawBot 扫码微信账号的表单。提交后写配置 + 注册 launchd 服务，
/// 关闭后回到主界面，选中新账号，在详情页扫码登录。
struct NewClawbotAccountView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss

    @State private var account = ""
    @State private var engine: ClawbotAccountService.Engine = .claude
    @State private var codexCwd = ""
    @State private var codexModel = "gpt-5.4"
    @State private var localError: String?

    private var nameValid: Bool { ClawbotAccountService.isValidAccountName(account) }
    private var nameTaken: Bool {
        ClawbotAccountService(repoRoot: model.repoRoot).accountExists(account)
    }
    private var canSubmit: Bool {
        nameValid && !nameTaken && !model.creatingAccount
            && (engine == .claude || !codexCwd.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("新建 ClawBot 账号").font(.title2).bold()
            Text("会生成 config/clawbot/<名字>.json 并注册成开机自启服务。创建后在详情页用微信扫码登录。")
                .font(.caption).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Form {
                Section {
                    TextField("账号名字", text: $account)
                        .textFieldStyle(.roundedBorder)
                    if !account.isEmpty && !nameValid {
                        Text("只能用字母、数字、- 和 _，不能叫 example")
                            .font(.caption).foregroundStyle(.red)
                    } else if nameTaken {
                        Text("该账号已存在")
                            .font(.caption).foregroundStyle(.red)
                    } else {
                        Text("将创建：clawbot-\(account.isEmpty ? "<名字>" : account)")
                            .font(.caption).foregroundStyle(.tertiary)
                    }
                }

                Picker("推理引擎", selection: $engine) {
                    ForEach(ClawbotAccountService.Engine.allCases) { e in
                        Text(e.displayName).tag(e)
                    }
                }
                .pickerStyle(.segmented)

                if engine == .codex {
                    Section("Codex 设置") {
                        HStack {
                            TextField("工作目录（cwd）", text: $codexCwd)
                                .textFieldStyle(.roundedBorder)
                            Button("选择…") { chooseCwd() }
                        }
                        TextField("模型", text: $codexModel)
                            .textFieldStyle(.roundedBorder)
                        Text("沙箱 danger-full-access、approval=never（与现有 codex 账号一致）。")
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                }
            }
            .formStyle(.grouped)

            if let err = localError ?? model.lastError {
                Text(err).font(.caption).foregroundStyle(.red)
            }

            HStack {
                if model.creatingAccount { ProgressView().controlSize(.small) }
                Spacer()
                Button("取消") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button("创建并启动") { submit() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .disabled(!canSubmit)
            }
        }
        .padding(20)
        .frame(width: 520)
    }

    private func submit() {
        localError = nil
        let spec = ClawbotAccountService.Spec(
            account: account.trimmingCharacters(in: .whitespaces),
            engine: engine,
            codexCwd: codexCwd.trimmingCharacters(in: .whitespaces),
            codexModel: codexModel.trimmingCharacters(in: .whitespaces)
        )
        model.createClawbotAccount(spec) { err in
            if err == nil { dismiss() } else { localError = err }
        }
    }

    private func chooseCwd() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            codexCwd = url.path
        }
    }
}
