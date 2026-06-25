#!/usr/bin/env swift
// 生成 App 图标 AppIcon.png (1024x1024)：海洋青色圆角方块 + 螃蟹。
// 用法: swift macos/make_icon.swift   -> 输出 macos/AppIcon.png
import AppKit

let S = 1024
let cs = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(
    data: nil, width: S, height: S, bitsPerComponent: 8, bytesPerRow: 0,
    space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else { fatalError("无法创建画布") }

// 圆角方块（macOS 风格 squircle 近似），四周留透明边距。
let inset: CGFloat = 96
let rect = CGRect(x: inset, y: inset, width: CGFloat(S) - inset * 2, height: CGFloat(S) - inset * 2)
let path = CGPath(roundedRect: rect, cornerWidth: 196, cornerHeight: 196, transform: nil)

// 渐变背景：上浅青 -> 下深青。
ctx.saveGState()
ctx.addPath(path)
ctx.clip()
let top = NSColor(calibratedRed: 0.10, green: 0.66, blue: 0.71, alpha: 1).cgColor   // #1AA8B5
let bottom = NSColor(calibratedRed: 0.03, green: 0.39, blue: 0.45, alpha: 1).cgColor // #086373
let grad = CGGradient(colorsSpace: cs, colors: [top, bottom] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: CGFloat(S)), end: CGPoint(x: 0, y: 0), options: [])
// 顶部高光。
let hi = CGGradient(colorsSpace: cs,
                    colors: [NSColor(white: 1, alpha: 0.22).cgColor, NSColor(white: 1, alpha: 0).cgColor] as CFArray,
                    locations: [0, 1])!
ctx.drawLinearGradient(hi, start: CGPoint(x: 0, y: CGFloat(S)), end: CGPoint(x: 0, y: CGFloat(S) * 0.55), options: [])
ctx.restoreGState()

// 螃蟹 emoji（彩色字形），带轻微阴影。
let nsctx = NSGraphicsContext(cgContext: ctx, flipped: false)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = nsctx

let shadow = NSShadow()
shadow.shadowColor = NSColor(white: 0, alpha: 0.28)
shadow.shadowBlurRadius = 26
shadow.shadowOffset = NSSize(width: 0, height: -16)

let emoji = "🦀" as NSString
let font = NSFont.systemFont(ofSize: 600)
let attrs: [NSAttributedString.Key: Any] = [.font: font, .shadow: shadow]
let strSize = emoji.size(withAttributes: attrs)
let pt = NSPoint(x: (CGFloat(S) - strSize.width) / 2, y: (CGFloat(S) - strSize.height) / 2 + 12)
emoji.draw(at: pt, withAttributes: attrs)

NSGraphicsContext.restoreGraphicsState()

guard let img = ctx.makeImage() else { fatalError("makeImage 失败") }
let rep = NSBitmapImageRep(cgImage: img)
guard let data = rep.representation(using: .png, properties: [:]) else { fatalError("PNG 编码失败") }

let outPath = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : FileManager.default.currentDirectoryPath + "/macos/AppIcon.png"
try! data.write(to: URL(fileURLWithPath: outPath))
print("✓ 已生成图标: \(outPath)")
