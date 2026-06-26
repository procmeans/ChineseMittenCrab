import SwiftUI

struct BotDetailView: View {
    @EnvironmentObject var model: AppModel
    let bot: BotRecord

    @State private var logText: String = ""
    @State private var qrContent: String?
    @State private var logTimer: Timer?
    @State private var showDeleteConfirm = false

    private var status: BotStatus { model.status(for: bot) }
    private var isBusy: Bool { model.busy.contains(bot.name) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    statusCard
                    if bot.type == .clawbot, let qr = qrContent {
                        qrCard(qr)
                    }
                    logCard
                }
                .padding(16)
            }
        }
        .onAppear { startLogTimer() }
        .onDisappear { logTimer?.invalidate() }
    }

    // MARK: header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: bot.type.symbolName)
                .font(.title)
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(bot.displayName).font(.title2).bold()
                Text(bot.label).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            controls
        }
        .padding(16)
    }

    private var controls: some View {
        HStack(spacing: 8) {
            Button {
                model.perform(.start, on: bot)
            } label: { Label("启动", systemImage: "play.fill") }
                .disabled(isBusy || status.running)

            Button {
                model.perform(.restart, on: bot)
            } label: { Label("重启", systemImage: "arrow.clockwise") }
                .disabled(isBusy || !status.installed)

            Button(role: .destructive) {
                model.perform(.stop, on: bot)
            } label: { Label("停止", systemImage: "stop.fill") }
                .disabled(isBusy || !status.installed)

            if bot.type == .clawbot {
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: { Label("删除账号", systemImage: "trash") }
                    .disabled(isBusy)
            }

            if isBusy { ProgressView().controlSize(.small) }
        }
        .buttonStyle(.bordered)
        .confirmationDialog(
            "删除账号 \(bot.account ?? "")？",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("删除", role: .destructive) { model.deleteClawbotAccount(bot) }
            Button("取消", role: .cancel) {}
        } message: {
            Text("会停止该服务、删除其 plist、config/clawbot/\(bot.account ?? "").json 及登录状态目录。此操作不可撤销。")
        }
    }

    // MARK: status card

    private var statusCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 8) {
                row("状态", value: statusText, color: statusColor)
                row("类型", value: bot.type.displayName)
                if let account = bot.account { row("账号", value: account) }
                row("PID", value: status.pid.map(String.init) ?? "—")
                row("上次退出码", value: status.lastExit.map(String.init) ?? "—")
                row("日志文件", value: bot.logPath, mono: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } label: {
            Label("运行状态", systemImage: "info.circle")
        }
        .overlay(alignment: .bottom) {
            if let err = model.lastError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 8)
            }
        }
    }

    private var statusText: String {
        if status.running { return "运行中" }
        if status.installed { return "已加载（未运行）" }
        return "未安装"
    }
    private var statusColor: Color {
        if status.running { return .green }
        if status.installed { return .orange }
        return .secondary
    }

    private func row(_ key: String, value: String, color: Color? = nil, mono: Bool = false) -> some View {
        HStack(alignment: .top) {
            Text(key)
                .frame(width: 90, alignment: .leading)
                .foregroundStyle(.secondary)
            Text(value)
                .font(mono ? .system(.caption, design: .monospaced) : .body)
                .foregroundStyle(color ?? .primary)
                .textSelection(.enabled)
            Spacer()
        }
    }

    // MARK: QR card

    private func qrCard(_ content: String) -> some View {
        GroupBox {
            HStack(alignment: .top, spacing: 16) {
                if let img = QRImage.make(from: content) {
                    Image(nsImage: img)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 200, height: 200)
                        .background(Color.white)
                        .cornerRadius(8)
                } else {
                    Text("无法渲染二维码").foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("用微信扫码登录此 ClawBot 实例")
                        .font(.headline)
                    Text("二维码来自该实例日志的 CLAWBOT_LOGIN_QR。扫码并在手机确认后，下方日志会显示登录成功。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
            }
        } label: {
            Label("扫码登录", systemImage: "qrcode")
        }
    }

    // MARK: log card

    private var logCard: some View {
        GroupBox {
            ScrollView {
                Text(logText.isEmpty ? "（暂无日志）" : logText)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 260)
        } label: {
            HStack {
                Label("日志（末尾 200 行）", systemImage: "doc.plaintext")
                Spacer()
                Button {
                    refreshLog()
                } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.borderless)
            }
        }
    }

    // MARK: log polling

    private func startLogTimer() {
        refreshLog()
        logTimer?.invalidate()
        logTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { _ in
            refreshLog()
        }
    }

    private func refreshLog() {
        let path = bot.logPath
        let type = bot.type
        Task.detached {
            let text = LogService.tail(path: path, lines: 200)
            let qr = type == .clawbot ? LogService.extractLoginQR(fromLog: text) : nil
            await MainActor.run {
                self.logText = text
                self.qrContent = qr
            }
        }
    }
}
