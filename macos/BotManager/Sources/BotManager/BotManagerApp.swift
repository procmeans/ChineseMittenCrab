import SwiftUI

@main
struct BotManagerApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup("大闸蟹机器人管理器") {
            ContentView()
                .environmentObject(model)
                .frame(minWidth: 860, minHeight: 560)
                .onAppear { model.onAppear() }
        }
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(replacing: .newItem) {}  // 隐藏 New Window
        }
    }
}
