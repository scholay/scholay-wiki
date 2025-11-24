# 订单管理用户信息显示更新

## 更新说明

订单管理列表已更新，将原来的"用户ID"列改为"用户信息"列，显示更详细的用户登录信息。

## 后端更新

### 1. 数据模型 (`internal/order/model.go`)
新增 `OrderWithUserInfo` 结构体，包含用户的详细登录信息：
- `username`: 用户名
- `email`: 邮箱
- `phone`: 手机号
- `wechat_name`: 微信昵称
- `wechat_union_id`: 微信 UnionID
- `github_name`: GitHub 用户名

### 2. 数据查询 (`internal/order/repository.go`)
更新 `AdminListOrders` 方法，通过 JOIN 查询获取用户的完整登录信息：
```sql
SELECT orders.*, 
       users.username, 
       users.email, 
       users.phone,
       JSON_UNQUOTE(JSON_EXTRACT(wechat_providers.provider_data, '$.nickname')) as wechat_name,
       wechat_providers.provider_user_id as wechat_union_id,
       JSON_UNQUOTE(JSON_EXTRACT(github_providers.provider_data, '$.login')) as github_name
FROM orders
LEFT JOIN users ON users.id = orders.user_id
LEFT JOIN user_auth_providers as wechat_providers 
  ON wechat_providers.user_id = orders.user_id AND wechat_providers.provider = 'wechat'
LEFT JOIN user_auth_providers as github_providers 
  ON github_providers.user_id = orders.user_id AND github_providers.provider = 'github'
WHERE orders.status = 'paid'
```

### 3. 服务层 (`internal/order/service.go`)
更新 `AdminListOrders` 方法的返回类型为 `OrderWithUserInfo`。

## 前端更新

### 1. 组件更新 (`frontend-admin/src/pages/OrderManagement.js`)

#### 新增渲染函数
```javascript
const renderUserInfo = (order) => {
  const userInfoParts = [];
  
  // 用户名（主要显示）
  const displayName = order.username || `用户${order.user_id}`;
  
  // 收集其他登录信息
  if (order.phone) userInfoParts.push(`📱 ${order.phone}`);
  if (order.email) userInfoParts.push(`📧 ${order.email}`);
  if (order.wechat_name) userInfoParts.push(`💬 ${order.wechat_name}`);
  if (order.wechat_union_id) userInfoParts.push(`🆔 ${order.wechat_union_id}`);
  if (order.github_name) userInfoParts.push(`🐙 ${order.github_name}`);
  
  return (
    <div className="user-info-cell">
      <div className="user-name">{displayName}</div>
      {userInfoParts.length > 0 && (
        <div className="user-details">
          {userInfoParts.map((info, index) => (
            <span key={index} className="user-detail-item">{info}</span>
          ))}
        </div>
      )}
    </div>
  );
};
```

#### 表格列更新
- 列标题从"用户ID"改为"用户信息"
- 使用 `renderUserInfo` 函数渲染用户信息

### 2. 样式更新 (`frontend-admin/src/pages/OrderManagement.css`)

新增样式：
```css
/* 用户信息列样式 */
.orders-table .user-info {
  max-width: 280px;
}

.user-info-cell {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.user-info-cell .user-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
  line-height: 1.3;
}

.user-info-cell .user-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.user-info-cell .user-detail-item {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  line-height: 1.4;
  word-break: break-all;
  padding: 0.1rem 0;
}

.user-info-cell .user-detail-item:not(:last-child) {
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 0.25rem;
}
```

## 显示效果

用户信息列将显示：
1. **用户名**（大字体，加粗）
2. **手机号**（如果有）：📱 13800138000
3. **邮箱**（如果有）：📧 user@example.com
4. **微信昵称**（如果有）：💬 张三
5. **微信UnionID**（如果有）：🆔 oxxxxxx
6. **GitHub用户名**（如果有）：🐙 username

每项信息之间用细线分隔，字体较小，便于一列显示多个信息。

## 数据来源

- **用户名、邮箱、手机号**：来自 `users` 表
- **微信信息**：来自 `user_auth_providers` 表（provider = 'wechat'）
- **GitHub信息**：来自 `user_auth_providers` 表（provider = 'github'）

## API 返回示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "orders": [
      {
        "id": 1,
        "user_id": 123,
        "order_no": "ORD20240101123456",
        "plan_code": "pro",
        "plan_name": "Pro",
        "billing_cycle": "monthly",
        "amount": 99.00,
        "final_amount": 89.00,
        "discount_amount": 10.00,
        "status": "paid",
        "payment_method": "alipay",
        "payment_time": "2024-01-01T12:34:56Z",
        "username": "张三",
        "email": "zhangsan@example.com",
        "phone": "13800138000",
        "wechat_name": "微信昵称",
        "wechat_union_id": "oxxxxxxxxxxxxxx",
        "github_name": "zhangsan"
      }
    ],
    "total": 100,
    "page": 1,
    "page_size": 20
  }
}
```

## 测试建议

1. 测试有完整信息的用户订单
2. 测试只有部分登录方式的用户订单
3. 测试只有用户ID没有其他信息的订单
4. 检查长文本（如邮箱）的显示效果
5. 检查移动端响应式布局
