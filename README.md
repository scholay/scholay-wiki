# Scholar - Academic Search Platform

A modern, full-stack academic search platform powered by AI, featuring a user-friendly interface and a comprehensive admin dashboard.

## Features

- **User Portal**: Modern, innovative design for browsing and searching academic papers
- **Admin Dashboard**: Flat, modern design for managing the platform
- **Authentication**: Secure JWT-based authentication
  - Admin login (username/password)
  - User registration/login (email-based with extensible OAuth support)
- **Scalable Architecture**: Microservices-ready design with Docker containerization
- **AI-Ready**: Built with AI integration in mind for smart recommendations
- **Database Migrations**: Automated schema synchronization

## Tech Stack

### Backend
- **Language**: Go 1.21
- **Framework**: Gin
- **Database**: MySQL 8.0
- **ORM**: GORM
- **Authentication**: JWT

### Frontend
- **Framework**: React 18
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **Styling**: Custom CSS with modern design patterns

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Web Server**: Nginx (for frontend)
- **Database**: MySQL with persistent volumes

## Project Structure

```
scholar/
├── backend/                    # Go backend application
│   ├── cmd/server/            # Application entry point
│   ├── internal/
│   │   ├── admin/             # Admin module
│   │   ├── user/              # User module
│   │   └── common/            # Shared utilities
│   │       ├── config/        # Configuration management
│   │       ├── database/      # Database connection
│   │       ├── middleware/    # HTTP middleware
│   │       └── utils/         # Utility functions
│   └── Dockerfile
│
├── frontend-admin/            # Admin dashboard (React)
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   ├── pages/             # Page components
│   │   ├── services/          # API services
│   │   └── utils/             # Utilities
│   └── Dockerfile
│
├── frontend-user/             # User portal (React)
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   ├── pages/             # Page components
│   │   ├── services/          # API services
│   │   └── utils/             # Utilities
│   └── Dockerfile
│
├── docker/
│   └── mysql/
│       └── init/              # Database initialization scripts
│
├── scripts/                   # Utility scripts
│   └── check-schema.sh        # Schema migration script
│
├── data/                      # Persistent data (gitignored)
│   └── mysql/                 # MySQL data directory
│
├── docker-compose.yml         # Docker Compose configuration
└── .env.example              # Environment variables template

```

## Getting Started

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- (Optional) Node.js 18+ and Go 1.21+ for local development

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd scholar
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

3. **Start the application**
   ```bash
   docker-compose up -d --build
   ```

4. **Access the applications**
   - User Portal: http://localhost:3000
   - Admin Dashboard: http://localhost:3001
   - Backend API: http://localhost:8080

### Default Credentials

**Admin Dashboard**
- Username: `admin`
- Password: `adminadmin`

**Note**: Please change the default admin password after first login!

## Environment Variables

Key environment variables (see `.env.example` for full list):

| Variable | Description | Default |
|----------|-------------|---------|
| MYSQL_ROOT_PASSWORD | MySQL root password | rootpassword |
| MYSQL_DATABASE | Database name | scholar |
| MYSQL_USER | Database user | scholar_user |
| MYSQL_PASSWORD | Database password | scholar_pass |
| JWT_SECRET | JWT signing secret | (change in production) |
| BACKEND_PORT | Backend API port | 8080 |
| ADMIN_FRONTEND_PORT | Admin dashboard port | 3001 |
| USER_FRONTEND_PORT | User portal port | 3000 |

## API Documentation

### Base URL
```
http://localhost:8080/api/v1
```

### Admin Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /admin/login | Admin login | No |
| GET | /admin/profile | Get admin profile | Yes (Admin) |
| PUT | /admin/password | Update admin password | Yes (Admin) |

### User Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /user/send-code | Send verification code | No |
| POST | /user/register | User registration | No |
| POST | /user/login | User login | No |
| GET | /user/profile | Get user profile | Yes (User) |
| PUT | /user/profile | Update user profile | Yes (User) |

### Example Request

**User Login**
```bash
curl -X POST http://localhost:8080/api/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

**Response**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "status": 1,
      "created_at": "2024-01-01T00:00:00Z"
    }
  }
}
```

## Database Schema

### Automatic Schema Synchronization ⭐

The project features **fully automated database schema synchronization**:

- Every startup automatically syncs database structure from `docker/mysql/init/*.sql`
- Uses `schema-sync` service to ensure database is ready before backend starts
- Supports incremental updates with `CREATE TABLE IF NOT EXISTS`
- Safe and idempotent - can run multiple times without data loss

**To add a new table:**
1. Edit `docker/mysql/init/01_schema.sql`
2. Add `CREATE TABLE IF NOT EXISTS` statement
3. Run `docker-compose up -d --build`
4. Done! Database automatically synced

### Tables

**admin_users**
- Administrator accounts with username/password authentication

**users**
- User accounts with extensible authentication support

**user_auth_providers**
- OAuth and third-party authentication provider mappings

**email_verification_codes**
- Email verification codes for registration and password reset

## Development

### Local Development (without Docker)

1. **Backend**
   ```bash
   cd backend
   go mod download
   go run cmd/server/main.go
   ```

2. **Admin Frontend**
   ```bash
   cd frontend-admin
   npm install
   npm start
   ```

3. **User Frontend**
   ```bash
   cd frontend-user
   npm install
   npm start
   ```

### Database Migration

The application automatically syncs the database schema on startup. To manually check schema:

```bash
docker exec -it scholar_mysql bash
mysql -u scholar_user -p scholar
SHOW TABLES;
```

## Deployment

### Production Considerations

1. **Security**
   - Change all default passwords
   - Use strong JWT secret
   - Enable HTTPS with SSL certificates
   - Configure CORS appropriately

2. **Performance**
   - Increase MySQL connection pool size
   - Enable Redis for session management
   - Use CDN for static assets
   - Implement rate limiting

3. **Monitoring**
   - Add logging and monitoring tools
   - Set up health checks
   - Configure alerts

### Docker Production Build

```bash
# Build with production environment
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Architecture

### Authentication Flow

**User Registration**
1. User requests verification code via email
2. Backend generates 6-digit code and stores in database
3. User submits email + code + password
4. Backend validates code and creates user account
5. JWT token returned for immediate login

**Extensible Authentication**
The system is designed to support multiple authentication methods:
- Email/Password (implemented)
- Phone/SMS (schema ready)
- Google OAuth (schema ready)
- WeChat (schema ready)

### Design Principles

1. **Separation of Concerns**: Clear separation between admin and user modules
2. **Scalability**: Microservices-ready architecture
3. **Maintainability**: Clean code structure with design patterns
4. **Extensibility**: Easy to add new authentication providers
5. **Security**: JWT-based authentication with bcrypt password hashing

## Troubleshooting

### Common Issues

**Port already in use**
```bash
# Check what's using the port
lsof -i :3000
# Kill the process or change port in .env
```

**Database connection failed**
```bash
# Check MySQL container logs
docker logs scholar_mysql
# Ensure MySQL is healthy
docker ps
```

**Frontend build fails**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Roadmap

- [ ] AI-powered paper recommendations
- [ ] Full-text search with Elasticsearch
- [ ] Citation graph visualization
- [ ] Paper collection and annotation
- [ ] Social features (sharing, discussions)
- [ ] OAuth integration (Google, WeChat)
- [ ] Mobile app (React Native)
- [ ] API rate limiting
- [ ] Advanced analytics dashboard

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- Create an issue in the repository
- Contact the development team

---

Built with love for the academic community
