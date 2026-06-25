import Foundation
import AppKit
import CoreImage

/// 把 ClawBot 日志里的二维码内容渲染成图片。
/// 内容可能是：
///   1. data URI（data:image/png;base64,...）
///   2. 纯 base64 的 PNG/JPEG
///   3. 一个 URL 或字符串（需要本地生成二维码）
enum QRImage {
    static func make(from content: String, size: CGFloat = 240) -> NSImage? {
        if let img = decodeBase64Image(content) {
            return img
        }
        return generateQR(from: content, size: size)
    }

    private static func decodeBase64Image(_ content: String) -> NSImage? {
        var base64 = content
        if let commaIdx = content.range(of: ",") , content.hasPrefix("data:") {
            base64 = String(content[commaIdx.upperBound...])
        }
        // 必须看起来像 base64 且有一定长度，否则当作字符串走二维码生成。
        guard base64.count > 64,
              let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
              let img = NSImage(data: data) else {
            return nil
        }
        return img
    }

    private static func generateQR(from string: String, size: CGFloat) -> NSImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        let data = Data(string.utf8)
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }

        let scale = size / output.extent.width
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))

        let context = CIContext()
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return NSImage(cgImage: cg, size: NSSize(width: size, height: size))
    }
}
