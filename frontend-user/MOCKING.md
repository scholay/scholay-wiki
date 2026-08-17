# Scholay 产品设计 Mock

这个分支的 `frontend-user` 默认是纯前端演示项目：浏览器内的 Mock Service Worker
接管 HTTP、SSE 与 WebSocket，请求不会转发到 5411，也不需要启动 Go、MySQL、Redis、
MinIO 或 Agent 服务。

## 启动

```bash
cd frontend-user
npm ci
npm run dev
```

打开 Vite 输出的本地地址（默认 `http://localhost:3001`）。右下角「产品设计 Mock」
控制台可以：

- 切换访客、研究者、运营和管理员身份；
- 切换正常、服务异常、登录过期和 AI 额度耗尽场景；
- 模拟即时、常规、慢网和极慢接口；
- 快速进入检索、文献集、智能助手、Prism、智能审稿、会员和后台；
- 一键复位所有可变演示数据。

默认研究者身份已经预置论文、文献文件夹、暂存区、Prism 项目、智能审稿记录、
Agent 会话、会员账单、消息、工具和 Skills。新增、编辑、移动、删除等常用操作会写入
浏览器 `localStorage`，刷新后仍保留。

## 临时连接真实后端

```bash
npm run dev:backend
```

这个命令加载 `.env.backend`，关闭 Mock Service Worker，并恢复 `/api` 到
`http://localhost:5411` 的 Vite 代理。真实后端模式和 Mock 模式共用同一个 origin 时，
重新回到 Mock 模式会由启动器覆盖鉴权身份，避免误用本机旧 token。

构建真实后端版本使用：

```bash
npm run build:backend
```

普通 `npm run build` 产出的是可独立托管的纯前端 Mock 版本。

## 工作原理

- `src/main.tsx` 先启动 Mock 和种入 persona，再动态加载 App，确保 `/admin` 首次路由守卫
  也能读取正确身份。
- `src/mocks/browser.ts` 统一接管 `/api/v1/*`；未覆盖端点返回明确的 Mock 501，
  不会穿透到真实后端。
- `src/mocks/database.ts` 提供确定性 seed、浏览器持久化和复位。
- `src/mocks/websocket.ts` 让现有 Agent WebSocket 状态机继续处理握手、心跳、流式增量、
  工具结果和完成帧。
- `index.html` 在 Mock 模式下关闭 Clarity、Umami、GA/GTM 和动态代码片段请求，避免
  React 启动前访问后端或第三方。
- `public/mockServiceWorker.js` 由 MSW 官方 CLI 生成，不手工编辑。

## 新增接口

保持页面原有 API hook 不变，在对应 Mock 域处理器中补路由：

- `core.ts`：鉴权、用户、文献集、分析、计费、消息；
- `public.ts`：论文、作者、期刊、新闻、工具、公开配置；
- `workspaces.ts`：Agent、Prism、智能审稿和流式接口；
- `admin.ts`：管理后台；
- `websocket.ts`：WebSocket 协议。

响应形态必须与调用方一致。项目里既有 `{ code, message, data }` 信封，也有 News 等裸
响应；不要用一个“万能成功对象”掩盖契约缺失。

> 本说明覆盖 `frontend-user` Web SPA。`miniprogram` 是独立的微信运行时项目，不由浏览器
> Service Worker 接管。
