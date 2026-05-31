# Scholar Backend — 命名 / 编码约定

> 这份文档把项目里"散落但有意义"的约定固化下来。新代码必须遵守, 旧代码遵循
> "改到的时候顺手改" 原则, 不批量改动 — 大批量改 JSON 字段名会破坏前端契约,
> 风险远大于收益。

## 1. JSON 字段命名

**规则**: 默认 `snake_case`。例外见下面。

| 场景 | 命名 | 理由 |
|---|---|---|
| REST 响应 / DB 映射 DTO | `snake_case` | 跟 GORM 默认列名一致, 大头惯例 |
| WS 消息 (`type`, `sessionId`, `wsToken`, `blockType`, `toolUseId` ...) | `camelCase` | agent SDK 协议本身是 camelCase, 改不动 |
| Agent / agentbridge 内部 DTO (`/api/sessions`, `/api/agents`) | `camelCase` | 跟 agent SDK HTTP 响应保持一致, 避免转换层 |

**当前历史遗留**: `peerreview` / `feedback` / `ai` 模块的部分 REST DTO 用了 `createdAt` / `updatedAt`,
跟主流的 `created_at` 不一致。**不强制迁移** — 这些模块的前端已经按 camelCase 写好类型,
强行改会触发"前后端契约破坏",成本远大于一致性收益。新加 REST DTO 时用 `snake_case`。

**自检 grep**:

```bash
grep -rEn 'json:"[a-z]+[A-Z][a-zA-Z]*"' backend/internal/ | grep -v "_test.go" | wc -l
```

数字增长 = 引入了新的 camelCase。新代码 review 时拒掉。

## 2. 错误码 / 业务码

详见 `internal/common/errcode/codes.go`。**禁止** handler 里写裸 4 位数字业务码。
跨模块共享的码 (e.g. AgentUnreachable=6001) 落 errcode 包; 模块自家的码留在模块内部 `error_codes.go`。

## 3. Context Timeout

详见 `internal/common/ctxutil/timeouts.go`。**禁止** `context.WithTimeout(context.Background(), <魔数>)`,
用 `ctxutil.With(ctxutil.QuickIO)` 这种命名档位。例外: 极特殊场景 (> 1h) 直写并加注释。

## 4. HTTP Handler Response

- 用 `utils.Success / utils.Error / utils.Unauthorized*` 等 helper, **禁止** 直接 `c.JSON(...)`
  绕过响应壳 (会丢 `request_id` 字段)
- 业务码细分时用 `utils.UnauthorizedWithCode(c, errcode.TokenRevoked, ...)`, 不用 `c.JSON(401, gin.H{...})`
- 错误码 + 文案: 错误码给前端识别业务场景, 文案给用户看 (zh-CN), 不混用

## 5. Repository / Service / Handler 分层

- Repository: DB 操作, 返回 GORM error 或自定义 `ErrXxx` 哨兵
- Service: 业务逻辑, 不接 gin.Context, 返回 `error` interface
- Handler: gin 入口, 翻译 service error → HTTP code + message
- 跨模块调用走 interface (e.g. `bootstrap.go` 里 `feedbackUserRepoAdapter`), 不直接 import 别人内部 struct

## 6. 缓存

- Redis 读写走 `internal/common/cache` 包
- 新加 cached repo 用 `cache.FetchOrLoad[T]` / `cache.FetchOrLoadSlice[T]` 通用模板,
  写路径用 `cache.InvalidateKeys(keys...)` 主动清
- key 命名: `<module>:<table>:<scope>:<key>`, e.g. `prompt_v1:by_slug:smart_search:scholay-smart-search-v1`
- TTL 用 const, **不要** 裸 `10 * time.Minute`

## 7. JWT / 鉴权

- 单 token 吊销: `utils.RevokeToken(ctx, claims)` (Logout 单端)
- 用户全部 token 吊销: `utils.RevokeUserAllTokens(ctx, userID)` (改密 / 封号 / 强制下线)
- 全量失效: 切 JWT secret (config)
- middleware 已经自动查 blacklist, 业务代码不需要手动校验

## 8. 后台任务

- 用 `safego.Go(name, fn)` 而不是裸 `go func()` —— `safego` 自带 recover 防 panic 漏到主进程
- 后台 ctx 用 `ctxutil.With(...)`, 别用裸 `context.Background()` 否则永不超时
- 长任务用 `ctxutil.BackgroundJob` (30min), 中等用 `LongIO` (5min)

---

**这份文档是"约定"不是"规则"** —— 遇到现实场景冲突时, 写明理由后破例, 比硬套约定造成的 bug 好。
