# 微信 UnionID 实现说明

## 概述

为了在订单管理中正确显示微信用户信息，我们添加了对微信 UnionID 的完整支持。UnionID 是微信提供的跨应用用户标识，可以在同一开放平台账号下的不同应用中识别同一用户。

## 数据库变更

### 新增字段

在 `user_auth_providers` 表中新增字段：

```sql
ALTER TABLE `user_auth_providers` 
ADD COLUMN `provider_union_id` VARCHAR(255) 
COMMENT '第三方平台联合ID（微信UnionID，用于跨应用识别同一用户）' 
AFTER `provider_user_id`;
```

### 索引

```sql
-- 唯一索引：确保同一个 UnionID 不会绑定到多个用户
CREATE UNIQUE INDEX `uk_provider_union` 
ON `user_auth_providers` (`provider`, `provider_union_id`);

-- 普通索引：优化查询性能
CREATE INDEX `idx_union_id` 
ON `user_auth_providers` (`provider_union_id`);
```

### 字段说明

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `provider_user_id` | VARCHAR(255) | 第三方平台用户ID，微信为 openID | `oxxxxxx` |
| `provider_union_id` | VARCHAR(255) | 第三方平台联合ID，微信为 UnionID | `oGxxxxxx` |

## Go 模型更新

### UserAuthProvider 结构体

```go
type UserAuthProvider struct {
    ID              uint      `gorm:"primaryKey" json:"id"`
    UserID          uint      `gorm:"not null" json:"user_id"`
    Provider        string    `gorm:"not null;size:20" json:"provider"`
    ProviderUserID  string    `gorm:"not null;size:255" json:"provider_user_id"` // 微信为 openID
    ProviderUnionID *string   `gorm:"size:255" json:"provider_union_id"` // 微信 UnionID
    ProviderData    *string   `gorm:"type:json" json:"provider_data"`
    CreatedAt       time.Time `json:"created_at"`
    UpdatedAt       time.Time `json:"updated_at"`
}
```

## 业务逻辑

### 登录/注册流程

1. **查找用户**：
   - 优先通过 `provider_union_id` 查找（如果有 UnionID）
   - 如果没找到，再通过 `provider_user_id`（openID）查找
   - 这样可以兼容历史数据

2. **新用户注册**：
   ```go
   authProvider = &UserAuthProvider{
       UserID:          user.ID,
       Provider:        "wechat",
       ProviderUserID:  openID,      // openID 作为主要标识
       ProviderUnionID: &unionID,    // UnionID 作为跨应用标识
       ProviderData:    &providerDataJSON,
   }
   ```

3. **历史用户迁移**：
   - 历史用户首次登录时，如果 `provider_union_id` 为空且有 UnionID，自动更新
   ```go
   if authProvider.ProviderUnionID == nil && unionID != "" {
       authProvider.ProviderUnionID = &unionID
       _ = s.repo.UpdateAuthProvider(authProvider)
   }
   ```

### 绑定微信流程

检查重复绑定时，同时检查 openID 和 UnionID：

```go
// 检查 openID
existing, err := s.repo.FindAuthProviderByProviderAndProviderUserID("wechat", openID)

// 检查 UnionID
if unionID != "" {
    existingByUnionID, err := s.repo.FindAuthProviderByUnionID("wechat", unionID)
}
```

## Repository 新增方法

```go
// FindAuthProviderByUnionID 通过 UnionID 查找用户认证信息
func (r *Repository) FindAuthProviderByUnionID(provider, unionID string) (*UserAuthProvider, error) {
    var authProvider UserAuthProvider
    err := r.db.Where("provider = ? AND provider_union_id = ?", provider, unionID).First(&authProvider).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &authProvider, err
}
```

## 订单管理显示

在订单列表中，现在可以正确显示微信 UnionID：

```sql
SELECT 
    orders.*, 
    users.username, 
    users.email, 
    users.phone,
    JSON_UNQUOTE(JSON_EXTRACT(wechat_providers.provider_data, '$.nickname')) as wechat_name,
    wechat_providers.provider_union_id as wechat_union_id,
    JSON_UNQUOTE(JSON_EXTRACT(github_providers.provider_data, '$.login')) as github_name
FROM orders
LEFT JOIN users ON users.id = orders.user_id
LEFT JOIN user_auth_providers as wechat_providers 
    ON wechat_providers.user_id = orders.user_id 
    AND wechat_providers.provider = 'wechat'
```

## 兼容性保证

### 向后兼容

✅ **历史用户不受影响**：
- 旧用户的 `provider_union_id` 为 NULL
- 仍然可以通过 `provider_user_id`（openID）正常登录
- 首次登录后自动迁移，填充 UnionID

✅ **查询逻辑**：
- 先查 UnionID（如果有）
- 再查 openID（向后兼容）
- 两种方式都能找到用户

✅ **唯一索引**：
- NULL 值不参与唯一性检查
- 不会影响历史记录

### 数据迁移

迁移脚本已包含在 `02_add_union_id.sql` 中：

```sql
-- 自动迁移脚本（幂等操作）
ALTER TABLE `user_auth_providers` 
ADD COLUMN IF NOT EXISTS `provider_union_id` VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS `uk_provider_union` 
ON `user_auth_providers` (`provider`, `provider_union_id`);

CREATE INDEX IF NOT EXISTS `idx_union_id` 
ON `user_auth_providers` (`provider_union_id`);
```

## 测试场景

### 1. 新用户首次登录
- ✅ 保存 openID 到 `provider_user_id`
- ✅ 保存 UnionID 到 `provider_union_id`
- ✅ 可以通过任一标识登录

### 2. 历史用户登录
- ✅ 通过 openID 找到用户
- ✅ 自动更新 UnionID
- ✅ 下次可以通过 UnionID 登录

### 3. 绑定微信
- ✅ 检查 openID 是否已绑定
- ✅ 检查 UnionID 是否已绑定
- ✅ 防止重复绑定

### 4. 订单管理显示
- ✅ 显示微信昵称
- ✅ 显示微信 UnionID
- ✅ NULL 值正常处理

## 部署步骤

### 1. 数据库升级

```bash
# 连接到数据库
mysql -u root -p scholar

# 执行迁移脚本
source /path/to/02_add_union_id.sql
```

### 2. 应用部署

```bash
# 重新构建后端
cd backend
go build -o scholar-backend cmd/server/main.go

# 重启服务
systemctl restart scholar-backend
```

### 3. 验证

```sql
-- 检查字段是否添加成功
DESC user_auth_providers;

-- 检查索引是否创建成功
SHOW INDEX FROM user_auth_providers;

-- 查看微信用户数据
SELECT 
    id, user_id, provider, 
    provider_user_id, provider_union_id 
FROM user_auth_providers 
WHERE provider = 'wechat' 
LIMIT 10;
```

## 注意事项

1. **UnionID 获取条件**：
   - 微信开放平台账号下的应用才能获取 UnionID
   - 公众号需要绑定到开放平台
   - 个人开发者可能无法获取

2. **NULL 处理**：
   - `provider_union_id` 允许为 NULL
   - 查询时需要处理 NULL 情况
   - 唯一索引会忽略 NULL 值

3. **性能优化**：
   - 添加了索引优化查询
   - 登录时优先查询 UnionID（如果有）
   - 避免重复查询

4. **数据一致性**：
   - 同一 UnionID 只能绑定一个用户
   - 通过唯一索引保证
   - 绑定前需要检查

## FAQ

**Q: 历史用户的 UnionID 什么时候更新？**
A: 用户下次登录时自动更新。

**Q: 如果获取不到 UnionID 怎么办？**
A: `provider_union_id` 字段允许为 NULL，系统会继续使用 openID。

**Q: UnionID 和 OpenID 的区别？**
A: 
- OpenID: 用户在单个公众号/小程序中的唯一标识
- UnionID: 用户在同一开放平台账号下所有应用中的唯一标识

**Q: 为什么不直接用 UnionID 替换 OpenID？**
A: 为了向后兼容，保留 OpenID 作为主标识，UnionID 作为补充。
