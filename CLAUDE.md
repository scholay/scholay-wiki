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

# Run frontend dev server (Vite, port 3001)
cd frontend-user && npm run dev

# 一次性：启用仓库自带的 git 钩子（pre-push 跑设计系统护栏）—— 每台机器/每份 clone 各一次
./scripts/install-git-hooks.sh

# 设计系统护栏（全仓口径，含跨包镜像；构建里的那次不覆盖跨包）
./scripts/check-design-system.sh
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

> ⚠️ 用户端与 `/admin` 后台是**同一个 Vite SPA**，只有 `frontend-user/` 一个前端目录、一套命令。

```bash
cd frontend-user
npm install
npm run dev        # Vite dev server，端口 3001（见 vite.config.ts）
npm run build      # tsc -b && vite build
npm run typecheck  # tsc -b --noEmit
npm run lint       # eslint
npm run test       # vitest（watch）
npm run test:design    # 设计系统护栏 + token 编译期契约（prebuild 会自动跑）
npm run test:contract  # 后端响应契约（zod × 录制 fixture）
```

**`prebuild` 钩子**（`npm run build` / Docker 构建都会触发）：
`node scripts/copy-pdf-cmaps.mjs && npm run test:design` —— 也就是说
**设计系统护栏是构建期硬失败**，写了违规的硬编码颜色 / 旧字号档 / 旧圆角档会直接构建不过。
（历史文档里的 `npm start` / `npm run copy-pdf-worker` / `GENERATE_SOURCEMAP` 都是已删除的 CRA 版遗留，**均不存在**。）

### 设计系统护栏：两个执行点（覆盖面不一样，别混着看）

护栏本体在 `frontend-user/tests/design-system-guard.test.ts`（类名 / 硬编码 / 跨包镜像）+
`design-tokens-compiled.test.ts`（token 声明 vs 实际编译产出）。**本仓库没有 CI、没有远端闸门**，
它靠下面两个点被触发：

| 执行点 | 何时跑 | 覆盖 | 跨包镜像 | 违规时 |
|---|---|---|---|---|
| `prebuild` → `npm run test:design` | `npm run build` / Docker 构建 | frontend-user 内全部规则 | ❌ **整族 skip** | 构建失败 |
| `scripts/check-design-system.sh` | git `pre-push` 钩子（**要装一次**）/ 手跑 | 全部规则 | ✅ 真的校验 | push 被拦 |

🔴 **Docker 构建里的绿灯 ≠ 跨包镜像已校验。** frontend-user 的构建
`context: ./frontend-user`（见 docker-compose.yml），`miniprogram/` `scholay-minitools/` `agent/`
三个兄弟包在那个环境里**物理上不存在** → 「跨包镜像」一族规则走 `ctx.skip()`。
小程序 / 小工具 / pptx 导出三份镜像是否与 `globals.css` 同步，**构建管不了**。
跳过时 `frontend-user/scripts/design-guard.mjs` 会在构建日志里打一条横幅、逐条列出被跳过的规则名
——刻意做得很吵（「一条永远绿的规则」和「一条不存在的规则」等价，本仓库被这个模式坑过）；
但**刻意不让构建失败**：那个 context 里客观上无法校验，红灯只会堵死部署。

🔴 **钩子要装一次才生效**（每台机器、每份 clone 各一次）：

```bash
./scripts/install-git-hooks.sh      # = git config core.hooksPath .githooks
git push --dry-run                  # 校验钩子确实会被调用（不会真推）
```

`.git/hooks/` 不进版本库，钩子放那儿只有写它的人有 = 等于没有；所以钩子在版本化的
`.githooks/` 里，但 git 必须被显式指过去。⚠️ 本仓库 `.git/config` 里 `core.hooksPath`
此前被显式设成绝对路径的 `.git/hooks`（里面只有 `.sample`，等于没钩子）——
「默认就行」的假设在这里不成立，**不执行上面这一步，护栏一次都不会自动跑**。

选 `pre-push` 而非 `pre-commit`：护栏读的是**工作区**文件而不是 index，pre-commit 时
与「本次提交的内容」对不上会同时制造假绿和假红（要对齐就得 stash，本仓库常年一堆未提交改动，不做）；
且护栏一次 3~4s，每个 WIP commit 都付会养出 `--no-verify` 的肌肉记忆。push 是代码离开本机的边界，
频率低、口径诚实。绕过用 `SKIP_DESIGN_GUARD=1 git push`，**留痕**到 `.git/design-guard-bypass.log`
（时间 / 邮箱 / 分支 / commit / 原因）；`git push --no-verify` 是 git 层面根本不调用钩子、**无痕**，别用。

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
│     IssueWSTicket)       │   - PreUserMessage 配额钩子 (StandardHooks→vip 日额度)
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
- 成本控制: 通过 `FeatureSpec.PreUserMessage` 钩子接配额。smart_search/claw/prism 经 `agentbridge.StandardHooks` 接 `internal/vip` 的 tier-aware 日额度(`vip.Service.CheckDailyQuota`,超额转 `agentbridge.NewQuotaError`→前端 `code=quota_exceeded`);peerreview server-side 在 `Submit` 内手放同一配额。(历史文档曾写 `NewRedisDailyCap` —— 该实现从未存在,以 vip 链路为准。)
- 用量审计: `FeatureSpec.OnMessageComplete` 拿 agent 返回的 token usage; 默认 `NewSlogUsageRecorder` 打到日志, `docker logs scholar_backend | grep agent_usage` 直接看
- agent 容器的 model / provider 配置在 `agent_config` 表, admin 后台可改, 改完后台异步 push 到 agent;`push_status` / `last_pushed_at` / `push_error` 字段反映推送结果
- **per-user 长期记忆 (migration 0035)**: 真源是 backend DB `user_memory_blocks`(label=profile/preferences, 跨 feature 共享), 由 `agentbridge.Bridge.MemoryBlocks` 在「首条 user_message 前缀」(smart_search/claw/prism) + peerreview 方法论 prompt 注入;后台每轮异步抽取更新(`internal/usermemory` 编排;**抽取 LLM 已移到 agent 容器**经 `extract_memory` 帧执行, 旧 `ai.Service.SimpleCompletion` 已删除;Redis 90s 冷却);用户经 `/api/v1/user/memory` 查看/编辑/删除。
  ⚠️ **agent 容器自带的桌面记忆设施(`src/memdir/` / `context.ts:getUserContext` / 注入 `CLAUDE.md`)在 Web 流里读到的是空** —— 它是机主单用户的设施, 多租户 Web 未对接, 别误以为它在生效。per-user 记忆真源 = `user_memory_blocks` + 首条 in-band 前缀。

**详细文档**: [agent/README.md](agent/README.md) (容器部署)。
⚠️ ~~`agent/docs/api.md`~~ **不存在**(2026-07-28 实测,`agent/` 下只有 `README.md`);
REST + WS 协议的真源是 `backend/internal/agent/` 的客户端代码与 `internal/agentbridge/` 的 WS pipe。

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

> 🔴 **本节曾长期描述已删除的 CRA 版前端**（`src/services/api.js` / `AuthContext` /
> `SearchIcons.js` / `SliderCaptcha.js` / `src/App.js` 等）。那份代码已于 2026-05-28 整体删除，
> 上述文件**全部不存在**（`frontend-user/src/` 下 `.js` 文件数为 0）。2026-07-28 已按实测重写。
>
> **唯一权威**是 [frontend-user/CLAUDE.md](frontend-user/CLAUDE.md)（强制约束，工作在该目录下自动加载）。
> 本节只做索引，细节以那份为准，冲突时以那份为准。

**技术栈**：React 19 + Vite 6 + TypeScript strict + Tailwind v4 + shadcn/Radix，
用户端与 `/admin` 后台共用**同一个 SPA**（`frontend-user/`）。

**Common Patterns**：
- HTTP 唯一入口 `src/shared/lib/http.ts`（axios 实例）；业务 API 写在
  `features/<domain>/api/*.ts` 并**导出 TanStack Query hook**，不导出裸 fetch
- 服务端状态 = `@tanstack/react-query` v5；客户端跨页状态 = `zustand` v5 的 slice（`src/stores/`）
- **禁止用 Context API 传共享状态**（只允许传 Provider 注入的依赖，如 QueryClient）
- Auth token 存 `localStorage.auth_token`（单一真源）
- 路由 = `react-router-dom` **v7**，每个 feature 在自己的 `routes.tsx` 暴露 `RouteObject[]`，
  页面级 lazy 是默认；登录态校验用 `loader` 而非组件内 useEffect

**Design system（2026-07 换真源到 Figma）**：
- token 唯一真源 = `frontend-user/src/styles/globals.css`（对应 Figma 提取产物
  [docs/figma-design-spec-2026-07.md](docs/figma-design-spec-2026-07.md)）；**旧的 `.pen` 口径已作废**
- 四色阶：朱砂 `#882828` / 松青 `#2F4D29` / 琥珀 `#E5A800` / 玄墨 `#1F1F23`；
  页面底米白 `#F6F4EE`、卡片底纯白 `#FFFFFF`（分层全靠这 3.5% 明度差）
- 字号 6 档 `text-12/14/16/20/24/28`（正文基准 14）、圆角 6 档 `rounded-4/8/12/16/20/pill`
- **暗色态已于 2026-07 移除**：无 `.dark` 块、无 theme store、`dark:` 前缀 0 处
- 护栏两个执行点（详见上文「设计系统护栏：两个执行点」）：
  ① `prebuild` → `npm run test:design`，挂在 `npm run build` / Docker 构建上，构建期硬失败，
  但**跨包镜像那族规则在 Docker 里会整族 skip**（构建 context 只有 `./frontend-user`）；
  ② `scripts/check-design-system.sh`，git `pre-push` 钩子调用（需先跑一次
  `./scripts/install-git-hooks.sh`），三个兄弟包在场，是**唯一真的校验跨包镜像**的口径
- 落地实况与已知坑见 [docs/design-audit-2026-07.md](docs/design-audit-2026-07.md)

**用户端主要能力**：论文检索（普通 / 智能）· PDF 预览（react-pdf + pdfjs-dist）·
AI 对话（智能搜索 / 智能助手 / 审稿 / 智能写作）· 文献集与暂存区 · Markdown + KaTeX 渲染 ·
Cloudflare Turnstile 人机校验 · 移动端独立渲染路径（UA 双向分流）

**`/admin` 后台主要能力**：用户与用量统计（recharts）· 三方账号 / API key 池 ·
agent 模型与 provider 配置 · 会话监控 · 订单与营销 · 系统配置

**Production Build**：Vite 生产构建（`tsc -b && vite build`）；
静态资源经 Nginx 一年强缓存 + gzip。⚠️ **不带内容 hash 的品牌资产**
（`favicon.svg` / `og-image*.png` / `manifest.webmanifest`）在两层 nginx 上都单独降到 1 天 TTL —— 
改这类资产**必须同时换文件名**，原地改内容对老用户无效（见 design-audit-2026-07.md §〇之四）

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

> 详细约束以 [frontend-user/CLAUDE.md](frontend-user/CLAUDE.md) 为准（分层 / 网络层 / 样式 token / 组件分层）。

1. 页面组件放 `frontend-user/src/features/<domain>/pages/`
2. 在该 feature 的 `routes.tsx` 里加 `RouteObject`（**页面级 lazy 是默认**），
   `app/router.tsx` 只负责拼装，不写具体路径
3. 需要后端数据 → 在 `features/<domain>/api/*.ts` 导出 **react-query hook**
   （不导出裸 fetch；HTTP 一律经 `shared/lib/http.ts` 的 axios 实例）
4. 样式只用 `src/styles/globals.css` 里的 token 工具类，**不新建 .css 文件、不写内联颜色**
5. 重建容器：`docker-compose up -d --build frontend-user`

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

**Frontend (React 19 + Vite 6 + TS strict)** —— 完整的「必用 / 禁止自研」对照表见
[frontend-user/CLAUDE.md](frontend-user/CLAUDE.md) §2，往 package.json 加包前**必须**先查那张表：
- `@tanstack/react-query` v5（服务端状态）+ `axios`（经 `shared/lib/http.ts`）
- `zustand` v5（客户端状态）· `react-router-dom` **v7**（路由）
- `tailwindcss` v4 + `@radix-ui/*` + `cva` + `tailwind-merge`（样式与 UI 原子）
- `framer-motion` v12（复杂动画）· `@formkit/auto-animate`（列表过渡）· `tw-animate-css`
- `pdfjs-dist` + `react-pdf`（PDF 预览）· `@codemirror/*`（LaTeX 编辑器）
- `recharts`（图表）· `@tanstack/react-table` + `@tanstack/react-virtual` · `@dnd-kit/*`
- `react-markdown` + `remark-gfm` + `rehype-highlight` + `rehype-katex` + `katex`
- `lucide-react`（图标）· `cmdk`（命令面板）· `sonner`（toast）
- `react-hook-form` + `zod`（表单与校验）· `@marsidev/react-turnstile`（人机校验）
- ⚠️ `rc-slider-captcha` **已不在依赖里**：滑块验证码整体下线，人机校验改用 Cloudflare Turnstile

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
- **不带内容 hash 的品牌资产** (`favicon.svg` / `og-image*.png` / `apple-touch-icon*.png` /
  `manifest.webmanifest`): **单独降到 1 天** (`max-age=86400`)
- **好处**: 大幅减少重复请求,提升加载速度60-80%

> 🔴 **改静态资产的铁律(2026-07-28 踩过)**:`immutable` 的语义是「一年内不回源校验」——
> **对已访问过的老用户,原地改文件内容完全无效**;已抓取过 `og:image` 的社交平台(微信/Twitter)
> 缓存更久且不受我们 TTL 控制。因此必须**同时**做两件事:
> ① **换 URL**(`og-image-v2.png` / `favicon.svg?v=2`,并保留旧文件名的同内容副本让历史链接自愈);
> ② **降 TTL**,而且要在**两层 nginx 上都改** —— `frontend-user/nginx.conf` 与
> `nginx/conf.d/user.conf`,后者用 `proxy_hide_header Cache-Control` 抹掉上游头再自己重打 1y immutable,
> **只改前端那份会被边缘层原样覆盖回去**。
> 另注:nginx 正则 location **按出现顺序首个命中生效**,短 TTL 那条必须写在通用静态正则**之前**。

### PDF.js CMap Setup

⚠️ 旧版这里写的 `npm run copy-pdf-worker` / `prestart` **不存在**（CRA 版遗留）。
现在需要拷贝的是 **CMap**（供浏览器端 pdf.js 渲染中/日/韩字体），worker 由 Vite 直接打包：

```bash
cd frontend-user
node scripts/copy-pdf-cmaps.mjs   # node_modules/pdfjs-dist/cmaps → public/pdfjs-cmaps/
```

由 `package.json` 的 **`predev` / `prebuild`** 自动执行，正常开发不需要手动跑。
`public/pdfjs-cmaps/` 已 gitignore（随依赖再生）。

### Go Proxy for China

If developing in China, use Aliyun Go proxy:
```bash
GOPROXY=https://mirrors.aliyun.com/goproxy/,direct go mod tidy
```

### 人机校验（滑块验证码已下线）

⚠️ 本节旧版描述的 `SliderCaptcha.js` / `SliderCaptcha.css` 属已删除的 CRA 版前端，**文件不存在**，
`rc-slider-captcha` 也已从依赖里移除。现行方案是 **Cloudflare Turnstile**：
- 组件：`frontend-user/src/features/auth/components/TurnstileField.tsx`
- 站点开关与 sitekey 由后端下发（`shared/api/public-config.ts`），`shared/lib/http.ts` 负责带上校验结果
- 后端校验 **fail-closed**（校验服务不可用时拒绝，不放行）

### 图标

⚠️ 本节旧版描述的 `SearchIcons.js` 与 `frontend-user/ICONS_PREVIEW.md` **均不存在**（CRA 版遗留）。
现行约定见 [frontend-user/CLAUDE.md](frontend-user/CLAUDE.md) §2：
- 统一用 **`lucide-react`**，**禁止自定 SVG**（品牌 logo 除外）
- 图标尺寸走设计系统的 `size-icon`(24 画板) / `size-icon-inline`(20)；
  当前代码主力仍是裸 `size-3.5/4`，属过渡态

### Mobile Responsive Design

- 断点：640 / 768 / 1024（Tailwind 默认 sm/md/lg）
- **移动端不是「同一棵树加断点」**：存在 UA 双向分流（PC ↔ 移动各自的 loader 与部分专属组件），
  设备判定收口在 `frontend-user/src/shared/lib/device.ts`
- 触控目标 ≥ 44px；全面屏底部让位用 `--safe-bottom`，**不要裸写 `env(safe-area-inset-bottom)`**
- **视口高度一律用 `dvh` 不用 `vh`** —— iOS 地址栏会盖住弹窗底部按钮（付费入口踩过），
  已加护栏，`src/**` 下裸 `vh` 实测为 0
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
- **README.md** — User-facing project overview and getting started guide
- **[frontend-user/CLAUDE.md](frontend-user/CLAUDE.md)** — 前端强制约束（第三方优先 / 分层 / 网络层 / 样式 token / 组件分层）。**在 `frontend-user/` 下工作时以它为准**
- **[docs/figma-design-spec-2026-07.md](docs/figma-design-spec-2026-07.md)** — Figma 设计稿提取产物（设计 token 的规范侧真源）
- **[docs/design-audit-2026-07.md](docs/design-audit-2026-07.md)** — 设计系统**落地实况**审计（token 层 vs 渲染层的差距、已知坑、计数口径分歧）
- **[docs/design-migration-ledger-2026-07.md](docs/design-migration-ledger-2026-07.md)** — 改造台账。🔴 **是「改造前的计划」不是结果**，顶部列了它会主动误导的地方，读前先看那段警示
- **[docs/interaction-spec/](docs/interaction-spec/)** — 交互规格
- **[agent/README.md](agent/README.md)** — agent 容器部署说明

> ⚠️ 以下文档在旧版本被列出/引用，2026-07-28 实测**均已不存在**，别再去找：
> `swagger.json`、`backend/SEMANTIC_SCHOLAR_API.md`（Semantic Scholar 集成已被 minicod 取代）、
> `frontend-user/ICONS_PREVIEW.md`、`frontend-user/SEO_*.md`（均为已删除的 CRA 版前端遗留）、
> **`agent/docs/api.md`**（实测 `agent/` 下只有 `README.md`；本文件 agent 一节的引用已就地更正）。

All other documentation has been consolidated into this file for simplicity.