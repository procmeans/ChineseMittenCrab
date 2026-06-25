// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "BotManager",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "BotManager",
            path: "Sources/BotManager"
        ),
        .testTarget(
            name: "BotManagerTests",
            dependencies: ["BotManager"],
            path: "Tests/BotManagerTests"
        )
    ]
)
