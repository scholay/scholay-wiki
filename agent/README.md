# Scholay 科研助手 · Agent Daemon

Scholay 平台的 AI agent 服务端,作为 scholar 项目的一个内部容器服务,对外通过 HTTP + WebSocket 提供接口,服务于智能搜索 / 智能助手 / 智能审稿三大场景。

---

## 快速开始 (Docker)

```bash
cp .env.example .env
# 编辑 .env,至少填上 ANTHROPIC_AUTH_TOKEN 和模型槽位
docker compose up -d --build
```

服务监听 `0.0.0.0:3456`,健康检查端点 `/health`。

## 配置

agent 内部使用 **Anthropic Messages 协议** (`/v1/messages`) 与上游模型通信。目标供应商可以是 **DeepSeek 的原生 Anthropic 端点**(`https://api.deepseek.com/anthropic`)或其他兼容上游,无需协议转换。

`.env` 必填:

| 变量 | 说明 |
|---|---|
| `ANTHROPIC_BASE_URL` | 上游地址,如 `https://api.deepseek.com/anthropic` |
| `ANTHROPIC_AUTH_TOKEN` | 上游 token |
| `ANTHROPIC_MODEL` | 主模型 ID |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` / `_SONNET_MODEL` / `_OPUS_MODEL` | 三档别名映射 |
| `ANTHROPIC_API_KEY` | 服务端 Bearer token(`SERVER_HOST=0.0.0.0` 时强制启用) |
| `MINICOD_API_KEY` | 学术检索 MCP server 的 API key(管理员后续从 DB 注入) |

## 接口

- HTTP REST: `http://<host>:3456/api/*` (conversations / models / providers / agents / sessions ...)
- WebSocket: `ws://<host>:3456/ws` (流式消息推送)
- 健康检查: `http://<host>:3456/health`

> 部署在 scholar 内网,3456 端口仅容器内可访问;对外由上层 nginx + 业务网关负责鉴权。

## 数据持久化

- 容器内 `~/.claude/` 映射到宿主机 `./data/claude/`
- 会话 jsonl、provider 配置、agent 定义都存在这里
- 备份只需复制 `./data/claude/` 目录

## 目录结构

```
agent/
├── src/
│   ├── server/         # HTTP + WebSocket 服务端 (主入口)
│   ├── tools/          # Agent 工具池 (Read/Bash/AgentTool/...)
│   ├── services/api/   # 上游 API 客户端 (Anthropic 协议)
│   ├── commands/       # 斜杠命令
│   └── skills/         # Skills 系统
├── adapters/
├── runtime/
├── stubs/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## License

Scholay 平台内部组件,仅供本项目研发使用。
