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

### 唯一真源:Figma → `src/styles/globals.css`

> ⚠️ **2026-07 换真源**:本项目的设计 token 曾以 `.pen` 设计稿(`design/pencil/scholay-global.pen`)
> 为真源,该口径**已作废**。现在的真源是 Figma:
>
> - **设计稿**: `JIv8fxQthMS37JLGHNOEbB` / Page 1 / `Scholay设计系统` (node `1:38`)
> - **提取产物**: [docs/figma-design-spec-2026-07.md](../docs/figma-design-spec-2026-07.md)
> - **改造台账**: [docs/design-migration-ledger-2026-07.md](../docs/design-migration-ledger-2026-07.md)
>
> **改 token = 改设计系统 → 必须同步更新 Figma,不要再改 .pen。**
> 代码里若见到 `.pen 'XXXXX'` 形式的注释,那是历史遗留,以 Figma 为准。

所有 token 定义在 [src/styles/globals.css](src/styles/globals.css),分 17 节,每节都标注了
Figma 依据或推导理由。**偏离 Figma 的地方必须写明偏离原因**,便于设计师 review 时
区分「有意决策」与「实现错误」。

### ⚠️ 改造进行中(2026-07)

设计系统正在从旧 token 迁移到 Figma 规范,**当前是中间态**:

| 维度 | 状态 | 说明 |
|---|---|---|
| 颜色 | ✅ 已切新值 | 语义未变,可直接翻值 |
| 圆角 | 🟡 新旧并存 | 新标度 `rounded-4/8/12/16/20`,旧 `rounded-sm/md/lg` 保持原值待迁移 |
| 字号 | 🟡 新旧并存 | 新标度 `text-12/14/16/20/24/28`,旧 `text-2xs/xs/base` 保持原值待迁移 |
| 字重 | ❌ 未开始 | 1030 处 `font-bold`/`font-semibold` 待降到 `font-medium` |
| 间距 | ❌ 未开始 | ~750 处半档待收口 |

**新代码一律用新标度**(`rounded-16` / `text-14`),不要再用旧名。
`globals.css` 的「过渡期兼容层」整段会在迁移完成后删除。

### 颜色 token(以下是全部可用,不要自创)

**色阶原语** — 四条 12 档色阶 `--red-1..12` / `--green-1..12` / `--amber-1..12` / `--ink-1..12`。
**业务代码禁止直接引用**,只能用下面的语义 token。

**背景(Surface)**:
| Tailwind 类 | 值 | 用途 |
|---|---|---|
| `bg-background` | `#F6F4EE` | ★ 页面 / 外层容器米白底 |
| `bg-surface-card` | `#FFFFFF` | **内层**卡片 / 输入框 / 搜索框纯白 |
| `bg-surface-1` | `#EFEDE5` | 工具栏 / 弱卡片 |
| `bg-surface-2` | `#E8E5DC` | hover / 选中 / 页面 chrome |
| `bg-surface-3` | `#F1EFE8` | Prism 编译状态条 |
| `bg-amber-soft` | `#E5DFCE` | 琥珀软底高亮块 |

> 🔴 **`bg-background` 与 `bg-surface-card` 不可混用**。Figma 明确区分外层米白 / 内层纯白,
> 视觉分层完全靠这 3.5% 明度差 —— 用错卡片就消失了。

**文字** — 4 档,对比度均已按米白底实测:
| 类 | 值 | 对比度 | 用途 |
|---|---|---|---|
| `text-foreground` | `#1F1F23` | 14.9:1 | 主标题 / 正文 / icon 主色 |
| `text-subtle` | `#505059` | 7.3:1 | 二级文本 / 文件树常态 |
| `text-muted-foreground` | `#686873` | 5.0:1 | 帮助说明 / 副文 |
| `text-faint` | `#757580` | 4.1:1 | 段标 / 计数(最弱档) |

**边框** — 容器族用 alpha(自动适配米白/纯白双底),控件族用实色:
| 类 | 值 | 用途 |
|---|---|---|
| `border-border-hairline` | `31 31 35 / 8%` | 极弱内分隔 |
| `border-border` ★ | `31 31 35 / 12%` | 标准容器边框(最常见) |
| `border-border-strong` | `31 31 35 / 22%` | 强调描边 |
| `bg-divider` | `31 31 35 / 14%` | Nav/Toolbar 组间竖线 |
| `border-border-control` | `#1F1F23` | **可点击控件**深色实边(搜索框) |
| `border-border-control-emphasis` | `#0D0C0B` | 幽灵按钮描边 |

> 🔴 控件族是**另一个 token 族**,不是容器族的新值。Figma 卡片根本没有描边 ——
> 分层靠白卡落米白底的明度差。把 `border-border` 换成深色会让全站变成线框图。

**品牌** — 三色(蓝色已退休,期刊线改用琥珀):
| 类 | 值 | 用途 |
|---|---|---|
| `text/bg-brand-red` | `#882828` | 朱砂 · CTA / danger / Logo S·a |
| `text/bg-brand-green` | `#2F4D29` | 松青 · AI 操作 / Logo ch·y |
| `text/bg-brand-amber` | `#E5A800` | 琥珀 · 期刊线 / 构建中 / Logo o |

配套软底:`bg-brand-{red,green,amber}-soft`

**状态色** 🟡 临时值待设计师确认:`text/bg-status-{success,error,warning,running,neutral,info}(-soft)`

**分类 / 图表**:`bg-cat-1..8`(头像 / 期刊封面等哈希取色) · `--chart-1..8`(recharts 序列色)

**shadcn 语义别名**:`bg-primary` / `bg-secondary` / `bg-muted` / `bg-accent` / `bg-card` /
`bg-popover` / `bg-destructive` / `border-input` / `ring-ring`

### 字号 — 6 档(数值命名)

`text-12` / `text-14` ★正文基准 / `text-16` / `text-20` / `text-24` / `text-28`
语义别名:`text-body`(=14) · `text-caption`(=12)
展示档(不进正文阶梯):`text-display-36` · `text-display-56`

> **为什么用数值名而非 xs/sm/base**:本仓库被 name≠value 咬过四次
> (`text-base`=13 / `text-md`=14 / `text-15` / `text-badge`=9 且零使用),
> 且 Tailwind 默认 `lg/xl/2xl`=18/20/24 与 Figma 的 20/24/28 全部错位。

### 行高 — 按**字族**绑定,不按字号档

`leading-sans`(1.25) · `leading-display`(1.333) · `leading-serif`(1.437) ·
`leading-paragraph`(1.7,长段中文) · `leading-display-tight`(1.15,≥28px 标题)

> 🔴 **绝不给字号 token 声明配套 line-height**(`--text-14--line-height`)。
> 一旦声明,`text-14` 会同时输出 font-size 和 line-height,字号档会盖掉字族层行高。

### 字间距 — 只有 2 个

`tracking-code`(0.25em,验证码/提取码) · `tracking-brand`(-0.03em,Scholay wordmark)

> Figma 中 letterSpacing 几乎全为 0。改造前散落 91 处 / 13 个值的 tracking **已全部删除**。
> **不要再加 tracking token** —— 历史证明只要留一个「uppercase 专用」档,它会立刻重新裂变。

### 圆角 — 6 档(数值命名)

`rounded-4` / `rounded-8` / `rounded-12` / `rounded-16` ★主力容器 / `rounded-20` / `rounded-pill`

**分层判定口诀**:
- 直接坐在页面底色上的一块内容 → **16**
- 嵌在另一个 16 里 → **12**
- 是个控件 → **8**
- 是段文字里的装饰 → **4**

**内层圆角必须严格小于外层**,否则子元素会「顶角」。

> `--radius-*` 命名空间已封闭(`initial`),`rounded-3xl` 这类会**编译不出类**。
> 旧的 `rounded-sm/md/lg/xl` 仍保持原值,是待迁移的过渡名。

### 控件高度阶梯

`h-control-xs`(24) · `h-control-sm`(32) · `h-control-md`(36) · `h-control-lg`(42) · `h-control-xl`(44)
配套:`size-avatar`(40) · `size-icon`(24 画板) · `size-icon-inline`(20)

### 间距

Figma 观测集合 `{4, 8, 10, 12, 16, 24, 32, 40}` = Tailwind `{1, 2, 2.5, 3, 4, 6, 8, 10}`。
**半档(`gap-1.5` / `gap-3.5` / `px-5` 等)不在集合内**,新代码不要用。

### Elevation(阴影)

只有 2 档:`shadow-overlay`(浮层) · `shadow-raised`(滑块/thumb/拖拽中)

> Figma 设计稿中 **0 个 DROP_SHADOW**,分层靠描边 + 米白底明度差。
> 只有「浮层盖在任意背景之上」和「浅滑块在浅槽里」两类场景物理上无法用描边替代。
> **不要为卡片/列表项加阴影。**

### z-index

`--z-raised`(10) · `--z-sticky`(20) · `--z-nav`(30) · `--z-scrim`(40) · `--z-overlay`(50) ·
`--z-modal`(60) · `--z-popover`(70) · `--z-tooltip`(80) · `--z-toast`(90) · `--z-fx`(100)

> 改造前 8 类语义不同的浮层全部 `z-50`,谁盖谁由 portal 挂载顺序决定。**不要再写裸 z-50。**

### Motion

`duration-fast`(160ms) · `duration-base`(280ms) · `duration-slow`(420ms) · `duration-deliberate`(700ms)
`ease-out` · `ease-in-out` · `ease-emphasized`

> CSS 侧与 framer-motion 侧(`shared/lib/motion.ts`)**必须共用同一组数值**,
> 否则同一次交互一半走 CSS 一半走 framer 会明显不同步。

### 纸张质感(noise)

默认**关闭**。`<html data-paper="on">` 开启,或对单个 surface 用 `paper-grain` 工具类。

> Figma 的 NOISE 效果是设计师标注的**待验证项**,不是既定规范。

### 何时允许 arbitrary value `[...]`

只有同时满足两条:
1. 上述 token 与 Tailwind 默认 scale 都没有该值
2. Figma 设计稿明确指定该精确像素

**必须注释说明 Figma 依据**。例:
```tsx
{/* 搜索条 —— Figma §4.5 搜索框 312 宽,Tailwind 无对应档位,保留 arbitrary value */}
<form className="w-[312px]">
```

### 禁止

- 写新的 `.css` 文件(globals.css 之外)
- `style={{ color: '...' }}` 内联样式(动态计算的尺寸/transform 除外)
- `styled-components` / `emotion` / CSS Modules
- `!important`(实在要用 → 反思是否选错容器)
- `dark:` 前缀 —— **暗色态已于 2026-07 移除**(切换机制存在但零调用点,`.dark` 从未生效)
- Tailwind 默认色板:`text-gray-500` / `bg-blue-100` **以及 `bg-white` / `text-black`**
  —— 后两个不符合「色名-数字」形态,是 grep 查不出的后门,同样禁止
- 藏在 `rgba()` 里的默认色板 —— 已知 `rgba(15,23,42,*)` = slate-900,这类同样违规
- 直接引用色阶原语(`--ink-5` / `bg-red-8`),只能用语义 token
- 新增 tracking / shadow token(见上文理由)

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
