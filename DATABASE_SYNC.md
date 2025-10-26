# 数据库自动同步机制

## 概述

本项目实现了**完全自动化的数据库结构同步机制**。每次启动项目时,系统会自动将 `docker/mysql/init/` 目录下的SQL文件同步到数据库中。

## 工作原理

### 启动流程

```
docker-compose up -d --build
    ↓
1. MySQL 容器启动
    ↓
2. schema-sync 服务自动运行
    ↓
3. 执行 check-schema.sh 脚本
    ↓
4. 自动同步所有 init/*.sql 文件到数据库
    ↓
5. Backend 服务启动(确保schema已同步)
    ↓
6. Frontend 服务启动
```

### 核心特性

✅ **自动同步**: 每次启动自动执行,无需手动干预
✅ **增量更新**: 使用 `CREATE TABLE IF NOT EXISTS`,不会影响现有数据
✅ **安全性**: 只读挂载SQL文件,防止意外修改
✅ **幂等性**: 多次执行相同结果
✅ **顺序执行**: 按文件名顺序执行(如 01_schema.sql, 02_data.sql)

## 使用方法

### 添加新表

1. 编辑 `docker/mysql/init/01_schema.sql`
2. 添加新表定义(使用 `CREATE TABLE IF NOT EXISTS`)

```sql
-- 示例: 添加新表
CREATE TABLE IF NOT EXISTS `papers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(500) NOT NULL,
  `abstract` TEXT,
  `authors` JSON,
  `publish_date` DATE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_publish_date` (`publish_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Academic papers table';
```

3. 重启项目

```bash
docker-compose up -d --build
```

4. 查看同步日志

```bash
docker logs scholar_schema_sync
```

### 修改现有表结构

1. 在 `01_schema.sql` 中添加 ALTER TABLE 语句

```sql
-- 示例: 添加新列
ALTER TABLE `users`
ADD COLUMN IF NOT EXISTS `bio` TEXT COMMENT 'User biography';

-- 示例: 添加索引
CREATE INDEX IF NOT EXISTS `idx_email_verified` ON `users` (`email_verified`);
```

2. 重启项目即可自动同步

```bash
docker-compose restart schema-sync backend
```

### 添加初始数据

1. 创建新的SQL文件 `docker/mysql/init/02_seed_data.sql`

```sql
-- 示例: 插入测试数据
INSERT IGNORE INTO `papers` (`id`, `title`, `abstract`) VALUES
  (1, 'Sample Paper 1', 'This is a sample abstract'),
  (2, 'Sample Paper 2', 'Another sample abstract');
```

2. 重启项目

```bash
docker-compose up -d
```

## 文件命名规范

SQL文件按**字母顺序**执行,建议使用数字前缀:

```
docker/mysql/init/
├── 01_schema.sql        # 表结构定义
├── 02_seed_data.sql     # 初始数据
├── 03_indexes.sql       # 索引优化
└── 99_procedures.sql    # 存储过程
```

## SQL 编写规范

### ✅ 推荐写法

```sql
-- 创建表 - 使用 IF NOT EXISTS
CREATE TABLE IF NOT EXISTS `table_name` (...);

-- 添加列 - MySQL 8.0.23+ 支持
ALTER TABLE `users`
ADD COLUMN IF NOT EXISTS `new_column` VARCHAR(255);

-- 创建索引
CREATE INDEX IF NOT EXISTS `idx_name` ON `table` (`column`);

-- 插入数据 - 使用 IGNORE 避免重复
INSERT IGNORE INTO `table` VALUES (...);
```

### ❌ 避免使用

```sql
-- 不要使用 DROP TABLE
DROP TABLE `users`;  -- ❌ 会删除数据!

-- 不要直接 ALTER TABLE 而不检查
ALTER TABLE `users` ADD COLUMN `email` VARCHAR(100);  -- ❌ 可能重复执行失败

-- 不要直接 INSERT 而不检查
INSERT INTO `table` VALUES (...);  -- ❌ 可能产生重复数据
```

## 查看同步状态

### 查看同步日志

```bash
# 查看最近一次同步日志
docker logs scholar_schema_sync

# 实时查看
docker logs -f scholar_schema_sync
```

### 手动触发同步

```bash
# 重启同步服务
docker-compose restart schema-sync

# 或者完全重建
docker-compose up -d --force-recreate schema-sync
```

### 验证数据库结构

```bash
# 进入数据库
docker exec -it scholar_mysql mysql -u scholar_user -pscholar_pass scholar

# 查看所有表
SHOW TABLES;

# 查看表结构
DESCRIBE users;
SHOW CREATE TABLE users;

# 查看表行数
SELECT
  TABLE_NAME,
  TABLE_ROWS
FROM
  INFORMATION_SCHEMA.TABLES
WHERE
  TABLE_SCHEMA = 'scholar';
```

## 迁移现有数据库

如果需要从现有数据库导出结构:

```bash
# 1. 导出表结构(不包含数据)
docker exec scholar_mysql mysqldump \
  -u scholar_user -pscholar_pass \
  --no-data \
  --skip-add-drop-table \
  scholar > docker/mysql/init/01_schema.sql

# 2. 手动编辑,将 CREATE TABLE 改为 CREATE TABLE IF NOT EXISTS

# 3. 重启项目验证
docker-compose down -v
docker-compose up -d --build
```

## 故障排查

### 问题: 同步失败

**查看错误日志**
```bash
docker logs scholar_schema_sync
```

**常见原因**:
- SQL语法错误
- 权限不足
- 表已存在但结构冲突

### 问题: 表没有创建

**检查SQL文件**
```bash
ls -la docker/mysql/init/
cat docker/mysql/init/01_schema.sql
```

**确认文件挂载**
```bash
docker exec scholar_schema_sync ls -la /docker-entrypoint-initdb.d/
```

### 问题: 需要重置数据库

```bash
# ⚠️ 警告: 这会删除所有数据!
docker-compose down -v
docker-compose up -d --build
```

## 最佳实践

### 1. 版本控制
将所有SQL文件纳入Git版本控制:
```bash
git add docker/mysql/init/*.sql
git commit -m "Add papers table schema"
```

### 2. 备份重要数据
修改表结构前先备份:
```bash
docker exec scholar_mysql mysqldump \
  -u scholar_user -pscholar_pass \
  scholar > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 3. 测试环境验证
在测试环境先验证SQL:
```bash
# 测试环境
docker-compose -f docker-compose.test.yml up -d

# 验证无误后再部署到生产环境
```

### 4. 使用事务
对于复杂的迁移,使用事务:
```sql
START TRANSACTION;

-- 你的迁移语句
ALTER TABLE `users` ADD COLUMN `status` TINYINT;
UPDATE `users` SET `status` = 1;

COMMIT;
```

## 高级用法

### 条件性迁移

```sql
-- 只在列不存在时添加
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'scholar'
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'bio'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN bio TEXT',
  'SELECT "Column already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

### 数据迁移脚本

```sql
-- 03_data_migration.sql
-- 迁移旧数据到新结构

-- 示例: 拆分全名为姓和名
UPDATE users
SET
  first_name = SUBSTRING_INDEX(full_name, ' ', 1),
  last_name = SUBSTRING_INDEX(full_name, ' ', -1)
WHERE
  first_name IS NULL
  AND full_name IS NOT NULL;
```

## 总结

通过这套自动同步机制,你可以:

✅ **完全无感知的数据库升级** - 只需修改SQL文件,重启即可
✅ **保证团队协作一致性** - 所有人使用相同的数据库结构
✅ **简化部署流程** - 生产环境部署时自动同步
✅ **降低出错风险** - 避免手动执行SQL的人为错误

**记住**: 只需编辑 `docker/mysql/init/*.sql`,然后 `docker-compose up -d --build` 即可! 🚀
