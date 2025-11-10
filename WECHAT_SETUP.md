# 微信登录配置指南

## 问题说明

微信登录功能已经实现，但需要配置微信OAuth才能正常工作。

## 已修复的问题

### 1. 路由保护问题（已修复 ✓）

**问题**：`/wechat/callback` 路由被 `ProtectedRoute` 包裹，导致未登录用户扫码后无法访问回调页面，造成登录死循环。

**修复**：将 `/wechat/callback` 改为公开路由，允许未登录用户访问以完成OAuth流程。

```javascript
// 修复前（错误）
<Route path="/wechat/callback" element={
  <ProtectedRoute>
    <WeChatCallback />
  </ProtectedRoute>
} />

// 修复后（正确）
<Route path="/wechat/callback" element={<WeChatCallback />} />
```

### 2. 缺少微信OAuth配置

**问题**：数据库 `wechat_configs` 表为空，导致生成登录URL失败。

**需要配置**：通过管理后台添加微信OAuth配置。

## 配置步骤

### 前置条件

1. 拥有微信开放平台账号（https://open.weixin.qq.com）
2. 已创建网站应用并获得审核通过
3. 获取到 AppID 和 AppSecret

### 步骤1：登录管理后台

访问管理后台：http://localhost:5455

默认账号：
- 用户名：`admin`
- 密码：`adminadmin`

### 步骤2：添加微信OAuth配置

1. 进入「系统设置」→「微信配置」
2. 点击「新增配置」
3. 填写以下信息：
   - **App ID**：从微信开放平台获取
   - **App Secret**：从微信开放平台获取
   - **Redirect URI**：`http://yourdomain.com/wechat/callback` 或本地测试用 `http://localhost:5411/wechat/callback`
   - **Scope**：保持默认 `snsapi_login`（网页扫码登录）
   - **是否启用**：勾选
4. 保存配置

### 步骤3：在微信开放平台配置回调域名

1. 登录微信开放平台
2. 进入你的网站应用
3. 在「授权回调域」中添加：
   - 生产环境：`yourdomain.com`
   - 测试环境：`localhost:5411` 或 `127.0.0.1:5411`

**注意**：微信不支持 `http://localhost` 作为回调域名，需要使用IP或真实域名。

### 步骤4：测试微信登录

1. 访问用户端：http://localhost:5411
2. 点击「微信登录」
3. 扫描二维码
4. 确认授权
5. 自动跳转回首页并完成登录

## 测试用配置（仅供开发测试）

如果你需要快速测试但没有真实的微信OAuth配置，可以通过API直接插入测试配置：

```bash
# 插入测试配置（请替换为真实的AppID和AppSecret）
docker exec scholar_mysql mysql -u scholar_user -pscholar_pass scholar -e "
INSERT INTO wechat_configs (app_id, app_secret, redirect_uri, scope, is_active, created_at, updated_at)
VALUES ('YOUR_APP_ID', 'YOUR_APP_SECRET', 'http://localhost:5411/wechat/callback', 'snsapi_login', true, NOW(), NOW());
"
```

## 技术实现说明

### 后端实现

- **微信服务**：`backend/internal/wechat/`
  - `handler.go`：处理获取登录URL、配置管理
  - `service.go`：微信OAuth核心逻辑（获取access_token、用户信息）
  - `repository.go`：数据库操作

- **用户服务**：`backend/internal/user/`
  - `handler.go`：`WeChatCallback()` 处理微信回调
  - `service.go`：`LoginOrRegisterWithWeChat()` 自动注册/登录

### 前端实现

- **路由配置**：`frontend-user/src/App.js`
  - `/wechat/callback` - 公开路由（不需要登录）

- **回调处理**：`frontend-user/src/pages/WeChatCallback.js`
  - 接收 `code` 和 `state` 参数
  - 调用后端 `/api/v1/user/wechat/callback`
  - 保存token和用户信息
  - 更新AuthContext
  - 跳转到首页

- **API服务**：`frontend-user/src/services/api.js`
  - `getWeChatLoginURL()`：获取登录URL
  - `wechatCallback(code, state)`：处理回调
  - `bindWeChatAccount(code, state)`：绑定微信账号

### OAuth流程

1. **用户点击微信登录**
   - 前端调用 `GET /api/v1/user/wechat/login-url`
   - 后端生成随机state，返回微信二维码URL
   - 前端保存state到localStorage并打开新窗口

2. **用户扫码授权**
   - 微信重定向到 `redirect_uri?code=xxx&state=yyy`
   - 前端 `WeChatCallback` 组件接收参数

3. **后端处理回调**
   - 验证state（防止CSRF）
   - 用code换取access_token和openid
   - 用access_token获取用户信息
   - 查询用户是否存在：
     - 存在 → 登录
     - 不存在 → 自动注册并登录
   - 返回JWT token和用户信息

4. **前端完成登录**
   - 保存token到localStorage
   - 更新AuthContext
   - 跳转到首页

### 安全机制

1. **State验证**：防止CSRF攻击
2. **HTTPS强制**：生产环境必须使用HTTPS
3. **Token过期**：Access token有效期2小时
4. **Session管理**：JWT token + Redis session

## 常见问题

### Q1：点击微信登录后报错「Failed to generate login URL」

**原因**：数据库中没有配置微信OAuth或配置未启用

**解决**：按照上述步骤添加微信配置

### Q2：扫码后跳转到首页但没有登录

**原因**：这是本次修复的主要问题，`/wechat/callback` 路由被保护导致无法访问

**解决**：已修复，重启前端服务即可

### Q3：微信回调时报错「redirect_uri参数错误」

**原因**：
1. 微信开放平台未配置回调域名
2. 配置的redirect_uri与代码中不一致

**解决**：
1. 确保微信开放平台已添加回调域名
2. 检查数据库中的redirect_uri与微信配置一致

### Q4：开发环境如何测试微信登录？

**方法1**：使用ngrok等内网穿透工具
```bash
ngrok http 5411
# 将生成的https URL配置到微信开放平台
```

**方法2**：使用测试域名
- 配置hosts文件指向本地
- 使用Nginx配置SSL证书

### Q5：生产环境部署注意事项

1. **修改.env配置**：
   - 确保 `HTTP_PORT` 和 `ADMIN_PORT` 正确
   - 修改 `JWT_SECRET` 为强密码

2. **配置HTTPS**：
   - 更新Nginx配置添加SSL证书
   - 微信OAuth必须使用HTTPS

3. **更新redirect_uri**：
   - 将数据库中的redirect_uri更新为生产环境URL
   - 在微信开放平台添加生产域名

4. **修改默认密码**：
   - 登录后立即修改admin账号密码

## 附录：API接口说明

### 获取登录URL
```http
GET /api/v1/user/wechat/login-url
Response: {
  "code": 0,
  "data": {
    "login_url": "https://open.weixin.qq.com/connect/qrconnect?...",
    "state": "1699999999999"
  }
}
```

### 微信回调
```http
POST /api/v1/user/wechat/callback
Body: {
  "code": "xxx",
  "state": "yyy"
}
Response: {
  "code": 0,
  "data": {
    "token": "jwt_token",
    "user": {...},
    "is_new_user": true
  }
}
```

### 绑定微信账号（需要登录）
```http
POST /api/v1/user/bind-wechat
Headers: Authorization: Bearer <token>
Body: {
  "code": "xxx",
  "state": "yyy"
}
Response: {
  "code": 0,
  "message": "微信账号绑定成功"
}
```

### 解绑微信账号（需要登录）
```http
POST /api/v1/user/unbind-wechat
Headers: Authorization: Bearer <token>
Response: {
  "code": 0,
  "message": "微信账号解绑成功"
}
```

## 更新日志

- **2025-11-10**：修复 `/wechat/callback` 路由保护问题，添加配置文档
