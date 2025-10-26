# Scholar 架构说明

## 整体架构

```
Internet
    ↓
┌───────────────────────────────────────┐
│         Nginx (反向代理)               │
│  端口 80:    用户端                    │
│  端口 8001:  管理台                    │
└───────────────────────────────────────┘
         ↓              ↓
    ┌────────┐    ┌────────┐
    │ 用户端  │    │ 管理台  │
    │ React  │    │ React  │
    └────────┘    └────────┘
         ↓              ↓
    ┌──────────────────────┐
    │   Backend (Go + Gin) │
    └──────────────────────┘
              ↓
    ┌──────────────────┐
    │  MySQL Database  │
    │ (容器内部only)    │
    └──────────────────┘
```

## 网络架构

### 端口映射

#### 对外暴露 (主机端口)
- **80端口** - 用户端入口
  - 前端: `http://localhost/`
  - API: `http://localhost/api/`

- **8001端口** - 管理台入口
  - 前端: `http://localhost:8001/`
  - API: `http://localhost:8001/api/`

#### 容器内部 (不对外暴露)
- **scholar_backend:8080** - Go后端服务
- **scholar_frontend_user:80** - 用户端Nginx
- **scholar_frontend_admin:80** - 管理台Nginx
- **scholar_mysql:3306** - MySQL数据库

### 服务通信

所有服务通过 `scholar-network` 桥接网络通信:

1. **前端 → 后端**
   ```
   浏览器请求 /api/*
   → Nginx反向代理
   → scholar_backend:8080
   ```

2. **后端 → 数据库**
   ```
   Backend连接 mysql:3306
   → 容器内部网络
   → scholar_mysql:3306
   ```

3. **Schema同步**
   ```
   docker-compose up
   → MySQL启动
   → schema-sync运行
   → Backend启动
   ```

## 核心特性

### 1. 统一入口 - Nginx反向代理

**优势:**
- ✅ 前后端通过同域名访问,无CORS问题
- ✅ 只暴露必要端口,增强安全性
- ✅ 统一管理SSL证书(生产环境)
- ✅ 负载均衡和缓存(可扩展)

**配置:**
- `nginx/nginx.conf` - 主配置
- `nginx/conf.d/user.conf` - 用户端配置
- `nginx/conf.d/admin.conf` - 管理台配置

### 2. 数据库隔离

**安全设计:**
- MySQL **不暴露** 到主机3306端口
- 仅容器内部通过 `mysql:3306` 访问
- 数据持久化到 `./data/mysql`

**连接方式:**
```go
// Backend代码中
DB_HOST=mysql  // 不是localhost!
DB_PORT=3306
```

**本地调试:**
如需本地访问MySQL调试:
```bash
# 方法1: 进入容器
docker exec -it scholar_mysql mysql -u scholar_user -p

# 方法2: 临时端口转发
docker-compose port mysql 3306
```

### 3. 自动化数据库迁移

每次启动自动同步数据库结构:
```
MySQL启动
→ schema-sync同步init/*.sql
→ Backend启动(依赖同步完成)
```

详见: [DATABASE_SYNC.md](DATABASE_SYNC.md)

## 请求流程

### 用户端访问流程

```
1. 浏览器访问 http://localhost/
   ↓
2. Nginx (80端口) 接收请求
   ↓
3. Nginx转发到 scholar_frontend_user:80
   ↓
4. 返回React前端页面
   ↓
5. 前端发起API请求 /api/user/login
   ↓
6. Nginx拦截 /api/* 请求
   ↓
7. Nginx转发到 scholar_backend:8080/api/user/login
   ↓
8. Backend处理请求,访问MySQL
   ↓
9. 返回JSON响应
```

### 管理台访问流程

```
1. 浏览器访问 http://localhost:8001/
   ↓
2. Nginx (8001端口) 接收请求
   ↓
3. Nginx转发到 scholar_frontend_admin:80
   ↓
4. 返回React前端页面
   ↓
5. 前端发起API请求 /api/admin/login
   ↓
6. Nginx转发到 scholar_backend:8080/api/admin/login
   ↓
7. Backend验证管理员身份
   ↓
8. 返回JWT token
```

## 容器编排

### 启动顺序

```yaml
1. mysql (健康检查)
2. schema-sync (运行一次后退出)
3. backend (依赖MySQL + schema-sync完成)
4. frontend-admin (依赖backend)
5. frontend-user (依赖backend)
6. nginx (依赖所有服务)
```

### 健康检查

- **MySQL**: `mysqladmin ping`
- **Backend**: 依赖MySQL健康
- **Schema-sync**: 一次性任务,完成后退出

## 开发 vs 生产

### 开发环境

```bash
# 当前配置 - 适合开发
docker-compose up -d --build
```

- 用户端: http://localhost
- 管理台: http://localhost:8001
- 禁用前端缓存,实时更新
- 详细日志输出

### 生产环境建议

1. **启用HTTPS**
   ```nginx
   server {
       listen 443 ssl http2;
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
   }
   ```

2. **启用Gzip压缩** (已配置)

3. **添加速率限制**
   ```nginx
   limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
   ```

4. **环境变量**
   - 修改 `JWT_SECRET` 为强密码
   - 修改 `MYSQL_ROOT_PASSWORD`
   - 修改默认管理员密码

5. **数据备份**
   ```bash
   # 定时备份MySQL
   docker exec scholar_mysql mysqldump -u root -p scholar > backup.sql
   ```

## 扩展性

### 水平扩展

```yaml
backend:
  deploy:
    replicas: 3  # 多个后端实例

nginx:
  # 配置upstream负载均衡
  upstream backend {
    server scholar_backend_1:8080;
    server scholar_backend_2:8080;
    server scholar_backend_3:8080;
  }
```

### 添加Redis

```yaml
redis:
  image: redis:alpine
  expose:
    - "6379"
  networks:
    - scholar-network
```

### 添加Elasticsearch

```yaml
elasticsearch:
  image: elasticsearch:8.11.0
  environment:
    - discovery.type=single-node
  expose:
    - "9200"
  networks:
    - scholar-network
```

## 监控和日志

### 查看日志

```bash
# 所有服务
docker-compose logs -f

# 特定服务
docker logs -f scholar_nginx
docker logs -f scholar_backend
docker logs -f scholar_mysql

# 数据库同步日志
docker logs scholar_schema_sync
```

### Nginx访问日志

```bash
docker exec scholar_nginx tail -f /var/log/nginx/access.log
docker exec scholar_nginx tail -f /var/log/nginx/user_access.log
docker exec scholar_nginx tail -f /var/log/nginx/admin_access.log
```

## 故障排查

### Nginx配置测试

```bash
docker exec scholar_nginx nginx -t
```

### 重载Nginx配置

```bash
docker exec scholar_nginx nginx -s reload
```

### 查看容器网络

```bash
docker network inspect scholar_scholar-network
```

### 测试容器间连接

```bash
# 从backend测试MySQL连接
docker exec scholar_backend ping mysql

# 从nginx测试backend连接
docker exec scholar_nginx wget -O- http://scholar_backend:8080/health
```

## 安全最佳实践

1. ✅ MySQL不暴露到公网
2. ✅ Backend不直接暴露,仅通过Nginx访问
3. ✅ 使用环境变量管理敏感信息
4. ✅ 容器间通过内部网络通信
5. ⚠️ 生产环境需启用HTTPS
6. ⚠️ 生产环境需修改默认密码
7. ⚠️ 生产环境需添加防火墙规则

## 总结

这个架构提供了:
- 🔒 **安全性**: 最小化暴露面,数据库完全隔离
- 🚀 **性能**: Nginx高效反向代理,支持扩展
- 🛠 **可维护**: 清晰的服务边界,统一的入口
- 📦 **可移植**: 完全容器化,一键部署
- 🔄 **自动化**: 数据库自动同步,健康检查

访问地址:
- **用户端**: http://localhost
- **管理台**: http://localhost:8001
