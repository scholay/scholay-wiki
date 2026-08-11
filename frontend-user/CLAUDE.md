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

### 上游设计证据:`dev.pen` → 运行时 SSOT:`src/styles/globals.css`

> **2026-08 当前口径**:
>
> - **规范侧真源**:`/Users/youngp/Downloads/scholay设计源文件/dev.pen`，通过 Pencil MCP
>   读取；设计系统根节点 `rfNKU`（`Scholay设计系统`）
> - **提取快照**:[docs/pen-design-spec-2026-08.md](../docs/pen-design-spec-2026-08.md)
> - **运行时 token 唯一真源（SSOT）**:[src/styles/globals.css](src/styles/globals.css)
> - **历史基线**:[docs/figma-design-spec-2026-07.md](../docs/figma-design-spec-2026-07.md)
>   已被取代，只用于解释旧决策，不再决定当前 token
>
> `dev.pen` 在仓库外，是设计证据而不是构建依赖。**改 token = 先用 Pencil MCP 读取
> 当前节点 → 更新 Pen 规范快照 → 更新 `globals.css` 与受护栏校验的跨包镜像。**
> 不从截图拾色，也不再把 2026-07 Figma 值覆盖回当前 Pen 值。

所有运行时 token 定义在 [src/styles/globals.css](src/styles/globals.css)。每节应标注
Pen 节点依据或工程推导理由。**偏离 Pen 的地方必须写明偏离原因**，便于设计师 review 时
区分「有意决策」与「实现错误」。Logo 图形（`D5gC67`）与 Scholay wordmark（`V2IJR`）
是本轮冻结资产，不随主题色、字体栈或字号迁移。

本次 Pen 提取覆盖颜色、字体、字号和基础 Button / Label / Card / Search。下文仍出现的
Figma 布局、间距、阴影等引用，是尚未被 Pen 新节点替换的 **2026-07 历史工程约束**；
它们可以继续约束实现，但不能反向覆盖本文明确列出的 Pen 颜色与排印值。

字体是一项明确的用户级覆盖（2026-08-11 两段指令）：**UI/正文/控件走系统字体
零下载；标题层中文用自托管 `Noto Serif SC`**（取代此前的 Google Sans 方案，
Playfair webfont 同步移除）。这一指令优先于 Pen `rhCJT` 中的任何字体样张；
但不解冻 Logo `D5gC67` 或 Scholay wordmark `V2IJR`（两者是 SVG 路径，
本就不依赖字体文件）。

### 护栏在哪跑(**两个执行点,覆盖面不一样**)

护栏本体:[tests/design-system-guard.test.ts](tests/design-system-guard.test.ts)(类名 / 硬编码 /
跨包镜像)+ [tests/design-tokens-compiled.test.ts](tests/design-tokens-compiled.test.ts)
(token 声明 vs 实际编译产出)。**它自己不会跑**,靠下面两个点被触发:

| 执行点 | 何时跑 | 覆盖 | 跨包镜像 | 违规时 |
|---|---|---|---|---|
| `prebuild` → `npm run test:design` | `npm run build` / Docker 构建 | frontend-user 内全部规则 | ❌ **整族 skip** | 构建失败 |
| [`scripts/check-design-system.sh`](../scripts/check-design-system.sh) | git `pre-push` 钩子(**要装一次**)/ 手跑 | 全部规则 | ✅ 真的校验 | push 被拦 |

🔴 **Docker 构建里的绿灯 ≠ 跨包镜像已校验。**
frontend-user 的构建 `context: ./frontend-user`(docker-compose.yml),
`miniprogram/` 和 `agent/` 两个兄弟包在那个环境里**物理上不存在** →
「跨包镜像」一族规则走 `ctx.skip()`。也就是说:小程序 / pptx 导出两份镜像
是否与 `globals.css` 同步,**构建管不了**。

跳过时,[scripts/design-guard.mjs](scripts/design-guard.mjs) 会在构建日志里打一条
横幅,逐条列出被跳过的规则名 —— 刻意做得很吵,因为「一条永远绿的规则」和
「一条不存在的规则」等价,而本仓库正是被这个模式坑过(「51 条护栏全绿」掩盖两份镜像
同时落后两代)。⚠️ 但**刻意不让构建失败**:跨包镜像在那个 context 里客观上无法校验,
为它红灯只会堵死部署,换不来任何校验。

🔴 **钩子要装一次才生效**(每台机器、每份 clone 各一次):

```bash
./scripts/install-git-hooks.sh      # = git config core.hooksPath .githooks
```

`.git/hooks/` 不进版本库 —— 钩子放那儿只有写它的人有,等于没有。所以钩子在版本化的
`.githooks/` 里,但 git 必须被显式指过去。**不做这一步 = 护栏一次都不会自动跑。**

绕过:`SKIP_DESIGN_GUARD=1 git push` —— 放行但**留痕**(时间/邮箱/分支/commit 记到
`.git/design-guard-bypass.log`)。`git push --no-verify` 是 git 层面根本不调用钩子,
**无痕**,别用。

### 迁移状态(2026-07-28 第二轮复核；2026-08 Pen token 行已刷新)

> ⚠️ 更早的版本写着「字重 ❌ 未开始 / 间距 ❌ 未开始 / 圆角字号 🟡 新旧并存」,
> 全部与实测相反 —— 那时它在**教人写会被护栏拒绝的旧类名**。以下是实测状态。
> 完整审计见 [docs/design-audit-2026-07.md](../docs/design-audit-2026-07.md)。
>
> 📏 **本表所有数字都是实测快照,不是当前值。** 两条使用须知:
> 1. 数字随收口推进在变(2026-07-28 并行修复期间,同一个下午多个数就变过) ——
>    引用前自己重跑,复现命令见表下。
> 2. **计数必须剥掉注释**。本仓库注释里大量出现被讨论的类名(「最近的 token 是 `h-control-xs`」
>    这类),裸 `rg` 会把它们计成用法 —— 实测 `h-control-*` 裸 `rg` 报 6 处、剥注释后只有 **2 处**。
>    下面的数字**一律是剥注释口径**(与 `design-system-guard` 的 `stripComments()` 同款)。

| 维度 | 状态 | 说明 |
|---|---|---|
| 圆角 | ✅ 已完成 | 旧标度 `rounded-sm/md/lg/xl` 已从 token 层**删除**,写了编译不出类 |
| 字号 | ✅ 已完成 | 八档封闭(`--text-*: initial`):`12/14/16/18/20/24/28/32`；语义旧名仍编译不出类，64 独立作 Headline / Display |
| 字重 | ✅ 已完成 | `font-semibold` 代码内 **0**(仅 globals.css 注释里提到);`font-bold` 只保留在 serif/display/mono 上 |
| 正文基准 | ✅ 已修正 | `body` 从 13px 改到 **14px**；当前 Pen 主 UI 阶梯同样以 14px 为正文基准 |
| 控件字号 | ⚪ 刻意偏离 | 控件基座**保持 `text-12`**,不采纳 Pen §4.1/§4.4 的 14px(高信息密度产品的有意层级)。2026-07-28 曾升到 14 后由产品撤销。详见下文「控件字号」小节 |
| 纸张质感 | ⚪ 已移除 | 产品已取消全站 noise；页面只使用主题背景色，不再叠加纸张颗粒。 |
| 颜色 | 🟡 语义层已切,**收口未完** | 值全部是新的,但 **482 处**(2026-07-28 剥注释实测)仍走过渡兼容层的旧色名(`border-soft` / `danger-soft` / `warning-soft` / `prism-badge-*` / `border-button`)。这些是**合法可用**的别名,新代码优先用右侧新名 |
| 状态色 | 🔴 阻塞 | `--status-*` 是**待设计师确认的临时值**(Q2)。tsx/ts 侧除 `status-info`(6 处)外**整族零消费**,调用点仍走品牌色;兼容层 `--color-danger-soft` / `--color-warning-soft` 至今仍指 `--brand-*-soft` 而非 `--status-*` |
| 间距 | 🔴 阻塞 | 阻塞于 Q8(Figma 观测集合里没有 6px,但 `gap-1.5` 已写进三个原子基线)。⚠️ **这个数有三种口径**(2026-07-28 实测):guard 口径(`0.5/1.5/3.5/5/7/9/11`,注释已剥离)**1293**、只数 `.5` 小数档**1401**、不剥注释的裸 `rg` **1423**。guard 的棘轮基线是 **1357**,当前 1293 **未突破**(余量 64)。**引用哪个数就说明是哪个口径** |
| 尺寸 token | 🔴 基本未接线 | `h-control-*` 全站消费**能逐条列完 —— 只有 2 处**:`browser/QuickOpenPaperDialog.tsx:83`(`h-control-xl`)、`sidebar/SidebarCollapse.tsx:81`(`h-control-md`)。`size-avatar` / `size-icon` / `size-icon-inline` / `max-w-page` / `--rail-*` / `--dialog-*` 仍是 **0**。写了**能编译**,但你会是全站第三个用户 |
| Motion(CSS 侧) | ✅ 已修复,🟡 收口未完 | `duration-fast/base/slow/deliberate` 曾**编译不出任何 CSS**,2026-07-28 在 `@theme` 补 `--transition-duration-*` 别名后已可用(消费点 1 处)。仍有 11 处 Tailwind 默认档 `duration-150/200/300/500` 未迁 —— **不能机械迁**,四档 token 与默认档无一相等,换过去是视觉变化。见下文「Motion」小节 |

复现命令(在 `frontend-user/` 下跑,**必须用 `rg --text`**,本仓库有含非 UTF-8 字节的 .tsx,BSD grep 会静默漏):

```bash
# 兼容层旧色名调用点
rg --text -o '\b(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|caret|placeholder)-(border-soft|danger-soft|warning-soft|border-button|prism-badge[a-z-]*)\b' src --glob '*.tsx' --glob '*.ts' --no-filename | wc -l
# 半档间距
rg --text -o '\b(gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space-x|space-y)-[0-9]+\.5\b' src --glob '*.tsx' --glob '*.ts' --no-filename | wc -l
# 尺寸 token 采用率(结果要逐行看:注释里的命中不算用法)
rg --text -n 'h-control-|size-avatar|size-icon|max-w-page' src --glob '*.tsx' --glob '*.ts'
```

⚠️ 上面这三条是**裸 `rg`,给的是上界**(含注释),因此会比表里的数略大。
要拿到与表一致的剥注释口径,照抄 `tests/design-system-guard.test.ts` 的
`walk()` + `stripComments()` + `hits()` 三个函数跑一遍即可 —— 那才是护栏实际用的口径。

**新代码一律用新标度**(`rounded-16` / `text-14`),不要再用旧名。
`globals.css` 的「过渡期兼容层」只剩颜色别名,颜色收口完成后整段删除。

### ⚠️ 「可用」= 真能编译出 CSS,不是「globals.css 里写了」

本节下面每一处「可用 / 全部可用」的清单,都在 2026-07-28 用**仓库自己的 `tailwindcss`
实编 `globals.css` 逐类探针**核对过一遍。结论:

- **本节列出的 token 现在全部真能编译出类**
  (surface / 文字 / 边框 / 品牌 / 状态 / cat / chart / shadcn 别名 / 八档主 UI 字号 /
  **六档行高**(含新增 `leading-code`)/ 两档字距 / 六档圆角 / `h-control-*` / `size-*` /
  `max-w-page` / `max-w-reading` / 两档阴影 / **`blur-2` · `backdrop-blur-2`** / 十档 z /
  `ease-*` / **`duration-*` 四档** / 四个字族 —— 逐条验证通过)
  > ⏪ 这一行此前写着「除了 `duration-fast/base/slow/deliberate` 四个」—— 那个缺口
  > 2026-07-28 已修(`@theme` 补 `--transition-duration-*` 别名),详见下文「Motion」小节。
  > ⚠️ `--weight-normal` / `--weight-medium` 是**刻意不注册**的例外,故意没有对应工具类,见下文「字重 token」。
- 反向也核对了:`text-sm/base/lg/3xl`、`rounded-sm/md/lg`、裸 `rounded`、`rounded-r` **确实编译不出**;
  但 `rounded-full` / `rounded-none` 是 Tailwind 的 static utility,**`--radius-*: initial` 封不住它们**,
  只能靠 `design-system-guard` 的类名规则拦
- `w-max` / `max-w-max` / `min-w-max` 已恢复成内建 `max-content`(`--container-max` 改名 `--container-page` 之后)

> **「能编译出类」≠「有人在用」。** 这是两件必须分开看的事:
> 前者由 [tests/design-tokens-compiled.test.ts](tests/design-tokens-compiled.test.ts) 保证,
> 后者见上面的迁移状态表。本文件历史上把两者混为一谈过 —— 把零消费 token 写成「可用」
> 让新人以为在跟随既有用法,把编译不出的 `duration-*` 写成「可用」则是**直接教错**。
> 往本节加新 token 时,请同步在那个测试文件里加一条断言。

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

> 🔴 **`bg-background` 与 `bg-surface-card` 不可混用**。Pen 明确区分外层米白 / 内层纯白,
> 视觉分层完全靠这 3.5% 明度差 —— 用错卡片就消失了。

#### 怎么判「这一层该米白还是该白」

一句话:**页面 chrome 用米白,内容面用白。**

| 该用 `bg-background`(米白) | 该用 `bg-surface-card`(白) |
|---|---|
| 路由组件最外层壳 | 卡片 / 面板 / 列表项 |
| 侧边栏、抽屉侧栏 | Dialog / Sheet / Popover 的**内容** |
| 顶栏、底栏、工具条、tab 条 | 输入框 / 搜索框 / textarea |
| 「外层展示区,里面还要放白卡」的容器 | 表格单元格 |
| Landing 的 section 色带 | iframe / PDF 拟纸 / 预览画布 |

判别问句:**它是「页面的一部分」还是「浮在页面上的一块东西」?**
侧边栏是页面的一部分 → 米白。卡片浮在页面上 → 白。

⚠️ **例外**:坐在 `bg-surface-1` 面板里的工具条可以是白的 ——
那是「白条压浅灰」的抬升关系,不是「白条压米白」的错位。看它的**直接父容器**是什么。

> 这条规则是 2026-07 改造时踩出来的:迁移的安全默认是 `bg-surface-card`
> (因为改造前 `--background` 就是 `#FFFFFF`,保持它 = 零视觉变化),
> 结果侧边栏被判成了卡片,全站唯独它是白的,与顶栏/主区/页脚割裂。
> 已修 9 处同类误判(Sidebar / SidebarLayout / PrismPreview 侧栏 /
> StagingTabs / PdfViewerToolbar / StructEditorToolbar / ClawPreview 底栏 /
> MobileSearchOverlay 顶栏与筛选条)。
> **这类错误 CI 查不出来**(两个 token 都合法),只能靠这条规则和肉眼。

**文字** — 4 档,对比度均已按米白底实测:
| 类 | 值 | 对比度 | 用途 |
|---|---|---|---|
| `text-foreground` | `#1F1F23` | 14.9:1 | 主标题 / 正文 / icon 主色 |
| `text-subtle` | `#505059` | 7.3:1 | 二级文本 / 文件树常态 |
| `text-muted-foreground` | `#686873` | 5.0:1 | 帮助说明 / 副文 |
| `text-faint` | `#6E6E78` | 4.58:1 | 段标 / 计数(最弱档) |

> 🔴 **`text-background` 一律禁用**。改造前 `--background` 是纯白,`text-background` 恰好等价于「白字」,
> 被大量用作深底上的前景色。改成米白后这些调用点会静默变成**米白前景**。
> 深底上的前景色用 `text-on-dark`(玄墨底) / `text-on-brand`(品牌实底) / `text-foreground`(**琥珀实底**)。
> 已加护栏(**本仓库没有 CI** —— 是构建期 + git pre-push 两个执行点,见 §五「护栏在哪跑」)。

**边框** — 容器族用 alpha(自动适配米白/纯白双底),控件族用实色:
| 类 | 值 | 用途 |
|---|---|---|
| `border-border-hairline` | `31 31 35 / 8%` | 极弱内分隔 |
| `border-border` ★ | `31 31 35 / 12%` | 标准容器边框(最常见) |
| `border-border-strong` | `31 31 35 / 22%` | 强调描边 |
| `bg-divider` | `31 31 35 / 14%` | Nav/Toolbar 组间竖线 |
| `border-border-control` | `#1F1F23` | **可点击控件**深色实边(搜索框) |
| `border-border-control-emphasis` | `#0D0C0B` | 幽灵按钮描边 |

> 🔴 控件族是**另一个 token 族**,不是容器族的新值。Pen 的 Default Card 没有深色实描边 ——
> 分层靠白卡落米白底的明度差。把 `border-border` 换成深色会让全站变成线框图。

**品牌** — 三色(蓝色已退休,期刊线改用琥珀):
| 类 | 值 | 用途 |
|---|---|---|
| `text/bg-brand-red` | `#882828` | 朱砂 · CTA / danger |
| `text/bg-brand-green` | `#2F4D29` | 松青 · AI 操作 |
| `text/bg-brand-amber` | `#B4880E` | 琥珀 · 期刊线 / 构建中 |

配套软底:`bg-brand-{red,green,amber}-soft`

> Pen 的 Neutral 标签文字写 `#141414`，但色块实际 fill 与色阶使用 `#1F1F23`；
> 运行时采用后者，不新增第二套玄墨。Logo / Scholay wordmark 使用独立冻结资产，
> 上表的主题色变化不得驱动品牌图形改色。

**状态色** 🟡 临时值待设计师确认(Q2):`text/bg-status-{success,error,warning,running,neutral,info}(-soft)`

> 这一族**能编译出类**(已逐条探针验证),但 2026-07-28 实测:tsx/ts 侧只有 `status-info` 有 6 处消费,
> 其余全族零消费。**注意一个容易误判的地方**:`design-system-guard` 的「死 color token」规则
> 只扫 `src/**/*.tsx?`,**不扫 `globals.css` 自身** —— 而 `--status-*` 其实正被 globals.css 里
> 的 sonner 变量桥接块(`--success-bg: var(--status-success-soft)` 等)消费着,toast 配色是真在跑的。
> 所以「guard 报它死」≠「它没在渲染」,详见 [design-audit-2026-07.md](../docs/design-audit-2026-07.md) 的计数分歧表。

**分类 / 图表**:`bg-cat-1..8`(头像 / 期刊封面等哈希取色) · `--chart-1..8`(recharts 序列色)

**shadcn 语义别名**:`bg-primary` / `bg-secondary` / `bg-muted` / `bg-accent` / `bg-card` /
`bg-popover` / `bg-destructive` / `border-input` / `ring-ring`

### 字体（2026-08-11：UI 系统字体 + 标题 Noto Serif SC）

用户两段指令的混合态：①全站字体走系统字体、不能拖慢渲染;②标题层中文用回
`Noto Serif SC`。落地:Google Sans / Playfair Display webfont **已移除且禁回流**;
`Noto Serif SC` 是**唯一保留的 webfont**（101 个 unicode-range 分片 + 首屏 UI
子集,swap 按需加载,只有标题真用到的字才下载）。栈真源在 `globals.css`「字体排印」:

| token / 用途 | 字体栈策略（mac / win 实际命中） |
|---|---|
| `font-sans` · 非品牌 UI / Body / 控件 | `system-ui` 领头的纯系统栈,零下载：SF Pro + 苹方 / Segoe UI + 微软雅黑。UI 中文走黑体系 —— 控件基座 text-12，衬线在 12px 的 win 渲染质量不可接受 |
| `font-serif` / `font-display` · 标题 / 中文展示 / 衬线角色 | 具名 Latin 无衬线（Helvetica Neue / Segoe UI / Arial）+ **`Noto Serif SC`** 承接 CJK；宋体系（Songti SC / SimSun）只是断网/404 时的离线兜底 |
| 品牌专用 · BrandName「Scholay」 | 系统高对比衬线近似 Playfair：mac `Didot` / win `Georgia`；`'Playfair Display'` 留在首位只做 local 匹配（零 @font-face 供源，绝不下载） |

侧栏面板标题（我的文件夹 / 会话历史 / 项目 / 我要投稿）、staging 栏目头
（搜索器 / 工作区 / 矩阵分析）、页面与 section 标题等「标题层」元素挂
`font-serif` / `font-display`；正文与控件**不要**挂衬线字族。

🔴 **两条铁律**（`tests/font-assets.test.ts` 钉死，违者构建红）：
1. `system-ui` / `-apple-system` 自带系统级联，会在 CSS 栈轮到后续家族前把 CJK
   交给苹方/雅黑 —— UI 栈正要这个效果，但**衬线栈里它们绝不能排在 Noto/宋体前**。
2. 衬线栈里只允许「无 CJK 字形的具名 Latin 字体 + Noto/宋体系 + 垫底 generic」，
   不得插入任何自带 CJK 的黑体家族（白名单硬校验）。

Logo `D5gC67` 和 Scholay wordmark `V2IJR` 是 SVG 路径、不依赖字体文件，仍是
冻结资产；小程序 `app.wxss` 的 `--font-sans/serif/display` 必须与 `globals.css`
逐字镜像（design-system-guard 硬校验）。**不要引入 Noto 之外的任何 webfont**
（包括 Google Fonts CDN / 镜像域 / base64 内联 / FontFace API）——
反向契约见 `tests/font-assets.test.ts`;更新 Noto 资产用 `npm run fonts:sync`。

### 字号 — 8 档主 UI + 1 档 Headline / Display(数值命名)

`text-12` / `text-14` ★正文基准 / `text-16` / `text-18` / `text-20` / `text-24` /
`text-28` / `text-32`
语义别名:`text-body`(=14) · `text-caption`(=12)
Headline / Display:`text-display-64`

旧 `text-display-36` / `text-display-56` 已迁出主 UI 阶梯；64px 仅保留为独立
Headline / Display 展示档，来自 `GQBuZ` 的中英文样张。

> **为什么用数值名而非 xs/sm/base**:本仓库被 name≠value 咬过四次
> (`text-base`=13 / `text-md`=14 / `text-15` / `text-badge`=9 且零使用)。
> 即使 Tailwind 某个默认档恰好等值，也不允许用不透明的语义名替代数值 token。

#### 控件字号(2026-07-28 产品拍板,写死在这里免得下一轮又当漏改)

> 🔴 **这是对 Pen 的刻意偏离,不是漏改。审计/codemod 看到它请跳过。**

| 控件 | 字号 | 依据 |
|---|---|---|
| Button(全档)/ Input / Textarea / Select / Tabs / DropdownMenu 项 | **`text-12`** | **对 Pen §4.1(按钮 `500/14px`)、§4.4(搜索框 `400/14px`)的刻意偏离** |
| Badge / Label / 各类描述与快捷键 | `text-12` | Pen §4.2 明写 `Google Sans 400 / 12px`,与控件基座同档 |
| CardTitle / AIOverlay 主文案 | `text-14` | 它们是**标题层**不是控件,不受本条约束 |
| 聊天正文(`chat/MarkdownRenderer`) | `text-12` | **已知偏离**(台账 Q12):升到 14 会让长会话滚动距离 +16.7%,决策是保持 12 |

**偏离原因**:Pen 只给了一个 `120px` 宽、`12px 16px` padding 的展示级按钮规格;
本产品是高信息密度的科研工具,同屏控件数量远多于设计稿场景,14px 会让工具条 /
表格行 / 侧栏成片撑开。
「控件字比正文(14)小一档」在本产品里是**有意的层级**,不是倒挂。

> 📌 2026-07-28 曾按旧 Figma 基线把 button/input/textarea/select/tabs/dropdown 基座抬到 `text-14`
> 并合入,**产品评估后明确撤销**。这一族是一个整体 —— 要改必须一起改,
> 单独升任何一个都会在同一横排里出现两种字号。

### 行高 — 按**字族**绑定,不按字号档

`leading-sans`(1.25) · `leading-display`(1.333) · `leading-serif`(1.437) ·
`leading-paragraph`(1.7,长段中文) · `leading-display-tight`(1.15,≥28px 标题) ·
`leading-code`(1.65,代码编辑器)

> `leading-code` 是 2026-07-28 新增的第六档,唯一消费点是 Prism 的 CodeMirror 主题
> (`LatexEditor.tsx` 的 `.cm-scroller`,走 `var(--leading-code)`)。**不要并进 `leading-paragraph`(1.7)**:
> 那是近似值不是等值,0.05em × 每一行 = 编辑器整体高度变化。

> 🔴 **绝不给字号 token 声明配套 line-height**(`--text-14--line-height`)。
> 一旦声明,`text-14` 会同时输出 font-size 和 line-height,字号档会盖掉字族层行高。

### 全局字间距 token — 只有 2 个

`tracking-code`(0.25em,验证码/提取码) · `tracking-brand`(-0.03em,Scholay wordmark)

> Pen 的 Card / Search 文本样张有 0.24px / 0.28px 字距；这是组件级精确值，不扩展成
> 全站 tracking 阶梯。改造前散落 91 处 / 13 个通用 tracking **已全部删除**。
> **不要再加泛用 tracking token** —— 组件需要采用 Pen 精确值时应在组件原子层集中实现。

### 圆角 — 6 档(数值命名)

`rounded-4` / `rounded-8` / `rounded-12` / `rounded-16` ★主力容器 / `rounded-20` / `rounded-pill`

**分层判定口诀**:
- 直接坐在页面底色上的一块内容 → **16**
- 嵌在另一个 16 里 → **12**
- 是个控件 → **8**
- 是段文字里的装饰 → **4**

**内层圆角必须严格小于外层**,否则子元素会「顶角」。

> `--radius-*` 命名空间已封闭(`initial`),`rounded-3xl` 这类会**编译不出类**。
> 旧的 `rounded-sm/md/lg/xl` 已于 2026-07-27 从 token 层**删除**,现在同样编译不出类
> (2026-07-28 探针复核)。⚠️ 唯二的例外是 `rounded-full` / `rounded-none` ——
> 它们是 Tailwind 的 static utility,不读 `--radius-*` 命名空间,**封不住**,靠 guard 的类名规则拦。
> 另:裸 `rounded` / `rounded-r` 也编译不出任何 CSS(**写了 = 直角**,Prism diff 块踩过)。

### 控件高度阶梯

`h-control-xs`(24) · `h-control-sm`(32) · `h-control-md`(36) · `h-control-lg`(42) · `h-control-xl`(44)
配套:`size-avatar`(40) · `size-icon`(24 画板) · `size-icon-inline`(20)

> ⚠️ **已定义、能编译,但采用率极低 —— 新代码应优先采用,老代码别指望它已经铺开。**
> 2026-07-28 剥注释实测:`h-control-*` 全站消费**只有 2 处**
> (`browser/QuickOpenPaperDialog.tsx:83` 的 `h-control-xl`、`sidebar/SidebarCollapse.tsx:81` 的 `h-control-md`);
> `size-avatar` / `size-icon` / `size-icon-inline` 仍是 **0**;而裸 `h-7/8/9/10/11` 有 **408 处**。
> 也就是说同一横排里很可能出现「你的 `h-control-sm` 和邻居的 `h-8`」这种等值不同名 ——
> 这是**过渡态的正常现象**,不是让你跟着写 `h-8`。
>
> ⚠️ 另一类真实情况:**代码里已经有一批注释在说「最近的 token 是 `h-control-xs`,但我需要 18px,故保留精确像素」**
> (`badge.tsx` / `LibraryPage.tsx` / `MobileToolsHomePage.tsx` 等)。这些是**合规的 arbitrary**
> (注明了依据),不要把它们当成待收口的违规 —— 也不要用裸 `rg` 把它们计成 `h-control-*` 的用法。

### 布局容器宽度

`max-w-page`(1440,Figma §5 中心内容最大宽) · `max-w-reading`(720,长文阅读区)

> ⚠️ **`max-w-page` 已定义、能编译,但 2026-07-28 剥注释实测消费为 0** —— 仅有的两处文本命中
> 都在注释里(`globals.css` 的说明、`peer-review/RecordDetailPage.tsx:129` 自陈
> 「`max-w-[1400px]` 是历史值,Figma §5 是 1440」)。全站仍是 **52 种不同的 `max-w-*` 类名 / 236 处**在各写各的。
> Figma §5「中心内容最大宽 1440」是布局规范里最明确的一条,新写页面壳请直接用它。

> 🔴 **命名陷阱**:Tailwind v4 的 `--container-*` / `--spacing-*` 命名空间用 **token 后缀直接生成类名**。
> 这个 token 曾叫 `--container-max`,生成的类就是 `w-max` / `max-w-max` / `min-w-max` ——
> 与内建的 `max-content` 同名且覆盖它,导致两处 `w-max` 被静默压成 1440px 定宽。
> **起名时后缀不能撞 Tailwind 保留字**(`max` / `min` / `fit` / `full` / `none` / `px` / `screen` / `auto`)。已加护栏(见 §五「护栏在哪跑」)。

### 间距

Figma 观测集合 `{4, 8, 10, 12, 16, 24, 32, 40}` = Tailwind `{1, 2, 2.5, 3, 4, 6, 8, 10}`。
**半档(`gap-1.5` / `gap-3.5` / `px-5` 等)不在集合内**,新代码不要用。

### Elevation(阴影)

只有 2 档:`shadow-overlay`(浮层) · `shadow-raised`(滑块/thumb/拖拽中)

> Figma 设计稿中 **0 个 DROP_SHADOW**,分层靠描边 + 米白底明度差。
> 只有「浮层盖在任意背景之上」和「浅滑块在浅槽里」两类场景物理上无法用描边替代。
> **不要为卡片/列表项加阴影。**

### 遮罩虚化(blur)

只有 1 档:`backdrop-blur-2` / `blur-2`(= `--blur-2`,2px)

> 全站四处遮罩(`shared/ui/{dialog,sheet,ai-overlay}` + `library/…/dialog-chrome`)统一用它。
> **不要用内建最小档 `blur-xs`(4px)** —— 那会把背景糊成一片,与「仍隐约可见、保住上下文感」
> 的设计意图冲突。2px 是刻意的极轻虚化,故 token 层单独立了这一档。

### 字重 token(⚠️ 只服务「JS 字符串里的裸 CSS」)

`--weight-normal`(400) · `--weight-medium`(500)

> 🔴 **这两个刻意不注册进 `@theme`,所以没有 `font-weight-medium` 这种类** ——
> 注册会覆写 Tailwind 内建同名档,而 `font-normal` / `font-medium` 本来就能编译。
> 它们存在的唯一理由是 **`<style>` 注入式的真 CSS**(`shared/components/chat/styles.tsx`、
> CodeMirror 的 `EditorView.theme()`):那类 CSS 不经 Tailwind 编译、拿不到工具类,
> 此前只能写字面 `font-weight: 500`,对护栏隐身。
> 刻意**不补 600/700**:护栏规定 sans 上禁 `font-semibold`、`font-bold` 只留给 serif/display/mono,
> 补出来等于给违规提供一个 `var()` 形态的后门。

### z-index

`--z-raised`(10) · `--z-sticky`(20) · `--z-nav`(30) · `--z-scrim`(40) · `--z-overlay`(50) ·
`--z-modal`(60) · `--z-popover`(70) · `--z-tooltip`(80) · `--z-toast`(90) · `--z-fx`(100)

> 改造前 8 类语义不同的浮层全部 `z-50`,谁盖谁由 portal 挂载顺序决定。**不要再写裸 z-50。**

### Motion

✅ **`duration-fast` / `duration-base` / `duration-slow` / `duration-deliberate` 现在是可用的 Tailwind 类**
(2026-07-28 修复并落到编译期契约里)。

> ⏪ **本节此前整段说反了**,而且是最贵的一种说反 —— 它红字写着「这四个写了编译不出任何 CSS」,
> 并点名 `HtmlRender.tsx:69` 的 arbitrary 写法叫人「照它抄」。缺口修好后那句话会**倒过来**
> 引导人把已经收口的具名类改回 arbitrary。留档如下,免得下一轮又当成新发现:
>
> **原缺口**:Tailwind v4 的 `duration-*` 工具类读的是 **`--transition-duration-*`** 命名空间,
> 而 globals.css 把值声明成了 `--duration-*` —— 名字差一截前缀,所以一个类都生成不出来,
> 且是**静默失效**(元素变成「无过渡」而不是报错,肉眼只觉得「动画有点生硬」)。
> **修法**:`@theme inline` 里补一层别名 `--transition-duration-{fast,base,slow,deliberate}: var(--duration-*)`。
> **现在的产物**:`.duration-base { --tw-duration: var(--duration-base); transition-duration: var(--duration-base); }`
> —— 与旧写法 `duration-[var(--duration-base)]` 的声明块**逐字节相同**,所以那次替换是零像素的。

**新代码怎么写**:

```tsx
{/* duration 走 token:--duration-base(280ms)+ 项目的 ease-*。具名类现在真能编译出 CSS。 */}
<div className="transition-[height] duration-base ease-emphasized" />
```

`shared/components/chat/HtmlRender.tsx:69` 就是这么写的 —— **照它抄**。

| 侧 | 现在实际用什么 | 说明 |
|---|---|---|
| **CSS / Tailwind 类** | 具名 token 类 `duration-fast/base/slow/deliberate` + `ease-out` / `ease-in-out` / `ease-emphasized`,**全部真能编译出** | 另有 Tailwind 默认档 `duration-150/200/300/500` 共 11 处未迁(见下面的红字) |
| **framer-motion** | [`shared/lib/motion.ts`](src/shared/lib/motion.ts) 的具名预设 | `SHEET_SPRING` / `SNAPPY_SPRING` / `FADE` / `PAGE_TRANSITION` / `TAP_SCALE` + variants |

🔴 **不要顺手把 `duration-200` 批量换成 `duration-fast`。** token 四档
`{160, 280, 420, 700}ms` 与 Tailwind 默认档 `{150, 200, 300, 500}` **没有一个相等** ——
换过去 = 改动画时长 = **视觉变化**,要产品/设计拍板,不是机械替换。
`shared/ui/dialog.tsx` 与 `sheet.tsx` 头部各留了一行红字警告防误迁。

⚠️ 连带的第二个事实(**本文件此前也写错了**):`shared/lib/motion.ts` 里是**字面秒数**,
读不到 CSS 变量(framer 的 `transition` 只吃数字/数组)。但现值是 `0.42 / 0.16 / 0.28`,
**三档全部命中 token**(= `--duration-slow / fast / base`),不是本文件曾写的
「`0.42 / 0.18 / 0.22`,只有 0.42 恰好相等」。两侧现在由
[tests/design-system-guard.test.ts](tests/design-system-guard.test.ts) 的
「动效 token 跨语言对齐」三条**硬失败**规则机械比对(含 motion.ts 头部那张对照表本身),
改任何一侧不同步另一侧当场红。

### 纸张质感(noise)

已于 2026-08-09 按产品要求完全移除。`index.html`、全局 CSS token、
条件选择器和单元素工具类均不再保留噪点入口，页面只渲染平面主题色。

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
5. **站内导航与实体跳转必须渲染真实 `<a href>`(react-router `<Link>`/`<NavLink>`)**;
   禁止以 button/div onClick + useNavigate 作为唯一跳转路径(**SEO 硬约束**:水合后的
   DOM 必须保留内链;2026-08-10 审计实测渲染后内链为 **0**)。`useNavigate` 仅用于
   程序化跳转(提交后重定向、canonical replace、会话态 URL)。点击处理用
   `isModifiedClick` 守卫 + 副作用(`@/shared/hooks` 的路径 helpers
   `paperPath/authorPath/journalPath/pdfPath` 是 href 唯一真源,副作用走
   `openXxx.prepare(entity)`),**不得 preventDefault、不得再 navigate**。

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

- [ ] **在仓库根跑过 `./scripts/check-design-system.sh`**(唯一会真的校验跨包镜像的口径;
      `npm run build` 里的绿灯不覆盖它 —— 见 §五「护栏在哪跑」)
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
