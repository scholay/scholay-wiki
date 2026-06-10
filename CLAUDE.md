# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scholar is an academic search platform with AI-powered features. It consists of:
- **Backend**: Go (Gin framework) + MySQL + GORM + Redis
- **Frontend**: React 19 + Vite 6 + TS strict + Tailwind v4 + shadcn 在 `frontend-user/`,用户端 + /admin 路由共一个 SPA,端口 5411
- **Infrastructure**: Docker Compose with Nginx reverse proxy
- **Caching**: Redis for session management and API key caching

> ⚠️ **在 `frontend-user/` 下工作时,该目录自带 [CLAUDE.md](frontend-user/CLAUDE.md) 强制约束**(第三方优先 / 分层 / 网络层 / 样式 token / 组件分层等)。提交前可用 `/v2-audit` skill 自动审计(skill 名沿用旧叫法)。

## Quick Reference

```bash
# Start everything
docker-compose up -d --build

# View logs
docker logs scholar_backend -f

# Restart after code changes
docker-compose restart backend

# Access MySQL
docker exec -it scholar_mysql mysql -u scholar_user -pscholar_pass scholar

# Access Redis
docker exec -it scholar_redis redis-cli

# Run backend tests
cd backend && go test ./...

# Run frontend dev server
cd frontend-user && npm start
```

**URLs** (check .env for actual ports):
- User Portal: http://localhost:5411
- Admin Dashboard: http://localhost:5411/admin (同一个 5411 SPA 的 `/admin` 路由,**没有独立端口**;旧的 ADMIN_PORT/5455 已下线)
- Admin login: 管理员与普通用户**共用** http://localhost:5411 的登录弹窗(`/api/v1/user/login`),登录后凭 `role=admin` 的 token 进 `/admin`(前端 `adminGuard` 校验角色)
- Default super_admin: `admin` / `adminadmin`(该种子账号 email 为空,实际请用带邮箱的管理员账号从用户登录入口登入)

## Essential Commands

### Development Workflow

```bash
# Start all services (builds and runs containers)
docker-compose up -d --build

# Stop all services
docker-compose down

# View logs for all services
docker-compose logs -f

# View logs for specific service
docker logs scholar_backend -f
docker logs scholar_frontend_user -f   # 用户端 + /admin 后台同一个容器
docker logs scholar_mysql -f
docker logs scholar_redis -f
# 注:scholar_frontend_admin 容器已下线(后台并入 frontend_user 的 /admin 路由)

# Restart specific service after code changes
docker-compose restart backend
docker-compose restart frontend-user

# Rebuild specific service after major changes
docker-compose up -d --build backend
```

### Backend Development

```bash
# Local development without Docker
cd backend
go mod tidy
GOPROXY=https://mirrors.aliyun.com/goproxy/,direct go mod tidy  # If in China
go run cmd/server/main.go

# Run backend tests
cd backend
go test ./...

# Format Go code
cd backend
go fmt ./...

# Generate test coverage report
cd backend
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Frontend Development

```bash
# Admin Dashboard (merged into frontend-user at /admin route)
cd frontend-user
npm install
npm start        # Development server on port 3000
npm run build    # Production build (optimized, no source maps)

# User Portal
cd frontend-user
npm install
npm run copy-pdf-worker  # Copy PDF.js worker (required for PDF preview)
npm start        # Development server on port 3000
npm run build    # Production build (optimized, no source maps)
```

### Database Operations

```bash
# Access MySQL CLI
docker exec -it scholar_mysql mysql -u scholar_user -pscholar_pass scholar

# View schema sync logs
docker logs scholar_schema_sync

# 手动触发数据库迁移
docker-compose restart schema-sync

# Database backup
docker exec scholar_mysql mysqldump -u scholar_user -pscholar_pass scholar > backup.sql

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d --build

# Test seed data idempotency
./scripts/test-seed-data.sh
```

### Redis Operations

```bash
# Access Redis CLI
docker exec -it scholar_redis redis-cli

# Common Redis commands
docker exec -it scholar_redis redis-cli KEYS "*"              # List all keys
docker exec -it scholar_redis redis-cli GET "key_name"        # Get value
docker exec -it scholar_redis redis-cli FLUSHALL              # Clear all cache (use carefully!)
docker exec -it scholar_redis redis-cli INFO                  # Redis stats
docker exec -it scholar_redis redis-cli INFO memory           # Memory usage

# Monitor Redis operations in real-time
docker exec -it scholar_redis redis-cli MONITOR
```

### Utility Scripts

```bash
# Check Alipay payment callback logs
./scripts/check-alipay-callback.sh          # View last 10 callbacks
./scripts/check-alipay-callback.sh 20       # View last 20 callbacks
./scripts/check-alipay-callback.sh ORDER123 # View specific order

# Test database seed data idempotency
./scripts/test-seed-data.sh

# Optimize images (requires ImageMagick)
./scripts/optimize-images.sh

# Memory monitoring
./scripts/monitor-memory.sh        # Show all containers memory usage
./scripts/monitor-memory.sh -w     # Watch mode (refresh every 10s)
./scripts/monitor-memory.sh -c     # Check against alert thresholds
./scripts/monitor-memory.sh -r     # Show Redis memory details
./scripts/monitor-memory.sh -m     # Show MySQL memory details

```

### Testing API Endpoints

```bash
# Health check (via Nginx - check actual port from .env)
curl http://localhost:5411/health

# Admin login —— 前端现在统一走用户登录入口(/api/v1/user/login,email+密码),
# 登录后凭 role=admin 的 token 进 /admin。下面这个 /admin/login 是仍保留的遗留后端端点
# (FindByLogin 支持 username 或 email),前端已不再调用,仅作兼容/调试。
curl -X POST http://localhost:5411/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"adminadmin"}'

# User login (use actual HTTP_PORT from .env)
curl -X POST http://localhost:5411/api/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Search papers (Semantic Scholar) with auth
TOKEN="your-jwt-token-here"
curl "http://localhost:5411/api/v1/scholar/papers/search?query=transformer&limit=5" \
  -H "Authorization: Bearer $TOKEN"

# Smart-search agent bridge (智能搜索, get-or-create + WS ticket)
curl "http://localhost:5411/api/v1/user/smart-search/session" \
  -H "Authorization: Bearer $TOKEN"
curl -X POST "http://localhost:5411/api/v1/user/smart-search/session/ws-ticket" \
  -H "Authorization: Bearer $TOKEN"
# WS upgrade (use the wsToken from previous call, 30s TTL, one-time use):
# ws://localhost:5411/api/v1/user/smart-search/ws/<sessionId>?ws_token=<wsToken>

# Get WeChat Official Account config (admin only)
ADMIN_TOKEN="your-admin-jwt-token"
curl "http://localhost:5411/api/v1/admin/wechat-official/config" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Update WeChat Official Account config (admin only)
curl -X PUT "http://localhost:5411/api/v1/admin/wechat-official/config" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "wx1234567890abcdef",
    "app_secret": "your_app_secret",
    "token": "your_token",
    "encoding_aes_key": "your_aes_key",
    "encryption_mode": "plaintext",
    "auto_reply_enabled": true,
    "ai_model_level": "low",
    "system_prompt": "你是一个友好的AI助手"
  }'

# List coupon templates (admin only)
curl "http://localhost:5411/api/v1/admin/coupon-templates" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get user's available coupons for an order
curl "http://localhost:5411/api/v1/user/coupons/available?amount=19.99" \
  -H "Authorization: Bearer $TOKEN"

# Generate invitation code (user)
curl -X POST "http://localhost:5411/api/v1/user/invitation/generate" \
  -H "Authorization: Bearer $TOKEN"

# Get GitHub OAuth login URL
curl "http://localhost:5411/api/v1/user/github/login-url"

# Get GitHub OAuth config (admin only)
curl "http://localhost:5411/api/v1/admin/github-oauth/config" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Update GitHub OAuth config (admin only)
curl -X PUT "http://localhost:5411/api/v1/admin/github-oauth/config" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "your_github_client_id",
    "client_secret": "your_github_client_secret",
    "redirect_uri": "http://localhost:5411/github/callback",
    "enabled": true
  }'
```

## Architecture & Important Concepts

### Service Communication via Nginx

The project uses Nginx as a reverse proxy to provide unified entry points and solve CORS issues:

- **HTTP_PORT** (configured in .env) → 整站唯一入口(frontend-user + backend API via `/api/*`)
  - Nginx listens on port 80 internally, mapped to HTTP_PORT (default: 5411) on host
  - Config: `nginx/conf.d/user.conf`(全站只有这一份 conf)
  - 管理后台是同一个 5411 SPA 的 `/admin` 路由,**不再有独立端口/独立 nginx conf**
  - ⚠️ 旧版的 **ADMIN_PORT / 5455 / 8001 / `admin.conf` / `frontend-admin` 容器已全部下线**,如在老文档/老 .env 见到请忽略
- **Internal**: MySQL (3306), Backend (8080), Redis (6379) are NOT exposed to host

**How it works**:
- 所有请求(含管理后台)→ Nginx:80 (HTTP_PORT) → Routes `/api/*` to backend:8080, `/` to frontend-user:80
- `/admin/*` 只是 SPA 内的前端路由,由前端 `adminGuard`(读 token 里的 role)守卫;后端 `/api/v1/admin/*` 数据接口用 `AdminAuthMiddleware` 校验 role
- All frontend-to-backend API calls go through Nginx, enabling same-origin requests
- Backend containers communicate via internal Docker network (`scholar-network`)

**Nginx Performance Configuration**:
- **Worker processes**: Auto-scale based on CPU cores
- **Worker connections**: 1024 per process
- **Gzip compression**: Level 6 for text/JSON content
- **Static caching** (静态资源 proxy_cache):
  - Static cache: 1GB max, 7-day inactive timeout
  - Static assets: 1-year cache headers
  - HTML files: no-cache headers
  - 注:原 API cache zone 已删除(声明后零 location 引用;鉴权 API 微缓存需 proxy_cache_bypass 才安全)

### Backend Layered Architecture

The Go backend follows a clean architecture pattern with clear separation:

```
internal/
├── admin/          # Admin module (username/password auth)
├── user/           # User module (email/OAuth auth)
├── ai/             # AI service integration (prompt templates, LLM calls)
├── agent/          # HTTP client to scholar_agent container (cc-haha)
├── agentbridge/    # Generic agent bridge: user↔session 映射 + WS pipe + 配额钩子 + ws-ticket
├── agentconfig/    # Admin-managed agent model/provider config (单行表)
├── smartsearch/    # 智能搜索 feature: 一份 FeatureSpec + thin handler 即可挂上 agentbridge
├── minicod/        # Minicod 学术 API client (papers / authors / journals)
├── thirdparty/     # Third-party account management (API keys, OAuth)
├── payment/        # Payment integration (Alipay + WeChat Pay)
├── wechat/         # WeChat integration (Mini Program, OAuth)
├── wechatofficial/ # WeChat Official Account auto-reply with AI
├── peerreview/     # AI 审稿 (prism/peerreview agent 化)
├── prism/          # 智能写作 (Scholay Prism, AI-native LaTeX IDE)
├── claw/           # 智能助手 (通用 agent 对话)
├── library/        # 个人文献集
├── stagingarea/    # 检索工作区 · 暂存区
├── feedback/       # 用户反馈工单
├── seo/            # SEO 索引 (papers/authors/journals)
├── seosubmit/      # 主动推送 SEO 给百度等搜索引擎
├── usagelog/       # 用户行为日志 (旧, 只读保留) · usagestat 是 v2
│                   # 注:semanticscholar / mcp / proxy / peerreview2 / latexwriter / pdf
│                   #     早已下线,不再存在;Semantic Scholar 集成已被 minicod 取代。
├── hotcontent/     # 热门内容
├── message/        # 站内信 / 系统消息
├── announcement/   # 全站公告
├── pdfparse/       # PDF 文本解析
├── storage/        # MinIO 抽象
├── websocket/      # 通用 WS hub (站内信推送)
├── clientlog/      # 前端错误日志上报
├── umami/          # umami 站点统计集成
├── config/         # 公共系统配置 (privacy policy 等)
└── common/
    ├── config/     # App configuration (env vars)
    ├── database/   # Database connection & initialization
    ├── middleware/ # HTTP middleware (CORS, auth, ratelimit, timeout, recovery)
    ├── cache/      # Redis cache utilities
    ├── cleanup/    # Background cleanup tasks
    ├── circuitbreaker/ # Circuit breakers for external services
    ├── safego/     # 带 recover 的 goroutine 包装
    └── utils/      # Utilities (JWT, password, response, ...)
```

**已下线/已迁移的模块**:
- `internal/conversation/` — 已删除 (migration 0049),功能由 [agentbridge](backend/internal/agentbridge/) + [smartsearch](backend/internal/smartsearch/) 接管
- `internal/subscription/` `internal/order/` `internal/coupon/` — Go 代码已不存在,对应 DB 表 (`subscription_plans` / `user_subscriptions` / `usage_quotas` / `orders` / `coupon_*`) 保留但**无代码读写**(stranded)。新功能不要再依赖这些表。

**Key Pattern**: Each domain module (admin/user/ai/etc.) follows Repository → Service → Handler:
- **Repository**: Database operations (GORM)
- **Service**: Business logic
- **Handler**: HTTP request/response (Gin)

### Database Schema

> 表多且持续增长,以 `docker exec scholar_mysql mysql ... -e "SHOW TABLES"` 为准。
> 下面只列**当前由 Go 代码读写**的关键表,不是穷举。stranded 表(无代码消费的历史遗留)
> 见上一节 "已下线/已迁移的模块"。

**核心账户与会话**:
- `users` — 用户账户(含 `role='admin'` 的管理员;`admin_users` 是历史表,通过 migration 0007 迁过来,留作回滚兜底)
- `user_auth_providers` — OAuth 关联(github / google / orcid / apple / microsoft / discourse / wechat 等)
- `user_messages` — 站内信收件箱

**Agent 桥接**(详见 [agentbridge](backend/internal/agentbridge/)):
- `agent_config` — agent 上游 provider / model 单行配置(admin 可改),含 `push_status` 字段反映推送结果
- `agent_sessions` — 用户↔agent session 多 feature 复合主键 (`user_id, feature_key`),每个 feature 一行

**AI / 学术**:
- `analysis_dimensions` — AI 分析维度模板
- `third_party_accounts` — Minicod / Anthropic 等上游 API key 池
- `paper_analysis` — 论文 AI 分析结果缓存
- `latex_*` — LaTeX 写作 agent 全套(`latex_documents` / `latex_conversations` / `latex_chat_messages` / `latex_agent_config` / `latex_agent_models`)
- `peer_review_*` / `pr2_*` — AI 审稿 v1 / v2 任务与文件
- `user_library_*` — 个人文献集
- `user_staging_*` — 检索工作区

**SEO**: `seo_papers` / `seo_authors` / `seo_journals` / `hot_papers` / `hot_search_keywords`

**支付 / 营销**: `payment_transactions` / `orders` / `alipay_configs` / `wechat_pay_configs` / `wechat_configs` / `wechat_official_config` / `currency_*` / `wallets` / `user_checkins`

**配置类**: `system_configs` / `feature_configs` / `email_configs` / `sms_configs` / `usage_log_config` / `*_oauth_config` 多个

**Stranded** (无代码消费, 见上节): `subscription_plans` / `user_subscriptions` / `usage_quotas` / `coupon_*` / `user_invitations` / `invitation_relationships`

### 数据库迁移系统（按序重放）

**核心特性**: 每次启动时，按编号顺序执行 `docker/mysql/migrations/` 下的所有 SQL 文件，通过幂等 SQL 保证可重复执行。

**迁移文件目录结构**:
```
docker/mysql/migrations/
├── 0000_utils.sql              # 幂等工具存储过程（每次重放前置执行）
├── 0001_initial_fields.sql     # 初始表结构（字段 + 主键）
├── 0002_initial_indexes.sql    # 初始索引（UNIQUE/INDEX/外键约束）
├── 0003_initial_defaults.sql   # 初始种子数据（INSERT IGNORE）
├── 0004_iterative_fields.sql   # 迭代: 新增字段迁移
├── ...（后续迭代按编号追加）
```

**命名规范**:
- 编号：4位数字前缀 `NNNN_`，按创建顺序递增
- 后缀类型标识：`_fields`（字段）、`_indexes`（索引）、`_defaults`（默认值/种子数据）
- 每次迭代按 字段 → 索引 → 默认值 的顺序编号

**幂等性保障**:
- 建表: `CREATE TABLE IF NOT EXISTS`
- 加字段: `CALL add_column_if_not_exists('表名', '列名', '列定义')`
- 加索引: `CALL add_index_if_not_exists('表名', '索引名', '列定义', TRUE/FALSE)`
- 加外键: `CALL add_foreign_key_if_not_exists('表名', '约束名', '外键定义')`
- 种子数据: `INSERT IGNORE`

**迁移执行**: `schema-sync` 容器运行 `scripts/run-migrations.sh`，backend 在迁移成功后才启动。

**新增迁移步骤**:
1. 在 `docker/mysql/migrations/` 下新建编号递增的 SQL 文件
2. 按类型命名（`_fields` / `_indexes` / `_defaults`）
3. 使用 `0000_utils.sql` 提供的存储过程保证幂等
4. 运行 `docker-compose restart schema-sync backend` 验证
5. 查看日志: `docker logs scholar_schema_sync`

**Never** use `DROP TABLE` or destructive operations in migration files. Always make changes idempotent.

### Docker Service Architecture

**Multi-stage Builds**:
- Backend: Go 1.21 builder → Alpine runtime with mysql-client
- Frontend: Node 18 builder → Nginx Alpine runtime
- All containers use Asia/Shanghai timezone

**Health Checks**:
- MySQL: `mysqladmin ping` (10s interval, 5s timeout, 5 retries)
- Redis: `redis-cli ping` (10s interval, 3s timeout, 5 retries)
- Schema-sync: Waits for MySQL health
- Backend: Waits for MySQL, Redis, and schema-sync

**Service Dependencies**:
```
MySQL → Schema-sync → Backend
Redis ↗                    ↓
                        Nginx
Frontend-user ↗            ↓
Frontend-admin → Nginx → User/Admin access
```

### Semantic Scholar Integration  ⚠️ 已下线(历史记录,勿据此找代码)

> 本节描述的 `internal/semanticscholar/`、`internal/mcp/`、`/api/v1/scholar/*`、`/api/v1/mcp/*`、
> `swagger.json`、`backend/SEMANTIC_SCHOLAR_API.md` 均**已不存在**。学术检索现由 **Minicod**
> (`internal/minicod/`)提供。下文仅作历史背景保留。

The backend integrates Semantic Scholar Academic Graph API with two access methods:

1. **RESTful API** (`/api/v1/scholar/*`):
   - Paper search, details, citations, references
   - Author search, details, papers
   - Recommendations
   - Full OpenAPI specification in `swagger.json`

2. **MCP Protocol** (`/api/v1/mcp/*`):
   - Provides tool-based access for LLMs
   - Tools: search_papers, get_paper, get_author, etc.
   - Uses dynamic API key rotation from third-party accounts

**Key Files**:
- `backend/internal/semanticscholar/` - API client implementation
- `backend/internal/mcp/` - MCP server implementation
- `backend/internal/thirdparty/` - API key management with Redis cache (5-min refresh)
- `backend/SEMANTIC_SCHOLAR_API.md` - Detailed API documentation (Chinese)
- `swagger.json` - Complete OpenAPI 2.0 specification

### Agent Service Integration (新版 AI Agent 架构)

旧版的 `internal/conversation/` (基于 SSE 的多分析模式 + 自研 prompt 模板) 在 migration 0049
已下线。新版统一走 **scholar_agent 容器 + agentbridge 桥接** 的架构:

```
┌──────────────────────────┐   HTTP /api/{sessions,agents,providers}
│  scholar_agent (cc-haha) │   WS   /ws/<sessionId>
│  /home/bun/.claude/      │ 数据落 jsonl, agent 自管;
│  Minicod MCP 预装         │ backend 完全黑盒, 不读 jsonl
└────────────▲─────────────┘
             │
┌────────────┴─────────────┐
│ internal/agent           │  纯 HTTP 客户端 (CreateSession / Delete / GetMessages
│  + httpclient + skill    │  + UpsertAgent + PushConfig + typed *HTTPError)
└────────────▲─────────────┘
             │
┌────────────┴─────────────┐
│ internal/agentbridge     │  通用 feature 桥接
│  - Bridge.For(spec)      │   - 用户↔session 1:N (PK = user_id + feature_key)
│  - FeatureBridge methods │   - WS upgrade + JWT/ws-ticket 鉴权 + pipe + ping
│    (Get/Reset/Messages/  │   - 首条 user_message 注入 SystemPrompt prefix (可选)
│     Context/HandleWS/    │   - permission_request 自动 approve (可选)
│     IssueWSTicket)       │   - PreUserMessage 配额钩子 (RedisDailyCap 默认实现)
│                          │   - OnMessageComplete usage 钩子 (slog 默认实现)
└────────────▲─────────────┘
             │
┌────────────┴─────────────┐
│ internal/smartsearch     │  Feature: 智能搜索
│  + spec.go (Spec)        │   一份 FeatureSpec + thin handler 即可挂上 bridge
│  + handler.go (~120 行)   │
└──────────────────────────┘
```

**加新 feature 的最小动作**:
1. 新模块 `internal/<feature>/spec.go` 声明 `agentbridge.FeatureSpec`
2. 新模块 `internal/<feature>/handler.go` ~100 行 gin 翻译层
3. `bootstrap.go` 一行: `feature := agentBridge.For(<feature>.Spec)`
4. `routes_user.go` 挂 4 个 HTTP 路由 + 1 个 WS 路由(路径模板见 smartsearch)

**关键约定**:
- session 数据在 agent 容器内 jsonl, backend DB 只存映射 (`agent_sessions`)
- WS 鉴权: 前端先 POST `/<feature>/session/ws-ticket` 拿 30s 一次性 token, 再用 `?ws_token=<...>` 升级 WS。**只认 ws_token** —— 旧的 `?token=<jwt>` 裸 JWT 回落已下线(缺/错 ws_token 一律 401);裸 JWT 落 URL 会被 nginx access log 长期暴露、且能绕过 HTTP 中间件用已吊销 token 升级 WS,故移除
- 成本控制: 通过 `FeatureSpec.PreUserMessage` 钩子接配额(目前提供 `agentbridge.NewRedisDailyCap`, 后续可替换为完整 subscription 系统)
- 用量审计: `FeatureSpec.OnMessageComplete` 拿 agent 返回的 token usage; 默认 `NewSlogUsageRecorder` 打到日志, `docker logs scholar_backend | grep agent_usage` 直接看
- agent 容器的 model / provider 配置在 `agent_config` 表, admin 后台可改, 改完后台异步 push 到 agent;`push_status` / `last_pushed_at` / `push_error` 字段反映推送结果

**详细文档**: [agent/docs/api.md](agent/docs/api.md) (REST + WS 协议) · [agent/README.md](agent/README.md) (容器部署)

### Payment System

The platform integrates with multiple payment providers for the Chinese market:

- **Alipay Integration**: Supports web and mobile payment flows
- **WeChat Pay Integration**: Native WeChat payment support (JSAPI, APP, Native, H5)
- **Order Management**: Links orders with subscription purchases
- **Payment Verification**: Validates payment callbacks and signatures
- **Refund Support**: Admin can process refunds through the system
- **Unified Interface**: Common payment interface for both providers

**Implementation**:
- `backend/internal/payment/` - Payment handlers, services, and repositories
  - Alipay: `alipay_*.go` files
  - WeChat Pay: `wechat_pay_*.go` files
- Payment callbacks trigger subscription activation
- Secure signature verification for all payment notifications
- Support for multiple payment scenarios (web, mobile app, mini program)
- Debug tool: `./scripts/check-alipay-callback.sh` for troubleshooting

### WeChat Integration

The platform includes comprehensive WeChat integration for Chinese market:

- **Mini Program Support**: Backend support for WeChat Mini Program authentication
- **WeChat OAuth**: Login via WeChat Open Platform
- **WeChat Official Account**: Auto-reply with AI-powered responses
  - Supports text and image messages
  - Configurable AI model levels (low, medium, high)
  - Admin-configurable system prompts
  - Multiple encryption modes (plaintext, compatible, secure)
- **WeChat Pay**: See Payment System section above

**Implementation**:
- `backend/internal/wechat/` - WeChat authentication and API integration
- `backend/internal/wechatofficial/` - WeChat Official Account auto-reply with AI
- `backend/internal/payment/wechat_pay_*.go` - WeChat Pay implementation

### GitHub OAuth Integration

The platform supports GitHub OAuth for user authentication:

- **Admin Configuration**: GitHub OAuth settings (Client ID, Secret, Redirect URI) are managed via Admin Dashboard
- **Automatic Account Linking**: If a user with the same email exists, GitHub account is linked automatically
- **Profile Sync**: User's GitHub profile information (name, avatar, bio, location) is synced on login
- **Dedicated Config Table**: `github_oauth_config` stores OAuth credentials (separate from general config)
- **Frontend Callback**: `frontend-user/src/pages/GithubCallback.js` handles OAuth redirect

**OAuth Flow**:
1. User clicks "Login with GitHub" → Frontend requests login URL from backend
2. Backend generates OAuth URL with Client ID and redirect URI
3. User authorizes on GitHub → Redirected to callback URL with code
4. Frontend sends code to backend → Backend exchanges for access token
5. Backend fetches user info from GitHub API → Creates or links user account
6. JWT token returned for authenticated session

**Implementation**:
- `backend/internal/user/github_oauth.go` - GitHub OAuth handlers
- `backend/internal/config/` - Admin config management for GitHub OAuth
- Stored in dedicated `github_oauth_config` table (admin-configurable)

### Authentication System

**统一登录入口(管理员与普通用户共用)**:

> 历史上 admin 走独立的 5455 后台 + `/api/v1/admin/login`,**现已合并**:所有人都在 5411
> 用同一套登录(`/api/v1/user/login` 等),登录后由 **token 里的 `role`** 决定权限。
> 因此用户端的登录/改密接口**不再区分**普通用户与管理员(查到 admin 行也照常处理)。

1. **Admin / Super Admin**:
   - Table: `users`(`role='admin'` / `'super_admin'`),与普通用户同表同登录入口
   - 登录:走用户端 `/api/v1/user/login`(email+密码)等;签发的 JWT 为 type="user" + role=admin/super_admin
   - 进后台:前端 `/admin` 路由由 `adminGuard`(读 store 里的 role)守卫;后端 `/api/v1/admin/*` 数据接口用 `middleware.AdminAuthMiddleware()` 校验 role
   - 遗留:`/api/v1/admin/login` 后端端点仍在(`FindByLogin` 认 username 或 email),但前端已不调用
   - Default super_admin: username=`admin` / `adminadmin`(email 为空,无法走 email 登录;实际请用带邮箱的管理员账号)
   - Sessions: managed via `user_sessions`(same as regular users)

2. **User** (email/OAuth, extensible):
   - Table: `users` + `user_auth_providers`
   - JWT with role="user"
   - Middleware: `middleware.UserAuthMiddleware()`
   - Supports: email/password, phone/SMS, GitHub OAuth, Google OAuth, WeChat OAuth
   - Email verification codes stored in `email_verification_codes`
   - Phone verification codes stored in `phone_verification_codes`
   - GitHub OAuth config stored in `github_oauth_config` (admin-configurable)

**Session Management**:
- `user_sessions` table tracks online users
- Heartbeat endpoint updates last_active_at
- Background task records snapshots every 5 minutes
- Redis caches session data and API keys for performance

### HTTP Proxy Service  ⚠️ 已下线(历史记录,勿据此找代码)

> `internal/proxy/`、`/api/v1/proxy/*`、`proxy.GetProxyHTTPClient` 均**已不存在**。
> AI 调用现统一走 `internal/ai`(项目侧)与 agent 容器(`internal/agent` + `agentbridge`)。

The platform includes a built-in HTTP proxy for AI service access:

- **Purpose**: Allows frontend to make requests to third-party AI services through backend
- **CORS Handling**: Eliminates cross-origin restrictions for AI API calls
- **Security**: Backend controls and validates all proxied requests
- **Use Case**: Used for direct AI API access from conversation/chat interfaces

**Implementation**:
- `backend/internal/proxy/` - HTTP proxy handler
- Routes: `/api/v1/proxy/*` forwards to configured AI service endpoints

### Performance & Reliability Features

The backend implements several patterns for high performance and reliability:

**Circuit Breakers** (`internal/common/circuitbreaker/`):
- Prevents cascading failures when external services are down
- Three breakers: `SemanticScholarBreaker`, `AIServiceBreaker`, `ProxyServiceBreaker`
- Uses gobreaker library with configurable thresholds
- Automatically opens circuit on high failure rates, prevents unnecessary requests
- Half-open state for gradual recovery testing

**Rate Limiting** (`internal/common/middleware/ratelimit.go`):
- Custom sliding window rate limiter (no external dependencies)
- IP-based and user-based rate limiting
- Automatic cleanup of stale entries
- Configurable per endpoint (e.g., 100 req/s)

**Request Timeouts** (`internal/common/middleware/timeout.go`):
- Smart timeout middleware with different timeouts based on operation type
- Read operations: 15s, Write operations: 30s, Streaming: 5m
- Prevents hanging requests and resource exhaustion
- Returns 408 status on timeout

**HTTP Connection Pooling**:
- Shared HTTP clients across all external API calls
- AI service: `internal/ai/httpclient.go` (100 max idle connections)
- Proxy service: `internal/proxy/httpclient.go` (100 max connections per host)
- Reduces latency by reusing TCP connections
- Configurable timeouts, keep-alive, and TLS settings

**日志(本地 docker logs)**:
- 后端用 `slog`(stdlib)结构化日志直接写 stdout
- `RecoveryMiddleware` 注入 RequestID → 错误日志可关联到具体一次请求
- 所有 handler 的错误路径 + 所有上游 API 调用失败都打 `slog.Error`(见 `internal/common/middleware/recovery.go`)
- 前端 / Nginx 都通过 docker logs 收集,不依赖外部观测平台 —— 历史的 OpenTelemetry/SigNoz 接入已移除
- 日志驱动统一 `json-file` + size 限制(见 docker-compose.yml `x-default-logging`),防容器盘爆

### Background Tasks & Caching

The backend runs several background tasks for performance and maintenance:

- **API Key Cache Refresh**: Third-party API keys refreshed every 5 minutes from database to Redis
- **Session Snapshots**: User session statistics recorded every 5 minutes
- **Cleanup Service**: Automatically runs on startup via `cleanup.CleanupService`
  - Removes expired email verification codes
  - Cleans up stale session data
  - Other maintenance tasks
- **Redis Cache Strategy**:
  - API keys: 5-minute TTL with automatic refresh
  - Session data: Cached for performance
  - LRU eviction policy with 512MB max memory
  - AOF persistence enabled for durability

### Frontend Architecture

**Common Patterns**:
- API calls via `src/services/api.js` (Axios)
- Auth token stored in localStorage
- Context API for global state (AuthContext)
- React Router v6 for routing

**User Portal Features**:
- Paper search with multiple modes (simple, advanced, intelligent)
- PDF preview (react-pdf + pdfjs-dist)
- Conversation interface with AI
- Captcha support (rc-slider-captcha)
- Responsive design for mobile
- Custom SVG icon set (`SearchIcons.js`) with multiple design variants
- Markdown rendering with syntax highlighting
- Cloudflare Turnstile integration

**Admin Dashboard Features**:
- User management & statistics (Recharts)
- Third-party account management (API keys)
- Prompt template management
- System configuration (privacy policy, email)
- Analytics visualization

**Production Build Optimization**:
- Source maps disabled (GENERATE_SOURCEMAP=false)
- Console logs removed in production
- Static asset caching via Nginx
- Gzip compression for all text content

## Common Development Tasks

### Adding a New Backend API Endpoint

1. Define model in appropriate module (e.g., `internal/user/model.go`)
2. Add repository method (database operations)
3. Add service method (business logic)
4. Add handler method (HTTP handling)
5. Register route in `cmd/server/main.go`
6. Update middleware if auth is required

### Adding a New Database Table

1. 在 `docker/mysql/migrations/` 下新建编号递增的迁移文件：
   - `NNNN_xxx_fields.sql` — 使用 `CREATE TABLE IF NOT EXISTS`（只含字段+主键）
   - `NNNN_xxx_indexes.sql` — 使用 `CALL add_index_if_not_exists(...)` 添加索引
   - `NNNN_xxx_defaults.sql` — 使用 `INSERT IGNORE` 添加种子数据（如需要）
2. Create corresponding GORM model in backend
3. Run `docker-compose restart schema-sync backend`
4. Verify: `docker logs scholar_schema_sync`

### Adding a New Frontend Page

1. Create component in `src/pages/`
2. Add route in `src/App.js`
3. Create API service method in `src/services/api.js` if needed
4. Rebuild container: `docker-compose up -d --build frontend-user`

### Working with Third-party API Keys

The system supports managing multiple API keys for external services:

1. Admin adds keys via Admin Dashboard → Third-party Accounts
2. Backend stores in `third_party_accounts` table
3. Redis caches keys with 5-minute TTL (automatic refresh)
4. Semantic Scholar Manager rotates keys on API calls
5. AI service uses configurable third-party providers (OpenAI, Claude, etc.)

### Modifying Nginx Configuration

1. Edit `nginx/nginx.conf` or `nginx/conf.d/*.conf`
2. Test config: `docker exec scholar_nginx nginx -t`
3. Reload: `docker exec scholar_nginx nginx -s reload`
4. Or restart: `docker-compose restart nginx`

### Making External API Calls

When adding new external API integrations:

1. **Use Circuit Breakers**: Wrap calls in circuit breaker to prevent cascading failures
   ```go
   result, err := circuitbreaker.YourServiceBreaker.Execute(func() (interface{}, error) {
       return makeAPICall()
   })
   ```

2. **Use Shared HTTP Clients**: Don't create new http.Client for each request
   - For AI services: Use `ai.GetHTTPClient()`
   - For proxy services: Use `proxy.GetProxyHTTPClient(timeout)`
   - For Semantic Scholar: Use existing manager's client

3. **Add Rate Limiting**: Protect endpoints with rate limiting middleware
   ```go
   router.Use(middleware.RateLimitMiddleware(100, time.Second))
   ```

4. **Set Appropriate Timeouts**: Use context with timeout for all external calls
   ```go
   ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
   defer cancel()
   ```

## Important Notes

### Key Dependencies

**Backend (Go 1.21)**:
- Gin Web Framework
- GORM + MySQL driver
- Redis Go client v9
- JWT v5
- gobreaker (circuit breaker)
- Aliyun SDK (SMS, payments)
- godotenv

**Frontend (React 18)**:
- axios (API calls)
- react-router-dom v6
- pdfjs-dist + react-pdf (PDF preview)
- rc-slider-captcha (slider CAPTCHA)
- recharts (admin analytics)
- react-markdown + rehype-highlight (markdown rendering)
- @marsidev/react-turnstile (Cloudflare Turnstile)

### Database and Cache Connection

- Backend connects to `mysql:3306` and `redis:6379` (container hostnames, NOT localhost)
- MySQL and Redis are NOT exposed to host by design (security best practice)
- For debugging MySQL: `docker exec -it scholar_mysql mysql -u scholar_user -pscholar_pass scholar`
- For debugging Redis: `docker exec -it scholar_redis redis-cli`

### Environment Variables

Key variables in `.env`:
- `JWT_SECRET` - Change in production
- `MYSQL_*` - Database credentials
- `REDIS_PASSWORD` - Redis password (optional, currently empty)
- `SEMANTIC_SCHOLAR_API_KEY` - Optional (uses free tier if not set)
- Port mapping: `HTTP_PORT` (整站唯一对外端口, default: 5411;后台 `/admin` 同端口同 SPA)。旧的 `ADMIN_PORT` 已废弃

外部观测平台(SigNoz / OpenTelemetry)已下线,所有日志走 docker logs(`json-file` 驱动,见 docker-compose.yml `x-default-logging`)。

### Email Verification Codes

Currently, verification codes are printed to backend logs (no real email sending):
```bash
docker logs scholar_backend | grep "Verification code"
```

To implement real email sending, update `internal/user/service.go` email service.

### CORS and API Paths

- Frontend API calls use relative paths: `/api/v1/...`
- Nginx proxies `/api/*` to `scholar_backend:8080/api/*`
- This eliminates CORS issues (same-origin)

### Static Resource Caching

Nginx配置了智能缓存策略:
- **静态资源** (图片、CSS、JS、字体): 缓存1年 (`max-age=31536000, immutable`)
- **HTML文件**: 不缓存 (`no-cache, must-revalidate`)
- **好处**: 大幅减少重复请求,提升加载速度60-80%
- **注意**: 更新静态资源需要修改文件名或添加版本号

### PDF Worker Setup

User portal requires PDF.js worker for PDF preview:
```bash
cd frontend-user
npm run copy-pdf-worker  # Copies worker from node_modules to public/
```
This is automatically run via `prestart` and `prebuild` npm scripts.

### Go Proxy for China

If developing in China, use Aliyun Go proxy:
```bash
GOPROXY=https://mirrors.aliyun.com/goproxy/,direct go mod tidy
```

### Slider CAPTCHA

Both admin and user frontends include a slider CAPTCHA component for login/registration:
- **Component**: `SliderCaptcha.js` and `SliderCaptcha.css` in `src/components/`
- **Usage**: User drags slider to star position (±5% tolerance)
- **Mobile optimized**: Touch events, larger touch targets
- **Current**: Frontend-only validation (can be enhanced with backend verification)
- To reset after failed login: Use `ref` and call `captchaRef.current.reset()`

### Custom Icon System

The user portal includes a custom SVG icon set for search modes:
- **Component**: `frontend-user/src/components/SearchIcons.js`
- **Available Icons**:
  - `NormalSearchIcon` - Simple document search (magnifying glass + document)
  - `AdvancedSearchIcon` - AI-powered search (chip + circuit pins)
  - Multiple alternative designs (Alt1, Alt2) for each mode
- **Features**:
  - Scalable SVG with responsive sizing
  - Uses `currentColor` for automatic theme adaptation
  - Flat design with consistent visual language
- **Documentation**: See `frontend-user/ICONS_PREVIEW.md` for visual guide and switching instructions

### Mobile Responsive Design

Both frontends are fully mobile-responsive:
- **Breakpoints**: 640px, 768px, 1024px
- **Admin**: Hamburger menu with drawer navigation on mobile
- **User**: Responsive cards, hidden decorative animations on mobile
- **Touch optimization**: Min 44px touch targets, no tap highlights
- **Viewport meta**: Allows zoom (accessibility), PWA-ready
- Test with Chrome DevTools device emulator or real devices

### Required CLI Tools

The following tools are used in various operations:
- `mysqladmin` - Database health checks
- `mysql` - Database CLI operations
- `redis-cli` - Redis operations
- `convert` (ImageMagick) - Image optimization
- `jq` - JSON processing (optional, for API testing)

## Access Information

**Development URLs** (check `.env` for actual port configuration):
- User Portal: http://localhost:${HTTP_PORT} (default in current setup: 5411)
- Admin Dashboard: http://localhost:${HTTP_PORT}/admin(同端口同 SPA 的 `/admin` 路由,无独立端口)
- Backend API: http://localhost:8080 (internal only, access via Nginx)
- Health Check: http://localhost:8080/health (internal only)

**Default Credentials**:
- Super Admin: username=`admin`, password=`adminadmin` (CHANGE IN PRODUCTION;该种子账号无 email,实际用带邮箱的管理员账号从用户登录入口登入)
- User: Register via email at user portal
- 管理员与普通用户共用 5411 登录入口,登录后凭 role 进 `/admin`

**Database**:
- Host: localhost (only via docker exec)
- Database: scholar
- User: scholar_user
- Password: scholar_pass (from .env)

## Troubleshooting

### Port Conflicts

If you encounter port conflicts, edit `.env` and change the port mapping:
```
HTTP_PORT=5411    # 整站唯一对外端口(用户端 + /admin 后台同一端口)
```
Then restart services: `docker-compose down && docker-compose up -d --build`

### Backend Not Starting

1. Check MySQL and Redis are healthy: `docker ps`
2. Check schema-sync completed: `docker logs scholar_schema_sync`
3. Check backend logs: `docker logs scholar_backend`
4. Verify Redis is accessible: `docker exec scholar_backend ping redis -c 1`

### Frontend Build Fails

```bash
cd frontend-user
rm -rf node_modules package-lock.json
npm install
docker-compose up -d --build frontend-user
```

### Database Schema Out of Sync

```bash
# 查看迁移文件列表
ls -la docker/mysql/migrations/

# 手动触发迁移
docker-compose restart schema-sync backend

# Test seed data idempotency
./scripts/test-seed-data.sh

# Nuclear option (deletes all data)
docker-compose down -v
docker-compose up -d --build
```

### Nginx 502 Bad Gateway

1. Check backend is running: `docker ps | grep backend`
2. Check backend health: `docker exec scholar_nginx wget -O- http://scholar_backend:8080/health`
3. Check Nginx config: `docker exec scholar_nginx nginx -t`

### Redis Connection Issues

```bash
# Check Redis is running
docker ps | grep redis

# Test Redis connectivity from backend
docker exec scholar_backend ping redis -c 3

# View Redis logs
docker logs scholar_redis

# Restart Redis
docker-compose restart redis backend

# Check Redis memory usage
docker exec scholar_redis redis-cli INFO memory
```

If Redis cache is stale (e.g., API keys not updating):
```bash
# Clear Redis cache and restart backend
docker exec scholar_redis redis-cli FLUSHALL
docker-compose restart backend
```

### Circuit Breaker Open

If you see "circuit breaker open" errors:

1. Check external service status (Semantic Scholar, AI service)
2. View backend logs: `docker logs scholar_backend | grep "Circuit Breaker"`
3. Circuit will auto-recover after timeout period (30s-60s)
4. If persistent, check API keys: `docker logs scholar_backend | grep "API key"`

### Rate Limiting Issues

If legitimate requests are being rate limited:

1. Check rate limit configuration in backend code
2. Adjust limits in middleware: `RateLimitMiddleware(maxRequests, windowSize)`
3. For testing, temporarily increase limits or disable rate limiting
4. Check client IP identification: `docker logs scholar_backend | grep "Rate limit"`

### Request Timeouts

If requests timeout frequently:

1. Check if timeout is appropriate for operation (streaming = 5m, write = 30s, read = 15s)
2. Adjust in `internal/common/middleware/timeout.go`
3. For long-running operations, consider implementing as background job
4. Check backend performance: `docker stats scholar_backend`

### Payment Callback Debugging

For Alipay payment issues:
```bash
# View last 10 callbacks
./scripts/check-alipay-callback.sh

# View specific order
./scripts/check-alipay-callback.sh ORDER123
```

## Project Documentation

This CLAUDE.md file consolidates all essential development information. Additional documentation:
- **README.md** - User-facing project overview and getting started guide
- **swagger.json** - Complete OpenAPI 2.0 specification for Semantic Scholar API
- **backend/SEMANTIC_SCHOLAR_API.md** - Detailed Semantic Scholar API documentation (Chinese)
- **frontend-user/ICONS_PREVIEW.md** - Visual guide for custom search icons and design variants
- **frontend-user/SEO_*.md** - SEO implementation guides and checklists for search engine optimization

All other documentation has been consolidated into this file for simplicity.