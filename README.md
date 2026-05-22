# ChineseMittenCrab

一个运行在 macOS 本地的飞书群聊 AI 机器人，推理引擎可按账号在 Claude Code CLI（默认）和 Codex CLI 之间切换，通过飞书 WebSocket 长连接实时收发消息。

## 功能

- 在飞书群聊中 @ 机器人发起对话
- 回复普通文字、引用消息、上传的图片和文件
- 生成文件（CSV、TXT、报告等）并自动发回飞书
- 5 分钟追问窗口内保留对话上下文，重启后自动恢复
- 以富文本卡片格式渲染回复（支持粗体、列表、代码块）
- macOS LaunchAgent 托管，崩溃自动重启

## 前置要求

- Node.js 18+
- [Claude Code CLI](https://claude.ai/code) 已安装并登录（`claude --version`）
- 飞书自建应用，已开通 WebSocket 长连接事件订阅

## 快速开始

**1. 安装依赖**

```bash
npm install
```

**2. 配置飞书凭据**

```bash
cp config/secrets/local.example.yaml config/secrets/local.yaml
```

编辑 `config/secrets/local.yaml`：

```yaml
feishu:
  app_id: cli_xxxxxxxxxxxxxxxx
  app_secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**3. 配置账号**

```bash
cp config/feishu/default.example.json config/feishu/default.json
```

编辑 `config/feishu/default.json`（可选，指定模型）：

```json
{
  "model": "claude-haiku-4-5-20251001"
}
```

**4. 配置机器人人格**

创建机器人的系统提示词文件：

```bash
mkdir -p ~/.chinese-mitten-crab/claude/default/.claude
cp ~/.chinese-mitten-crab/claude/default/.claude/CLAUDE.md  # 参考下方说明
```

**5. 验证配置**

```bash
npm test
node tools/feishu_ws_bot.js --account default --dry-run
```

**6. 启动机器人**

```bash
npm run feishu:bot
```

## 配置文件说明

| 文件 | 说明 |
|---|---|
| `config/secrets/local.yaml` | 飞书 app_id / app_secret（不提交 git）|
| `config/feishu/default.json` | 账号配置，支持选择 `engine`（`claude` 或 `codex`，默认 `claude`）和指定模型 |
| `~/.chinese-mitten-crab/claude/default/.claude/CLAUDE.md` | Claude 引擎系统提示词，控制角色和行为 |
| `~/.chinese-mitten-crab/claude/default/.claude/settings.json` | Claude 权限配置 |
| `~/.chinese-mitten-crab/codex/default/.codex/CODEX.md` | Codex 引擎系统提示词（可选，仅当 engine=codex） |
| `~/.chinese-mitten-crab/codex/default/{auth.json,config.toml}` | Codex 凭据，启动时自动从 `~/.codex/` 同步 |

### 系统提示词示例

`~/.chinese-mitten-crab/claude/default/.claude/CLAUDE.md`：

```markdown
你是一个部署在飞书群聊中的通用 AI 助手。

## 行为准则
- 默认用中文回复
- 回答简洁直接，不要有不必要的免责声明
- 不拒绝合理的非工程类请求

## 格式要求
- 不要使用 Markdown 表格，改用列表
- 标题用 **粗体** 而非 ## 语法

## 文件生成
当用户要求生成文件时，用 Write 工具把文件写到指定目录，回复文件路径即可。
```

### Claude 权限配置示例

`~/.chinese-mitten-crab/claude/default/.claude/settings.json`：

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions",
    "allow": ["WebSearch(*)", "WebFetch(*)"]
  }
}
```

## 多账号支持

机器人支持同时运行多个飞书应用账号：

```bash
# 启动 default 账号
node tools/feishu_ws_bot.js --account default

# 启动其他账号（需对应的 config/feishu/myaccount.json）
node tools/feishu_ws_bot.js --account myaccount
```

每个账号有独立的引擎配置目录：`~/.chinese-mitten-crab/claude/[account]/` 或 `~/.chinese-mitten-crab/codex/[account]/`。

## 切换到 Codex 引擎

在账号配置里把 `engine` 设为 `codex` 并提供 `codex` 块（参考 `config/feishu/codex.example.json`）：

```json
{
  "engine": "codex",
  "codex": {
    "bin": "codex",
    "model": "gpt-5.4",
    "reasoning_effort": "medium",
    "cwd": "/Users/you/Documents",
    "sandbox": "danger-full-access",
    "approval_policy": "never"
  }
}
```

启动时会自动把 `~/.codex/` 里的 `auth.json` / `config.toml` 同步到 `~/.chinese-mitten-crab/codex/[account]/`，因此第一次只需在终端跑一次 `codex` 完成登录即可。

## macOS 后台运行（LaunchAgent）

**安装为系统服务（开机自启、崩溃自动重启）：**

```bash
bash tools/install_feishu_launchagents.sh install default \
  > ~/Library/LaunchAgents/com.cmr.feishu.default.plist

launchctl load ~/Library/LaunchAgents/com.cmr.feishu.default.plist
```

**查看状态：**

```bash
bash tools/install_feishu_launchagents.sh status default
launchctl list | grep cmr
```

**停止服务：**

```bash
launchctl unload ~/Library/LaunchAgents/com.cmr.feishu.default.plist
```

## 监控

```bash
# 启动监控 HTTP 服务（默认 3000 端口）
node tools/feishu_monitor_server.js

# 查看状态
curl http://localhost:3000/health
```

浏览器访问 `http://localhost:3000` 查看状态面板。

## 开发

```bash
# 运行全部测试（42 个，使用 Node.js 内置 test runner）
npm test

# 运行单个测试文件
node --test test/reply_rendering.test.js

# 干运行（验证凭据、配置、Claude CLI 可用性，不连接飞书）
node tools/feishu_ws_bot.js --account default --dry-run
```

## 架构

```
feishu_ws_bot.js          入口，WebSocket 连接，消息去重，队列调度
└── message_handler.js    消息处理主流程
    ├── exec_service.js   调用 claude --print 执行推理
    ├── reply_gateway.js  回复发送，文件上传路由
    ├── reply_rendering.js Markdown → 飞书卡片转换
    ├── thread_state.js   对话历史管理（含磁盘持久化）
    └── task_queue.js     按 taskKey 串行执行，防止并发冲突
```

**数据流：**

```
飞书 WS 事件
  → 解析事件（incoming_event）
  → 标准化（event_projection，生成 taskKey = chatId::senderId）
  → 下载附件到 /tmp（file_gateway）
  → 获取引用消息内容（sdk_client）
  → 构建 Prompt（含历史上下文）
  → 调用 Claude CLI（exec_service）
  → 渲染回复卡片（reply_rendering）
  → 发送回复 + 上传文件（reply_gateway）
  → 保存对话历史（thread_state）
```

## 运行时行为

- **消息去重**：同一条消息 ID 只处理一次（防飞书重投）
- **冷启动过滤**：跳过启动前已存在的消息（防重播）
- **串行队列**：同一用户的消息按序处理，不并发
- **流式占位**：收到消息立即回复 ⏳，Claude 执行完后更新
- **追问窗口**：5 分钟内的连续消息共享对话历史
- **历史持久化**：重启后自动恢复仍在 TTL 内的对话历史
- **文件隔离**：每条消息使用独立输出目录 `/tmp/cmr-out/{messageId}/`

## 飞书应用配置要求

在[飞书开发者后台](https://open.feishu.cn/app)需要开通：

- 订阅方式：长连接（WebSocket）
- 订阅事件：`im.message.receive_v1`
- 权限：`im:message`、`im:message:send_as_bot`、`im:file`（如需文件功能）

## 联系开发者

- 微信：18038001212
