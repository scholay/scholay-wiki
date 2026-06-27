# 契约测试(FE↔BE 漂移守卫)

本项目**没有**代码生成:`swagger.json` 随 Semantic Scholar 集成下线已不存在,`openapi-typescript`
生成链路于 2026-06 移除(见 [../../CLAUDE.md](../../CLAUDE.md) §3.6)。前端类型全部**手写镜像**后端
Go struct。手写镜像的致命弱点是「后端改字段 → 前端静默 `undefined`」,且编译期/请求期都没有信号。

这里用 [`zod`](https://zod.dev) 把**行为关键**的契约(驱动 UI 分支的那些:error code 表、额度信号、
计费总览、分页信封)钉死,对照**录制的真实后端响应**校验,漂移直接在 CI fail。

## 跑

```bash
npm run test:contract        # = vitest run --dir tests/contract
```

两类断言:
1. **常量类**(无需后端):`http.ts` 的 `BizCode` 必须等于 `schemas.ts` 的 `CANONICAL_BIZ_CODES`
   (后者是 `backend/internal/common/errcode/codes.go` 的真值镜像)。任一侧改号、另一侧没跟 → fail。
   `quota-events.ts` 的 `isQuotaSignal` 必须同时认数字 `6010` 和 WS 字符串 `quota_exceeded`。
2. **形态类**(对照 `fixtures/`):录制的后端响应必须满足 FE 依赖的 zod schema。

## 刷新 fixtures(让契约对照真值,而非手写 seed)

`fixtures/*.json` 初始是**手写 seed**(贴合当时的 Go struct)。要真正发挥守卫作用,定期用真实后端刷新:

```bash
# 本地起好 docker、用真实账号登录,从浏览器 localStorage.auth_token 取 JWT
BASE_URL=http://localhost:5411/api/v1 TOKEN=<jwt> node tests/contract/record.mjs
git diff tests/contract/fixtures/   # 后端动了字段就能看到
npm run test:contract               # schema 跟不上就 fail,提示同步前端 interface + schema
```

WS 帧(`ws-error-quota.json`)无法用 HTTP 录制 —— 触发一次额度耗尽、从真实 WS 抓一帧手动更新。

## 加新契约

某个端点的响应开始驱动 UI 分支(显隐、跳转、付费墙、额度墙……)时:
1. 在对应 `src/**/api/*.ts` 写/改 interface(文件头注释配对的 Go struct 路径);
2. 在 [`schemas.ts`](./schemas.ts) 加 zod schema(注释 `// source: backend/...`);
3. 在 [`record.mjs`](./record.mjs) 的 `targets` 加一行,录一份 fixture;
4. 在 [`contract.test.ts`](./contract.test.ts) 加一条断言。
