# Scholar - Quick Start Guide

## 快速启动

### 一键启动
```bash
./start.sh
```

### 访问应用
- **用户端**: http://localhost:3000 - 现代创新的学术搜索界面
- **管理台**: http://localhost:3001 - 扁平化管理界面
- **后端API**: http://localhost:8080

### 默认账号

**管理员登录** (管理台)
- 用户名: `admin`
- 密码: `adminadmin`

**用户注册** (用户端)
- 使用邮箱注册,会收到验证码(当前会打印在后端日志中)
- 查看验证码: `docker logs scholar_backend`

## 项目特点

### 1. 前后端分离架构
- **后端**: Go + Gin + MySQL
- **前端**: React + 现代化设计
- **容器化**: Docker Compose 一键部署

### 2. 双前端设计
- **管理台**: 扁平化现代风格,专业简洁
- **用户端**: 创新设计,视觉吸引力强

### 3. 可扩展认证系统
当前实现:
- 管理员: 用户名/密码登录
- 用户: 邮箱验证码注册登录

已预留扩展:
- 手机号登录
- Google OAuth
- 微信扫码
- 其他第三方登录

数据库表 `user_auth_providers` 支持多种登录方式绑定到同一用户。

### 4. 数据库自动同步 ⭐
- **完全自动化**: 每次启动自动同步数据库结构
- **零配置**: 只需编辑 `docker/mysql/init/*.sql` 文件
- **增量更新**: 使用 `CREATE TABLE IF NOT EXISTS`,不影响现有数据
- **独立服务**: `schema-sync` 服务确保数据库就绪后再启动后端

**如何添加新表?**
1. 编辑 `docker/mysql/init/01_schema.sql`
2. 添加 `CREATE TABLE IF NOT EXISTS` 语句
3. 运行 `docker-compose up -d --build`
4. 完成! 数据库自动同步

详细说明: [DATABASE_SYNC.md](DATABASE_SYNC.md)

### 5. 设计模式
- **后端**: 分层架构 (Handler -> Service -> Repository)
- **前端**: 组件化设计,Context API 状态管理
- **通用**: 关注点分离,易于维护和扩展

## 常用命令

### 启动项目
```bash
./start.sh
# 或
docker-compose up -d --build
```

### 停止项目
```bash
./stop.sh
# 或
docker-compose down
```

### 查看日志
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务
docker logs scholar_backend -f
docker logs scholar_frontend_admin -f
docker logs scholar_frontend_user -f
docker logs scholar_mysql -f
```

### 重启服务
```bash
# 重启后端
docker-compose restart backend

# 重启前端
docker-compose restart frontend-admin
docker-compose restart frontend-user
```

### 进入容器
```bash
# 进入数据库
docker exec -it scholar_mysql mysql -u scholar_user -p scholar

# 进入后端容器
docker exec -it scholar_backend sh
```

### 清理数据
```bash
# 停止并删除容器和卷(会清空数据库)
docker-compose down -v

# 删除本地数据目录
rm -rf data/mysql
```

## 开发工作流

### 修改后端代码
1. 编辑 `backend/` 下的代码
2. 重启后端: `docker-compose restart backend`
3. 或重新构建: `docker-compose up -d --build backend`

### 修改前端代码
1. 编辑 `frontend-admin/` 或 `frontend-user/` 下的代码
2. 重新构建: `docker-compose up -d --build frontend-admin`

### 修改数据库结构

**添加新表或新列:**
1. 编辑 `docker/mysql/init/01_schema.sql`
2. 使用 `CREATE TABLE IF NOT EXISTS` 或 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
3. 重启同步服务:
   ```bash
   docker-compose restart schema-sync backend
   ```
4. 验证同步:
   ```bash
   ./test-schema-sync.sh
   # 或查看日志
   docker logs scholar_schema_sync
   ```

**重置整个数据库(会删除所有数据!):**
```bash
docker-compose down -v
docker-compose up -d --build
```

## 本地开发(不使用Docker)

### 后端
```bash
cd backend
go mod download
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=scholar_user
export DB_PASSWORD=scholar_pass
export DB_NAME=scholar
go run cmd/server/main.go
```

### 前端
```bash
# 管理台
cd frontend-admin
npm install
REACT_APP_API_URL=http://localhost:8080 npm start

# 用户端
cd frontend-user
npm install
REACT_APP_API_URL=http://localhost:8080 npm start
```

## 调试技巧

### 查看验证码
用户注册时的邮箱验证码会打印在后端日志中:
```bash
docker logs scholar_backend | grep "Verification code"
```

### 检查数据库
```bash
docker exec -it scholar_mysql mysql -u scholar_user -pscholar_pass scholar
```

```sql
-- 查看所有表
SHOW TABLES;

-- 查看用户
SELECT * FROM users;

-- 查看管理员
SELECT * FROM admin_users;

-- 查看验证码
SELECT * FROM email_verification_codes ORDER BY created_at DESC LIMIT 10;
```

### API测试
```bash
# 健康检查
curl http://localhost:8080/health

# 用户登录
curl -X POST http://localhost:8080/api/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# 管理员登录
curl -X POST http://localhost:8080/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"adminadmin"}'
```

## 下一步开发

### 功能扩展优先级
1. 实现实际的邮件发送服务(当前验证码只打印在日志中)
2. 添加论文搜索核心功能
3. 集成AI大模型进行智能推荐
4. 实现用户收藏、笔记等功能
5. 添加OAuth登录(Google, 微信等)

### 技术优化
1. 添加Redis缓存
2. 实现API限流
3. 添加日志管理系统
4. 完善错误处理
5. 添加单元测试

## 故障排除

### 端口被占用
```bash
# 修改 .env 文件中的端口
BACKEND_PORT=8081
ADMIN_FRONTEND_PORT=3002
USER_FRONTEND_PORT=3001
```

### 数据库连接失败
1. 检查MySQL容器是否启动: `docker ps`
2. 查看MySQL日志: `docker logs scholar_mysql`
3. 确认数据库配置正确

### 前端无法连接后端
1. 检查后端是否运行: `curl http://localhost:8080/health`
2. 检查CORS配置
3. 查看浏览器控制台错误

## 生产部署建议

1. **安全性**
   - 修改所有默认密码
   - 使用强JWT密钥
   - 启用HTTPS
   - 配置防火墙

2. **性能**
   - 使用CDN
   - 启用Gzip压缩
   - 配置负载均衡
   - 增加数据库连接池

3. **监控**
   - 配置日志收集
   - 添加性能监控
   - 设置告警系统

---

有问题随时查看完整的 [README.md](README.md) 文档!
