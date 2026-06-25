import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @State private var path: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("设置").font(.title2).bold()

            VStack(alignment: .leading, spacing: 6) {
                Text("仓库根目录").font(.headline)
                Text("管理器调用此目录下的 tools/launchd_ctl.sh 与 config/。")
                    .font(.caption).foregroundStyle(.secondary)
                HStack {
                    TextField("/path/to/ChineseMittenCrab", text: $path)
                        .textFieldStyle(.roundedBorder)
                    Button("选择…") { chooseFolder() }
                    Button("保存") { model.setRepoRoot(path) }
                        .disabled(path == model.repoRoot)
                }
            }

            Divider()
            sandboxSection

            Spacer()
            HStack {
                Spacer()
                Button("关闭") { dismiss() }
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
        .frame(width: 560, height: 520)
        .onAppear {
            path = model.repoRoot
            model.loadDenyPaths()
        }
    }

    // MARK: 禁止机器人访问的文件夹（seatbelt 沙箱）

    private var sandboxSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("禁止机器人访问的文件夹").font(.headline)
            Text("机器人进程将被内核级沙箱（sandbox-exec）禁止读取和写入这些文件夹——连 shell 命令都绕不过，可防止有人借机器人转发其中的敏感文件。")
                .font(.caption).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            List {
                if model.denyPaths.isEmpty {
                    Text("（暂无 —— 当前不限制任何文件夹）")
                        .foregroundStyle(.tertiary).font(.callout)
                }
                ForEach(model.denyPaths, id: \.self) { p in
                    HStack {
                        Image(systemName: "lock.fill").foregroundStyle(.orange).font(.caption)
                        Text(p).font(.system(.callout, design: .monospaced))
                            .lineLimit(1).truncationMode(.middle)
                        Spacer()
                        Button {
                            model.removeDenyPath(p)
                        } label: { Image(systemName: "minus.circle.fill") }
                            .buttonStyle(.borderless).foregroundStyle(.secondary)
                    }
                }
            }
            .frame(height: 140)
            .border(Color.secondary.opacity(0.2))

            HStack {
                Button {
                    addFolder()
                } label: { Label("添加文件夹", systemImage: "plus") }

                Spacer()

                if model.applyingSandbox { ProgressView().controlSize(.small) }
                Button {
                    model.applySandbox()
                } label: { Label("应用并重启全部机器人", systemImage: "checkmark.shield") }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.applyingSandbox)
            }
            Text("「应用」会写入 config/sandbox/deny.json 并重装所有服务，期间机器人会短暂重启。")
                .font(.caption2).foregroundStyle(.tertiary)

            if let err = model.lastError {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        }
    }

    private func addFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = true
        panel.prompt = "禁止访问"
        if panel.runModal() == .OK {
            for url in panel.urls { model.addDenyPath(url.path) }
        }
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            path = url.path
        }
    }
}
