# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scholar is an academic search platform with AI-powered features. It consists of:
- **Backend**: Go (Gin framework) + MySQL + GORM
- **Frontend User Portal**: React 18 (modern, innovative design)
- **Frontend Admin Dashboard**: React 18 (flat, professional design)
- **Infrastructure**: Docker Compose with Nginx reverse proxy

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

### Testing API Endpoints

```bash
# Health check
curl http://localhost:8080/health

# Admin login
curl -X POST http://localhost:8080/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"adminadmin"}'

# User login
curl -X POST http://localhost:8080/api/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Search papers (Semantic Scholar)
curl "http://localhost:8080/api/v1/scholar/papers/search?query=transformer&limit=5"
```

## Architecture & Important Concepts

### Service Communication via Nginx

The project uses Nginx as a reverse proxy to provide unified entry points and solve CORS issues:

- **Port 80** → User Portal (frontend-user + backend API via `/api/*`)
- **Port 8001** → Admin Dashboard (frontend-admin + backend API via `/api/*`)
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
├── proxy/          # Proxy for external services
├── mcp/            # MCP (Model Context Protocol) server
├── config/         # System configuration (privacy policy, email, etc.)
└── common/
    ├── config/     # App configuration (env vars)
    ├── database/   # Database connection & initialization
    ├── middleware/ # HTTP middleware (CORS, auth)
    ├── model/      # Shared models (sessions, statistics)
    └── utils/      # Utilities (JWT, password, response)
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
- `backend/internal/thirdparty/` - API key management with cache refresh

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
3. Service refreshes cache every 5 minutes
4. Semantic Scholar Manager rotates keys on API calls

### Modifying Nginx Configuration

1. Edit `nginx/nginx.conf` or `nginx/conf.d/*.conf`
2. Test config: `docker exec scholar_nginx nginx -t`
3. Reload: `docker exec scholar_nginx nginx -s reload`
4. Or restart: `docker-compose restart nginx`

## Important Notes

### Database Connection

- Backend connects to `mysql:3306` (container hostname, NOT localhost)
- MySQL is NOT exposed to host by design (security)
- For debugging: `docker exec -it scholar_mysql mysql -u scholar_user -pscholar_pass scholar`

### Environment Variables

Key variables in `.env`:
- `JWT_SECRET` - Change in production
- `MYSQL_*` - Database credentials
- `SEMANTIC_SCHOLAR_API_KEY` - Optional (uses free tier if not set)
- Port mappings: `HTTP_PORT`, `ADMIN_PORT`, `BACKEND_PORT`

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

### Mobile Responsive Design

Both frontends are fully mobile-responsive:
- **Breakpoints**: 640px, 768px, 1024px
- **Admin**: Hamburger menu with drawer navigation on mobile
- **User**: Responsive cards, hidden decorative animations on mobile
- **Touch optimization**: Min 44px touch targets, no tap highlights
- **Viewport meta**: Allows zoom (accessibility), PWA-ready
- Test with Chrome DevTools device emulator or real devices

## Access Information

**Development URLs**:
- User Portal: http://localhost (port 80)
- Admin Dashboard: http://localhost:8001
- Backend API: http://localhost:8080 (internal only, access via Nginx)
- Health Check: http://localhost:8080/health

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

Edit `.env` and change port mappings:
```
HTTP_PORT=8080
ADMIN_PORT=8002
```

### Backend Not Starting

1. Check MySQL is healthy: `docker ps`
2. Check schema-sync completed: `docker logs scholar_schema_sync`
3. Check backend logs: `docker logs scholar_backend`

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

## Project Documentation

This CLAUDE.md file consolidates all essential development information. The project also has:
- **README.md** - User-facing project overview and getting started guide
- **Backend API docs** - `backend/SEMANTIC_SCHOLAR_API.md` for Semantic Scholar API details

All other documentation has been consolidated into this file for simplicity.
