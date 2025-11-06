# 数据库预置数据修复说明

## 问题描述

原来的SQL初始化脚本使用了`ON DUPLICATE KEY UPDATE`,导致每次Docker容器重启时,预置数据都会被重置为默认值。这意味着管理员修改的订阅计划价格、提示词模板等配置在重启后会丢失。

### 原始问题代码

```sql
-- 旧代码 (有问题)
INSERT INTO `subscription_plans` (...) VALUES (...)
ON DUPLICATE KEY UPDATE
  `plan_name` = VALUES(`plan_name`),
  `price_monthly` = VALUES(`price_monthly`),
  ...;
```

**问题**: 每次重启都会执行UPDATE,覆盖管理员的修改

## 解决方案

### 1. 分离表结构和预置数据

将SQL文件拆分为三个独立文件:

- **`01_schema.sql`** - 仅包含表结构定义
- **`02_indexes_optimization.sql`** - 性能优化索引
- **`03_seed_data.sql`** - 预置数据 (使用 INSERT IGNORE)

### 2. 使用 INSERT IGNORE

```sql
-- 新代码 (正确)
INSERT IGNORE INTO `subscription_plans` (...) VALUES (...);
```

**优势**:
- ✅ 首次启动时插入预置数据
- ✅ 重启时跳过已存在的记录,不覆盖
- ✅ 管理员修改的数据得到保留

### 3. 文件执行顺序

SQL文件按字母顺序执行:

```
01_schema.sql              → 创建所有表
02_indexes_optimization.sql → 添加性能索引
03_seed_data.sql           → 插入预置数据 (仅首次)
```

## 改进的数据

### 订阅计划预置数据

```sql
INSERT IGNORE INTO `subscription_plans`
  (`plan_code`, `plan_name`, `price_monthly`, `price_yearly`, ...)
VALUES
  ('free', 'FREE', 0.00, 0.00, ...),
  ('pro', 'PRO', 88.00, 880.00, ...),
  ('max', 'MAX', 199.00, 1990.00, ...);
```

### 提示词模板预置数据

```sql
INSERT IGNORE INTO `prompt_templates`
  (`key`, `name`, `template`, `description`, `is_active`)
VALUES
  ('paper_analysis', '论文分析总结提示词', '...', '...', 1);
```

## 验证测试

已创建测试脚本: `scripts/test-seed-data.sh`

### 测试步骤

```bash
# 在MySQL容器中运行测试
docker exec scholar_mysql bash /check-schema.sh

# 或者手动测试
docker exec -it scholar_mysql mysql -u scholar_user -pscholar_pass scholar

# 1. 查看预置数据
SELECT plan_code, plan_name, price_monthly FROM subscription_plans;

# 2. 修改数据
UPDATE subscription_plans SET price_monthly = 99.00 WHERE plan_code = 'free';

# 3. 重启容器
docker-compose restart schema-sync backend

# 4. 再次查看数据 - 应该仍然是99.00
SELECT plan_code, plan_name, price_monthly FROM subscription_plans WHERE plan_code = 'free';
```

### 预期结果

- ✅ 首次启动: 插入3个订阅计划
- ✅ 管理员修改价格: UPDATE成功
- ✅ 重启容器: 数据**不会**被覆盖
- ✅ 查询结果: 显示管理员修改后的价格

## 数据安全保障

### 应用层保护

除了SQL层面的`INSERT IGNORE`,应用代码也有保护机制:

```go
// backend/internal/admin/service.go
func (s *Service) InitializeDefaultAdmin(username, password string) error {
    // 检查是否已存在
    existing, err := s.repo.FindByUsername(username)
    if existing != nil {
        return nil // 已存在,跳过初始化
    }
    // 只在不存在时创建
    return s.repo.Create(...)
}
```

类似机制应用于:
- 默认管理员账户
- 默认隐私政策
- 默认系统配置

### 双重保护

1. **SQL层**: `INSERT IGNORE` - 避免重复插入
2. **应用层**: 先检查再创建 - 避免覆盖

## 迁移说明

### 从旧版本升级

如果您已经在运行旧版本的系统:

1. **备份数据库**:
```bash
docker exec scholar_mysql mysqldump -u scholar_user -pscholar_pass scholar > backup_$(date +%Y%m%d).sql
```

2. **停止服务**:
```bash
docker-compose down
```

3. **更新代码**:
```bash
git pull  # 或手动替换文件
```

4. **重新启动**:
```bash
docker-compose up -d --build
```

5. **验证数据**:
```bash
docker exec -it scholar_mysql mysql -u scholar_user -pscholar_pass scholar \
  -e "SELECT * FROM subscription_plans;"
```

### 已有数据会怎样?

- **已存在的记录**: `INSERT IGNORE`会跳过,完全保留
- **新增的预置数据**: 正常插入
- **管理员修改的数据**: 完全保留,不会被覆盖

## 最佳实践

### 修改预置数据的正确方法

#### ❌ 错误做法

```sql
-- 不要直接修改SQL文件中的VALUES
INSERT IGNORE INTO subscription_plans (...) VALUES
  ('free', 'FREE', 100.00, ...);  -- 修改价格
```

这样做虽然不会覆盖已存在的数据,但会造成混乱。

#### ✅ 正确做法

1. **通过管理后台修改**:
   - 登录管理后台
   - 在界面上修改价格/配置
   - 数据保存在数据库中

2. **直接修改数据库** (高级用户):
```sql
UPDATE subscription_plans
SET price_monthly = 128.00
WHERE plan_code = 'pro';
```

3. **添加新的预置数据**:
   - 编辑 `03_seed_data.sql`
   - 添加新的 `INSERT IGNORE` 语句
   - 重启容器应用新数据

### 添加新预置数据示例

```sql
-- 添加新的订阅计划
INSERT IGNORE INTO `subscription_plans`
  (`plan_code`, `plan_name`, `price_monthly`, `price_yearly`, `features`, `is_active`, `sort_order`)
VALUES
  ('enterprise', 'ENTERPRISE', 999.00, 9990.00, '{"unlimited": true}', 1, 4);

-- 添加新的提示词模板
INSERT IGNORE INTO `prompt_templates`
  (`key`, `name`, `template`, `description`, `is_active`)
VALUES
  ('new_template', '新模板', '模板内容...', '描述...', 1);
```

## 技术细节

### INSERT IGNORE vs ON DUPLICATE KEY UPDATE

| 特性 | INSERT IGNORE | ON DUPLICATE KEY UPDATE |
|------|---------------|------------------------|
| 已存在记录 | 跳过,保持原样 | **更新为新值** |
| 新记录 | 正常插入 | 正常插入 |
| 适用场景 | 预置数据 | 数据同步/更新 |
| 幂等性 | ✅ 完全幂等 | ❌ 会覆盖数据 |

### UNIQUE KEY的作用

预置数据表需要有UNIQUE约束才能使INSERT IGNORE生效:

```sql
-- subscription_plans 表
UNIQUE INDEX `idx_plan_code` (`plan_code`)

-- prompt_templates 表
UNIQUE INDEX `idx_key` (`key`)
```

有了UNIQUE约束,MySQL会:
1. 检查`plan_code`是否已存在
2. 如果存在,`INSERT IGNORE`跳过这条记录
3. 如果不存在,正常插入

## 总结

这次修复解决了数据库预置数据在容器重启后被覆盖的问题,确保了:

- ✅ 管理员修改的配置不会丢失
- ✅ 重启容器安全可靠
- ✅ 预置数据只在首次启动时生效
- ✅ 符合Docker最佳实践

现在您可以放心地修改订阅计划价格、提示词模板等配置,重启服务不会丢失任何数据!
