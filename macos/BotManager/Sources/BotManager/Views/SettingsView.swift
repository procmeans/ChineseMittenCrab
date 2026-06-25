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
                }
            }

            Spacer()
            HStack {
                Spacer()
                Button("取消") { dismiss() }
                Button("保存") {
                    model.setRepoRoot(path)
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 520, height: 240)
        .onAppear { path = model.repoRoot }
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
