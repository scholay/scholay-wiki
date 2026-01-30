# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scholar is an academic search platform with AI-powered features. It consists of:
- **Backend**: Go (Gin framework) + MySQL + GORM + Redis
- **Frontend User Portal**: React 18 (modern, innovative design)
- **Frontend Admin Dashboard**: React 18 (flat, professional design)
- **Infrastructure**: Docker Compose with Nginx reverse proxy
- **Caching**: Redis for session management and API key caching

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
cd frontend-user && npm start  # or frontend-admin
```

**URLs** (check .env for actual ports):
- User Portal: http://localhost:5411
- Admin Dashboard: http://localhost:5455
- Default admin: `admin` / `adminadmin`

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
docker logs scholar_frontend_user -f
docker logs scholar_frontend_admin -f
docker logs scholar_mysql -f
docker logs scholar_redis -f

# Restart specific service after code changes
docker-compose restart backend
docker-compose restart frontend-user
docker-compose restart frontend-admin

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
# Admin Dashboard
cd frontend-admin
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

# Manually trigger schema sync
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

# Admin login (use actual ADMIN_PORT from .env)
curl -X POST http://localhost:5455/api/v1/admin/login \
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

# Check user subscription quota
curl "http://localhost:5411/api/v1/user/subscription/quota" \
  -H "Authorization: Bearer $TOKEN"

# Check user subscription usage
curl "http://localhost:5411/api/v1/user/subscription/usage" \
  -H "Authorization: Bearer $TOKEN"

# Get WeChat Official Account config (admin only)
ADMIN_TOKEN="your-admin-jwt-token"
curl "http://localhost:5455/api/v1/admin/wechat-official/config" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Update WeChat Official Account config (admin only)
curl -X PUT "http://localhost:5455/api/v1/admin/wechat-official/config" \
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
curl "http://localhost:5455/api/v1/admin/coupon-templates" \
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
curl "http://localhost:5455/api/v1/admin/github-oauth/config" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Update GitHub OAuth config (admin only)
curl -X PUT "http://localhost:5455/api/v1/admin/github-oauth/config" \
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

- **HTTP_PORT** (configured in .env) → User Portal (frontend-user + backend API via `/api/*`)
  - Nginx listens on port 80 internally, mapped to HTTP_PORT (default: 5411) on host
  - Config: `nginx/conf.d/user.conf`
- **ADMIN_PORT** (configured in .env) → Admin Dashboard (frontend-admin + backend API via `/api/*`)
  - Nginx listens on port 8001 internally, mapped to ADMIN_PORT (default: 5455) on host
  - Config: `nginx/conf.d/admin.conf`
- **Internal**: MySQL (3306), Backend (8080), Redis (6379) are NOT exposed to host

**How it works**:
- User requests → Nginx:80 (HTTP_PORT) → Routes `/api/*` to backend:8080, `/` to frontend-user:80
- Admin requests → Nginx:8001 (ADMIN_PORT) → Routes `/api/*` to backend:8080, `/` to frontend-admin:80
- All frontend-to-backend API calls go through Nginx, enabling same-origin requests
- Backend containers communicate via internal Docker network (`scholar-network`)

**Nginx Performance Configuration**:
- **Worker processes**: Auto-scale based on CPU cores
- **Worker connections**: 1024 per process
- **Gzip compression**: Level 6 for text/JSON content
- **Two-tier caching**:
  - Static cache: 1GB max, 7-day inactive timeout
  - API cache: 100MB max, 1-hour inactive timeout
  - Static assets: 1-year cache headers
  - HTML files: no-cache headers

### Backend Layered Architecture

The Go backend follows a clean architecture pattern with clear separation:

```
internal/
├── admin/          # Admin module (username/password auth)
├── user/           # User module (email/OAuth auth)
├── ai/             # AI service integration (prompt templates, LLM calls)
├── conversation/   # Conversation management with AI analysis
├── semanticscholar/# Semantic Scholar API client & MCP server
├── thirdparty/     # Third-party account management (API keys, OAuth)
├── subscription/   # Subscription plans and quota management
├── order/          # Order processing and management
├── payment/        # Payment integration (Alipay + WeChat Pay)
├── coupon/         # Coupon/discount system with invitation rewards
├── wechat/         # WeChat integration (Mini Program, OAuth)
├── wechatofficial/ # WeChat Official Account auto-reply with AI
├── proxy/          # HTTP proxy for external AI services
├── mcp/            # MCP (Model Context Protocol) server
├── config/         # System configuration (privacy policy, email, etc.)
└── common/
    ├── config/     # App configuration (env vars)
    ├── database/   # Database connection & initialization
    ├── middleware/ # HTTP middleware (CORS, auth)
    ├── model/      # Shared models (sessions, statistics)
    ├── cache/      # Redis cache utilities
    ├── cleanup/    # Background cleanup tasks
    ├── circuitbreaker/ # Circuit breakers for external services
    └── utils/      # Utilities (JWT, password, response, Redis)
```

**Key Pattern**: Each domain module (admin/user/ai/etc.) follows Repository → Service → Handler:
- **Repository**: Database operations (GORM)
- **Service**: Business logic
- **Handler**: HTTP request/response (Gin)

### Database Schema (31 Tables)

The system uses MySQL with the following tables:

**Core Tables**:
- `users` - User accounts
- `admin_users` - Admin accounts
- `user_auth_providers` - OAuth provider associations
- `user_sessions` - Active session tracking
- `online_user_snapshots` - User activity statistics

**Subscription & Order**:
- `subscription_plans` - Available subscription tiers
- `user_subscriptions` - Active user subscriptions
- `usage_quotas` - API call quotas per subscription
- `orders` - Purchase orders
- `payment_transactions` - Payment records

**Coupon System**:
- `coupon_templates` - Reusable coupon definitions
- `user_coupons` - Issued coupons
- `coupon_usage_logs` - Usage history
- `coupon_batches` - Bulk distribution management
- `user_invitations` - User invitation codes
- `invitation_relationships` - Inviter-invitee tracking

**Configuration**:
- `third_party_accounts` - API keys and credentials
- `prompt_templates` - AI prompt configurations
- `system_configs` - System-wide settings
- `github_oauth_config` - GitHub OAuth settings
- `wechat_configs` - WeChat Mini Program config
- `wechat_official_config` - WeChat Official Account config
- `wechat_pay_configs` - WeChat Pay settings
- `alipay_configs` - Alipay settings
- `email_configs` - Email service settings
- `sms_configs` - SMS service settings
- `privacy_policies` - Privacy policy versions
- `terms_of_service` - Terms of service versions

**Content**:
- `conversations` - User AI conversations
- `conversation_messages` - Individual messages
- `user_statistics` - User analytics data

### Automatic Database Schema Synchronization

**Critical Feature**: Database schema is automatically synchronized on every startup.

- Schema file: `docker/mysql/init/01_schema.sql` (single consolidated file)
  - Contains table definitions, indexes, and seed data
  - Uses `INSERT IGNORE` for seed data to preserve existing records
- Sync service: `schema-sync` container runs `scripts/check-schema.sh`
- Backend starts ONLY after schema-sync completes successfully

**To add/modify tables**:
1. Edit `docker/mysql/init/01_schema.sql`
2. Use `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
3. Run `docker-compose up -d --build` or `docker-compose restart schema-sync backend`
4. Check logs: `docker logs scholar_schema_sync`

**To add/modify seed data**:
1. Edit `docker/mysql/init/01_schema.sql` (scroll to bottom for INSERT statements)
2. Use `INSERT IGNORE` instead of `ON DUPLICATE KEY UPDATE`
3. This ensures restarts don't overwrite modified data
4. Test idempotency: `./scripts/test-seed-data.sh`

**Never** use `DROP TABLE` or destructive operations in init scripts. Always make schema changes idempotent.

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

### Semantic Scholar Integration

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

### AI & Conversation System

The platform includes an AI-powered conversation system:

- **Conversations**: Users can create conversations with AI
- **Messages**: Each conversation contains multiple messages
- **Analysis Modes**:
  - Paper analysis (streaming)
  - Advanced search (multi-step streaming)
  - Continue conversation (streaming)
- **Prompt Templates**: Admin-configurable templates for AI interactions
- **Third-party Integration**: Uses configurable AI service providers (OpenAI, Claude, etc.)

**Implementation**:
- `backend/internal/conversation/` - Conversation management
- `backend/internal/ai/` - AI service and prompt templates
- Streaming responses via Server-Sent Events (SSE)

### Subscription & Order System

The platform includes a subscription management system with quota tracking:

- **Subscription Plans**: Admin can create and manage subscription plans (free, basic, premium, etc.)
- **User Subscriptions**: Each user has an active subscription with associated quotas
- **Quota Management**:
  - API call quotas (conversations, searches, advanced searches)
  - PDF preview quotas
  - Automatic quota reset on subscription renewal
  - Real-time quota tracking and enforcement
- **Usage Tracking**: Records user API usage and deducts from quotas
- **Orders**: Tracks subscription purchases and payment records

**Implementation**:
- `backend/internal/subscription/` - Subscription plans, user subscriptions, quota management
- `backend/internal/order/` - Order processing
- Quota checks integrated into conversation and search endpoints
- Background tasks for quota reset and cleanup

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

### Coupon & Discount System

The platform includes a comprehensive coupon/discount system with invitation rewards:

- **Coupon Templates**: Admin can create and manage reusable coupon templates
  - Multiple discount types: percentage, fixed amount, price-off
  - Flexible conditions: minimum purchase amount, applicable plans/products
  - Usage limits: per user, total usage, first purchase only, new user only
  - Time limits: fixed period or relative validity (days from issuance)
- **Distribution Methods**:
  - Manual distribution by admin
  - Auto-distribution on registration
  - Invitation rewards (both inviter and invitee)
  - Batch distribution with targeting rules
  - Public claim codes
- **Invitation System**: Built-in referral program
  - Each user gets unique invitation code and URL
  - Track invitation statistics (total, successful, paid invites)
  - Automatic coupon rewards for both parties
  - Invitation relationship tracking
- **Usage Tracking**: Complete audit trail
  - Coupon status lifecycle (unused, reserved, used, expired, cancelled)
  - Usage logs with discount calculations
  - Order integration with coupon validation
  - Refund handling
- **Batch Management**: Scheduled bulk distribution
  - Target specific user groups (new users, paid users, custom segments)
  - Track distribution and usage statistics
  - Schedule distribution for future dates

**Key Tables**:
- `coupon_templates` - Template definitions
- `user_coupons` - Issued coupons with validity and status
- `coupon_usage_logs` - Complete usage history
- `user_invitations` - User invitation codes and statistics
- `invitation_relationships` - Inviter-invitee tracking
- `coupon_batches` - Batch distribution management

**Implementation**:
- `backend/internal/coupon/` - Full coupon system implementation
- Integration with order and payment systems
- Real-time coupon validation during checkout
- Automatic expiration and status management

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

**Two separate authentication flows**:

1. **Admin** (username/password):
   - Table: `admin_users`
   - JWT with role="admin"
   - Middleware: `middleware.AdminAuthMiddleware()`
   - Default: username=`admin`, password=`adminadmin`

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

### HTTP Proxy Service

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

**Observability with OpenTelemetry/SigNoz**:
- Distributed tracing with automatic span creation for HTTP requests (via otelgin middleware)
- Structured logging with trace context correlation
- Metrics export to SigNoz collector
- Configuration via `SIGNOZ_*` environment variables
- Uses OTLP HTTP exporter for trace data

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

1. Edit `docker/mysql/init/01_schema.sql`
2. Add `CREATE TABLE IF NOT EXISTS` statement
3. Create corresponding GORM model in backend
4. Run `docker-compose up -d --build`
5. Verify: `docker logs scholar_schema_sync`

### Adding a New Frontend Page

1. Create component in `src/pages/`
2. Add route in `src/App.js`
3. Create API service method in `src/services/api.js` if needed
4. Rebuild container: `docker-compose up -d --build frontend-user` (or frontend-admin)

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
- Port mappings: `HTTP_PORT` (user portal port, default: 5411), `ADMIN_PORT` (admin dashboard port, default: 5455)

**SigNoz Observability** (optional):
- `SIGNOZ_ENDPOINT` - SigNoz collector endpoint (e.g., `198.44.187.186:4318`)
- `SIGNOZ_SERVICE_NAME` - Service name for tracing (default: `scholar-backend`)
- `SIGNOZ_ENVIRONMENT` - Environment tag (default: `production`)
- `SIGNOZ_ENABLE_TRACING` / `SIGNOZ_ENABLE_LOGGING` / `SIGNOZ_ENABLE_METRICS` - Enable/disable features
- `SIGNOZ_SAMPLING_RATE` - Trace sampling rate (0.0-1.0, default: 1.0)

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
- Admin Dashboard: http://localhost:${ADMIN_PORT} (default in current setup: 5455)
- Backend API: http://localhost:8080 (internal only, access via Nginx)
- Health Check: http://localhost:8080/health (internal only)

**Default Credentials**:
- Admin: username=`admin`, password=`adminadmin` (CHANGE IN PRODUCTION)
- User: Register via email at user portal

**Database**:
- Host: localhost (only via docker exec)
- Database: scholar
- User: scholar_user
- Password: scholar_pass (from .env)

## Troubleshooting

### Port Conflicts

If you encounter port conflicts, edit `.env` and change port mappings:
```
HTTP_PORT=5411    # Change to any available port for user portal
ADMIN_PORT=5455   # Change to any available port for admin dashboard
```
Then restart services: `docker-compose down && docker-compose up -d --build`

### Backend Not Starting

1. Check MySQL and Redis are healthy: `docker ps`
2. Check schema-sync completed: `docker logs scholar_schema_sync`
3. Check backend logs: `docker logs scholar_backend`
4. Verify Redis is accessible: `docker exec scholar_backend ping redis -c 1`

### Frontend Build Fails

```bash
cd frontend-user  # or frontend-admin
rm -rf node_modules package-lock.json
npm install
docker-compose up -d --build frontend-user
```

### Database Schema Out of Sync

```bash
# View what should be synced
cat docker/mysql/init/01_schema.sql

# Trigger sync manually
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