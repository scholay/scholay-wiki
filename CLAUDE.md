# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scholar is an academic search platform with AI-powered features. It consists of:
- **Backend**: Go (Gin framework) + MySQL + GORM + Redis
- **Frontend User Portal**: React 18 (modern, innovative design)
- **Frontend Admin Dashboard**: React 18 (flat, professional design)
- **Infrastructure**: Docker Compose with Nginx reverse proxy
- **Caching**: Redis for session management and API key caching

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

# Run backend tests (if available)
cd backend
go test ./...

# Format Go code
cd backend
go fmt ./...
```

### Frontend Development

```bash
# Admin Dashboard
cd frontend-admin
npm install
npm start        # Development server on port 3000
npm run build    # Production build

# User Portal
cd frontend-user
npm install
npm run copy-pdf-worker  # Copy PDF.js worker (required for PDF preview)
npm start        # Development server on port 3000
npm run build    # Production build
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

# Monitor Redis operations in real-time
docker exec -it scholar_redis redis-cli MONITOR
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
```

## Architecture & Important Concepts

### Service Communication via Nginx

The project uses Nginx as a reverse proxy to provide unified entry points and solve CORS issues:

- **HTTP_PORT** (configured in .env) → User Portal (frontend-user + backend API via `/api/*`)
- **ADMIN_PORT** (configured in .env) → Admin Dashboard (frontend-admin + backend API via `/api/*`)
- **Internal**: MySQL (3306), Backend (8080) are NOT exposed to host

All frontend-to-backend API calls go through Nginx, enabling same-origin requests. Backend containers communicate via internal Docker network (`scholar-network`).

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
    └── utils/      # Utilities (JWT, password, response, Redis)
```

**Key Pattern**: Each domain module (admin/user/ai/etc.) follows Repository → Service → Handler:
- **Repository**: Database operations (GORM)
- **Service**: Business logic
- **Handler**: HTTP request/response (Gin)

### Automatic Database Schema Synchronization

**Critical Feature**: Database schema is automatically synchronized on every startup.

- Schema files: `docker/mysql/init/*.sql` (executed in alphabetical order)
- Sync service: `schema-sync` container runs `scripts/check-schema.sh`
- Backend starts ONLY after schema-sync completes successfully

**To add/modify tables**:
1. Edit `docker/mysql/init/01_schema.sql`
2. Use `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
3. Run `docker-compose up -d --build` or `docker-compose restart schema-sync backend`
4. Check logs: `docker logs scholar_schema_sync`

**Never** use `DROP TABLE` or destructive operations in init scripts. Always make schema changes idempotent.

### Semantic Scholar Integration

The backend integrates Semantic Scholar Academic Graph API with two access methods:

1. **RESTful API** (`/api/v1/scholar/*`):
   - Paper search, details, citations, references
   - Author search, details, papers
   - Recommendations

2. **MCP Protocol** (`/api/v1/mcp/*`):
   - Provides tool-based access for LLMs
   - Tools: search_papers, get_paper, get_author, etc.
   - Uses dynamic API key rotation from third-party accounts

**Key Files**:
- `backend/internal/semanticscholar/` - API client implementation
- `backend/internal/mcp/` - MCP server implementation
- `backend/internal/thirdparty/` - API key management with Redis cache (5-min refresh)
- `backend/SEMANTIC_SCHOLAR_API.md` - Detailed API documentation (Chinese)

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
   - Supports: email/password, Google, WeChat (schema ready)
   - Email verification codes stored in `email_verification_codes`

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

**Admin Dashboard Features**:
- User management & statistics (Recharts)
- Third-party account management (API keys)
- Prompt template management
- System configuration (privacy policy, email)

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

## Important Notes

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
- Port mappings: `HTTP_PORT` (user portal port), `ADMIN_PORT` (admin dashboard port)

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

## Project Documentation

This CLAUDE.md file consolidates all essential development information. Additional documentation:
- **README.md** - User-facing project overview and getting started guide
- **backend/SEMANTIC_SCHOLAR_API.md** - Detailed Semantic Scholar API documentation (Chinese)
- **frontend-user/ICONS_PREVIEW.md** - Visual guide for custom search icons and design variants

All other documentation has been consolidated into this file for simplicity.
