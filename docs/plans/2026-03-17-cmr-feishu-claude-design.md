# ChineseMittenCrab Feishu + Claude Design

## Goal

`ChineseMittenCrab`，简称 `CMR`，是一个独立于 `SunCodexClaw` 的新项目。

它的目标不是做“Claude 聊天壳”，而是做一套面向飞书工作流的 `Claude Code CLI` 本机执行机器人：在飞书里收消息、在本机工作目录里运行 Claude、把结果和过程可靠地回给飞书。

第一版是 `Claude` 专用，不为 `Codex` 或其他模型做兼容层。

## Product Direction

项目整体思路参考 `SunCodexClaw`，但不照搬其历史结构。

`CMR` 的目标分三阶段推进：

1. 最小内核
   - 飞书长连接收消息
   - 私聊和群聊 `@` 触发
   - 调 `Claude Code CLI`
   - 回普通文本结果
   - 基础线程延续
   - 基础等待提示
2. 核心工作流
   - 群聊追问窗口
   - 排队和 supersede 规则
   - 引用消息上下文
   - 文件 / 图片 / 语音输入
   - 多账号和工作目录绑定
   - LaunchAgent 常驻
3. 完整化
   - Markdown 卡片回复
   - 进度消息 / 进度文档
   - 文件回传
   - 按群名转发纯文本结果
   - 本机监控面板
   - 更强的配置分层和测试基线

## Architecture

项目从一开始就按 5 层拆分：

1. `platform/feishu`
   - 飞书 WebSocket 长连接
   - 消息解析
   - 回复和附件回传
   - 群搜索和飞书侧资源下载
2. `claude`
   - `Claude Code CLI` 调用
   - 工作目录解析
   - 会话恢复策略
   - 结果提取和错误处理
3. `runtime`
   - 会话线程状态
   - 群聊追问窗口
   - 任务排队
   - 等待提示
   - 引用上下文拼装
4. `monitor`
   - 状态快照
   - 心跳
   - 疑似卡死判断
   - 本机面板数据
5. `config`
   - 系统默认值
   - preset
   - account override

## Repo Layout

```text
ChineseMittenCrab/
├── README.md
├── package.json
├── config/
│   ├── feishu/
│   │   └── default.example.json
│   └── secrets/
│       └── local.example.yaml
├── docs/
│   └── plans/
├── tools/
│   ├── feishu_ws_bot.js
│   ├── feishu_monitor_server.js
│   ├── install_feishu_launchagents.sh
│   └── lib/
│       ├── platform/feishu/
│       ├── claude/
│       ├── runtime/
│       ├── monitor/
│       └── config/
└── test/
```

## Configuration Model

`CMR` 继续沿用三层配置思路，但字段改成 `Claude` 语义。

配置优先级：

1. 命令行参数
2. 环境变量
3. `config/secrets/local.yaml`
4. `config/feishu/<account>.json`

关键配置字段：

- `feishu.app_id`
- `feishu.app_secret`
- `feishu.encrypt_key`
- `feishu.verification_token`
- `feishu.bot_name`
- `feishu.mention_aliases`
- `feishu.require_mention`
- `feishu.progress_mode`
- `claude.bin`
- `claude.cwd`
- `claude.home`
- `claude.model`
- `claude.permission_mode`
- `claude.add_dirs`

第一版建议默认给每个账号分配独立的 `claude.home`，避免多机器人共享状态目录。

## Reuse Strategy

以下能力可以从 `SunCodexClaw` 强复用思路，必要时迁移模块：

- 飞书消息接入
- 群聊 `@` 和追问窗口
- 排队与 supersede
- 引用消息上下文
- 文件 / 图片 / 语音的飞书下载上传
- LaunchAgent 常驻
- 监控面板
- replay fixture 测试方法

以下部分必须重写：

- `codex exec` 调用链
- `CODEX_HOME` 逻辑
- Codex 线程恢复
- Codex prompt 组装
- Codex 认证补齐

这些都会替换成 `Claude Code CLI` 对应逻辑。

## Execution Strategy

第一版不追求一次做完全部能力，而是保持结构完整、能力分阶段开启。

推荐顺序：

1. 先把文本主链路打通
2. 再补群聊工作流
3. 再补多模态输入
4. 最后补进度回传和监控

这样能更快拿到一个可用的 Claude 飞书助手，同时不牺牲长期结构。

## Testing Strategy

测试从第一阶段就开始建立：

- `node:test` 单测
  - 文本解析
  - 配置解析
  - 线程状态
  - 排队
  - 等待提示
- Feishu replay 测试
  - 群聊 `@`
  - 引用消息
  - 文件
  - 语音
  - 群名路由
- Claude runner smoke test
  - CLI 可调用
  - 结果可提取
  - 错误可回退

## Risks

最主要的风险有三类：

1. `Claude Code CLI` 的会话延续方式可能和 Codex 不同
2. 文件 / 图片 / 语音输入的本机处理体验可能需要单独调优
3. 进度文档不一定适合第一阶段直接照搬

因此第一版优先保证“能干活、能持续回复、能稳定运行”，再逐步补体验层。

## Recommendation

推荐路线是：

- 项目独立建仓
- 结构从一开始就按平台层 / Claude 层 / 运行时层拆开
- 产品能力参考 `SunCodexClaw`
- 底层执行完全围绕 `Claude Code CLI`
- 按阶段推进，但最终目标明确对齐成熟工作流，而不是停留在聊天壳
