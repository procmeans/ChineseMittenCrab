import XCTest
@testable import BotManager

final class BotManagerTests: XCTestCase {

    // MARK: ClawBot 账号发现

    func testClawbotAccountsExcludesExamples() {
        let files = ["default.json", "default.example.json", "second.json", "third.json", "notes.txt"]
        let accounts = LaunchctlService.clawbotAccounts(fromFilenames: files)
        XCTAssertEqual(accounts, ["default", "second", "third"])
    }

    func testClawbotAccountsSorted() {
        let files = ["zeta.json", "alpha.json"]
        XCTAssertEqual(LaunchctlService.clawbotAccounts(fromFilenames: files), ["alpha", "zeta"])
    }

    func testFixedRecordsCoverCoreServices() {
        let names = Set(LaunchctlService.fixedRecords.map { $0.name })
        XCTAssertTrue(names.contains("feishu-default"))
        XCTAssertTrue(names.contains("wechat-default"))
        XCTAssertTrue(names.contains("cloudflared"))
    }

    // MARK: 记录派生属性

    func testBotRecordLabelAndPaths() {
        let bot = BotRecord(name: "clawbot-default", type: .clawbot, account: "default")
        XCTAssertEqual(bot.label, "cmr.clawbot-default")
        XCTAssertTrue(bot.logPath.hasSuffix("Library/Logs/cmr/cmr.clawbot-default.log"))
        XCTAssertTrue(bot.plistPath.hasSuffix("Library/LaunchAgents/cmr.clawbot-default.plist"))
    }

    // MARK: launchctl print 解析

    func testParseStatusRunning() {
        let sample = """
        com.apple.xpc.launchd.domain.gui.501 = {
            pid = 1233
            state = running
            last exit code = (never exited)
        }
        """
        let st = LaunchctlService.parseStatus(fromLaunchctlPrint: sample, exitOK: true)
        XCTAssertTrue(st.installed)
        XCTAssertTrue(st.running)
        XCTAssertEqual(st.pid, 1233)
    }

    func testParseStatusNotInstalled() {
        let st = LaunchctlService.parseStatus(fromLaunchctlPrint: "", exitOK: false)
        XCTAssertFalse(st.installed)
        XCTAssertFalse(st.running)
        XCTAssertNil(st.pid)
    }

    func testParseStatusLoadedButStopped() {
        let sample = """
        service = {
            state = not running
            last exit code = 0
        }
        """
        let st = LaunchctlService.parseStatus(fromLaunchctlPrint: sample, exitOK: true)
        XCTAssertTrue(st.installed)
        XCTAssertFalse(st.running)
        XCTAssertEqual(st.lastExit, 0)
    }

    // MARK: QR 提取

    func testExtractLoginQR() {
        let log = """
        2026-06-25 启动中
        CLAWBOT_LOGIN_QR https://login.weixin.qq.com/abc123
        等待扫码
        """
        XCTAssertEqual(LogService.extractLoginQR(fromLog: log), "https://login.weixin.qq.com/abc123")
    }

    func testExtractLoginQRReturnsLast() {
        let log = """
        CLAWBOT_LOGIN_QR old-code
        CLAWBOT_LOGIN_QR new-code
        """
        XCTAssertEqual(LogService.extractLoginQR(fromLog: log), "new-code")
    }

    func testExtractLoginQRNoneWhenAbsent() {
        XCTAssertNil(LogService.extractLoginQR(fromLog: "普通日志\n登录成功"))
    }

    // MARK: 沙箱 deny.json 解析/序列化

    func testSandboxParseDenyPathsObject() {
        let data = Data(#"{"denyPaths":["/Users/me/secret","/Users/me/.ssh"]}"#.utf8)
        XCTAssertEqual(SandboxConfig.parse(data), ["/Users/me/secret", "/Users/me/.ssh"])
    }

    func testSandboxParseBareArray() {
        let data = Data(#"["/a","/b"]"#.utf8)
        XCTAssertEqual(SandboxConfig.parse(data), ["/a", "/b"])
    }

    func testSandboxParseGarbageReturnsEmpty() {
        XCTAssertEqual(SandboxConfig.parse(Data("not json".utf8)), [])
    }

    func testSandboxSerializeRoundTrip() {
        let paths = ["/Users/me/Documents/rainwe games", "/Users/me/.aws"]
        let data = SandboxConfig.serialize(paths)
        XCTAssertEqual(SandboxConfig.parse(data), paths)
    }

    // MARK: 日志尾部

    func testLogTailReadsLastLines() throws {
        let tmp = NSTemporaryDirectory() + "cmr-test-\(getpid()).log"
        let lines = (1...500).map { "line \($0)" }.joined(separator: "\n")
        try lines.write(toFile: tmp, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(atPath: tmp) }

        let tail = LogService.tail(path: tmp, lines: 10)
        let tailLines = tail.split(separator: "\n")
        XCTAssertEqual(tailLines.last, "line 500")
        XCTAssertLessThanOrEqual(tailLines.count, 10)
    }
}
