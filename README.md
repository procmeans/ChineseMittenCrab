# ChineseMittenCrab

一个运行在 macOS 本地的多平台 AI 机器人,把 [Claude Code CLI](https://claude.ai/code) 和 [Codex CLI](https://openai.com/index/codex/) 接到飞书 / 微信客服 / 微信 ClawBot 上。引擎可按账号切换,多个机器人可共处一群互不抢答,守护进程自启自愈。

## 功能

- **飞书**:WebSocket 长连接,群聊 @ 机器人或私聊触发,支持引用消息、图片、文件、富文本卡片
- **微信客服**:企业微信内部接入 + 客服 API,客户扫客服二维码即聊
- **微信 ClawBot**:扫码登录普通微信 ClawBot 通道,长轮询收消息,支持文本、typing 和文件发送
- **双引擎**:每个账号可独立选 `claude` 或 `codex`
- **多机器人协作**:同群多 bot 时只有被 @ 的回复,其他静默
- **对话上下文**:5 分钟追问窗口,重启自动恢复磁盘持久化历史
- **文件能力**:生成文件(CSV/TXT/报告)自动回传;读取上传的图片/文件
- **守护进程**:LaunchAgent 托管,崩溃自动重启,开机自启

## 前置要求

- macOS + Node.js 18+
- [Claude Code CLI](https://claude.ai/code) 或 [Codex CLI](https://openai.com/index/codex/) 至少装一个并登录
- 飞书自建应用(开 WebSocket 长连接事件订阅);或微信客服 + 企业微信;或微信 ClawBot SDK(进阶,见下方专章)

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
| `config/clawbot/default.json` | ClawBot 账号配置，指定 Python venv 和本地登录态目录 |
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

机器人支持同时运行多个飞书应用账号:

```bash
# 启动 default 账号
node tools/feishu_ws_bot.js --account default

# 启动其他账号(需对应的 config/feishu/myaccount.json)
node tools/feishu_ws_bot.js --account myaccount
```

每个账号有独立的引擎配置目录:`~/.chinese-mitten-crab/claude/[account]/` 或 `~/.chinese-mitten-crab/codex/[account]/`。

## 多机器人共群:提及过滤

同一群里同时跑多个 bot(常见于一个团队部署多个 CMR 实例)时,飞书会把消息推送给所有应用,默认会出现"抢答"。CMR 内置 mention filter:

- **私聊**永远响应
- **群聊**只在以下情况响应:消息里 @ 了本 bot;或同一 `taskKey` 5 分钟内 @ 过本 bot 的续聊
- 其他情况记 `IGNORE_UNADDRESSED` 日志直接 drop

启动时通过 `/bot/v3/info` 查本 bot 的 `open_id`(自动);如需关闭过滤让某个账号"接管全群消息",在该账号 JSON 加 `"ignore_unmentioned": false`。

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

启动时会自动把 `~/.codex/` 里的 `auth.json` / `config.toml` 同步到 `~/.chinese-mitten-crab/codex/[account]/`,因此第一次只需在终端跑一次 `codex` 完成登录即可。

## 接入微信客服(进阶)

微信侧门槛比飞书高得多 —— 需要**企业认证 + 备案域名 + cloudflare tunnel + 4 层授权配置**。如果你只用飞书,跳过这章。

### 架构

```
微信用户扫客服二维码
  → 微信客服(kf.weixin.qq.com)
  → 企业微信 API 接管(联合版)
  → 你的回调 URL(cloudflare tunnel → 本机 :8080)
  → CMR 解密 → kf/sync_msg 拉真实消息 → engine 处理
  → kf/send_msg 推回复 → 用户微信
```

### 前置门槛

| 项 | 说明 |
|---|---|
| 企业认证 | 微信客服必须企业账号,个人不行 |
| ICP 备案域名 | 自建应用的回调 URL 必须备案,备案主体须跟企业一致 |
| cloudflare tunnel | 本机服务通过 named tunnel 暴露给微信侧 |
| 自建应用授权 | 企业微信自建应用 → 在「微信客服」的「可调用接口的应用」勾上 |
| 客服 API 接管授权 | 微信客服 →「企业内部开发」→ 指定客服账号交给自建应用 |

### 凭据格式(`config/secrets/local.yaml`)

```yaml
wechat:
  # 微信客服后台 →「开发配置」→「企业内部接入」的 Token + EncodingAESKey
  token: xxxxxxxxxxxx
  encoding_aes_key: 43-char-base64-key
  # 企业微信里授权调用 kf API 的自建应用凭据
  kf:
    corpid: ww...
    secret: <自建应用 Secret,不是微信客服后台那个 Secret>
```

### 配置(`config/wechat/default.json`)

```json
{
  "model": "claude-opus-4-6",
  "channel": 9,
  "port": 8080
}
```

启动:`node tools/wechat_bot.js --account default`

### 双引擎(per-open_kfid 路由)

一个企业可有多个客服账号,每个账号可走不同引擎。**注意当前微信客服联合版限制是一个自建应用只能管一个客服账号**,所以多客服多引擎需要多个自建应用(代码已 scaffold,看 `config/wechat/default.example.json`)。

### cloudflare tunnel 速记

```bash
# 1. cloudflare 注册账号,把域名 nameserver 改到 cloudflare(无损,主站 IP 不变)
# 2. Zero Trust → Networks → Tunnels → Create tunnel → 拿 token
# 3. token 写入 logs/cf_token.txt(被 .gitignore)
# 4. cloudflared tunnel run --token "$(cat logs/cf_token.txt)"
# 5. tunnel 详情页 → Published application routes → 加 kf.yourdomain.com → http://localhost:8080
```

callback_server 同时 serve `WW_verify_xxx.txt` 文件,企业微信可信域名验证不用手动上传。

### 踩坑速查

| errcode | 含义 | 解决 |
|---|---|---|
| 95011 | 已用 wecom,但你用了独立版 token | 你企业开了联合版,要用企业微信自建应用 secret |
| 95012 | 未用 wecom,但你用了 wecom 模式 | 客服账号没授权给当前自建应用 / access_token 缓存太旧需刷新 |
| 95016 | 不允许的会话状态转换 | 当前会话已分配给人工坐席,转 state 被拒;先 trans→4 结束旧会话 |
| 95018 | 会话状态不允许发送 | 新会话默认 state=0,代码会自动 trans→1(智能助手接待)再 retry |
| 48002 | 自建应用无权调此 API | 在 微信客服「可调用接口的应用」对话框勾上自建应用 |
| 48007 | 该客服没授权给本应用 | 在「企业内部开发」对话框把客服授权给本自建应用 |
| 60020 | IP 不在白名单 | 自建应用 → 企业可信IP 加上当前出口 IP |

### 微信侧运行时特性

- **「⏳ 处理中」占位**:每条用户消息进入流水线后,bot 立刻先发一条 `⏳ 收到,正在思考...` 让对方知道在干活,真实回复随后单独送达(微信客服不支持卡片 in-place patch,只能用两条消息模拟)。只对 60 秒内的新消息发占位,bot 启动时拉的旧 sync 队列不刷屏。
- **失败自动报错**:claude / codex 抛错时,message_handler 的 catch 分支自动 sendText `⚠️ <错误信息>`,用户能看到出了什么,而不是无声卡死。
- **文件 / 图片真实推送**:claude 写到 `/tmp/cmr-out/{messageId}/` 的文件,会经 `/cgi-bin/media/upload` 上传再 `kf/send_msg` 推给用户。图片(`.png/.jpg/.gif/.webp/.bmp`)走 `msgtype=image`,其余走 `file`。20MB 以内即可。
- **95012 自愈**:`api_client` 把 42001(token 过期)和 95012(wecom 接管状态短暂飘移)都纳入 `withTokenRetry`,自动刷 access_token 重试一次。下午长时间 95012 期间消息会丢,但状态恢复后第一条新消息就会自动跑通,不用手动重启。
- **昵称解析**:`api_client.getCustomers` 调 `/cgi-bin/kf/customer/batchget` 把 `wm_xxx` 翻成中文昵称,缓存 24 小时。日志里 user / bot 两侧都带 `nickname="..."` 字段,grep 一个人的对话:
  ```bash
  grep 'nickname="小草爷爷"' ~/Library/Logs/cmr/cmr.wechat-default.log | grep -E 'KF_USER_MSG|KF_SEND'
  ```
- **⚠️ 易忽视的开关**:企业微信「微信客服」**应用详情页右上角的蓝色开关**(`https://work.weixin.qq.com/wework_admin/frame#/apps`)关掉 = 整个微信客服 wecom 模式停 = 所有 wecom API 立刻 95012。误碰过一次,排查 1 小时才发现。**不要点应用页右上角任何疑似开关的东西**。

## 微信 ClawBot 通道

ClawBot 是独立的扫码微信通道,不替换上面的企业微信「微信客服」通道。Node 侧继续复用当前消息队列、Claude/Codex 引擎、上下文和文件回复逻辑;Python bridge 只负责二维码登录、长轮询收消息、typing、文本和文件发送。

### 安装 ClawBot SDK

SDK 需要 Python 3.11+。macOS 上建议用 Homebrew Python 建一个项目内 venv:

```bash
/opt/homebrew/bin/python3.12 -m venv .venv-clawbot
.venv-clawbot/bin/python -m pip install git+https://github.com/minibear2021/wechat_clawbot_sdk.git
```

`config/clawbot/default.json` 默认使用 `.venv-clawbot/bin/python` 和 `.clawbot-state`。检查环境:

```bash
node tools/clawbot_bot.js --account default --dry-run
```

应看到:

```text
CLAWBOT_DRY_RUN account=default config=ready python=ready sdk=ready engine=ready
```

### 前台登录 / 生成二维码

```bash
npm run clawbot:bot
```

首次启动时日志会输出 `CLAWBOT_LOGIN_QR https://liteapp.weixin.qq.com/q/...`,把这个链接发给要登录的人,对方用微信打开并确认。登录成功后会输出 `CLAWBOT_READY account=...`,登录态会写入 `.clawbot-state/`,后续重启会自动复用。

二维码有效时间由微信服务端决定;SDK 默认最多等待 480 秒,二维码过期后最多自动刷新 3 次。实际操作建议让对方在 1-2 分钟内扫码确认;如果链接过期,重新运行启动命令拿新的 `CLAWBOT_LOGIN_QR`。

给别人单独生成一个账号二维码时,用独立 account 和 state 目录:

```bash
cat > config/clawbot/friend.json <<'EOF'
{
  "engine": "claude",
  "python_bin": ".venv-clawbot/bin/python",
  "state_dir": ".clawbot-state-friend"
}
EOF

node tools/clawbot_bot.js --account friend
```

## macOS 后台运行(LaunchAgent)

`tools/launchd_ctl.sh` 一键管理 5 个服务:`feishu-default` / `feishu-xiaocao` / `wechat-default` / `clawbot-default` / `cloudflared`。每个服务 `RunAtLoad: true` + `KeepAlive` 异常重启,所以 mac 重启自启、bot crash 自愈。

```bash
./tools/launchd_ctl.sh install        # 安装并启动所有服务
./tools/launchd_ctl.sh status         # 看 5 个服务 PID + 日志末行
./tools/launchd_ctl.sh restart        # 全部重启(配置改完用)
./tools/launchd_ctl.sh logs clawbot-default # 实时跟 ClawBot 日志
./tools/launchd_ctl.sh uninstall      # 完全移除
```

日志位置:`~/Library/Logs/cmr/cmr.<service>.log` —— **不在** `~/Documents/` 下,这是 macOS TCC 隐私限制(LaunchAgents 写 `~/Documents/` 会静默失败,launchd 报 exit 78 EX_CONFIG 一直 throttle)。

要修改默认服务清单,编辑 `tools/launchd_ctl.sh` 顶部的 `SERVICES` 数组。

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
