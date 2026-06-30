# frontend-user 架构与开发约束

工作在 `frontend-user/` 下时自动加载。当前项目唯一一份前端(旧 CRA 版 `frontend-user-old/` 已于 2026-05-28 整体删除)。

目标:**职责清晰、解耦、可扩展、不重复造轮子**。

---

## 〇、第一原则

> **能用成熟第三方包,绝不自己手写。**

新增功能前先问三个问题:
1. shadcn/Radix/TanStack/Zustand/我们已装的包能搞定吗?
2. 社区有没有 1k+ star 的轻量库直接做这件事?
3. 真的需要自研吗?(>50 行业务无关基础设施代码 = 危险信号)

只在以下情况自研:
- 业务规则 / 业务组件
- 对接 Scholay 后端的 API 封装
- 把第三方组件包装成符合本项目设计的样式适配层

**禁止自研清单**(见下面 §2 第三方约定的"已有方案")。

---

## 一、目录与分层

```
src/
├── app/                      入口层 — 路由 / Provider / 全局 Layout
│   ├── App.tsx               
│   ├── providers.tsx         QueryClient / Helmet / Tooltip / Toaster
│   ├── router.tsx            createBrowserRouter,lazy 接入 feature 路由
│   └── layouts/              全局壳(AppShell / WorkspaceShell)
├── features/<domain>/        业务域(library / prism / peer-review / ...)
│   ├── routes.tsx            本 feature 的子路由(lazy 暴露给 app/router)
│   ├── pages/                页面组件
│   ├── components/           本 feature 私有的组件
│   ├── hooks/                本 feature 私有的 hooks
│   ├── api/                  本 feature 的 API 调用(返回 react-query hook)
│   └── types.ts              本 feature 的类型
├── shared/                   跨域可复用
│   ├── ui/                   纯样式原子(shadcn 风格,不含业务)
│   ├── components/           业务无关的 composite(Sidebar 全家桶 / EmptyState / ...)
│   ├── hooks/                通用 hooks(useDebounce / useHotkey / ...)
│   ├── lib/                  工具函数 + http 实例
│   └── api/                  手写 interface(文件头注释配对的后端 Go struct 路径)
├── stores/                   跨域客户端状态(zustand slice 一个文件一个)
├── styles/                   globals.css + 主题 token
└── types/                    跨域共享的纯类型
```

### 依赖方向(单向,不允许反向)

```
features → shared → (ui / hooks / lib)
features → stores
features → app/layouts
app      → features (只在 router 里)

shared/components → shared/ui + shared/hooks + shared/lib
shared/ui        → shared/lib (utils.ts 的 cn 之外不允许其他)
shared/hooks     → 无依赖(纯 React)
shared/lib       → 无依赖(纯 TS)
```

**绝对禁止**:
- `shared/` 任何文件 import `features/` 任何东西
- 任意 feature import 其他 feature(跨 feature 复用 = 提到 shared/)
- `shared/ui` 引用 `shared/components`
- `stores/` 引用 `features/` / `shared/components/`

---

## 二、第三方包约定

### 已装 + 必用(不要再装同类)

| 用途 | 用什么 | 不要 |
|---|---|---|
| 路由 | `react-router-dom` v7 | TanStack Router、自研 |
| 服务端状态 | `@tanstack/react-query` v5 | SWR、自研 fetch hook、Redux Toolkit Query |
| 客户端状态 | `zustand` v5 | Redux、Jotai、Context-based store |
| 表单 | `react-hook-form` + `zod` + `@hookform/resolvers` | Formik、自研 useForm |
| HTTP | `axios`(经 `shared/lib/http.ts`)| fetch 裸调、自创 client、各组件自己创实例 |
| API 类型 | 手写 interface + 文件头注释配对后端 Go struct 路径;行为关键契约进 `tests/contract/` | 凭记忆瞎写、不标真源(swagger 生成链路已废,见 §3.6) |
| UI 原子 | `@radix-ui/*` + `class-variance-authority` + `tailwind-merge` | MUI、Antd、Chakra、自研 |
| 样式 | `tailwindcss` v4 + CSS 变量(globals.css) | styled-components、emotion、CSS modules、内联 style |
| 动画(复杂/手势/出入场) | `framer-motion` v12 | 自研 keyframe / GSAP / react-spring |
| 动画(列表自动过渡) | `@formkit/auto-animate` —— 父元素 ref,子元素增删改/重排自动平滑 | 用 framer-motion 包裹每个 li |
| 动画(CSS keyframe utility) | `tw-animate-css` | 手写 .css |
| 走马灯 / 触控 carousel | `embla-carousel-react`(shadcn 官方选择) | 自研 slider、react-slick |
| 表格 | `@tanstack/react-table` v8 | 自研、Antd Table |
| 虚拟列表 | `@tanstack/react-virtual` | react-window(已在 v1)、自研 |
| 拖拽 | `@dnd-kit/*` | react-dnd、HTML5 原生 |
| 图标 | `lucide-react` | 自定 SVG(除非品牌 logo) |
| 命令面板 | `cmdk` | 自研 |
| 弹层 | shadcn Dialog/Popover/DropdownMenu/Tooltip(基于 Radix) | 自研 portal |
| Toast | `sonner` | 自研 |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` + `rehype-katex` | 自研解析 |
| 数学公式 | `katex` + `rehype-katex` | MathJax |
| PDF | `react-pdf` + `pdfjs-dist` | 自研 worker |
| 编辑器(LaTeX) | `@codemirror/*` | Monaco、自研 |
| 图(引用网络) | `@xyflow/react` | D3 手搓、cytoscape |
| 图表(折线/柱状/饼图) | `recharts` —— admin 仪表板 / 用户分析 / umami analytics 都用 | D3 手搓、chart.js |
| 树 | `react-arborist` | 自研 |
| 多窗格 | `react-resizable-panels`(经 `shared/ui/resizable.tsx`) | 自研 split-pane |
| 日期 | `date-fns` | dayjs、moment |
| 实用函数 | `lodash-es` 按需 import | 自研 deepClone/throttle/... |
| 校验 | `zod` | yup、joi、自写校验 |
| SEO meta | `react-helmet-async` | 自研 head 注入 |
| 人机校验 | `@marsidev/react-turnstile` | 自研 |

### 新增依赖的门槛

往 `package.json` 加包前,**必须**:
1. 在上面表格里没出现过同类项
2. 包的周下载量 ≥ 10k 或 GitHub star ≥ 1k(避免依赖朝不保夕)
3. 维护活跃(近 6 个月有 commit)
4. 体积可控(单包 minified+gzip ≤ 50KB,超过要做 dynamic import)
5. 在 PR 描述里说明:为什么不能用现有的

---

## 三、网络层(server state)

### 唯一入口:TanStack Query + axios

```
组件 → useXxxQuery / useXxxMutation (feature/api)
              ↓
       http (shared/lib/http.ts, axios 实例)
              ↓
         Nginx /api/*
              ↓
            Backend
```

### 强约定

1. **业务 API 写在 `features/<domain>/api/*.ts`,导出 react-query hooks,不导出裸 fetch 函数。**
   ```ts
   // features/library/api/papers.ts
   export function usePapers(folderId: number) {
     return useQuery({
       queryKey: ['library', 'papers', folderId],
       queryFn: () => http.get(`/library/folders/${folderId}/papers`).then(r => r.data),
     });
   }
   ```

2. **queryKey 命名遵循 `[feature, resource, ...params]` 三段式**,便于 invalidateQueries。

3. **Mutation 成功后用 `queryClient.invalidateQueries({ queryKey: ['library'] })` 批量失效**,不要手动 setQueryData(除非有特殊乐观更新需求)。

4. **不允许在组件 / store 里写 `axios.xxx`**。所有 HTTP 必须经 `shared/lib/http.ts` 的 `http` 实例。

5. **错误用 `toApiError(err)` 提取**,Toast 由调用方决定要不要弹(避免到处 setError state)。

6. **API 类型手写,但必须单一真源化(代码生成链路已废)**。历史上本项目计划用 `openapi-typescript` 从 `swagger.json` 生成 `schema.d.ts`,但 `swagger.json` 随 Semantic Scholar 集成下线后已不存在,`gen:api` 形同虚设 —— 已于 2026-06 移除该脚本与 `openapi-typescript`/`openapi-fetch` 依赖。现行约定:
   - 每个 `api/*.ts` 在**文件头注释**标注它镜像的后端 Go struct 真源,例如 `// mirrors backend/internal/vip/quota.go Overview`;改字段时**两侧一起改**。
   - **行为关键的契约**(error code 表 / 额度信号 / 分页信封等驱动 UI 分支的)由 `tests/contract/` 下的 zod 用例对**真实录制的后端响应**做校验,漂移在 CI `npm run test:contract` 直接 fail —— 把「后端改了字段、前端静默 undefined」挡在构建期而不是用户屏幕上。
   - 新增此类契约时,既在 TS 写 interface,也在 `tests/contract/` 加/更新对应 zod schema + fixture。

7. **SSE 流式接口用原生 EventSource**,不要装 SSE 库;封装放 `features/<feature>/api/streams.ts`。

8. **WebSocket 用原生 WebSocket API**,不要装 socket.io-client(后端用的是 gorilla 不兼容)。

---

## 四、状态管理(按类型分流)

| 类型 | 用什么 | 例 |
|---|---|---|
| 服务端数据 | TanStack Query | 论文列表、用户配额、订阅信息 |
| 跨页面客户端状态 | Zustand slice in `stores/` | auth token、theme、全局 modal 开关 |
| 表单 | react-hook-form + zod | 登录、设置、投稿表单 |
| 本页面局部 | `useState` / `useReducer` | tab 选中、抽屉开关 |
| 持久化但非业务 | `useLocalStorage` hook | 用户偏好的栏目宽度 |

### 禁止

- **禁止用 Context API 传共享状态**(只允许传 Provider 注入的依赖,如 QueryClient)
- **禁止把服务端数据放进 zustand**(自动失效 / 缓存 / 错误处理都丢了)
- **禁止 zustand store 互相 import**(slice 之间不耦合)

---

## 五、样式

### 唯一来源:`src/styles/globals.css` + Tailwind v4 工具类

**Design Token 系统** 完整定义在 [src/styles/globals.css](src/styles/globals.css)。所有 token 都来自 `.pen` 设计稿,修改 token = 修改设计系统(需同步更新 .pen)。

#### 颜色 token(以下是全部可用,不要自创)

**背景(Surface)** — 4 档:
| Tailwind 类 | 值 | 用途 |
|---|---|---|
| `bg-background` | #FFFFFF | 容器主底 / Card / Dialog |
| `bg-surface-1` | #FAFAFA | 工具栏 / 弱卡片 |
| `bg-surface-2` | #F5F5F5 | hover/选中/页面 chrome/icon 容器 |
| `bg-surface-3` | #F8F8F8 | Prism 编译状态条专用 |

**文字** — 4 档(.pen 真实出现的 #444/#555 合并到 subtle,#999/#AAA 合并到 faint):
| 类 | 值 | 用途 |
|---|---|---|
| `text-foreground` | #111 | 主标题 / icon 主色 |
| `text-subtle` | #444 | 二级文本 / 文件树常态 |
| `text-muted-foreground` | #666 | 帮助说明 / 副文 |
| `text-faint` | #999 | placeholder / 计数 / 段标 |

**边框** — 5 档,职责严格:
| 类 | 值 | 用途 |
|---|---|---|
| `border-border-soft` | #EEEEEE | 极弱内分隔(breadcrumb 底) |
| `border-border` ★ | #E8E8E8 | 标准容器边框(最常见) |
| `border-border-separator` | #E0E0E0 | Nav/Toolbar 内组间小竖线 |
| `border-border-strong` | #D8D8D8 | 强调描边(home 搜索条) |
| `border-border-button` | #C8C8C8 | outlined 按钮边 |

**软底色** — 与品牌色配对:
| 类 | 值 | 用途 |
|---|---|---|
| `bg-danger-soft` | #FFF5F5 | danger active / diff 标记 |
| `bg-warning-soft` | (浅黄) | Badge warning 变体 |

**品牌** — 三色:
| 类 | 值 | 用途 |
|---|---|---|
| `text/bg-brand-red` | #CC2222 | CTA / 审稿活跃 / Logo S·a |
| `text/bg-brand-green` | #2A7A2A | AI 操作 / success / Logo ch·y |
| `text/bg-brand-amber` | #D4A017 | 构建中 / warning / Logo o |

**Prism 专用**:`bg-prism-badge-bg` (#F0E8D8) / `text-prism-badge-fg` (#806A2E)

**shadcn 语义别名**(组件可直接用):`bg-primary` / `bg-secondary` / `bg-muted` / `bg-accent` / `bg-card` / `bg-popover` / `bg-destructive` / `border-input` / `ring-ring`

#### 圆角 — 4 档
`rounded-sm` (4) / `rounded-md` (6) / `rounded-lg` (8) / `rounded-pill` (9999)
禁止 `rounded-[7px]` 这类自定义值。

#### 字号 — 8 档
`text-2xs/xs/sm/base/md/lg/xl/2xl` = 10/11/12/13/14/16/20/24,**正文基准是 13(text-base),不是 16**。

#### 高度 — 优先 Tailwind 默认 scale
`h-7` (28) `h-8` (32) `h-9` (36) `h-10` (40) `h-11` (44) `h-12` (48) `h-14` (56) `h-15` (60 ★ 自加,sidebar 用户条) `h-16` (64)

#### 间距 / 圆角 / 阴影
- 间距:Tailwind 默认(gap-2/3/4/6/8/12...)
- 阴影:基本不用 — .pen 设计是描边为主,极少用阴影

### 何时允许 arbitrary value `[...]`

只有同时满足两条:
1. Tailwind 默认 scale 没有该值
2. .pen 设计稿明确指定该精确像素

**必须注释 `/* .pen `frameId` 用途说明 */`**。例:
```tsx
{/* 搜索条 — .pen `OtefE` 中心容器宽度 640,Tailwind 无对应档位,保留 arbitrary value */}
<form className="max-w-[640px]">
```

### 禁止

- 写新的 `.css` 文件(globals.css 之外)
- `style={{ color: '...' }}` 内联样式(动态计算的尺寸/transform 除外)
- `styled-components` / `emotion` / CSS Modules
- `!important`(实在要用 → 反思是否选错容器)
- `dark:bg-xxx` 前缀(暗色由 `.dark` 切 CSS 变量自动生效)
- 自创 Tailwind 默认色板(`text-gray-500` `bg-blue-100` 等)— 不在 token 里就是没有

---

## 六、组件分层

```
shared/ui/             原子(纯样式,无业务感知)         ← shadcn 复刻
shared/components/     composite(业务无关的复合组件)     ← Sidebar/PageHeader/EmptyState
features/<x>/components/  业务组件(只本 feature 用)
```

### 每层的判定

- **要不要进 `shared/ui/`?** — 它在两个以上不同设计场景出现,并且不耦合业务名词。Button、Input、Dialog 是,PaperCard 不是。
- **要不要进 `shared/components/`?** — 它跨多个 feature 复用,但已有特定业务模式(如 Sidebar 7 件套、PageHeader、EmptyState)。
- **进 `features/`** — 只有一个 feature 用、或带业务实体(Paper / Folder / Reviewer)。

### 组件实现规则

1. **复杂组件用组合式 API**(参考 `Sidebar / SidebarHeader / SidebarItem`),不要塞一堆 prop slot。
2. **单文件 ≤ 300 行**,超出就拆。
3. **写组件前先 grep**:`grep -r "<XxxButton" src/` — 别造重复轮子。
4. **forwardRef + displayName** 是 shadcn 风格的最低标准,所有可被外部引用的组件都加。
5. **业务组件命名带业务名词**:`PaperCard` `FolderTree` `ReviewerSidebar`,不叫 `Card1` `Tree2`。

---

## 七、路由

1. 每个 feature 在自己的 `routes.tsx` 暴露 `RouteObject[]`:
   ```ts
   // features/library/routes.tsx
   export const libraryRoutes: RouteObject[] = [
     { path: 'library', lazy: () => import('./pages/LibraryPage').then(m => ({ Component: m.LibraryPage })) },
     { path: 'library/:folderId', lazy: () => import('./pages/FolderPage').then(m => ({ Component: m.FolderPage })) },
   ];
   ```
2. `app/router.tsx` 只负责拼装,不写具体路径。
3. **登录态校验用 `loader`**,不要在组件里 useEffect + navigate。
4. **页面级 lazy 是默认**,不要全部一次加载。

---

## 八、测试

- 单元 / 集成: **Vitest** + `@testing-library/react`,测业务 hook 和有逻辑的组件
- E2E: 后续接 **Playwright**(预留 `tests/e2e/`)
- 不为纯样式组件写测试

---

## 九、文件 / 命名约定

| 类型 | 规则 | 例 |
|---|---|---|
| 组件文件 | PascalCase.tsx | `PaperCard.tsx` |
| Hook 文件 | useXxx.ts | `useDebounce.ts` |
| 工具文件 | kebab-case.ts | `format-date.ts` |
| Store 文件 | xxx.store.ts | `auth.store.ts` |
| API 文件 | xxx.api.ts 或目录 api/xxx.ts | `papers.ts` |
| 类型导出 | `export type Xxx` 紧贴定义 | — |
| barrel `index.ts` | 只在 `shared/ui` `shared/components` `shared/hooks` 用 | — |

---

## 十、常见反模式速查(发现立刻拒)

| ❌ 反模式 | ✅ 替代 |
|---|---|
| 组件里直接 `axios.get(...)` | feature 的 useXxxQuery hook |
| `setTimeout` 模拟 debounce | `useDebounce` |
| 手写 split pane / drag handle | `ResizablePanelGroup` |
| 自己 portal + setState 写 dropdown | `DropdownMenu` |
| `<div onKeyDown=...>` 监听全局快捷键 | `useHotkey('mod+k', ...)` |
| `style={{ color: '#666' }}` | `text-muted-foreground` |
| `text-[#2A7A2A]` 硬编码品牌色 | `text-brand-green` |
| 手写 .css 文件 | Tailwind 工具类 |
| 自己写 portal + Fade 动画 | Radix Dialog + `tw-animate-css` |
| `if (!x) return null` 写在 `<Dialog open=...>` / Radix modal 之上;`{cond && <Dialog open=.../>}`(挂载条件 == open) | **绝不在 open 时卸载**:`<Dialog open={open && cond}>` 常驻 + 内容 `{cond && <DialogContent/>}`(全站点击失灵根因,见 `BodyPointerLockGuard` + `RouteModalReset`) |
| `useContext` 传 user / theme | `useAuthStore` / `useThemeStore` |
| 自己手写树渲染 | `react-arborist` |
| 自己渲染 markdown | `react-markdown` |
| 自己拼 toast 系统 | `toast()` from sonner |
| `interface Paper { ... }` 凭记忆瞎写、不标后端真源 | 手写 interface + 文件头注释配对 Go struct 路径;关键契约进 `tests/contract/`(§3.6) |
| 多个 `axios.create(...)` 实例 | 只用 `shared/lib/http.ts` 的 `http` |
| 组件文件 > 500 行 | 拆成 sub-component / 提 hook |

---

## 十一、PR 自查(等同于人肉 lint)

提交前过一遍:

- [ ] 没有新增同类第三方包(查表 §2)
- [ ] 没有在组件里裸调 axios / fetch
- [ ] 没有在组件里硬编码颜色 / 圆角 / 字号
- [ ] 没有新建 .css 文件
- [ ] 没有 `dark:` 前缀(用 CSS 变量)
- [ ] 没有跨 feature import
- [ ] 没有 shared 反向 import features
- [ ] 业务 API 写在 `features/<x>/api/`,导出 hook
- [ ] 新增的可复用组件位置合理(ui / components / feature)
- [ ] forwardRef + displayName 已加(可被外部 ref 的组件)
- [ ] 强制 lazy(页面级)
- [ ] **没有「Radix modal 还 `open` 就被 unmount」**:组件内别 `if(!x) return null` 在 `<Dialog open>` 之上,也别 `{cond && <Dialog open=.../>}`(挂载条件==open)。要么 `open={open && cond}` 常驻+内容守卫,要么先关再卸(分帧)。否则 Radix 的 body `pointer-events:none` 锁泄漏→**全站点击失灵、需刷新**。兜底有 `BodyPointerLockGuard`(症状网,带回归测试)+ `RouteModalReset`(导航关全局浮层),但**别依赖它们**,根因层照样要修。

不确定时调用 `/v2-audit` skill 让 Claude 自动审一遍。
