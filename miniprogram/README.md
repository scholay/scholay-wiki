# Scholay 学术 · 微信小程序端

原生小程序(WXML/WXSS/**TypeScript**),复用现有 Go 后端(与 `../backend` 同一套 REST API + JWT)。
## 当前进度(P0 骨架)

已跑通的主链路:**`wx.login` → 后端 `jscode2session` 换 JWT → 调用受保护接口**。

- `pages/login` 微信一键登录
- `pages/index` 首页 + 自测入口
- `pages/profile` 受保护接口自测(`GET /api/v1/user/profile`,证明 JWT 生效)

## 目录结构

```
miniprogram/
├── app.ts / app.json / app.wxss   # 全局
├── project.config.json            # 开发者工具工程配置(改 appid!)
├── config/env.ts                  # dev/prod BASE_URL(按 envVersion 切换)
├── services/
│   ├── request.ts                 # wx.request 封装:Bearer 注入 + BizCode 解封 + 401 清 token
│   ├── auth.ts                    # wx.login → /user/wechat/miniprogram/login → 存 token
│   └── api/user.ts                # 受保护接口示例(GET /user/profile)
├── store/auth.ts                  # token 单一真源(wx.storage,对标 Web localStorage.auth_token)
├── typings/                       # 共享/契约类型
└── pages/{index,login,profile}/   # 页面
```

## 本地运行

### 1) 后端:在管理后台配置小程序凭据(动态配置,**不写死在代码/.env**)

小程序 AppID/AppSecret 在 **mp.weixin.qq.com → 开发管理 → 开发设置** 获取,然后在**本项目管理后台**填入(单行配置,后端 `wechat_miniprogram_config` 表):

- 页面:管理后台(`/admin`)对应「微信小程序配置」入口
- 或直接调接口(需管理员 token):
  ```bash
  # 查看(AppSecret 默认脱敏,?show_sensitive=true 看明文)
  curl "http://localhost:5411/api/v1/admin/wechat-miniprogram/config" -H "Authorization: Bearer $ADMIN_TOKEN"
  # 保存并启用
  curl -X PUT "http://localhost:5411/api/v1/admin/wechat-miniprogram/config" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"app_id":"wxYOURAPPID","app_secret":"YOUR_SECRET","enabled":true}'
  ```
- ⚠️ 未启用 / 未配齐 → 后端 `Code2Session` 直接拒绝(不会打微信上游)。
- 迁移:`docker/mysql/migrations/0056_wechat_miniprogram_config.sql`(`docker compose restart schema-sync backend` 生效)。

### 2) 小程序端

```bash
cd miniprogram
npm install            # 装 miniprogram-api-typings（仅类型,不影响运行）
```

用**微信开发者工具**导入本目录:

1. `project.config.json` 里把 `"appid": "touristappid"` 改成**你的真实小程序 AppID**(必须与后台配置的一致,否则 jscode2session 不匹配)。
2. 详情 → 本地设置 → 勾选 **「不校验合法域名、web-view(业务域名)、TLS 版本以及 HTTPS 证书」**(本地打 `http://localhost:5411` 需要)。
3. 编译运行 → 首页点「微信一键登录」→ 再点「查看我的资料」验证受保护接口。

> `config/env.ts`:`envVersion==='develop'` 走 `http://localhost:5411`;体验版/正式版走 `PROD_BASE_URL`(默认 `https://api.scholay.com`,上线前按实际域名改)。

## 上线前:服务器域名白名单清单(逐条配到 mp 后台)

小程序**没有同源概念**,所有网络目标域名必须是 HTTPS + 已备案 + 登记白名单。四类合计每月约 50 次修改额度,**一次配齐**:

| 类别 | 用途 | 需登记 |
|---|---|---|
| **request 合法域名** | 所有 `wx.request`(REST) | 你的 API 域名(建议 `https://api.scholay.com`) |
| **socket 合法域名** | 智能搜索/助手 WS(P2) | 同域 `wss://...` |
| **uploadFile 合法域名** | 文献 PDF / 附件上传(P1+) | 上传目标域名 |
| **downloadFile 合法域名** | 文件/图片下载(P1+) | 下载目标域名 |

其他上线前置(详见立项报告 三/七):**内容安全 `msgSecCheck`**(AI 输出+UGC 强制过检)、生产 TLS 证书、**小程序绑定到同一微信开放平台账号**(否则拿不到 unionid、无法与 PC 扫码同号)、小程序 appid 与商户号 mchid 绑定(JSAPI 支付 P1)。

## 后端对接点(已就绪)

| 端点 | 说明 |
|---|---|
| `POST /api/v1/user/wechat/miniprogram/login` | 小程序一键登录(公开;body `{code}`) |
| `GET/PUT /api/v1/admin/wechat-miniprogram/config` | 管理后台动态配置 AppID/AppSecret/开关 |
| `GET /api/v1/user/profile` 等全部受保护 REST | 带 `Authorization: Bearer <token>` 即可复用 |

## 下一步(P0 续)

搜索/详情/资讯等只读页(纯 `wx.request`)→ 对照 `../frontend-user/src/features/{search,journals,news}` 的请求契约补 `services/api/*.ts` 与页面。markdown 正文用 `mp-html`(见立项报告决策 12)。
