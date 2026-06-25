import SwiftUI

struct ContentView: View {
    @EnvironmentObject var model: AppModel
    @State private var showSettings = false

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            if let bot = model.selectedBot {
                BotDetailView(bot: bot)
                    .id(bot.name)
            } else {
                ContentUnavailableLabel()
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    Task { await model.refreshStatuses() }
                } label: {
                    Label("刷新", systemImage: "arrow.clockwise")
                }
                Button {
                    showSettings = true
                } label: {
                    Label("设置", systemImage: "gearshape")
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(model)
        }
    }

    private var sidebar: some View {
        List(selection: $model.selection) {
            Section("机器人") {
                ForEach(model.bots) { bot in
                    BotRow(bot: bot, status: model.status(for: bot))
                        .tag(bot.name)
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("机器人")
        .frame(minWidth: 240)
        .safeAreaInset(edge: .bottom) {
            HStack {
                Button {
                    model.installAll()
                } label: {
                    Label("安装全部", systemImage: "square.and.arrow.down")
                }
                Spacer()
                Button(role: .destructive) {
                    model.uninstallAll()
                } label: {
                    Label("卸载全部", systemImage: "trash")
                }
            }
            .buttonStyle(.borderless)
            .padding(8)
            .background(.bar)
        }
    }
}

/// 侧边栏单行：图标 + 名字 + 状态点。
struct BotRow: View {
    let bot: BotRecord
    let status: BotStatus

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: bot.type.symbolName)
                .frame(width: 20)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(bot.displayName)
                    .font(.body)
                Text(bot.name)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            Spacer()
            StatusDot(status: status)
        }
        .padding(.vertical, 2)
    }
}

struct StatusDot: View {
    let status: BotStatus
    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 9, height: 9)
            .help(text)
    }
    private var color: Color {
        if status.running { return .green }
        if status.installed { return .orange }
        return .secondary
    }
    private var text: String {
        if status.running { return "运行中" }
        if status.installed { return "已加载未运行" }
        return "未安装"
    }
}

struct ContentUnavailableLabel: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "sidebar.left")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("选择左侧的机器人查看详情")
                .foregroundStyle(.secondary)
        }
    }
}
