# 更新日志

## [最新] - 数据库自动同步机制

### ✨ 新增功能

#### 数据库自动同步服务
- **完全自动化**: 每次 `docker-compose up` 时自动同步数据库结构
- **独立服务**: 新增 `schema-sync` 服务,在后端启动前完成同步
- **智能依赖**: Backend 服务依赖 `schema-sync` 成功完成才启动
- **详细日志**: 显示同步过程、表数量、行数统计

#### 工作流程
```
MySQL 启动 → schema-sync 自动同步 → Backend 启动 → Frontend 启动
```

### 📝 文件变更

#### 新增文件
- `DATABASE_SYNC.md` - 数据库同步完整文档
- `test-schema-sync.sh` - 同步功能测试脚本

#### 修改文件
- `docker-compose.yml` - 添加 `schema-sync` 服务
- `scripts/check-schema.sh` - 优化同步脚本,增强日志输出
- `README.md` - 添加自动同步说明
- `QUICKSTART.md` - 更新数据库操作指南

### 🎯 使用方法

#### 添加新表
```sql
-- 编辑 docker/mysql/init/01_schema.sql
CREATE TABLE IF NOT EXISTS `papers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(500) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

```bash
# 重启服务自动同步
docker-compose restart schema-sync backend
```

#### 修改表结构
```sql
-- 编辑 docker/mysql/init/01_schema.sql
ALTER TABLE `users`
ADD COLUMN IF NOT EXISTS `bio` TEXT COMMENT 'User biography';
```

```bash
# 重启服务
docker-compose restart schema-sync backend
```

#### 验证同步
```bash
# 方法1: 使用测试脚本
./test-schema-sync.sh

# 方法2: 查看日志
docker logs scholar_schema_sync

# 方法3: 直接查询数据库
docker exec -it scholar_mysql mysql -u scholar_user -pscholar_pass scholar
SHOW TABLES;
```

### 💡 核心优势

1. **零配置**: 无需手动执行SQL或配置迁移工具
2. **开发友好**: 修改SQL文件后自动同步,立即生效
3. **团队协作**: 所有人拉取代码后自动获得最新表结构
4. **生产就绪**: 部署到生产环境时自动应用数据库变更
5. **安全可靠**:
   - 使用 `IF NOT EXISTS` 避免重复创建
   - 只读挂载,防止意外修改
   - 幂等操作,多次执行结果一致

### 🔧 技术细节

#### docker-compose.yml 配置
```yaml
schema-sync:
  image: mysql:8.0
  volumes:
    - ./docker/mysql/init:/docker-entrypoint-initdb.d:ro
    - ./scripts/check-schema.sh:/check-schema.sh:ro
  depends_on:
    mysql:
      condition: service_healthy
  command: bash /check-schema.sh
  restart: "no"  # 只运行一次

backend:
  depends_on:
    schema-sync:
      condition: service_completed_successfully  # 等待同步完成
```

#### 同步脚本特性
- 最多等待60秒 MySQL 就绪
- 按文件名顺序执行 SQL (01, 02, 03...)
- 显示每个文件的执行状态
- 统计表数量和行数
- 彩色输出,易于阅读

### 📚 相关文档

- [DATABASE_SYNC.md](DATABASE_SYNC.md) - 完整的数据库同步文档
- [README.md](README.md) - 项目总体说明
- [QUICKSTART.md](QUICKSTART.md) - 快速开始指南

### ⚠️ 注意事项

1. **删除表**: 不建议在 init 文件中使用 `DROP TABLE`,可能导致数据丢失
2. **ALTER TABLE**: 使用 `ADD COLUMN IF NOT EXISTS` (MySQL 8.0.23+)
3. **数据插入**: 使用 `INSERT IGNORE` 避免重复插入
4. **备份**: 修改生产环境表结构前请先备份数据

### 🎉 示例场景

#### 场景1: 新成员加入团队
```bash
git clone <repository>
cd scholar
docker-compose up -d --build
# ✓ 自动获得最新数据库结构!
```

#### 场景2: 添加新功能表
```bash
# 1. 编辑 SQL 文件添加新表
vim docker/mysql/init/01_schema.sql

# 2. 重启服务
docker-compose restart schema-sync backend

# 3. 验证
./test-schema-sync.sh
# ✓ 新表已创建!
```

#### 场景3: 生产环境部署
```bash
# 在生产服务器上
git pull origin main
docker-compose up -d --build
# ✓ 数据库自动升级,无需手动干预!
```

---

## [初始版本] - 项目脚手架

### ✨ 核心功能

- ✅ Go 后端 (Gin + GORM + MySQL)
- ✅ React 管理台 (扁平化现代设计)
- ✅ React 用户端 (创新深色主题)
- ✅ JWT 认证系统
- ✅ 邮箱注册登录
- ✅ 可扩展 OAuth 架构
- ✅ Docker 容器化部署
- ✅ 数据持久化

### 📦 交付内容

- 完整的前后端代码
- Docker 配置文件
- 数据库表结构
- 完整文档
- 启动脚本
