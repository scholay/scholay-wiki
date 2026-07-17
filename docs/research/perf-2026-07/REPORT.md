# Scholar 全栈性能审计报告(2026-07)

> 审计方式:89 个子智能体多维并行审计 + 逐条对抗验证(高危 2 名验证员、中危 1 名,验证员任务是**推翻**发现并亲读代码逐行核对)+ 完备性批评家补盲区。
> 范围:前端路由/渲染/资源冗余/数据层、后端 DB/逻辑/并发/中间件、agent 执行与多租户、agentbridge 桥接、Nginx/Docker、活库体检、小程序、Prism 编译链、存储生命周期。

**总计 86 条发现:52 条验证成立,0 条被推翻,34 条低危(单人核查未做双重验证)。**
严重度分布:high 5 / medium 37 / low 44。

## 目录速览(按层)

| 层 | 发现数 | high | medium |
|---|---|---|---|
| 前端 Web(frontend-user) | 25 | 2 | 10 |
| 后端 Go(backend) | 30 | 0 | 12 |
| Agent 容器(agent/, Bun 多租户) | 13 | 2 | 6 |
| 桥接链路(internal/agentbridge) | 7 | 0 | 5 |
| 基础设施(Nginx/Docker) | 7 | 1 | 1 |
| 微信小程序(miniprogram) | 4 | 0 | 3 |

> 同一问题被多个维度独立命中的已在下文各自保留(视为交叉印证):hubsMu 全局锁(be-logic + be-concurrency)、eventlog 批处理器锁内落库(be-db-query + be-concurrency + bridge)、agent_turn_events 无清理(be-db-query + bridge + db-live)、agent 会话 Map 不淘汰(agent-exec + agent-concurrency)、agent 容器 1.5G 限额(infra + agent-concurrency)。

## 修复优先级路线图

### P0 —— 稳定性风险(会打挂服务 / 删错文件 / 磁盘与表无界增长)

1. **前端 assets 按 mtime 回收会整代误删现役 chunk → 全站 JS/CSS 404**(high,`frontend-user/docker-entrypoint.d/40-sync-site.sh:24`)。`cp -a` 保留镜像构建时的 mtime,镜像龄超过 7 天后任何一次容器重启,`find -mtime +7 -delete` 会把**当前正在服役**的整代 chunk 删光。验证员用一次性容器端到端复现了故障机制。修法:回收基准改为「不在当前 dist 清单里的文件」而非 mtime(或 cp 后统一 touch)。
2. **Agent 容器 OOM 组合拳**:Bash 工具 stdout 无界缓冲进内存(high,`agent/src/tools/registry.ts`)+ 会话注册表连同含 base64 图片的完整 transcript 永不淘汰(medium,`agent/src/server/sessions.ts`)+ 无任何全局并发/准入控制(medium,`agent/src/server/ws.ts`)+ 生产仅 1.5G/2CPU(medium,`docker-compose.prod.yml`)。约 2 个重会话即可打挂承载全部 4 个 AI feature 的单容器。修法:工具输出截断上限、会话 LRU/TTL 淘汰、并发准入闸、容器配额重估。
3. **磁盘与数据表无界增长**:agent 会话 workspace 磁盘零回收且多会话按设计永久保留(high,`agent/src/server/sessions.ts:103`);executor 重启后 deleteSession 只认内存 Map,重启前的会话删除时磁盘目录永久遗留(medium);`agent_turn_events` 无 TTL/清理,RANGE 分区只建到 2026-09 之后全落 p_future(medium×2,迁移 0046);小程序侧 mermaid PNG 落 USER_DATA_PATH 永不清理,顶到 200MB 后图表功能永久哑火(medium)。修法:统一加 TTL GC + 删除路径按磁盘目录兜底 + 分区滚动/清理任务。
4. **eventlog deltaBatcher 全局锁内同步写 MySQL(含重试退避)**(medium,三个维度交叉印证,`backend/internal/agentbridge/eventlog_batcher.go`)。写通道一满,持全局锁落库,MySQL 抖动 → 全站所有会话的流式广播级联冻结。修法:锁外落库 + 满时降级丢弃(journal 本就是 best-effort)+ 按 session 分片。
5. **hubsMu 全局互斥锁内做网络拨号 + 多次 DB/HTTP 往返**(medium,两个维度交叉印证,`backend/internal/agentbridge/hub.go`)。全站新会话 WS 建连被串行化,一个慢拨号拖住所有人。修法:per-session 锁分片,dial/查库移出临界区。

### P1 —— 用户可直接感知的性能

- **前端首屏四连**:MarkdownRenderer 静态焊死 katex+hljs 致 /search 首访 589KB gz、法律页翻 5 倍(high);入口 chunk 747KB/226KB gz 全站门票(high);react-dom 本体漏出 vendor 分块致缓存失效面扩大(medium);/prism 首访 3.07MB 双编辑器栈焊单 chunk(medium)。
- **流式链路三处 O(N²)**:backend replayBuf 每帧全量重 marshal(medium);Web 前端 thinking 帧不合并 + fold 每帧全量重建(medium×2);小程序 claw 每 flush 全文重 parse + 整轮 setData(medium)。长回复越长越卡,三端同病。
- **Prism 编译链**:StartCompile 无并发闸/在途去重,排队超时被前端 auto-fix 回路放大成 AI 轮风暴(medium);每次编译全量物化文本+MinIO 资产,缓存命中路径也先白下载(medium);PDF 回传禁缓存整份重拉(medium)。
- **交互细节**:批量暂存 N 篇 = N 个 POST + N 次列表重拉;大文件下载被全局 30s timeout 掐断;审稿 failed 详情页每 5s 永轮询;PDF 页签切回整份重下载;feature_tools 公开列表每请求全表扫+filesort;agent 近上限稳态每条消息同步付一次摘要 LLM 阻塞首 token;/render/math 同步渲染阻塞 Bun 事件循环;续流补帧 256 队列静默丢最新内容;journal 校验器已失效仍每 60s 空转扫库。

### P2 —— 低危与清理机会

死依赖/死代码约 1.4MB 源码与包体(@tanstack/react-table、@radix-ui/react-select、peer-review-record 整目录等);nginx upstream keepalive 因未清 Connection 头而失效、限流键可被 XFF 伪造绕过、claw WS 落在 60s 通用超时;TieredRateLimit 的 is_vip 分支与 Maintenance 中间件管理员放行均为死代码;MySQL slow log 关闭不可观测(36h 内已有 10 条 >2s 慢查询)、Redis 偶发 20~156ms 命令 stall、umami 假 unhealthy;明细见下文各层。

---

# 前端 Web(frontend-user)


## 前端路由加载与bundle构成

### [🔴 high] MarkdownRenderer 静态焊死 katex+highlight.js(607KB/183KB gz),经 manualChunks 变成 all-or-nothing 巨块,搜索/claw/prism/新闻/法律条款等一大片路由首访被拖 —— 传统搜索模式也被智能搜索面板静态连坐

- **位置**:`frontend-user/src/shared/components/chat/MarkdownRenderer.tsx:5`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:三层机制叠加:① MarkdownRenderer.tsx:2-11 顶层静态 import react-markdown + rehype-highlight + rehype-katex + 'highlight.js/styles/github.css' + 'katex/dist/katex.min.css',katex(252KB min)与 highlight.js 全量 common 语言包(166KB min)进入同步依赖图;② vite.config.ts:42 `markdown: ['react-markdown','rehype-highlight','rehype-katex','remark-gfm','remark-math']` 把它们强制聚成单个 markdown-SNi9or-M.js(607KB min/182.7KB gz),任何消费方都只能整块下载;③ SearcherColumn.tsx:18 `import { SmartSearchPanel } from './smart-search/SmartSearchPanel'` 是静态 import,SmartSearchPanel → shared/components/chat(barrel)→ MarkdownRenderer,于是 /search 路由 chunk 静态依赖 markdown 巨块 —— 用户只用传统关键词搜索、一次智能对话都没发起,也要先下完 183KB gz 的 katex+hljs 才能渲染路由(React Router lazy 等待整个静态依赖图)。同链路还拖进 motion(125KB)、agent-attach(28KB)、agent-session-broadcast(22KB)。构建实测各路由首访 JS 总量(min/gz):/search 1844KB/589KB、/claw 1829KB/583KB、/m/claw(手机蜂窝网!)1824KB/581KB、新闻详情 1553KB/481KB、隐私/条款页 1549KB/481KB —— 法律纯文本页也为用不到的公式渲染和代码高亮付 418KB min。同文件 MermaidDiagram.tsx:10 注释明言铁律『体积 >50KB 动态 import』且 mermaid 已正确懒加载,katex/hljs 恰恰违反同一铁律。

**影响**:核心路径 /search 首访需下载 589KB gz JS(入口 283KB + 增量 306KB),弱网/移动网络下路由白屏数秒;/m/claw 手机端 581KB gz;隐私/条款/新闻这类轻内容页翻 5 倍体量。每个受影响路由的首次进入都被 183KB gz 的公式+高亮库闸住,而多数会话/页面根本不含公式或代码块

**建议**:分两刀:① MarkdownRenderer 内把 rehype-katex/katex.css、rehype-highlight/hljs.css 改为按需动态 import(检测内容含 $..$/``` 时再加载并二次渲染,或整个 MarkdownRenderer 用 React.lazy 包装),对齐 MermaidDiagram 已有模式;② 删掉或拆分 vite.config.ts 的 markdown manualChunk(至少把 katex、highlight.js 各自独立成 chunk),让 Rollup 按真实动态边界切分;③ SearcherColumn 把 SmartSearchPanel 改 lazy(仅智能模式激活时加载),对齐同文件 MatrixColumn/WelcomeBoard 已有的 lazy 拆分注释

### [🔴 high] 入口 chunk 747KB/226KB gz 是全站门票:AuthDialog 全家桶(zod+react-hook-form+turnstile+微信扫码等 ~105KB min)常驻 eager,react-resizable-panels 经 ui barrel 副作用滞留入口且零渲染方

- **位置**:`frontend-user/src/app/App.tsx:7`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:首屏必下三件套 = index-CuEk-2pH.js 747KB + vendor 103KB + query 84KB ≈ 934KB min/283KB gz(另 CSS 151KB/23KB gz),任何路由(含 SEO landing 页、手机端 /m/feed)都要先付这张门票。sourcemap 归因入口大头除 react-dom 174KB(见另一发现)外,可移除项:zod 52.4KB + react-hook-form 29.8KB + @hookform/resolvers + sonner 之外的 auth 组件树 16.4KB(LoginForm/RegisterForm/ForgotPasswordForm/WeChatQRPanel/TurnstileField 全在入口 sourcemap sources 里)+ @marsidev/react-turnstile 5.6KB —— 根因是 App.tsx:7 `import { AuthDialog } from '@/features/auth'` eager 导入、:78 常驻渲染,而登录弹窗仅在用户点登录时才需要;providers.tsx:41-45 已为同类问题给出样板(CollectFolderPicker 懒加载把 framer 移出首屏,实测入口闭包确无 motion chunk)。另 react-resizable-panels 26.2KB 滞留入口:auth 表单组件 import '@/shared/ui' barrel,barrel(shared/ui/index.ts:62)re-export './resizable',该库无 sideEffects 标注致 treeshake 保守保留 —— 但入口图里没有任何组件渲染 ResizablePanelGroup(WorkspaceShell/SkillMarketGrid 均不在入口 sourcemap 中)。

**影响**:全站每个首访(含拉新的 landing 宣传页 301KB gz、手机 /m/feed 350KB gz)都多付 ~35-40KB gz 的登录表单/校验库/面板库,首屏 TTI 直接变慢;登录弹窗多数访问从不打开

**建议**:AuthDialog 按 providers.tsx 的 CollectFolderPickerGate 模式改 lazy(store 首次 open 时加载,保持挂载避免 Radix pointer-events 锁问题);shared/ui barrel 移除 resizable 的 re-export(消费方直接 import '@/shared/ui/resizable')或给依赖打 sideEffects:false 补丁;顺带审计 barrel 里其他低频重组件

### [🟠 medium] manualChunks vendor 只锁住 react-dom 包入口,174KB 的 react-dom/client 本体漏进入口 chunk —— vendor 缓存分层意图落空,每次发版用户重下 react-dom

- **位置**:`frontend-user/vite.config.ts:34`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:`vendor: ['react','react-dom','react-router-dom']`(数组形式)只把这三个 specifier 解析到的包入口模块钉进 vendor chunk。main.tsx:2 实际 import 的是 'react-dom/client',它解析到 react-dom/client.js → react-dom-client.production.js(174KB min),不匹配数组里的 'react-dom' 模块 id,于是被 Rollup 按默认策略并进了应用入口 chunk。sourcemap 实证:vendor chunk(101KB)里 react-dom 相关只有 react-dom.production.js(3.5KB 的 legacy 入口壳),而 react-dom-client.production.js + scheduler 全在 index-CuEk-2pH.js 里(归因 174.4KB,占入口 24.1%)。vendor chunk 的意义本是『框架代码几乎不变,跨发版长缓存』,现在恰恰把最大的一块框架代码放进了每次发版必然换 hash 的入口 chunk。

**影响**:老用户每次发版(本项目发版频繁)重新下载 ~174KB min(约 55KB gz)完全未变的 React 运行时;入口 chunk 被撑到 747KB 也拉长了首访的单文件下载与解析

**建议**:manualChunks 改函数形式按包名归组(id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler') → 'vendor'),或数组里补 'react-dom/client'、'react/jsx-runtime';改完用 sourcemap 复核 vendor ≈ react+react-dom+router 全量、入口不再含 react-dom-client

### [🟠 medium] /prism 首访 3.07MB JS(969KB gz):codemirror(~265KB)+ tiptap/prosemirror(~330KB)双编辑器焊在单个 904KB 页面 chunk,pdfjs TextLayer 412KB 又被 PdfViewer 静态拖进 —— 三大重件不分先后一次性下完

- **位置**:`frontend-user/src/features/prism/components/PrismWorkspace.tsx:6`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:PrismPage 是单个 lazy 路由,但页面内部再无第二层代码分割:PrismWorkspace.tsx:6 `import { PdfViewer } from '@/shared/components/PdfViewer'`、:13 `import { LatexEditor ... } from './LatexEditor'` 均为静态导入,LatexEditor 静态引 @codemirror/*(view 154KB + state 45KB + language/commands/merge/lezer ~110KB),Tiptap 所见即所得编辑器(tiptap-extensions.tsx)静态引 @tiptap/* + prosemirror-*(合计 ~330KB),全部进了 PrismPage-BQxu_zD1.js(904.7KB min/295.8KB gz,构建警告超 700KB 上限的唯一业务 chunk);PdfViewer 链又静态挂上 pdfjs 的 TextLayer chunk(412KB/122KB gz)。加上另一发现的 markdown 593KB,/prism 首访静态闭包实测 69 chunks、3074KB min/969KB gz。用户打开文档默认只在一种编辑模式(源码 or 预排版),另一套编辑器(~330KB)和 PDF 预览(仅编译产出后才看,412KB)都可以等交互再拉。mathlive(816KB)已在 MathEditorDialog 里正确动态 import,证明该页有懒加载先例。

**影响**:智能写作(主打功能之一)首次进入需下载近 1MB gzip JS,国内普通网络下编辑器可交互前有数秒白屏/骨架;此后每次发版该 904KB chunk 整体换 hash 重下

**建议**:按编辑模式二次切分:LatexEditor(codemirror)与 Tiptap 预排版编辑器各自 React.lazy,进入对应模式才加载;PdfViewer 改 lazy(首次编译成功/用户切 PDF 面板时加载);markdown 依赖随发现 1 一并瘦身。目标把 PrismPage 首屏 chunk 压到 ~300KB min 内

### [🟡 low] index.html 每次整页加载向后端发 3 个配置请求(umami-config/system/code-snippets),其中 2 个无任何缓存策略 —— 抢首屏带宽且随 PV 线性打后端

- **位置**:`frontend-user/index.html:90`
- **验证**:⚪ 低危未做对抗验证

**机制**:head 里三段内联脚本在 HTML 解析期立即 fire:①:65 `fetch('/api/v1/public/umami-config', { cache: 'force-cache' })`(有缓存,OK);②:90 `fetch('/api/v1/config/system')` 拿 GA 衡量 ID;③:157 `fetch('/api/v1/config/code-snippets')` 拿代码片段。②③既无 `cache` 选项也依赖后端响应头(若后端未下发 Cache-Control 则每次整页加载都回源),与 entry/vendor/query 的下载同期竞争同一条 HTTP/2 连接;这三项配置(GA ID、片段库)变更频率极低,却按 PV 次数打到 Gin。另 Clarity(:49)硬编码 project id 以 async 外链加载,无性能问题但注意它在所有页面包括 /admin 都会上报。均不阻塞渲染(异步注入),影响限于带宽竞争与后端 QPS。

**影响**:每次整页加载额外 2-3 个后端往返,高峰期给 /api/v1/config/* 带来与 PV 等量的 QPS;弱网下与首屏 JS 抢带宽,轻微推迟 TTI

**建议**:②③也加 `{ cache: 'force-cache' }` 或后端给这两个接口下发 `Cache-Control: max-age=300`;或合并三个配置为单个 bootstrap 接口一次拉取

### [🟡 low] 构建产出 365 个 JS chunk,单路由静态闭包 40-61 个模块请求(lucide 图标一图标一 chunk)—— 高 RTT 移动网络下请求扇出放大加载尾延迟

- **位置**:`frontend-user/vite.config.ts:35`
- **验证**:⚪ 低危未做对抗验证

**机制**:vite.config.ts:35-38 注释记录了刻意移除 lucide-react 的 icons manualChunk(避免 80KB 图标块进首屏,方向正确),副作用是每个图标就近成为独立微 chunk(file-text/bookmark/copy/eye/… 每个 0.3-1KB),叠加组件级共享 chunk 后:构建共 365 个 JS 资产;实测静态闭包 ClawPage 56 chunks、SearchPage 54 chunks、MatrixColumn 61 chunks —— 首次进入这些路由要并发拉 50+ 个文件。Vite 会通过 modulepreload 平铺(无瀑布深度问题),HTTP/2 复用下带宽成本不高,但每请求的调度/解压/求值开销在手机高 RTT 场景累计可感,也让 nginx access log 与缓存条目膨胀。

**影响**:移动端/高 RTT 网络下路由加载尾部拖长(几十个微请求的调度开销),CDN/nginx 缓存对象数膨胀;桌面宽带影响可忽略

**建议**:给 Rollup 配 output.experimentalMinChunkSize(如 8-10KB)或函数式 manualChunks 把 <2KB 的图标/微模块按引用路由聚簇,在『图标不进首屏』与『请求数可控』间取中间值;改后复核首屏闭包不回胖


## 前端渲染性能

### [🟠 medium] 流式 thinking 帧从不合并:socket.messages 随思考 token 数线性膨胀,叠加每帧全量重折叠形成会话内 O(N²) 流式开销

- **位置**:`frontend-user/src/shared/lib/agent-stream.ts:90`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:appendStreamMessage 是三个 agent feature(claw/智能搜索/prism)共用的 WS 消息累积函数,其自身注释明确说明合并的目的是防止「messages[] 撑到 O(token 数),上层每帧全量重折叠 ⇒ O(N²)」。但它只合并了两类相邻帧:带 text 的 content_delta(line 91-96)和带 toolInput 的 content_delta(line 100-114);`{type:'thinking', text}` 帧完全没有合并分支,每条 thinking delta 都走 `return [...prev, evt]`(line 115)整数组拷贝后独立入列。而 agent 侧 turnLoop.ts:226 是逐 thinking_delta 发帧的(`else if (d.type === "thinking_delta" && d.thinking) sink.frame({ type: "thinking", text: d.thinking })`),开思考的模型一轮就能产出成百上千条 thinking 帧。下游 useAgentSocket.ts:191 每个 rAF flush 执行 `batch.reduce(appendStreamMessage, prev)`(每条新帧一次 O(N) 拷贝),消费方 useClawConversation.ts:232 / SmartSearchPanel.tsx:380 每次 flush 对整个 messages 数组重跑 foldMessagesIntoTurns(fold.ts:69 `for (const msg of messages)`,thinking 分支 fold.ts:130-134 逐条 `current.thinkingText += msg.text`)。messages 在一次会话挂载内只增不减(仅切会话 clearMessages),所以前面轮次积累的所有 thinking 帧会让后续每一轮流式期间的每个动画帧都付出 O(N) 遍历 + O(N) 拷贝。

**影响**:凡是启用思考的模型(claw/智能搜索/prism 均渲染 ThinkingFold,thinking 帧是常态),长会话不刷新页面连续对话时:每轮流式期间每个动画帧(最高 60fps)对累计上万条消息做全量 switch 遍历 + 每条新到帧一次全数组拷贝,CPU 在整个回答期间(往往 30s~几分钟)持续偏高、GC 压力大、越聊越卡;移动端/低端机流式打字肉眼掉帧。这正是该文件注释里自己声明要防、且已为 text/toolInput 堵上的同一个 O(N²),thinking 是漏网的第三类高频帧。

**建议**:在 appendStreamMessage 里增加第三个合并分支:相邻两帧均为 `type==='thinking'` 且带 string text 时合并为一帧(与 fold 的 `thinkingText +=` 语义完全等价,fold 不区分一条还是多条)。三个 feature 与 admin 会话监控共用此函数,一处修复全局生效。

### [🟠 medium] fold 每次重建全部 live Turn 对象 + useAgentSocket 返回值/回调引用每 render 变化:流式期间「本次挂载的所有轮」每帧穿透 memo 重渲,未 memo 的论文列表组件每帧重跑十余个 hooks

- **位置**:`frontend-user/src/features/claw/components/chat/fold.ts:44`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:foldMessagesIntoTurns 每次调用都 `pendingTurns.map((p) => ({...}))` 新建全部 Turn 对象(fold.ts:44-55,智能搜索同款 fold 同构),而 pendingTurns 在一次会话挂载内只增不减(useClawConversation.ts 注释自认「pendingTurns 整个 session 都累积着」)。于是流式期间每个 rAF flush 产出的 liveTurns 里,连早已 complete 的历史轮也全部是新引用 → MessageTurn/AssistantTurn 的 memo 对 live 轮全部失效。这与 MessageTurn.tsx:84-86 注释宣称的「历史轮的 turn 对象引用稳定→memo 直接跳过它们,只有正在流式的那轮才重渲染」不符(该保证只对 replayHistoryAsTurns 的 history 轮成立)。每帧重渲的 live 轮里:MessageTurn.tsx:163 对每个文本块跑 stripContainerPaths 正则(O(正文长度));更重的是 renderResultPreview 挂的 PaperListScroller(PaperListScroller.tsx:53,无 memo)与 ClawPaperList(ClawPaperList.tsx:35,无 memo)——每帧重跑其全部 hooks:useStagingView(4 个 store 订阅 + 多个 useMemo)、useStagingActions(useStagingActions.ts:83-98,7 个 zustand selector + 6 个 useMutation 实例)、3 × useFavoriteCheck、useJournalEnrichments、useAutoAnimate。另外 useAgentSocket.ts:473-501 每 render 返回新对象字面量(send 等每次新建),使 useClawConversation.ts:485-500 中依赖 [socket] 的 handleNewConversation/handleActivateSession 每帧新引用,ClawSidebar 及其会话列表行随之每帧重渲,line 144-149 依赖 [socket] 的 effect 也每 render 重执行。

**影响**:一次长坐席(同一会话几十轮不刷新、每轮含论文卡工具结果)流式回答期间,每个动画帧重渲几十个 MessageTurn/AssistantTurn 子树 + 每个论文组重跑 ~15 个 hooks + 侧栏全部会话行,CPU 在整个流式期间持续偏高(正文 markdown 因字符串值相等被下层 memo 兜住不重 parse,但组件层/正则/hook 开销逃不掉);与发现 1 叠加,会话越长流式越卡。项目 2026-07 的 CPU 打满事故(prod 剥了警告只见 CPU 满)说明这类静默重渲风暴在真实负载下会被放大。

**建议**:三个低侵入修复任选组合:① fold 增量化——已 complete 的轮缓存复用旧 Turn 引用(如按 message_complete 边界缓存前缀折叠结果),只重建最后一条未完成轮;② PaperListScroller / ClawPaperList 包 memo(props content/toolUseId 引用稳定,可直接命中);③ useAgentSocket 用 useMemo/useCallback 稳定返回对象与 send,消费方依赖 [socket] 的回调随之稳定。同时修正 MessageTurn 的 memo 注释,避免后人基于错误前提加重渲染。

### [🟠 medium] Prism 写作台每次键击执行 3 次全文级字符串操作并重渲整个工作台子树(含 PdfViewer/聊天面板/文件侧栏),文档越大打字延迟越明显

- **位置**:`frontend-user/src/features/prism/components/LatexEditor.tsx:167`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:键击链路:① LatexEditor 的 CodeMirror updateListener 每次 docChanged 调 `u.state.doc.toString()`(LatexEditor.tsx:167,CM 内部 rope 全量摊平,O(文档长度))→ onChange=setBuffer;② PrismWorkspace 持 buffer state(PrismWorkspace.tsx:160 `const [buffer, setBuffer] = useState('')`,367 `onChange={readOnly ? undefined : setBuffer}`),每键击整个工作台函数组件重跑;③ 其中 `const outline = useMemo(() => parseOutline(buffer), [buffer])`(line 294)每键击对全文 `body.split('\n')` + 逐行正则(parseOutline line 70-80,O(行数));④ LatexEditor 的 value 同步 effect(line 188-195)又跑一次 `v.state.doc.toString()` + O(n) 字符串比较;⑤ 子树中 PrismChatPanel(features/prism/components/PrismChatPanel.tsx:32,无 memo,内部含 useUserModels、useComposerAttachments 等一串 hooks)、PdfViewer(shared/components/PdfViewer.tsx:65,forwardRef 无 memo,含 react-pdf Document/Page 与 toolbar)、PrismFileSidebar(接收每键击新建的 outline 数组)全部随键击重渲。仅存的防抖(useDebounce 800ms,line 183-189)只作用于保存请求,不覆盖上述渲染/解析链。

**影响**:智能写作的核心交互是编辑器打字。中大型 .tex(50–500KB,论文+参考文献常见)下每键击 = 2 次全文 toString + 1 次全文比较 + 1 次全文逐行正则 + 整个三栏工作台 VDOM 重算(含 react-pdf 组件树),单键开销数 ms 起步、随文档线性增长,低端机可感的输入延迟;连续打字时开销连续叠加。

**建议**:① outline 解析防抖:parseOutline 改用 useDeferredValue(buffer) 或复用已有的 debounced 值(大纲不需要键级实时);② onChange 不再 toString 全文,或用 useSyncExternalStore/局部 state 把 buffer 收进编辑器容器组件,PrismWorkspace 只在保存/发起 AI 轮时经 ref 拉取正文(编辑态不驱动全工作台重渲);③ PrismChatPanel、PdfViewer、PrismFileSidebar 包 memo,outline 数组内容比较后再换引用。

### [🟡 low] 搜索页拖宽手柄每次 pointermove 同步写 localStorage + 派发全局事件 + 二次 JSON.parse 回读,拖动期间每帧两次 storage IO 加双 setState

- **位置**:`frontend-user/src/features/search/pages/SearchPage.tsx:242`
- **验证**:⚪ 低危未做对抗验证

**机制**:startDrag 的 onMove 直接对每个 pointermove 事件调 setSearcherWidth(SearchPage.tsx:242-249),而 setSearcherWidth 来自 useLocalStorage:其 set 函数在每次调用里同步执行 `window.localStorage.setItem(key, JSON.stringify(resolved))` 并 `window.dispatchEvent(new CustomEvent('local-storage', ...))`(useLocalStorage.ts:28-31);同一个 hook 自己又监听该事件,回调里 `setValue(read())` 再做一次 localStorage.getItem + JSON.parse(useLocalStorage.ts:43-44, 11-19)。即拖动期间每个指针事件(60–120Hz)= setItem + 事件派发 + getItem + JSON.parse + 两次 setState + 整个 SearchPage 子树重渲(SearcherColumn 全部论文卡 + MatrixColumn 矩阵表;卡片 memo 能挡住大部分,但布局宽度变化本身已在逐帧 reflow)。localStorage 是同步阻塞主线程的 IO,与逐帧 layout 叠加。

**影响**:拖动搜索器分栏宽度时(带满页搜索结果 + 矩阵已挂载的重型工作区)出现拖动卡顿/掉帧;每秒上百次同步 storage 读写纯属浪费。仅影响该交互瞬间,不影响常驻性能。

**建议**:拖动过程中用普通 useState/ref + style 宽度更新,pointerup 时一次性写入 useLocalStorage;或给 useLocalStorage 的 set 增加「同 hook 实例跳过自派发事件回读」的短路(自己 set 时无需再 read 一遍)。

### [🟡 low] PdfViewer 连续/双页模式一次性 mount 全部页面,无虚拟化,大 PDF 切换模式时内存与首帧成本高

- **位置**:`frontend-user/src/shared/components/PdfViewer.tsx:48`
- **验证**:⚪ 低危未做对抗验证

**机制**:组件头注释自认:「single 只渲染当前一页;continuous / two-up 一次性 mount 所有 Page(学术论文 < 30 页常态,百页 PDF 再上 @tanstack/react-virtual)」(PdfViewer.tsx:48-49)。PdfViewerContent 在多页模式下按 numPages 全量渲染 react-pdf Page(每页 canvas + text layer + annotation layer),并为每页挂 IntersectionObserver 同步当前页。该组件是全站通用 PDF 预览(文献库上传 PDF、论文详情 OA 全文、prism 编译产物均走此组件),用户可打开任意页数的 PDF(书籍、长报告、学位论文 100–400 页很常见),此时切到连续模式会一次性创建数百个 canvas/text-layer。项目已在 4 处使用 @tanstack/react-virtual,基础设施现成。

**影响**:打开 100 页以上 PDF 并切连续/双页模式时:一次性数百个 canvas 位图占用数百 MB 级内存、首次渲染长时间白屏/卡死滚动,移动端(MobileFolderPage 等也复用)更易触发浏览器 tab 崩溃。常规论文(<30 页)不受影响,故 low。

**建议**:连续/双页模式接入 @tanstack/react-virtual(项目既定虚拟列表方案,已有 4 处使用先例),按页高估算 overscan 渲染视口附近页;或先做低成本兜底:numPages 超阈值(如 60)时禁用连续模式/提示分段加载。


## 前端资源冗余

### [🟠 medium] PrismPage 单个懒加载 chunk 925KB(gzip 287KB),把新旧两代编辑器栈(tiptap/ProseMirror + CodeMirror)全量打在一起,任一方对当前项目都是纯浪费

- **位置**:`frontend-user/src/features/prism/pages/PrismPage.tsx:6`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:PrismPage.tsx 顶部静态 import 了两代工作台:`import { PrismWorkspace } from '../components/PrismWorkspace'`(V1,内含 LatexEditor/LatexDiffEditor,即 @codemirror/view+state+language+legacy-modes+merge 全家桶)和 `import { PrismWorkspaceV2 } from '../components/PrismWorkspaceV2'`(V2,内含 StructEditor,即 @tiptap/react+starter-kit+extension-table×4+ProseMirror)。运行时按 `proj.schema_version === 'struct'`(PrismPage.tsx:50)二选一渲染,但静态 import 使 Rollup 把两套编辑器都打进同一个路由 chunk:实测 build/assets/PrismPage-BQxu_zD1.js = 925,271 字节(gzip 287KB),chunk 内同时命中 ProseMirror 签名 104 处和 CodeMirror 'cm-' 签名 193 处。另外 PrismPage 还静态 import PrismPreview(仅 PRISM_COMING_SOON 蒙层态使用,PrismPage.tsx:31),开着 coming-soon 门时用户同样要先下完整 925KB 才能看到一张蒙层。

**影响**:每个进入 /prism 工作区的用户(含只有 struct 新项目的用户)都要下载并解析两套编辑器,其中一套完全不会执行;925KB JS 的解析/编译在中低端设备上是可感知的进入延迟(gzip 287KB 在 4G 下约 1-2 秒额外下载)。legacy(CodeMirror)栈估算占 300-400KB min,对新项目用户是纯浪费。

**建议**:把 PrismWorkspace(V1)与 PrismWorkspaceV2 改为 React.lazy()/动态 import,在 schema_version 判定后再拉对应 chunk(与项目里 ClawArtifactPreview 对 PdfViewer/SpreadsheetPreview 的处理同款);PrismPreview 也随 coming-soon 分支懒加载。若 legacy 项目已可全部迁移,直接删除 V1 栈并顺带下掉 @codemirror/merge 等仅 V1 使用的依赖。

### [🟡 low] src/shared/components/peer-review-record/ 整目录(6 文件,88KB 源码)是死代码,且与 features/peer-review/components/record/ 近全量复制、已开始双向分叉

- **位置**:`frontend-user/src/shared/components/peer-review-record/ReviewerDetailPanel.tsx:1`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:「审稿 record 面板提升 shared 供后台监控镜像复用」的重构留下了一个孤儿链:shared/components/peer-review-record/ 下 6 个组件(StatusGrid 370 行、ReviewerDetailPanel 609 行、ChiefVerdictPanel 520 行、DetailRail 163 行、EditorialCheckPanel 125 行、MethodologyPhaseCard 39 行)在全仓库的唯一 importer 是 src/features/admin/components/PeerReviewRecordView.tsx,而 PeerReviewRecordView 自身没有任何 import 引用(仅出现在 PeerReviewRecordParts.tsx 和 SkillReviewPage 的注释里)——后台会话监控实际用的是 PeerReviewMonitor.tsx(其 import 列表 1-19 行不含 PeerReviewRecordView)。连带 PeerReviewRecordParts.tsx(173 行)和 lib/pr-record-adapter.ts(117 行,唯一 importer 也是死的 RecordView)全部死掉。同时用户端活副本 features/peer-review/components/record/ 与 shared 副本几乎逐行相同但已分叉:shared 版 StatusGrid 多 hideEditorial prop,ReviewerDetailPanel 字节数 26,343 vs 26,587,shared 副本停在 7/15、feature 副本 7/16 还在改。

**影响**:约 116KB / 2300+ 行死源码。运行时无影响(tree-shaking 已剔除,构建产物中无该链),但这是全仓库最大的一块死代码,且双副本已实际分叉——后续在 feature 副本修 bug 时极易误改/漏改 shared 副本,或未来有人误把死的 shared 副本当真源重新挂载,复活的是旧逻辑。

**建议**:确认后台监控确已不走 PeerReviewRecordView 路线后,整体删除 src/shared/components/peer-review-record/、admin/components/PeerReviewRecordView.tsx、PeerReviewRecordParts.tsx、admin/lib/pr-record-adapter.ts;record 面板保留 features/peer-review/components/record/ 单一真源。若监控镜像还要回来,应从 feature 版引用而非再复制。

### [🟡 low] 两个零 import 的死依赖:@tanstack/react-table(776KB)与 @radix-ui/react-select(492KB),前者还残留在 vite manualChunks 配置里;另有 @dnd-kit 两包被生产代码引用却挂在 devDependencies

- **位置**:`frontend-user/package.json:43`
- **验证**:⚪ 低危未做对抗验证

**机制**:对 package.json 全部 71 个 dependencies 逐个做 import 级核对(src/ + tests/ + index.html + vite.config.ts,含动态 import 与子路径):@tanstack/react-table(package.json:43)和 @radix-ui/react-select(package.json:36)命中 0 个文件——shared/ui/ 下也没有 select.tsx 封装,项目下拉全部用 Radix DropdownMenu/Popover。vite.config.ts:43 的 manualChunks 仍写着 `table: ['@tanstack/react-table', '@tanstack/react-virtual']`,react-table 因不在模块图中被 Rollup 静默忽略,实际产物 table-CKDoi65N.js 只有 16KB(纯 react-virtual),配置与现实脱节。反向问题:@dnd-kit/core 与 @dnd-kit/sortable(package.json:92-93,devDependencies)被生产组件 src/features/search/components/dimension-settings/DimensionSettingsDialog.tsx 和 DimensionRow.tsx 运行时 import,归类错误。

**影响**:无 bundle 体积影响(未 import 即被剔除),但两个死依赖白占安装/CI 时间与 node_modules 体积(合计约 1.3MB + 传递依赖),且 manualChunks 死条目和 CLAUDE.md「表格必用 react-table」的约定共同误导后续开发者以为它在用。@dnd-kit 放 devDependencies 目前碰巧无害(构建本身依赖 devDeps),但任何按 dependencies 语义做裁剪/审计的工具都会误判。

**建议**:npm uninstall @tanstack/react-table @radix-ui/react-select,删掉 vite.config.ts manualChunks 的 react-table 条目(table 组可直接改名 virtual 或去掉),并把 @dnd-kit/core、@dnd-kit/sortable 移入 dependencies;同步更新 frontend-user/CLAUDE.md 第三方表格行,避免下个人按文档把它又 import 回来。

### [🟡 low] 零散死代码 9 个文件约 48KB(含已下线的 AdminCommandPalette、V1 遗留 PrismSidebar/ClawPreview/WorkspaceShell 等),以及两处微型重复实现(双份分享面板 store、双份数据源品牌映射)

- **位置**:`frontend-user/src/features/admin/components/AdminCommandPalette.tsx:1`
- **验证**:⚪ 低危未做对抗验证

**机制**:文件级引用扫描(748 个 ts/tsx,匹配一切 import 路径含 '/<basename>' 的字符串)找出 10 个零引用文件,逐个人工复核后确认 9 个为死代码(所有残留引用均为注释):AdminCommandPalette.tsx 7.3KB(AdminShell.tsx:21 注释明说「⌘B/⌘K 快捷键含 AdminCommandPalette 此前已下线」)、JournalExploreOverview.tsx 6.5KB、PrismSidebar.tsx 4.4KB、ClawPreview.tsx 3.1KB、app/layouts/WorkspaceShell.tsx 2.2KB(仅 ErrorBoundary.tsx:19 注释提及)、claw ConnectionBadge.tsx 1.6KB、_placeholder/FeaturePlaceholderPage.tsx 1.0KB、admin/pages/_stub.tsx 0.9KB、smart-search/dataSourceBrand.ts 0.2KB。重复实现两处:① stores/share.store.ts(22 行)与 shared/components/share/use-share-sheet.ts(19 行)是字段完全同构的两个 zustand 分享面板 store,PC/移动各挂一份 ShareSheet;② dataSourceBrand.ts 自己的文件头注释承认与 shared/lib/mask-tool-source.ts 的 normalizeSourceBrand 映射「一致」,属复制后又死掉。

**影响**:全部被 tree-shaking 剔除,零运行时影响;代价是源码噪音和维护误导(例如给死的 ConnectionBadge/PrismSidebar 做无效重构,或分享面板行为改动只落到两个 store 之一)。整体死代码率很低(10/748 文件),说明仓库卫生良好,此项主要是收尾清扫。

**建议**:删除 9 个死文件(_placeholder 若为脚手架约定可留目录删内容);分享面板 store 二合一:PC 端 LibraryPage 改用全局 stores/share.store.ts,删除 use-share-sheet.ts;dataSourceBrand.ts 直接删(真源在 shared/lib/mask-tool-source.ts)。


## 前端数据获取层

### [🟠 medium] 批量暂存 N 篇论文 = N 个并行单篇 POST,且每个成功回调各自触发一次暂存区列表失效重拉,无批量端点

- **位置**:`frontend-user/src/features/search/hooks/useStagingActions.ts:345`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:「一键导入」(EmptyMatrixPreview.tsx:278 传统搜索、PaperListScroller.tsx:194 智能搜索)走 bulkStagePapers,对每篇论文各发一个 POST /user/staging-areas/:id/papers,用 Promise.all 并行打出(useStagingActions.ts:345-358,注释自述『并行 fire mutations…后端 AddPaper 单点无 rate-limit』)。而 useAddRemotePaper 的 onSuccess 每次都调 invalidate(qc)(staging-areas.ts:168 → :100-101 invalidateQueries(['staging-areas'])),N 个 mutation 在不同时刻 settle → 对 GET /user/staging-areas 反复 cancel+refetch(invalidateQueries 默认 cancelRefetch),被 abort 的请求后端仍会完整执行。暂存区上限 MAX_PAPERS_PER_AREA=100,最坏一次点击 = 100 个并行 POST + 数十次列表 GET。

**影响**:用户在搜索页点一次「一键导入」(页大小 10-50 篇)即产生 10-50 个并发写请求 + 同数量级的列表重拉;多用户同时操作时对后端 staging-areas 表和 IP 级限流(100 req/s)形成突发压力,用户侧也可能因触发限流出现部分论文导入失败。

**建议**:后端加批量端点 POST /user/staging-areas/:id/papers/batch 一次提交;短期前端可先把 per-item onSuccess 的 invalidate 去掉,改在 bulkStagePapers 的 Promise.all 完成后统一 invalidate 一次(单篇路径保留原行为)。

### [🟠 medium] 审稿报告查询对 failed/终态投稿永不停轮询:只按「不足 4 份报告」判停,失败的审稿详情页每 5s 打一次后端

- **位置**:`frontend-user/src/features/peer-review/api/reports.ts:34`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:useSubmissionReports 的 refetchInterval 只看 `items.length < 4 ? 5000 : false`(reports.ts:34-37),完全不参考 submission.status。而 SubmissionStatus 存在 'failed' 终态(types.ts:23 『failed — agent 异常 / 配额不足』),失败的投稿永远凑不齐 4 份报告。RecordDetailPage 无条件挂载该查询(RecordDetailPage.tsx:46),用户打开任意一条失败/中途取消的历史审稿记录,页面就以 5s 间隔无限轮询 /user/peer-review/submissions/:id/reports,直到关页。对照:同文件夹的 useSubmission(submissions.ts:68-76)按 computeState 正确判停。

**影响**:每个停留在失败审稿详情页的前台标签页 ≈ 720 请求/小时(refetchIntervalInBackground 默认 false,后台标签会暂停,故限于前台停留场景);报告接口带 4 份完整报告 JSON,长期挂着白耗后端与带宽,且随失败记录数量和用户回看行为线性放大。

**建议**:refetchInterval 回调里结合投稿终态判停:把 submission.status/computeState 传入(或在 RecordDetailPage 用 `enabled`/条件 interval),`status === 'failed'`(及其他终态)时返回 false;凑齐 4 份的现有条件保留。

### [🟠 medium] 大文件 blob 下载共用全局 axios 30s timeout,慢网下载审稿附件 zip / 导出 docx 会中途被掐断(上传已特判 60s,下载没有)

- **位置**:`frontend-user/src/shared/lib/http.ts:14`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:共享 http 实例设 `timeout: 30_000`(http.ts:14),XHR 的 timeout 覆盖整个响应体传输。上传路径已意识到这个问题并按需覆写(library/api/pdf.ts:70 `timeout: 60_000` + onUploadProgress),但所有 blob 下载都没有覆写:审稿原稿+附件 zip(peer-review/api/submissions.ts:370-372,稿件上传上限 50MB,打包后同量级)、prism 编译 PDF(PrismWorkspace.tsx:219 / PrismWorkspaceV2.tsx:391)、docx 导出(prism.ts:522)、claw 交付物 arraybuffer(artifacts.ts:112-114)、admin 文件预览(AdminFileViewer.tsx:21)。注:2026-06 修过的『下载 15s 截断』是后端侧,前端 30s 封顶是残留的另一半。

**影响**:带宽低于 ~13 Mbps 的用户下载 50MB 级 zip 必然在 30s 处 ERR_CANCELED,表现为『下载失败请重试』且重试也永远失败;prism 大 PDF、admin 大附件预览同理。随附件体积增长恶化。

**建议**:所有 `responseType: 'blob' / 'arraybuffer'` 的请求显式覆写 `timeout: 0`(或 120s+);更彻底的做法是给下载走独立的长超时实例/工具函数,与 15s/30s 的 API 语义超时分离。

### [🟡 low] LibraryReferencePicker(三 agent 共用引用文献选择器)的论文搜索框无防抖,每敲一个字符发一次后端请求

- **位置**:`frontend-user/src/shared/components/chat/LibraryReferencePicker.tsx:174`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:搜索输入直接 `onChange={(e) => setQ(e.target.value)}`(:174),q 原样传入 useLibraryBrowsePapers(:85),而该 hook 把 q 直接放进 queryKey(library-browse.ts:48 `queryKey: [... , q]`),没有任何 debounce。每个中间前缀都是一个新 queryKey → 一次 GET /user/library?folder=&q=。同仓库同类场景都做了防抖:PrismCitationDialog 用 useDebounce(q, 300)(PrismCitationDialog.tsx:26),搜索联想统一 280ms(suggestions.ts:63)。该组件被 claw / smart-search / prism 三个输入框常驻复用。

**影响**:用户在引用选择器里输入 11 个字符的检索词 = 11 个后端 LIKE 查询(文献集大的用户每次都是全量模糊匹配),打字期间请求队列排队,慢网下最终结果可能被中间前缀的响应竞争;staleTime 30s 还会把所有中间前缀结果全部占进缓存。

**建议**:与 PrismCitationDialog 对齐:`const dq = useDebounce(q, 300)` 后把 dq 传入 useLibraryBrowsePapers;或把防抖下沉进 useLibraryBrowsePapers 使所有调用方受益。

### [🟡 low] admin 导入任务详情 1.5s 轮询不判终态:任务完成后只要停留在页面/弹窗就继续每 1.5s 打后端

- **位置**:`frontend-user/src/features/admin/api/feature-tools.ts:192`
- **验证**:⚪ 低危未做对抗验证

**机制**:useImportJob 的 `refetchInterval: poll ? 1500 : false`(feature-tools.ts:192)把判停责任交给调用方,但两个调用方传的都是『有没有 id』而不是『任务是否还在跑』:FeatureToolImportPage.tsx:42 `useImportJob(jobId ?? undefined, jobId != null)`、FeatureToolJobsPage.tsx:62 `useImportJob(id ?? undefined, !!id)`。两处都在拿到数据后才算 `running = status === 'pending' || 'running'`,却没把它接回 poll。任务 succeeded/failed 后,导入页(jobId 是 state,不离开不清)与任务详情弹窗(不关不清)都以 1.5s 间隔无限轮询。对照:prism useCompile(prism.ts:174-177)在 hook 内部按 status 判停,是正确样板。

**影响**:admin-only、单人页面,量级有限(前台 0.67 req/s),但导入完成后管理员核对结果期间(常见停留数分钟)持续空转打 /admin/tools/import-jobs/:id;间隔 1.5s 也偏激进。

**建议**:照 useCompile 模式把判停收进 hook:`refetchInterval: (q) => { const s = q.state.data?.status; return s === 'pending' || s === 'running' ? 1500 : false; }`,调用方的 poll 参数即可删除。

### [🟡 low] admin 会话监控 transcript 全量拉取无分页:用户端有 limitTurns 窗口,管理端一次拉整个会话 jsonl

- **位置**:`frontend-user/src/features/admin/api/session-monitor.ts:64`
- **验证**:⚪ 低危未做对抗验证

**机制**:useAdminTranscript 直接 GET /admin/agent-sessions/:id/messages,不传任何 limit 参数(session-monitor.ts:63-67),注释自述『拉某会话的完整 transcript』。对照用户端同数据源已做窗口化:claw useClawHistory 显式 `limit=limitTurns`(claw/api/session.ts:118,注释『避免上万轮 transcript 一次性推给浏览器 JSON.parse + 折叠 + 渲染』,初始窗口 HISTORY_WINDOW=100)。管理端看长会话时把用户端刻意规避的问题原样吃下。

**影响**:仅 admin 使用、单会话单次;但监控重度使用的会话(数千轮、含 tool_result 大 JSON)时是数 MB 级响应 + 一次性 JSON.parse + 全量折叠渲染,监控页明显卡顿,也让 backend↔agent 容器一次性搬运整份 jsonl。

**建议**:复用后端已有的 sliceRecentTurns 能力:useAdminTranscript 加 limit 参数(默认最近 N 轮)+「加载更早」,与用户端 useClawHistory 同型。

### [🟡 low] 引用文献选择器与文献集功能对同一后端端点维护两套 queryKey,互不共享缓存且写操作失效覆盖不到

- **位置**:`frontend-user/src/shared/api/library-browse.ts:22`
- **验证**:⚪ 低危未做对抗验证

**机制**:library-browse.ts 因分层约束(shared 不能 import features/library)对 /user/library/folders 与 /user/library 用了自有键 `['shared','library-browse',...]`(:22、:48),与 features/library 的 `['library',...]` 是两套缓存:同端点同参数在两处挂载时各拉一次;更重要的是文献集所有写操作的统一失效 invalidateLibrary 按 `queryKey[0] === 'library'` 谓词匹配(library-invalidation.ts:18-19),完全覆盖不到 browse 缓存 —— 用户在文献集里增删论文/文件夹后,打开引用选择器在 30s staleTime 窗内(picker 常驻挂载、Dialog 反复开合不重挂观察者)看到的是旧列表。

**影响**:重复请求量小(picker 按需打开),主要是缓存一致性/浪费问题:同一份文件夹树最多双份缓存 + 写后 30s 内引用选择器数据陈旧,用户刚收藏的论文在 agent 引用面板里找不到。

**建议**:把 browse 键并入 'library' 命名空间(如 ['library','browse',...],它在 shared 层不违反分层 —— key 只是字符串),使 invalidateLibrary 天然覆盖并与 features/library 共享缓存;或在 invalidateLibrary 的谓词里追加 'shared'/'library-browse' 前缀。


## 论文/作者详情页(features/browser + 移动详情)渲染与请求扇出

### [🟠 medium] PDF 预览页签每次切走再切回都全量重新下载整份 PDF(前端无跨挂载缓存 + 后端响应无 ETag/Last-Modified 且 Cache-Control 强制作废)

- **位置**:`frontend-user/src/features/browser/components/PdfBrowserPane.tsx:39`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:浏览器多页签设计里「论文详情」与「PDF 预览」是两个平级 tab(PaperActionRow.tsx:49-53 的 handleViewPdf 走 useOpenPdfInBrowser 另开 /pdf/:id tab),对照阅读时天然来回切换。但三层都没有缓存:① BrowserPage.tsx:77 `<motion.div key={pathname}>` + 路由分支切换使 PdfBrowserPane 每次切走即卸载;② PdfViewer.tsx 仅有组件内 useState(numPages/page/scale),挂载即由 pdfjs 重新 getDocument 拉流,无 ArrayBuffer 级复用;③ 后端 handler_pdf.go:270 显式 `c.Header("Cache-Control", "private, max-age=0, must-revalidate")`,而 storage.go:379-427 ServeObject 只设 Content-Type/Accept-Ranges/Content-Length,从不写 ETag / Last-Modified —— 没有校验器,浏览器无法发条件请求,must-revalidate + max-age=0 意味着每次都必须整份重下(Range 分段也是重新拉)。

**影响**:用户在「详情 ↔ PDF」间每切换一次,数 MB 的 PDF 就完整重新流经 MinIO→backend(io.Copy)→nginx 一遍;高频对照阅读时后端带宽/CPU 与用户流量(尤其移动端)成倍浪费。附带:PdfViewer 自述 continuous/two-up 模式一次性 mount 所有 Page(PdfViewer.tsx:48-49),百页 PDF 会同时渲染全部页,组件注释已自认待虚拟化。

**建议**:后端 ServeObject 补 ETag(MinIO 对象自带 etag)+ Last-Modified 并处理 If-None-Match/If-Modified-Since 返 304(鉴权已在 handler 层完成,304 不泄内容);或前端把已加载的 pdfjs document/ArrayBuffer 按 libPaperId 缓存(react-query gcTime 拉长即可),切回免重下。两者做其一即可消除全量重下。

### [🟡 low] 无摘要论文 / 零指标学者的详情 fallback 拉取永不收敛:tab 快照短路条件永远为假,每次重访都多打一次上游代理接口

- **位置**:`frontend-user/src/features/browser/components/PaperDetailPane.tsx:68`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:详情页的设计是「tab 快照命中则零请求,缺字段才 fallback fetch」。但短路条件用『业务字段是否存在』当『是否已拉过』的代理:PaperDetailPane.tsx:68 `needsFetch = !isLocal && (!tab || !tab.paper.abstract)` —— 上游本就没有摘要的论文(老文献、元数据不全的 PMD/OLX 条目)fetch 回来 abstract 仍为空,且 browser-tabs.store.ts:195 合并条件 `incomingRicher = !!paper.abstract && !existing.paper.abstract` 也拒绝写入,于是 needsFetch 永真,该 query 永远 enabled。AuthorDetailPane.tsx:50-51 同病更重:`needsFetch = !tab || tab.author.paperCount == null || tab.author.hIndex == null`,而 store 合并条件(browser-tabs.store.ts:271-272)`(author.paperCount ?? 0) > 0 || (author.hIndex ?? 0) > 0` 对 paperCount=0/hIndex=0 的学者永远判定『不够富』拒绝合并 → API 明明返回了 0 值也写不进 tab → 永久重拉。配合全局 gcTime=5min(providers.tsx:31)/staleTime 5-10min,这类实体每次打开或切回 tab(超过 5 分钟)都重新打 `/public/papers/:paperId` 或 `/public/author-detail/:id`;而有摘要的论文一生只拉一次。

**影响**:论文/学者详情是 SEO 主落地页 + 站内多 tab 高频往返场景;这两个公开接口后端是对 Minicod 上游的付费/限流代理,该 bug 让『无摘要论文』『零指标学者』两类不小的实体集合产生无上限的重复上游调用(每次重访 +1),且附带每次 mount 都触发 openPaperTab→persist 全量 30-tab JSON 序列化写 localStorage(PaperDetailPane.tsx:85-89 effect)。

**建议**:把『是否已拉过』与『字段是否有值』解耦:tab 快照里加 fetchedAt/detailLoaded 标记(或把 abstract 缺失合并为哨兵值 ''),needsFetch 改判标记;author 合并条件同步改为『本次来自 detail 接口即覆盖』(接口返回 0 也是权威值),让快照能收敛。

### [🟡 low] 冷进入(SEO 直达)论文详情页的 references 请求串行在元数据请求之后,白等一个上游 RTT

- **位置**:`frontend-user/src/features/browser/components/PaperDetailPane.tsx:204`
- **验证**:⚪ 低危未做对抗验证

**机制**:PaperReferences 只在拿到 paper 对象后才挂载(PaperDetailPane.tsx:116 `if (!paper)` 守门,:204 `{!isLocal && <PaperReferences paper={paper} />}`),其内部 useFetchPaperReferences 只需要 paperId(paper-detail.ts:80-89),而 paperId 在 URL 里 t0 就有。站内暖路径(tab 快照命中)无此问题;但冷进入 —— 恰恰是未登录高流量的 SEO 落地路径 —— 变成『先等 /public/papers/:id 一个完整上游代理 RTT,才开始拉 /references』的两段瀑布。referenceCount==0 免拉的优化(PaperReferences.tsx:19)只在暖路径有意义,冷进入时 referenceCount 未知本来就默认拉。

**影响**:SEO 冷进入的参考文献区块首屏延迟 ≈ 详情 RTT + references RTT(两段上游代理各数百 ms),本可并行;仅影响冷进入,且 references 在折叠区下方,故为 low。

**建议**:冷进入(无 tab 快照)时用 URL 的 paperId 直接并行预取 references(如在 PaperDetailPane 顶层再挂一个同 queryKey 的 useFetchPaperReferences(paperId, coldEntry)),与详情请求同时出发;暖路径维持 referenceCount 守门。


---

# 后端 Go(backend)


## 后端数据库查询(代码级)

### [🟠 medium] agent 事件日志 batcher:通道满时在全局互斥锁内同步落库(含重试退避),DB 抖动会把所有会话的流式转发串行卡死

- **位置**:`backend/internal/agentbridge/eventlog_batcher.go:176`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:deltaBatcher 是进程级单例,一把全局 b.mu 守护所有 feature、所有会话的事件累加。非终态事件(tool_use/tool_result/content_start/4KB delta flush)走 `enqueue`,而 enqueue 的调用方全部持有 b.mu(append 292-297 行、flushDeltaLocked 163-167 行、timedFlush 307-317 行)。enqueue 在 writeCh(容量 2048)满或已 Shutdown 时回退为 `createWithRetry` **同步落库**:最多 3 次 INSERT 尝试 + 20/40ms sleep(94 行),全程持有全局锁。同时 writeLoop(74-79 行)是单 goroutine 逐行 `db.Create(row)`(每行一个 autocommit 事务),排空吞吐有限——DB 一旦变慢,通道很快打满,之后每个事件都在全局锁内同步写库。而每个会话的 upstreamLoop(hub.go:954 `f.bridge.turns.Append(...)`)在「读 agent 帧→扇出给浏览器」的同一循环里同步调 append,即所有在线会话的流式输出都会在 b.mu 上排队。

**影响**:正常负载下无感;但 MySQL 抖动(备份、磁盘慢、schema-sync 重启、写入洪峰)时,writeCh 打满 → 每个事件在全局锁内做最多 3 次查询 + 60ms sleep → 所有用户(smart_search/claw/prism)的流式回复同时冻结,故障从「日志写入慢」放大为「平台级对话卡死」。终态事件路径(280-289 行)已正确做到锁外同步写,非终态回退路径没有。

**建议**:enqueue 通道满时不要在锁内写库:参照终态路径,把行收集后由调用方在 `b.mu.Unlock()` 之后再 createWithRetry;或回退为丢弃+计数(journal 完整性已有 failCnt 可观测)。同时 writeLoop 建议积攒批量后用多行 INSERT(CreateInBatches / 单事务多 VALUES)提升排空吞吐,降低通道打满概率。

### [🟠 medium] agent_turn_events 无任何保留/清理策略,且月度 RANGE 分区只建到 2026-09,之后全部落 p_future——增长最快的表将无界膨胀

- **位置**:`docker/mysql/migrations/0046_agent_turn_journal_fields.sql:1`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:agent_turn_events 存每一轮对话的全部事件 payload(合并后的 content_delta 文本、thinking、tool_result 的完整 JSON——含论文检索结果、文件内容等大对象),自述「写最重」,且是 executor feature 历史的唯一真源。但:① 后端没有任何针对 agent_turn_events / agent_turns / agent_billing_ledger 的清理代码——cleanup.go 只清 usage_events、llm_token_usage、hot_content(88-91 行),grep 全仓无 journal 删除/归档逻辑;② 建表时 RANGE 分区只预建 p_init/p2607/p2608/p2609 + p_future,仓库内没有任何滚动加分区的迁移或运行时代码,2026-10-01(距今 2.5 个月)之后所有写入都进 MAXVALUE 分区。

**影响**:对比同为 per-call 级的 llm_token_usage(365 天清理 + 注释「不清会涨爆」),journal 每轮写入量高一个数量级却永久保留:磁盘持续增长;p_future 变成单个巨型分区后,月度分区的裁剪/按分区归档能力全部失效,将来想重组分区需要对巨表做 ALTER(长时间锁/拷贝)。按会话读取(idx_sid_id)短期不受影响,但备份、DDL、崩溃恢复时间都随之恶化。

**建议**:二选一并尽快落地:① 增加分区滚动机制(每月迁移文件或后台任务 `ALTER TABLE ... REORGANIZE PARTITION p_future INTO (下月分区, p_future)`),配套「N 个月前分区 DROP/归档」策略;② 若确定永久保留,至少把旧轮 payload 压缩/归档到对象存储,并加磁盘水位监控。趁 p_future 还没积累数据处理成本最低(2026-10 前)。

### [🟡 low] admin 会话监控列表按 feature_key 过滤 + last_accessed_at 排序无可用索引,COUNT+SELECT 双次全表扫 agent_sessions

- **位置**:`backend/internal/agentbridge/admin_monitor.go:42`
- **验证**:⚪ 低危未做对抗验证

**机制**:AdminListSessions 的查询是 `WHERE s.feature_key = ? [AND user_id/keyword] ORDER BY s.last_accessed_at DESC` 且先 Count 再取页。agent_sessions 的索引只有 PRIMARY(id)、uk_agent_session_id、idx_user_feature_accessed(user_id, feature_key, last_accessed_at)、uk_owner、uk_user_feature_single——没有任何 feature_key 打头的索引(GORM tag 里的 `index` 不生效,该项目 schema 由迁移文件驱动、无 AutoMigrate),纯 feature 过滤时只能全表扫 + filesort,一次请求扫两遍(Count + 分页)。keyword 搜索还会叠加 LEFT JOIN users 的 LIKE '%kw%'。

**影响**:仅 admin 页面。但 claw 与 smart_search 均已多会话化(每次新开会话一行、行不过期不清理),agent_sessions 行数随用户×会话数线性增长;到几十万行时监控页每次打开都是两次全表扫描 + 排序,拖慢 admin 且给 DB 添无谓负载。

**建议**:加迁移 `CALL add_index_if_not_exists('agent_sessions', 'idx_feature_accessed', '`feature_key`,`last_accessed_at`', FALSE)`,让过滤+排序都走索引;keyword 模糊搜索保持现状(admin 低频可接受)。

### [🟡 low] WS 消息热路径每条 user_message 重复 3-4 次 users 表同一行主键点查(EffectiveTier 无缓存)

- **位置**:`backend/internal/vip/service.go:91`
- **验证**:⚪ 低危未做对抗验证

**机制**:vip.EffectiveTier 每次调用都 `SELECT vip_tier, vip_expires_at FROM users WHERE id=?`(repository.go:70-77),无任何缓存。一条 user_message 的处理链上它被独立调用多次:① CheckDailyQuotaOverdraft(quota.go:318)配额闸;② RemainingBudget(quota.go:298)预算盖章;③ revalidateModelBeforeMessage → ValidateUserModel → tierResolver(hub.go:442, modelcatalog/service.go:307-312,锁定模型的会话每条消息都走);④ 轮结束 AddUsage 的越线告警再查一次(quota.go:380)。同一条消息内 3-4 次读同一行同两列。对比同文件其他配置(vip.ConfigService、modelcatalog 30s snapshot)都做了进程内缓存,唯独每消息最高频的 tier 读取没做。

**影响**:单次是 PK 点查极轻,不构成慢查询;但属于纯粹的重复往返——聊天并发高时 users 表读 QPS 被放大 3-4 倍,连接池(MaxOpen 90)时间片被无谓占用。属于低成本可回收的浪费。

**建议**:给 EffectiveTier 加短 TTL(如 30s)进程内缓存(照抄 modelcatalog.Service 的 snapshot 手法,授予/到期路径主动 invalidate);或在 handleUserMessage 入口读一次 tier 后经 hookCtx 传递给配额/预算/模型校验三处复用。


## 后端Go逻辑热点

### [🟠 medium] WS 扇出热路径 replayBuf 合并是 O(内容²):每个 content_delta 帧都反序列化+重序列化整段已累积文本

- **位置**:`backend/internal/agentbridge/hub.go:1244`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:upstreamLoop 每收到一帧 agent 消息都调 broadcastAgent(hub.go:699-712),轮进行中(inFlight)时对每帧执行 `h.replayBuf = coalesceReplay(h.replayBuf, frame)`(hub.go:702,且在 h.mu 锁内)。coalesceReplay(hub.go:1244-1258)为了把相邻 content_delta 合并,对**每个新 delta 帧**做三次 JSON 操作:① contentDeltaText(frame) 解析新帧;② contentDeltaText(buf[n-1]) **完整反序列化已合并的大帧**(随回答增长线性变大);③ json.Marshal 重新序列化 last+txt 的完整合并文本。即第 i 个 delta 帧要处理 O(已累积内容) 字节,整轮总量 O(N×L)≈O(内容²)。以 prism 长文写作一轮 100KB 正文、~5000 个 delta 帧计,单轮 JSON 编解码总量约 2×50KB×5000≈500MB,数秒级纯 CPU + 等量内存分配/GC churn;且**每帧都在 h.mu 锁内做**,直接拖慢同 hub 的广播与订阅者注册。次要浪费(同一循环):每帧 frameType(data) 解析两遍(hub.go:797 的 switch 与 hub.go:953→classifyJournalEv:1300),delta 帧再被 batcher extractDeltaText 第 5 次解析(eventlog_batcher.go:223/343)。注意:P1 事件日志(readFromJournal)开启后迟到续流已优先走 journal(hub.go:574-596),replayBuf 只是 fallback,但仍对每帧无条件维护;即使只有 1 个订阅者、永远没有迟到者,这套二次方开销也全额发生。

**影响**:三个聊天 feature(claw/smart_search/prism)所有进行中的回答,每个流式帧都触发;回答越长越贵(二次方)。长回答(尤其 prism 生成整章 LaTeX)单轮造成数秒 CPU 与数百 MB 分配churn;多用户并发流式时 CPU 与 GC 压力叠加,并在 h.mu 锁内放大,拖慢同会话广播/迟到补帧。这是全后端调用频率最高的代码路径(每 WS 帧)。

**建议**:把 replayBuf 的 delta 合并改成与 batcher 同款的增量结构:hub 内存里存 `pendingDeltaText strings.Builder`(+ 非 delta 帧的 [][]byte 列表),新 delta 只 WriteString(可复用已解析出的 txt,不再碰旧帧);仅在 addSubscriber 需要补帧时一次性 json.Marshal 物化成一帧。再进一步:frameType 在 upstreamLoop 顶部解析一次后把结果传给 classifyJournalEv/batcher,消掉同帧重复浅解析;readFromJournal 开启的 feature 可干脆跳过 replayBuf 维护(它只是 fallback)。

### [🟠 medium] 全局 hubsMu 互斥锁内做网络 dial + 多次 MySQL 查询 + 重试 sleep:hub 创建全平台串行化

- **位置**:`backend/internal/agentbridge/hub.go:146`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:getOrCreateHub(hub.go:141-157)用**单个全局** `b.hubsMu.Lock(); defer Unlock()`(Bridge 上唯一一把,bridge.go:49,跨所有 feature/所有用户共享)包住整个 f.newHub(hub.go:151)。而 newHub(hub.go:184-239)在锁内做大量阻塞 I/O:① agentDialer.Dial 上游 WS(hub.go:197,HandshakeTimeout 10s,且用的是 Dial 不带 ctx 不可取消);② resolveAlreadyInjected(hub.go:220→243-260):MySQL FindByAgentSessionID + 未标记时再发一个 3s 超时的 agent HTTP 探测(SessionAlreadyHasUserMessage);③ seedHistoryFromJournal(hub.go:228→462-555):journal 两次 MySQL 查询(ReadRecentTurns)+ FoldToMessages + 归档文件读/agent HTTP 兜底 + FindByAgentSessionID + buildCreateOptions(Picker.Pick、MemoryBlocks、SessionSkillsProvider —— 后者是 ≤11 次 MySQL 查询,skillmarket/service.go:610-643 的 N+1)+ 写失败最多 3 次重试含 2×100ms time.Sleep(hub.go:528-535);④ sendInitialModel(hub.go:233→314-352):MySQL 读 + 写失败最多 3 次重试含 2×200ms time.Sleep(hub.go:350)。正常一次 hub 创建 = 1 次 WS dial + 5~15 次 DB 往返,几十~上百 ms;全部串行在一把全局锁后面。

**影响**:打开会话/切会话/重连的每个「首订阅者」都要过这把锁。后端发版重启后所有 tab 重连是最坏场景:百级并发重连 × 每个几十~上百 ms = 秒~十秒级排队,后来者 WS 建联明显卡顿,且 claw/smart_search/prism 互相拖累(一把锁跨全部 feature)。若 agent 容器 wedge(接受连接不响应),锁内 dial 最长挂 10s、HandleWS 又重试 3 次 → 单客户端可占锁 ~30s,期间**全平台所有 AI 会话的新 WS 接入全部冻结**。

**建议**:把全局互斥改成 per-key 创建:hubsMu 只保护「向 b.hubs 放入占位条目」(带 ready channel 的 pending hub),随后释放全局锁,dial/seed/DB 都在锁外做,后续同 key 请求者等 ready channel(即 singleflight-by-hubKey)。同时把 agentDialer.Dial 换成 DialContext 挂请求 ctx,重试 sleep 移出任何锁。

### [🟠 medium] 附件上传 30MB 全量读进内存两份:ParseMultipartForm(30MB) + io.ReadAll 再拷一份,而下游本已支持流式

- **位置**:`backend/internal/agentattach/upload.go:202`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:parseAndValidateUpload 用 `c.Request.ParseMultipartForm(MaxFileBytes)`(upload.go:160,maxMemory=30MB,意味着 ≤30MB 的文件 part 整体驻留 RAM 不落盘),接着 readMultipart(upload.go:202→321-328)对同一文件 `io.ReadAll(f)` 又完整复制一份 []byte,峰值 ≈ 2×文件大小(30MB 文件 ≈ 60MB+)驻留到 push 完成。而下游 PushSessionFile(agent/client.go:225-248)本身就接收 io.Reader 并用 io.Pipe 边读边发(注释:「边写边发:goroutine 把 content 拷进 multipart part,经 pipe 流给 HTTP body」),ReadAll 这份拷贝纯属多余 —— 直接把 fh.Open() 的 reader 传给 PushSessionFile 即可。该 Uploader 被 claw / smart_search / prism 三个 feature 共用(文件 ≤30MB、图片 ≤5MB)。

**影响**:每个并发上传占 ~2×文件大小内存。多个用户同时传大 PDF/office 文件(例如 8 个并发 30MB)即产生 ~0.5GB 瞬时驻留 + 等量 GC 压力,对 1GB 内存限制的 backend 容器是实际的 OOM 风险放大器;正常单发场景也是白白的 30MB 拷贝。

**建议**:① ParseMultipartForm 的 maxMemory 降到 4~8MB(超出自动 spill 到临时文件,net/http 自管清理);② 删掉 readMultipart 的 io.ReadAll,把 fh.Open() 返回的 reader 直接传 PushSessionFile(它已流式);校验只需 fh.Size 与 mime/扩展名,不需要字节在手。

### [🟡 low] agent HTTP 共享 Transport 按「低频管理接口」定容(MaxConnsPerHost=10),却承载全部会话/文件/历史流量

- **位置**:`backend/internal/agent/httpclient.go:25`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:sharedTransport 的注释写明是给低频的 /api/providers 用(「每次请求 < 5KB,连接池开得很小」),配置 MaxIdleConns:10 / MaxConnsPerHost:10。但 NewClient(agent/client.go:48-53)把这同一个 client(且整体 Timeout=roundTripTimeout=10s,client.go:35)用于**所有** agent HTTP 操作:GetSessionMessages(响应上限 48MB,client.go:1069-1071)、PushSessionFile(≤30MB 上传)、ReadWorkspaceFileRaw / 工作区读(artifact 收割,claw/artifact_harvest.go:78)、会话 CRUD。MaxConnsPerHost=10 是硬上限:同 host 第 11 个并发请求会阻塞等空闲连接,而排队时间计入 10s 的 client Timeout。另外 PushSessionFile 虽然调用方给了 30s ctx(agentattach pushFileTimeout),但 http.Client.Timeout=10s 是更小的硬上限,ctx 形同虚设。

**影响**:并发超过 10 个 in-flight agent HTTP 调用(历史加载、附件上传、成果收割同时发生)时请求排队;排队+传输合计超 10s 即超时失败 —— 用户侧表现为「打开旧会话历史转圈后报错」「上传失败」,且随用户规模恶化。单机低并发下无感,属于规模触发型瓶颈。

**建议**:为会话/文件类操作使用独立的、按并发定容的 Transport(如 MaxConnsPerHost 64~128,MaxIdleConnsPerHost 32),providers 推送保留小池;去掉 http.Client 全局 Timeout,统一用每调用 context.WithTimeout(现在两处叠加且 client Timeout 更小,让 ctx 生效)。

### [🟡 low] AI SSE 转发每 chunk 反序列化+重序列化,原始字节可直通

- **位置**:`backend/internal/ai/service_llm.go:148`
- **验证**:⚪ 低危未做对抗验证

**机制**:streamResponse 对上游每个 SSE chunk 先 json.Unmarshal 成 ChatCompletionChunk(需要,用于取 usage 和过滤空 delta),但转发时又 `json.Marshal(chunk)` 重新序列化一遍再写给前端(service_llm.go:149-154)。`data` 变量本身就是上游原始 JSON 串,前端只消费 delta.content,直接 `fmt.Fprintf(writer, "data: %s\n\n", data)` 语义等价且省一次 O(chunk) 序列化 + 分配。该路径每个流式 token chunk 执行一次(现役消费者:流式翻译 StreamTranslateToChinese / StreamTranslatePaperToChinese)。

**影响**:每个翻译流式 chunk 多一次完整 JSON 序列化与两次字符串拷贝([]byte(data) 与 string(chunkJSON))。翻译长论文时是千级 chunk 的常态路径,属稳定但量级不大的 CPU/分配浪费。

**建议**:转发处直接写原始 `data` 字符串(Unmarshal 仅用于判空 delta 和抓 usage);顺带 `[]byte(data)` 可换成 scanner.Bytes() 的切片判断避免再拷。

### [🟡 low] 每个已认证 HTTP 请求 spawn 一个 goroutine + 2 次 Redis SETNX 做活跃度节流(可用进程内缓存短路)

- **位置**:`backend/internal/user/service.go:187`
- **验证**:⚪ 低危未做对抗验证

**机制**:AuthMiddleware 对每个通过鉴权的 user 请求调用 activityHook(auth.go:135-137),即 RecordActivity(service.go:187-227):每次都 safego.Go 起一个新 goroutine,并在其中执行两次 Redis SETNX(`user:lastactive:<id>` 5min 节流键 + `user:dau:<id>:<date>` 26h 节流键)。DB 写确实被节流住了,但 Redis 往返和 goroutine 生成本身没有节流 —— 高频轮询/列表页会让每秒每用户产生 2×RPS 次 Redis 命令。单实例部署(本项目 hub 明确单实例假设)下,一个进程内 per-user 的 5min/当日已记 时间戳 map 即可把绝大多数请求短路成零 Redis 调用。

**影响**:不阻塞请求延迟(全异步),但给 Redis 带来与全站已认证 QPS 成正比的 2× 命令量,并有每请求一次的 goroutine 生成/调度开销;Redis 与后端共池(512MB LRU),高峰期是纯可避免的负载。

**建议**:在 RecordActivity 入口加进程内快路径:sync.Map 存 per-user『lastactive 上次写入时间 / 今日已记日期』,5min 内 / 当日已记直接 return,不起 goroutine 不打 Redis;Redis SETNX 保留作跨重启兜底。


## 后端并发与多用户

### [🟠 medium] agentbridge 全局 hubsMu 持锁执行网络拨号 + 多次 DB/HTTP 往返,串行化全站所有新会话 WS 建连

- **位置**:`backend/internal/agentbridge/hub.go:146`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:getOrCreateHub 用一把 Bridge 级全局互斥锁 hubsMu 串行化「首个订阅者建 hub」(hub.go:146-157: `b.hubsMu.Lock(); defer b.hubsMu.Unlock(); hub, err := f.newHub(...)`),而 newHub 在锁内做了大量慢 I/O:① `agentDialer.Dial`(hub.go:197,HandshakeTimeout 10s);② resolveAlreadyInjected(hub.go:243-260,DB 读 + SessionAlreadyHasUserMessage 经 HTTP 打 agent 拉消息,ctx 3s);③ seedHistoryFromJournal(hub.go:228→462-555,ReadRecentTurns MySQL 读 5s ctx + 归档读 + GetSessionMessages HTTP 兜底 + buildCreateOptions 内 Picker/MemoryBlocks/SkillsProvider 多次 DB 读 + 写失败重试 3×100ms);④ sendInitialModel(hub.go:232→314-352,DB 读 + 写重试 3×200ms sleep)。该锁跨全部 feature(claw/smart_search/prism 共享一个 Bridge),existing-hub 快路径虽走锁外 Load,但每个会话「首个 tab 接入」和「3 分钟 grace 过期后重连」(hubGracePeriod=3min,hub.go:632)都要走建 hub 路径,是高频用户路径。

**影响**:健康态下每次建 hub 也含 1 次内网 WS 拨号 + 3-6 次 MySQL 读 + 可能 1-2 次 agent HTTP 往返(数十到上百 ms),全站串行:课堂/高峰场景几十个用户同时打开 AI 对话页时,队尾用户 WS 建连延迟秒级累积。恶化态(agent 容器重启/发版/网络抖动)单次 Dial 最长挂 10s,期间所有用户的「新开会话/切回会话」WS 升级全部排队在 hubsMu 上,一个慢上游拖住所有人;排队的 gin handler goroutine 与已 Upgrade 的前端连接同步堆积。

**建议**:把串行化粒度从全局降到 per-key:hubs map 里先在锁内放一个「creating 占位」(或用 singleflight.Group 按 hubKey 分组),真正的 Dial/seed/sendInitialModel 全部移到 hubsMu 临界区外执行,失败再删占位。这样同一 session 的并发首连仍只拨一条上游(保住 jsonl 单写者不变式),不同 session 的建连互不阻塞。

### [🟠 medium] 事件日志 deltaBatcher 写通道满时持全局 b.mu 同步落库,MySQL 变慢会级联冻结所有会话的流式广播

- **位置**:`backend/internal/agentbridge/eventlog_batcher.go:176`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:batcher 的 enqueue 在写通道满(batchWriteChanSize=2048)或已 Shutdown 时,回落为同步 createWithRetry 落库(eventlog_batcher.go:176-186),而 enqueue 的全部调用点(flushDeltaLocked/flushThinkLocked/append 普通事件分支 eventlog_batcher.go:292-297)都在持有 batcher 全局 b.mu 的状态下执行。createWithRetry 是 3 次 DB 尝试 + 20/40ms 退避(eventlog_batcher.go:85-99),MySQL 慢时单次可挂数百 ms 到秒级。b.mu 是所有 turn 共享的一把锁,且每个 hub 的 upstreamLoop 每帧都要经 turns.Append→batcher.append 进入它(hub.go:948-957,在 broadcastAgent 之后、读下一帧之前)——一旦有人在锁内同步写慢 DB,所有活跃会话的上游读循环都会卡在 b.mu 上,content_delta 无法继续读取和广播。终态事件(message_complete/error)的同步落库虽已刻意移到锁外(eventlog_batcher.go:280-289),但通道满回落路径没有同样处理。

**影响**:触发条件是 MySQL 持续变慢或事件洪峰把 2048 深的 writeCh 打满(writeLoop 单 goroutine 串行落库,DB 慢时必然积压)。一旦触发,「DB 慢」被放大成「全部用户的 AI 对话流式输出集体冻结」:每个 hub 的 upstreamLoop 阻塞在 b.mu,前端表现为所有会话同时停止吐字,与仅日志降级的预期(journal 是 best-effort 起家)不符。正常态无影响。

**建议**:通道满的回落路径改为:在锁内只完成取号(nextSeq)和构行,锁外做同步落库(与终态事件路径同一手法);或直接丢弃并走已有的 failCnt/slog.Error 可观测通道(journal 写失败本就有计数),避免把持锁写 DB 作为兜底。也可考虑给 writeLoop 加批量 INSERT 提升消化速度,降低通道打满概率。

### [🟡 low] 配额 check-then-act(只读闸门+后置扣减)在多会话并发下敞口按会话数放大——有界且属有意设计,确认非 bug

- **位置**:`backend/internal/vip/quota.go:267`
- **验证**:⚪ 低危未做对抗验证

**机制**:按任务要求核实了 CheckDailyQuota 的 check-then-act 竞态:闸门是纯只读(quota.go:267-285 读 loadWindow 后比较,不预扣),真实消耗由 AddUsage 后置累加(quota.go:333)。并发防线逐层核实:① 单会话内 hub 有 inFlight busy 锁(hub.go:750-761 beginTurn,进行中再发直接拒);② 每条 user_message 盖有界透支预算 stampBudget(hub.go:1192-1208),executor 按 hard=ceiling+透支带自我限速;③ AddUsage 开窗用 Lua CAS 原子换锚(quota.go:67-72),重置扣费有 per-user 分片锁+Redis SETNX 双层锁(quota.go:57-111)+锁内重判,不会并发双扣重置费;④ R8 越线观测(quota.go:380-397)。残余敞口:claw/smart_search 已多会话化,同一用户开 N 个会话(或跨 3 个 feature)并发发消息,每条消息独立过只读闸门+独立盖预算,总超支上限=N×(单轮透支带)而非文档语境的「至多超支一轮」;Redis 挂时退进程内 quotaFallback(quota.go:161-197),per-实例计数、重启清零。

**影响**:不会无界超发:每个并发会话的单轮被 executor 侧 hard budget 收口,后置 AddUsage 会把下一轮闸死。最坏情况=恶意用户开多个会话同时开跑,免费额度多蹭 N×透支带的 token(N 受前端会话列表和操作成本约束),属可接受的成本泄漏而非资源打挂。

**建议**:维持现设计即可。若要收敛多会话放大,可在 PreUserMessage 层加一个 per-user 的「并发在途轮数」小上限(Redis INCR/DECR,如 ≤3),或在 RemainingBudget 盖章时按用户在途轮数折减 hard;优先级低。

### [🟡 low] hub→agent 上游写无 WriteDeadline,agent 容器 TCP 假死时该会话所有写方阻塞,依赖 60s 读超时间接解救

- **位置**:`backend/internal/agentbridge/hub.go:741`
- **验证**:⚪ 低危未做对抗验证

**机制**:writeAgent(hub.go:741-745)对上游 agent 连接的 WriteMessage 前没有 SetWriteDeadline(全文件仅前端方向有 frontWriteDeadline,hub.go:991)。agentWriteMu 串行化了该 hub 的全部写方:用户消息转发(handleUserMessage)、pingLoop、permission 回写、模型帧下发。若 agent 容器进程假死/TCP 零窗口(容器 pause、OOM 抖动),写方会无限期阻塞并持有 agentWriteMu,该会话的订阅者 readLoop(转发路径)与 pingLoop 一并卡住。间接兜底是 upstreamLoop 的 agentReadDeadline=60s(ws.go:91):读超时后 shutdown→agentConn.Close() 会以错误唤醒所有阻塞的写。故阻塞有界(≤60s)且仅波及单会话,不跨 hub 传染。

**影响**:agent 侧 TCP 半死期间,该会话用户发消息无响应且无错误提示,最长 60s 后才由读超时触发 hub 关闭、前端重连;多个会话同时遇到时各自独立卡 60s。属体验劣化而非资源泄漏(goroutine 随 Close 释放)。

**建议**:writeAgent 内写前加 `h.agentConn.SetWriteDeadline(time.Now().Add(10*time.Second))`(与内网延迟量级匹配),写超时即报错走既有 endTurn/shutdown 路径,把最坏 60s 无响应缩到 10s 并让用户尽早拿到可重试错误。


## 后端中间件与请求链路

### [🟠 medium] APITimeoutMiddleware 路径分类既过宽又有漏:/analysis CRUD 全拿 15min、Accept 头可自授 15min、claw artifact.zip 的 30s 预算被 15s 父 ctx 腰斩、PATCH/DELETE 落 15s 读档

- **位置**:`backend/internal/common/middleware/timeout.go:26`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:四个分类缺陷同源于 isStreamingPath/isObjectServePath 的粗粒度匹配:① `strings.Contains(path, "/analysis")`(timeout.go:30,34)把 /api/v1/analysis/dimensions 全组 9 个 CRUD(routes_scholar.go:40-48)、/api/v1/public/analysis/dimensions(routes_scholar.go:79)、/api/v1/admin/analysis/dimensions(routes_admin.go:53-54)这类普通增删改查全划成 15min 流式档,DB 卡顿时这些请求 15 分钟不被 ctx 收割(nginx 60s 就断了客户端,但 backend goroutine+DB 连接继续挂);② `c.GetHeader("Accept") == "text/event-stream"`(timeout.go:69)完全由客户端控制,任意端点可自授 15min 预算;③ GET /claw/session/artifact.zip 不在 isObjectServePath 白名单(后缀非 /pdf|/download|/file,也不含 /claw/artifact/),落 15s 读档,而 handler 自己给了 30s 打包预算 `context.WithTimeout(c.Request.Context(), artifactZipTimeout)`(claw/artifact.go:485,artifactZipTimeout=30s@:397)——子 ctx 被 15s 父 ctx 静默钳制,预算腰斩;同组的 /claw/session/artifact 实时回退端点也只有 15s;④ 只有 POST/PUT 拿 30s 写档(timeout.go:75),PATCH/DELETE 落 15s 读档,而 DELETE /claw/sessions/:id 要级联调 agent HTTP + MinIO 清理。

**影响**:用户可见:多文件大交付目录打包超过 15s 即报「打包失败」,与代码 30s 预算的设计意图不符;资源面:/analysis 组 CRUD 失去 15s 收割保护,DB 慢查询时 goroutine+连接可挂满 15min,放大故障;Accept 头旁路让任何人把任意慢端点的收割阈值拉到 15min。

**建议**:① streamingPatterns 改精确匹配(/analysis 只放行真正长跑的 /analysis/papers/batch,删除死模式 /continue);② Accept 头判定叠加路径白名单(两者与,而非或);③ isObjectServePath 增补 /claw/session/artifact 与 /claw/session/artifact.zip(或统一改成 handler 用 context.WithoutCancel+自管超时);④ PATCH/DELETE 并入 30s 写档。

### [🟡 low] 全局 BodyLimit 对 multipart 无条件放行,任何路由都能被伪造 Content-Type 推 50MB body,news webhook 更是在验签前整读进内存

- **位置**:`backend/internal/common/middleware/bodylimit.go:40`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:BodyLimitMiddleware 对 multipart 的豁免只看请求头 Content-Type 前缀,不看路由是否真是上传端点:`if strings.HasPrefix(c.GetHeader("Content-Type"), "multipart/form-data") { c.Next(); return }`(bodylimit.go:40-43)。攻击者对任意 JSON 端点谎报 multipart 即绕过 10MB MaxBytesReader,body 上限退化到 nginx 的 client_max_body_size 50m(nginx/nginx.conf:121)。凡是会整读/整解析 body 的 handler 都会真的吃下 50MB:① news webhook(公开端点,无认证)在 HMAC 验签**之前**就 `raw, err := io.ReadAll(c.Request.Body)`(internal/news/handler.go:42),验签失败也已完成 50MB 分配;② 所有 ShouldBindJSON 端点——json.Decoder 遇到单个巨型 JSON 值会完整读入解析。当初豁免是为修 10MB 架空路由级 50MB 的 bug,但修法把非上传路由也一并放开了。

**影响**:多 IP 攻击下每请求最多 50MB 分配(news webhook 无需任何凭据即可触发,且 nginx 给了 burst=200 的宽松限流),造成 GC 压力与内存尖峰;等于把精心设计的 10MB DoS 防线在全站范围打了一个通用旁路。正常业务不受影响,属被动攻击面。

**建议**:multipart 请求不要完全跳过,改为包一层 `http.MaxBytesReader(c.Writer, body, UploadMaxBodySize)`(50MB 全局硬顶,与路由级 50MB 相等不会再出现内层更小的架空问题);news webhook 单独用 `io.ReadAll(io.LimitReader(body, N))` 且尽量先校验 Content-Length/签名头存在性再读 body。

### [🟡 low] http.Server WriteTimeout=10min 与 SSE 15min 预算、nginx 900s 对齐相矛盾,长流在 10 分钟处被最弱一环掐断

- **位置**:`backend/cmd/server/main.go:148`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:APITimeoutMiddleware 给 SSE/流式端点 15 分钟 ctx 预算(timeout.go:70 `timeout = 15 * time.Minute`),nginx 也特意把 /stream 端点的 proxy_read/send_timeout 调到 900s 并注释「跟 backend APITimeoutMiddleware 的 SSE 15min 对齐」(user.conf:86-88)。但 http.Server 的 `WriteTimeout: 10 * time.Minute`(main.go:148)从读完请求头就开始计时、覆盖整个响应写入,是三层里最短的一环——注释声称 generous enough to cover the longest stream,实际上 600s < 900s < 15min。另外 isObjectServePath 的大文件下载给了 10min ctx(timeout.go:74),与 WriteTimeout 相等,但 WriteTimeout 计时起点更早(含 handler 前置耗时),实际可用传输时间必然小于 10min 预算。

**影响**:审稿等超过 10 分钟的 SSE 直播流在 10min 整点被 TCP 写超时切断(EventSource 需重连重放);接近 10 分钟的弱网大文件下载在收尾阶段被截成坏文件——与 2026-06 已修的「下载 15s 截断」同类,只是这次卡在 server 层而非 ctx 层。触发场景:>10min 的长流/慢下载。

**建议**:WriteTimeout 提到 ≥16min(略大于最长 ctx 预算),或设 0 并依赖 APITimeoutMiddleware 的 per-request ctx + nginx 层超时兜底;三层数值(nginx 900s / ctx 15min / server WriteTimeout)应在一处注释里互相引用,改一处必须同步。

### [🟡 low] TieredRateLimit 的 is_vip 分支是死代码(全代码库无人写入),VIP 限流倍率配置无效;三层限流叠加中 backend 两层实际不可达

- **位置**:`backend/internal/common/middleware/ratelimit.go:272`
- **验证**:⚪ 低危未做对抗验证

**机制**:TieredRedisRateLimitMiddleware/TieredRateLimitMiddleware 靠 `if vip, _ := c.Get("is_vip"); vip == true`(ratelimit.go:167,272)走 VIP 放大档,但全仓库 grep 只有这两处读、没有任何 c.Set("is_vip", ...)——AuthMiddleware(auth.go:127-131)只写 user_id/username/user_type/user_role/token。于是 RATE_LIMIT_VIP_MULTIPLIER(默认 3.0,config.go:224)与 vipLimiter 的构建(ratelimit.go:153-161)全是死配置,付费用户与免费用户同吃 UserRPS=50。另盘点分层:nginx 已按 IP 限 10r/s burst50(nginx.conf:60,user.conf:135),比 backend 全局内存限流 100r/s(main.go:112)和 Redis 分级 50r/s 都严——正常经 nginx 的流量在 backend 两层限流永远不会触发,但每个认证请求仍要为分级限流付一次 Redis Lua INCR 往返(ratelimit.go:284),叠加 auth 的 revoke MGET(auth.go:86→jwt_revoke.go:110)与 RecordActivity 每请求起 goroutine + 2 次 SETNX(user/service.go:191-217),每认证请求固定 4 次 Redis 操作。

**影响**:功能面:VIP 用户高频操作(如批量分析、快速翻页)与免费用户同阈值,倍率配置改了也不生效;性能面:每认证请求 2 次同步 Redis 往返(revoke MGET + 限流 INCR)+2 次异步 SETNX,本地 Redis 下是亚毫秒级,单实例部署下多为纵深冗余,规模上去后是线性放大的 Redis 负载。

**建议**:要么在 AuthMiddleware 后挂一个从 vip.EffectiveTier 写 is_vip 的轻中间件(带短 TTL 进程内缓存),要么删掉 VIP 分支和配置项避免假象;可把 revoke MGET 与限流 INCR 合并进同一条 pipeline/Lua 省一次 RTT;RecordActivity 可在进程内记 per-user 上次上报时间,5min 内直接短路,省掉绝大多数 SETNX 与 goroutine。

### [🟡 low] MaintenanceModeMiddleware 挂载在认证中间件之前,「已登录管理员放行」分支永远读不到 user_role,是死代码

- **位置**:`backend/internal/common/middleware/maintenance.go:83`
- **验证**:⚪ 低危未做对抗验证

**机制**:routes.go:120 `api.Use(middleware.MaintenanceModeMiddleware())` 挂在 /api/v1 组顶层,而 UserAuthMiddleware/AdminAuthMiddleware 是在各子组才挂(routes_user.go:97、routes_admin.go:19),gin 按注册顺序执行——维护中间件运行时 context 里还没有 user_role,maintenance.go:83-88 `if role, ok := c.Get("user_role"); ok { if r == "admin" ... c.Next() }` 的 ok 恒为 false。管理员在维护期只能用路径白名单里的 /api/v1/admin/*、/user/login、/user/profile,访问其余用户侧 API(如自查 claw/智能搜索复现用户问题)一律 503,与代码注释「管理员 (role=admin/super_admin) 正常通过」的设计意图不符。中间件本身的性能没问题(30s atomic 缓存 + CAS 单飞防惊群)。

**影响**:仅维护模式开启时触发:管理员无法用用户侧 API 验证系统状态,角色放行逻辑整体失效。属挂载顺序导致的死分支,不影响日常性能。

**建议**:在 maintenance 分支里自行调用 extractToken+ParseToken 轻量判定 role(仅在维护开启时才走,不增加日常路径开销),或把维护拦截改挂到各认证子组的 auth 之后并保留公开路由白名单。

### [🟡 low] claw WS 缺席 nginx 长超时 location,落入通用 /api/ 的 60s 读写超时,保活全押在应用层心跳且 pingLoop 出错即退出不重启

- **位置**:`nginx/conf.d/user.conf:48`
- **验证**:⚪ 低危未做对抗验证

**机制**:nginx 为 agent WS 专设的 24h 长超时 location 正则是 `location ~ ^/api/v1/user/(smart-search|prism)/ws/`(user.conf:48),漏了 claw——/api/v1/user/claw/ws/:sessionId(routes_user.go:362)落到通用 `location /api/` 的 `proxy_read_timeout 60s`(user.conf:159-161)。当前靠 25s 应用层心跳链(hub pingLoop→agent pong→broadcastAgent 下发前端,hub.go:961-963)刷新 60s 窗口才不断连,但这条链是单点:pingLoop 首次写失败直接 `return` 不重启(hub.go:971-974),agent 短暂繁忙/写抖动后该 session 的心跳即永久停摆,claw 前端连接会在下一个 60s 静默窗口被 nginx 掐断,而 smart-search/prism 有 86400s 兜底完全免疫同一故障。三个同构 feature 在链路配置上不对称,明显是 claw 后加时漏改 nginx。

**影响**:claw 长回合(agent 深度思考/长工具执行)叠加心跳链任何一次抖动时,用户对话中途断连需重连续流;smart-search/prism 无此风险。日常在心跳正常时无感,属边界条件下的稳定性劣化。

**建议**:把 nginx 正则改为 `^/api/v1/user/(smart-search|prism|claw)/ws/` 与其余两个 feature 对齐;顺手让 pingLoop 写失败时重试/触发 hub 收口而非静默退出。


## 活库体检(容器在跑才做)

### [🟠 medium] feature_tools 公开列表每请求全表扫描+filesort(最大表 55MB/10036 行),返回全量重模型且缺排序复合索引

- **位置**:`backend/internal/featuretool/repository.go:129`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:公开接口 GET /api/v1/tools 的 List 查询是 `WHERE status='published' ORDER BY sort_weight DESC, created_at DESC LIMIT 24`(repository.go:129 `q = q.Order("sort_weight DESC, " + sortBy + " " + order)`)。idx_status 基数为 1(全部行都是 published),等于全表扫;排序列无任何索引支持,每次请求对全部 published 行 filesort。同一请求还先跑一次 `Count(&total)`(repository.go:90)再扫一遍。handler.go:72 `utils.Success(c, gin.H{"items": items, ...})` 直接把全量 Tool 模型(含 description_md、faq、use_cases、pricing、spec、vendor 等大 JSON 列,平均行宽约 5KB)序列化给列表页。关键词搜索分支(repository.go:111-118)更重:CASE+LIKE+两组 MATCH 全表算分。另:统计信息已过期 31%(information_schema.table_rows=6912,实际 COUNT=10036),优化器行数估计偏低一半。

**影响**:这是无鉴权公开端点 + 全站最大表:当前每次列表/搜索请求约 20-40ms 纯 DB 开销(数据全在 buffer pool 里仍要全扫+排序 1 万行),表随 import job 持续增长(已从 6912 涨到 10036),耗时线性恶化;高并发访问工具广场时该查询会成为 MySQL CPU 热点。列表响应还携带 24 行 × ~5KB 的大字段,浪费带宽与序列化时间。

**建议**:① 加复合索引 (status, sort_weight DESC, created_at DESC),默认排序路径可走索引序直接 LIMIT 24 免 filesort;② 列表查询用 Select 只取卡片需要的轻列(排除 description_md/faq/use_cases/pricing/spec 等),或建 ListItem 投影 DTO;③ Count 可用近似值或短 TTL Redis 缓存(公开列表本身也适合 30-60s 微缓存);④ 跑一次 ANALYZE TABLE feature_tools 刷新统计。

### [🟡 low] Redis 偶发命令级 stall(O(1) 命令 20~156ms)恰好打在每请求必经的鉴权/限流热路径

- **位置**:`backend/internal/common/middleware/ratelimit.go:276`
- **验证**:⚪ 低危未做对抗验证

**机制**:两个 Redis 实例数据量极小(scholar_redis 20 keys/2MB,persist 17 keys/1.25MB),但 SLOWLOG(阈值 10ms)记录到本应微秒级的命令出现数十毫秒尖刺:限流 Lua 脚本 EVALSHA rl:uid:*(ratelimit.go:276 `key = fmt.Sprintf("rl:uid:%v", uidRaw)`)最高 82ms,token 吊销检查 MGET auth:revoke:tok:*(common/utils/jwt_revoke.go:37)在 persist 实例上 156ms,SET user:lastactive EX NX 82ms,普通 GET 19.5ms。这些 key 全部位于每个已登录 API 请求的中间件链上。频率约 16 条/36h(占 22303 条命令的 0.07%),AOF 无 delayed_fsync(aof_delayed_fsync=0),事件循环指标正常,本机成因大概率是宿主(macOS Docker Desktop 同时跑 50+ 容器)VM 调度抢占而非 Redis 自身。

**影响**:stall 发生瞬间,该请求的端到端延迟直接 +20~156ms(鉴权与限流是串行前置步骤);当前频率低、属开发机环境噪声,但同样的部署形态上生产后若宿主 IO/CPU 有压,尖刺会同比例放大且难归因。

**建议**:生产环境给两个 Redis 实例的 SLOWLOG 建立巡检基线(如每日导出、条目数环比告警);Redis 容器保证 CPU 配额不被邻居抢占;鉴权/限流中间件的 Redis 调用已有 fail-open 逻辑的,确认其超时设置(建议 ≤100ms)以免尖刺期间请求被拖住。

### [🟡 low] umami 容器假 unhealthy 34 小时(healthcheck 探 /login 必败,服务实际正常)+ 内存 72.8% 逼近 512MB 上限

- **位置**:`docker-compose.yml:530`
- **验证**:⚪ 低危未做对抗验证

**机制**:docker-compose.yml:530 的健康检查 `wget -q -O- http://localhost:3000/login >/dev/null 2>&1 || exit 1` 持续失败(FailingStreak=4092,×30s ≈ 34 小时),但实测容器内服务完全正常:`wget http://scholar_umami:3000/api/heartbeat` 返回 {"ok":true},日志显示 Ready。/login 在当前 umami 版本上对 wget 非 2xx(重定向或 SSR 行为变化)导致必败。同时 docker stats 显示 umami 内存 372.7MiB/512MiB(72.8%),是全部 scholar 容器中距 limit 最近的。

**影响**:长期假 unhealthy 让 docker ps 的健康列失去信号价值——真故障出现时无法与噪声区分;若未来给 umami 配 autoheal 或依赖其 health 的编排,会被误杀/阻塞。内存已用 73%,Next.js 进程继续增长可能触发 OOM kill,admin /analytics 统计图表随之空窗。

**建议**:healthcheck 改探 `/api/heartbeat`(umami 官方心跳端点,返回 200 JSON);观察 umami 内存趋势,必要时把 limit 提到 768MB 或定期重启策略。

### [🟡 low] agent_turn_events 按 created_at 分区但全部读查询按 turn_id 过滤——永无分区裁剪,且 30 轮历史读带 filesort;属随规模恶化项

- **位置**:`backend/internal/agentbridge/eventlog_store.go:170`
- **验证**:⚪ 低危未做对抗验证

**机制**:agent_turn_events 做了 RANGE 分区(p_init/p2607/p2608/p2609/p_future,按 created_at,便于按月滚动清理),但读侧两条查询(eventlog_store.go:148 `WHERE turn_id = ? ORDER BY ev_seq ASC` 与 :170 `WHERE turn_id IN ? ORDER BY id ASC`)的 WHERE 都不含分区键,EXPLAIN 显示每次探测全部 5 个分区(partitions: p_init,p2607,p2608,p2609,p_future),即每查询 5 份索引下潜;IN+ORDER BY id 那条还要 filesort(估算 1608 行)。单 turn 事件量可观:最重的 turn 442 个事件/294KB payload,ReadRecentTurns 一次拉 30 个 turn 的全部事件无行数上限。当前 AGENT_JOURNAL_READ 为空(读路径未启用,仅 validator/管理台会走),数据也小(5085 行/5.9MB),现在无感;但该表是每帧必写的 journal,分区按月累积后,"每查询×分区数"的索引探测和整段 filesort 会随月份数和会话长度双向放大。

**影响**:现在零影响;当 AGENT_JOURNAL_READ 全量打开且分区跑过若干个月后,每次会话历史回放要跨全部历史分区做 5~N 份索引探测 + 对数千行×KB 级 payload 的 filesort,长会话重放延迟会明显上翘。

**建议**:开启 journal 读之前:① ORDER BY 从 `id` 改为 `turn_id, ev_seq`(uk_turn_ev_seq 前缀即索引序,免 filesort;应用侧按 turnIDs 的 seq 顺序拼接即可保持轮序);② 若保留分区,读查询带上 turn 的 created_at 范围(BeginTurn 已知)让裁剪生效,或评估该表是否真需要分区(月度清理也可用带索引的 DELETE 批量完成);③ ReadRecentTurns 给单次事件总行数设上限。

### [🟡 low] MySQL 慢查询完全不可观测:slow log 显式关闭但 36h 已发生 10 条 >2s 慢查询,且应用账号无 performance_schema 权限

- **位置**:`docker-compose.yml:48`
- **验证**:⚪ 低危未做对抗验证

**机制**:docker-compose.yml:48 以 `--slow-query-log=0` 显式关闭慢日志(注释写明是刻意为之,排查时可 SET GLOBAL 临时打开),long_query_time=2s。但活库 SHOW GLOBAL STATUS 显示 Slow_queries=10——36 小时内已有 10 条超 2 秒的查询发生,事后完全无法知道是哪些语句(慢日志关闭,又没有任何采样机制)。辅助排查通道也不通:scholar_user 对 performance_schema.events_statements_summary_by_digest 无 SELECT 权限(实测 ERROR 1142),只能用 root。本次借 root 查 digest 只看到迁移重放语句(每条 72 次,对应 36h 内 72 轮全量迁移重放,单轮 14s,系开发期频繁重启),应用侧慢语句已无从追溯。

**影响**:已经存在的 >2s 查询(极可能与 feature_tools 全扫或迁移期 DDL 有关)无法归因;生产遇到偶发卡顿时没有第一手证据,只能事后临时开日志等复现,拉长故障定位时间。

**建议**:最低成本方案:保持文件日志关闭,但给运维手册固化一条『开箱即用』的 root digest 查询(events_statements_summary_by_digest 按 SUM_TIMER_WAIT 排序),并在部署脚本里定期快照该表;或将 slow log 输出改为 TABLE 模式(log_output=TABLE,mysql.slow_log,自动轮转成本低),long_query_time 维持 2s。


## Prism 编译链路 backend 侧(runCompile 并发闸/物化放大/缓存命中率)

### [🟠 medium] StartCompile 无任何并发闸/在途去重:多用户排队必然产生伪「编译服务异常」,且被前端 auto-fix 回路放大成 AI 轮风暴

- **位置**:`backend/internal/prism/service.go:294`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:StartCompile(:285-298)对每次请求无条件建 queued 行并 `safego.Go("prism-compile", ...)` 起后台 goroutine —— safego.Go(backend/internal/common/safego/safego.go:29)是裸 goroutine+recover,无池无信号量;整个链路没有 per-project 在途去重(同项目同内容并发点两次=两个 goroutine 各自全量物化+各占一个沙箱槽,缓存只在 runCompile 起点查一次,在途结果不共享/无 singleflight),也没有 backend 侧全局并发上限与沙箱 MAXPAR=3 对齐。沙箱侧 prism_tex/entrypoint.sh:22-25 自认:「串行 watcher 下 2+ 并发用户会触发后端 95s 轮询超时(伪『编译服务异常』)。默认 3」。每个编译 latexmk 超时 60s(entrypoint.sh:16),backend 轮询上限 95s(texclient.go:36);第 4 个并发任务先排队(最长~60s)再编译(最长~60s),总时长轻易越过 95s → texclient 返回 timeout → failCompile 写状态 error、文案「编译服务异常,请稍后重试」(service.go:334, :383-388),同时 defer os.RemoveAll(jobDir)(texclient.go:89)可能在沙箱正编译该目录时把它删掉,白白烧掉一个并行槽。更糟的放大回路:前端 AI 轮 apply 后自动编译并「武装」自动修复(PrismWorkspaceV2.tsx:151-157),编译 status=error 且 armed 时 fixCompile 把 log_excerpt 原文回喂 agent 走一轮修复(:192-203, :220-228)—— 而排队超时的 log_excerpt 恰是「编译服务异常,请稍后重试」这句非 LaTeX 错误,agent 白跑一整轮(烧 token)后 onApplied 又触发新编译加剧拥堵,每条链最多 2 轮(MAX_AUTO_FIX)但多用户叠加即是拥堵放大器。另外前端 onTemplateChange(:368-379)与 onApplied 的 triggerCompile 都不看 compiling 在途状态,单 tab 也能叠出并发编译。

**影响**:3-5 个用户同时用智能写作(每人一次 AI 轮就自动触发编译,失败再自动修复又编译)即可把沙箱 3 槽占满,后续所有人的编译系统性 95s 超时报「编译服务异常」;每个滞留请求在 backend 挂一个 goroutine + 全量文件/资产驻内存最长 ~100s,且每次伪失败可能再烧一轮 agent token。重 TikZ/大文档场景 1-2 个用户即可触发。

**建议**:① backend 加 per-project singleflight(同项目在途编译直接返回既有 compile 记录,或至少同 cacheKey 在途去重);② 加全局带缓冲信号量(容量≈MAXPAR)+ 排队时保持 queued 状态并把 pollTimeout 计时从「入队」改为「被沙箱认领」;③ failCompile 区分「排队超时」与「LaTeX 错误」,超时类不进 auto-fix 回喂(前端按 error code 分支);④ 前端 triggerCompile 统一加在途守卫。

### [🟠 medium] 每次编译全量物化:全部文本读 DB + 全部图片资产从 MinIO 整体下载重写,连缓存命中路径也先白下载全部资产(assetHash 只用 DB 里的 sha)

- **位置**:`backend/internal/prism/service.go:316`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:runCompile 每次执行都:gatherCurrent(:209-252)拉全部文本文件 current 版本、gatherAssets(:256-282)对每个 KindAsset 逐个 storage.GetObject + io.ReadAll 把完整字节读进内存,然后 texclient.Compile(:92-119)把全部文本+资产逐文件写进共享卷任务目录,编完 defer RemoveAll(:89)全部丢弃 —— 无任何增量/内容寻址复用。关键浪费:资产哈希用的是 DB 列 `f.RelPath+":"+f.ContentSHA256`(:278),根本不需要字节;但 gatherAssets 在缓存检查(:320 FindCachedCompile)**之前**执行(:316),即使命中缓存直接复用旧 PDF,也已经把项目全部图片从 MinIO 完整下载了一遍并丢弃。此外 N 个排队中的编译 = N 份项目全量副本同时写在 ./data/prism-work 宿主 bind mount 上(docker-compose.yml:315),N 份资产 map[string][]byte + PDF 字节同时驻 backend 堆。

**影响**:图多项目(如 20 张图共 40MB)每次点编译/每轮 AI 自动编译 = 40MB MinIO 内网流量 + 40MB 共享卷磁盘写 + 等量 backend 堆内存,auto-fix 一条链(最多 3 次编译)即 ~120MB;缓存命中本应零成本,实际仍付全额下载。随项目图量和并发编译数线性放大。

**建议**:① 把 assetHash 计算改为纯 DB 查询(RelPath+ContentSHA256 已足够),缓存命中判断提到 gatherAssets 之前,未命中才拉字节;② 中期可在共享卷做按 ContentSHA256 的资产内容寻址缓存(硬链接进任务目录),同一图片跨编译只拉一次;③ gatherAssets 改流式(GetObject 直接拷到任务目录文件)避免整段驻内存。

### [🟠 medium] 编译回传链全量经 backend 代理且禁缓存:每次编译成功前端整份重拉 PDF,下载再重复一次;queued/running 期间 1s×2 次 DB 查询轮询,backend 重启后 queued 行永久滞留致打开的 tab 无限轮询

- **位置**:`backend/internal/prism/handler.go:334`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:GetPDF(:319-342)把最近成功编译的 PDF 从 MinIO GetObject 后 io.Copy 全量代理给浏览器,显式 `Cache-Control: no-store`(:336),无 Accept-Ranges/ETag/304 通道;前端每次编译成功 pdfKey+1 → prismPdfSource 换 ?v= 整份重拉(PrismWorkspaceV2.tsx:118-123, prism.ts:299-303),「下载 PDF」按钮再走 http blob 完整拉第二遍(PrismWorkspace.tsx:217-224)。轮询侧:useCompile 在 queued/running 每 1s 打一次 GET /compile/:id(prism.ts:174-177),后端每次 poll 做 ownedProject + GetCompileInProject 两次 DB 查询;而编译状态机只活在 runCompile goroutine 里,backend 重启/崩溃后 queued/running 行没有任何 startup 对账或超时清理(全仓只有 48h GC 且明确排除各项目最新一条,repository.go:463-472 `id NOT IN (SELECT MAX(id) ... GROUP BY project_id)` —— 卡死的恰恰通常是最新一条,永不回收),该 tab 将以 1Hz 无限轮询且「编译中」按钮永久禁用直到刷新。

**影响**:AI 轮自动编译 + auto-fix 使「编译成功→整份 PDF 过 backend→nginx→浏览器」成为高频事件,几十 MB 的图文稿每轮双份带宽(MinIO→backend、backend→客户端)叠加;多 tab 编译期 1s 轮询给 DB 恒定底噪。重启滞留是低频但一旦发生该项目 UI 卡死到用户刷新。

**建议**:① GetPDF 按 pdf_object_key(内容寻址,含 cacheKey)改回 `Cache-Control: private, max-age=31536000, immutable` 或至少支持 ETag/304,前端 ?v= 已保证换版本换 URL;② 加 Accept-Ranges 让 pdf.js 分段加载大 PDF;③ 启动时把 status IN (queued,running) 且 updated_at 早于 ~5 分钟的行批量置 error(「服务重启,请重试」),前端轮询对 queued 加最大时长兜底。

### [🟡 low] 保存→投影链写放大:每 800ms 打字停顿追加 2-3 份全文版本行,SaveStructVersion 的 sha 去重被 materializeStruct 无条件投影架空,prism_file_versions 无任何修剪

- **位置**:`backend/internal/prism/struct_service.go:193`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:V2 编辑器 800ms 防抖(StructEditor.tsx:288-294)每次停顿 onChange → SaveStruct → saveStructLocked(:181-197):SaveStructVersion 虽有 sha 去重(struct_repository.go:46 「内容与当前 current 一致时不追加」),但紧接着 materializeStruct(:193, :218-229)**无条件**对投影产物(整份 main.tex + references.bib)逐个调 UpsertFileBody → AppendCurrentVersion(repository.go:275-306)—— 该路径没有 sha 比对,内容未变也 supersede 旧行 + INSERT 全文新行。即:每次打字停顿至少写 1 份 struct JSON 全文 + 2 份投影全文;哪怕零改动的保存(compileNow 每次点编译都先 save.mutateAsync,PrismWorkspaceV2.tsx:354-360)也净增 2 份全文版本行。且 prism_file_versions 只在删文件/删项目时删除(repository.go:106, :230),无 superseded 修剪任务(编译 GC 只管 prism_compiles,service.go:396-467),表体量=用户全部打字历史×全文长度,无上界。

**影响**:一个活跃写作者一小时约数百次停顿,50KB 文稿即每小时 ~30-60MB 版本行写入;MySQL 表随使用时长无界膨胀,拖慢 appendVersionTx 里的 MAX(version_no) 扫描与备份体积。gatherCurrent 编译只读 current 行不受直接影响,但同一保存路径也是每次编译的前置(compileNow 先 save)。

**建议**:① UpsertFileBody/AppendCurrentVersion 加与 SaveStructVersion 相同的 sha 短路(f.ContentSHA256 == sha 时直接返回,File 表已冗余该列,零额外查询);② 给 prism_file_versions 加后台修剪(如保留最近 N 版 + 每天首版),挂在既有 compile GC ticker 上。

### [🟡 low] gatherAssets 对 MinIO 抖动 best-effort 跳过:瞬时取图失败会静默改变缓存键并把缺图 PDF 当成功产物

- **位置**:`backend/internal/prism/service.go:269`
- **验证**:⚪ 低危未做对抗验证

**机制**:gatherAssets 取单个资产失败时只 slog.Warn 后 continue(:267-271),该资产既不进任务目录也不进 assetHash(:278 只对成功取到的追加)。后果:① cacheKey 随之变化 → 本该命中的缓存假 miss,多付一次完整沙箱编译;② 编译在缺图状态下进行,latexmk 对缺失 \includegraphics 可能仍产出 PDF(draft 模式类降级或报错),成功则该缺图 PDF 以「缺资产键」缓存 1h;③ runCompile 对此完全无感知,用户只看到图没了。

**影响**:MinIO 瞬时不可用/网络抖动时,受影响的编译静默降级为缺图产物并绕过缓存多烧一次沙箱;偶发但用户不可诊断(无错误提示)。

**建议**:资产取失败应视为编译失败(failCompile,文案提示「素材读取失败请重试」)或至少在 error_summary 里标注缺失文件;若坚持 best-effort,至少把「缺失资产列表」折进 assetHash 的固定位并拒绝写缓存(不设 expires_at)。


---

# Agent 容器(agent/, Bun 多租户)


## Agent执行性能

### [🔴 high] Bash 工具 stdout/stderr 无界缓冲进内存,单条命令可 OOM 整个多租户 agent 容器

- **位置**:`agent/src/tools/registry.ts:296`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:bashTool.run 用 `new Response(proc.stdout).text()` / `new Response(proc.stderr).text()` 把子进程全部输出一次性拉进 JS 堆,之后才 `slice(0, 60_000)`(registry.ts:296-302)。超时 killer 默认 120s、最长 300s(288 行),期间输出多少就缓冲多少,没有任何字节上限。同文件里 runConverter 已经因为完全相同的风险加了 readCapped(8MB 硬帽 + 到帽即 kill,315-345 行,注释原话:'大 PDF 可吐几百 MB,在多租户共享容器里 OOM 拖垮所有会话'),但 Bash 这条路径漏掉了同款保护——修 converter 时的不对称遗留。

**影响**:claw 是开 Bash 的 feature,命令内容由模型按用户诉求生成。一条高产出命令(如 `base64 /dev/urandom`、循环 cat、脚本误打全量 dump)在 120-300s 超时窗口内可灌入数 GB 甚至数十 GB 字符串 → 共享单容器 scholar_agent OOM,所有用户、所有 AI feature(claw/prism/smart_search/peerreview)一起挂,直到容器重启。用户 prompt 即可触达,无需漏洞。

**建议**:把 bashTool 的 stdout/stderr 读取切到现成的 readCapped(如 stdout 1-8MB、stderr 64KB,到帽 kill 子进程并标记 truncated),与 runConverter 对齐;60_000 的最终截断保持不变。

### [🟠 medium] 执行器会话 Map 无 TTL/LRU 淘汰,完整 transcript(含 base64 图片)常驻内存只增不减

- **位置**:`agent/src/server/sessions.ts:96`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:全局 `const sessions = new Map<string, SessionMeta>()`(sessions.ts:96)持有每个接触过会话的完整 messages[](加上 compactCache.messages 的第二份拷贝),唯一收缩路径是显式 deleteSession(138-150 行,仅用户删会话/重置时由 backend 调用);用户切走、闲置、开新会话都不释放。图片附件经 buildUserContentWithImages 以 base64 内嵌进 history(attachments.ts:58-61),一张 6MB 图 ≈ 8MB base64 ≈ 16MB UTF-16 字符串;limitLiveImages/stripImageBlocks 只在发请求时变换(turnLoop.ts:192-194),history 本体刻意不动(attachments.ts:77 'history 本体不动')。窗口压缩按 token 估算触发(image 仅按 1600 tok 记,context-budget.ts:45),图多字节大但 token 少的会话永不触发裁剪,内存无界。

**影响**:多租户单容器长时间运行(restart: unless-stopped),常驻内存随「历史活跃会话数 × transcript 大小(近顶可达数百 KB 文本)+ 图片数 × ~2-16MB」线性膨胀直至重启;上传过几十张图的会话即数百 MB。同时 deleteSession 不触达的闲置会话 workDir(上传件/out 产物)在磁盘同样只增不减。与发现 1 叠加时更早 OOM。

**建议**:给 sessions Map 加闲置淘汰:按 lastActive 时间戳定期清扫(如 24h 无 WS 活动即驱逐内存 meta,jsonl 真源在 backend,重连 seed_history 自愈——机制已具备);或至少对 history 里的 image 块在落 history 时就换占位、原图留在 cwd 文件按需重读。磁盘侧配套清理超龄 workDir。

### [🟠 medium] 近上限稳态下每条消息同步付一次摘要 LLM 调用,阻塞主回复首 token 数秒且 memoize 几乎必 miss

- **位置**:`agent/src/server/ws.ts:279`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:handleUserMessage 在 runTurn 之前同步 `await reduceForWindow(...)`(ws.ts:279)。一旦会话估算进入 75% 触发区,若 prune 层(截老 tool_result)不够,就走 compact 层:一次 haiku 档摘要调用,最多 2 次尝试 + 300/600ms 退避(compact.ts:151-164),输入最多 48K 字符、超长还递归分段多次调用(167-203)。memoize 的 cache key 是 `${cut}:${estimateTokens(旧段)}`(compact.ts:256)——每追加一轮对话 cut 就移动,key 必变,稳态长会话几乎每条消息都 cache miss、重新全量摘要(重复计费 + 每条消息首 token 延迟 +1~5s)。另外触发信号 lastCtx 取上一轮 sumUsage 的 input+output(turnLoop.ts:351-361 跨多工具轮求和 → ws.ts:274),多轮 turn 会数倍高估上下文,导致远未近顶也进入 reduce 路径(幸有 compact.ts:236 的 estimateTokens 早退,只多付几遍全量 O(n) 扫描:estimateTokens 对每个 tool_use/tool_result 做 JSON.stringify,单条消息最多重复 4-6 遍)。

**影响**:重度长会话(审稿/写作多轮工具)进入近上限稳态后,用户每发一条消息都要先等一次(或递归多次)摘要补全才开始流式回复,体感首 token 延迟从 <1s 变 3-8s,且摘要调用费用按消息数线性重复;compactCache 形同虚设。

**建议**:① memoize key 放宽:摘要对 + 最近回合结构下,把已生成的摘要对复用为新压缩的输入前缀(增量滚动摘要),而非每次对全部旧段重摘;② 或把摘要压缩改为 turn 结束后异步预做(下一条消息直接用),主路径只做无 LLM 的 prune/硬裁;③ 触发信号改用上一轮「单次 LLM call 的最大 input_tokens」而非跨轮求和,消除高估。

### [🟡 low] 工具批次“全或无”并行:混入一个写类工具即整批串行,且每个工具都付一次 WS permission 往返

- **位置**:`agent/src/turn/runTools.ts:28`
- **验证**:⚪ 低危未做对抗验证

**机制**:runTools 只有当批内所有 tool_use 都是 MCP 或 parallelSafe 时才 Promise.all;否则整批逐个 await(runTools.ts:28-41)——批里混一个 Write/Edit/Bash/ExportDocument(parallelSafe:false),连本可并行的 MCP 检索、Read 也一起退化串行。且 runOne 对每个工具(无论 hub 是否配置自动 approve)都发 permission_request 并阻塞等 permission_response(runTools.ts:50-57),串行路径下 agent→Go→agent 的 WS 往返逐个叠加。

**影响**:claw 等场景模型一轮并行发「3 次检索 + 1 次 Write」时,3 个 1-3s 的 MCP 检索从并行变串行,该轮多花数秒;每工具一次 WS 往返在容器内网约 ms 级,单独影响小,串行放大后可感。仅影响多工具混批的轮次,常规单工具轮无感。

**建议**:把批次按 parallelSafe 分组:连续的 parallelSafe 前缀/分段并行执行、非 safe 的按序插入(保持写操作互斥与顺序);tool_result 仍按原 tool_use 顺序回填即可满足 SDK 约束。

### [🟡 low] Write 流式预览在字段序不利时对累计 JSON 每 delta 全量重扫(O(N²)),挤占单线程事件循环

- **位置**:`agent/src/turn/turnLoop.ts:245`
- **验证**:⚪ 低危未做对抗验证

**机制**:P1-1 逐 token 预览路径:FieldStreamer 本身是有状态 O(N) 增量抽取(streamText.ts 已修过一次 O(N²)),但 file_path 的定位是 `extractStreamingFieldValue(meta.json, "file_path")`(turnLoop.ts:245)——在 path 尚未出现前,每个 input_json_delta 都对**累计**JSON 从头 indexOf 全量扫描(streamText.ts:80-86)。注释假设 file_path '短、早于 content 完成',但字段顺序由模型决定;若模型把 content 放在 file_path 之前,512KB 上限(MAX_STREAM_JSON,streamText.ts:15)内按 ~64B/delta 估算累计扫描量可达 ~2GB 字符。

**影响**:单次大 Write(长文档)遇到 content-先于-file_path 的模型输出时,流式期间累计约 0.5-2s 的纯 CPU indexOf 扫描,摊在 Bun 单线程事件循环上,会拉长本会话 delta 转发间隔并挤占同容器所有并发会话的流式转发。有 512KB 硬上限兜底,不会无界。

**建议**:path 未命中时记录已扫描偏移,下次从 `max(0, lastScanned - marker.length)` 续扫(增量 indexOf);或首个 inc 产出后即断定 content 在前、直接停止 file_path 探测(改在 tool_use_complete 时补发一帧带 path 的修正)。


## Agent多租户并发

### [🟠 medium] 内存会话注册表永不淘汰:每个连过的会话连同完整 transcript(含 base64 图)常驻内存,进程生命期只涨不跌

- **位置**:`agent/src/server/sessions.ts:96`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:全局 `const sessions = new Map<string, SessionMeta>()`(sessions.ts:96)是唯一会话表,`SessionMeta.messages: Anthropic.MessageParam[]`(sessions.ts:75)承载整段会话历史。写入路径:WS 连上即 `getOrCreateEphemeral`(ws.ts:206/134→createSession sessions.ts:103)插入;每条消息把 user/assistant/tool_result 全量 push 进 `meta.messages`(ws.ts:266、turnLoop 返回后 ws.ts:335 回写),其中图片附件被 `buildUserContentWithImages` 内嵌成 base64 image 块(attachments.ts:58,单图可达 6MB→base64 ~8MB)常驻在 messages 里。删除路径只有显式 `deleteSession`(sessions.ts:138),由 backend 在用户主动删会话/会话轮换/建失败清理时才调(bridge.go 各处)。`onClose` 只 abort 不删(ws.ts:369),grep 全 src 无任何 setInterval/定时 reaper/LRU 上限。结果:一个用户日常开 N 个会话、每个会话跑 M 轮,进程活着期间这些 SessionMeta 及其完整 messages 全部滞留堆里,永不回收。

**影响**:单 Bun 进程、prod `restart: unless-stopped` 可连续跑数周,内存随累计会话数单调上涨。agent 容器 prod 限 1.5G(compose 注释自承单会话峰值 ~765MiB),多租户长期运行必然逼近上限被 OOM-kill;OOM 一发,容器内所有用户在途的流式回答同时中断。即无并发峰值,只靠时间累积也会周期性 OOM。

**建议**:给 sessions 加基于 LRU + 空闲 TTL 的上限淘汰(如末次活动 30min 且无活跃 WS 即驱逐 meta;真源在后端 journal,重连由 seed_history 回灌);或在 onClose 且该 session 无其它订阅者时延迟驱逐内存 meta。至少设 MAX_SESSIONS 硬帽 + 淘汰最久未用。

### [🟠 medium] 无全局并发/准入控制:同时 N 个用户各跑一轮流式+子进程,内存/CPU 无上限保护,约 2 个重会话即打爆 1.5G 容器

- **位置**:`agent/src/server/ws.ts:199`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:并发控制只有「每会话一轮」的 `inFlight` 忙锁(ws.ts:199、hub.beginTurn),跨会话没有任何全局信号量/准入闸。每个并发轮同时占用:①该会话完整 messages[](近上限时 ~128k token≈数百 KB~MB,外加最多 3 张 live base64 图 ~20MB,见 turnLoop MAX_LIVE_IMAGES=3 + attachments limitLiveImages);②一路 LLM 流式的 SSE 解析缓冲(openai/adapter.ts 状态机 textBuf/args 累积、turnLoop assembler json 累积);③可能并行的工具子进程 —— Bash(bwrap+bash)、pdftotext、pandoc(registry.ts:282/348)、mermaid 的 headless Chromium(mermaid.ts:84,每个 ~100-200MB)。这些子进程也无跨会话并发上限(prod 仅有 pids:512 与 2 CPU)。此外每条首轮消息还 fire-and-forget 再起标题生成(ws.ts:352 generateTitle)、每轮后端触发记忆抽取(ws.ts:178 extract_memory→fastCompletion),都是不受 inFlight 约束的额外并发 LLM 调用。

**影响**:运营方自己标注单会话峰值 ~765MiB → 仅约 2 个并发重会话(大历史/带图/触发 PDF 解析)即超 1.5G 被 OOM,连累容器内全部用户;CPU 仅 2 核,N 个 pdftotext/pandoc/chromium + N 路流式解析在同一事件循环+2 核上争抢,尾延迟陡升。唯一现有兜底是后端 per-user 每日 token 配额(限总量不限并发)与 OOM/pids 硬杀。

**建议**:进程内加全局并发准入:限同时活跃 turn 数(如按 CPU/内存预算的信号量,超额排队并给前端 busy/排队提示)、限并发工具子进程数(尤其 chromium/pandoc/pdftotext 各自的全局上限)。标题生成/记忆抽取也纳入低优先级队列,避免与主轮争资源。

### [🟠 medium] /render/math 同步 CPU 渲染无队列,阻塞单线程事件循环——一次公式渲染卡住所有用户的流式输出

- **位置**:`agent/src/render/math.ts:59`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:`renderMath` 里 `mjDoc.convert(src,...)`(math.ts:59,MathJax TeX→SVG,纯 JS CPU)与 `resvg.render().asPng()`(math.ts:82,resvg-wasm 同步栅格化)都是同步 CPU 密集调用,直接跑在 Bun 主事件循环上,且**没有任何串行队列或并发上限**。对比同目录的 mermaid 渲染明确用 `let queue` 串行化并注释「并发渲染在小容器里会 OOM」(mermaid.ts:33),math 路径却没有这层保护。该端点由 backend 代理调用(小程序 rich-text 渲染公式),一条消息含多条公式时会短时间打来多发请求。因为是同步 CPU,MathJax/resvg 执行期间整个事件循环被占住,期间所有用户的 WS token 转发、HTTP 都被推迟。此外模块级单例 `mjDoc`(math.ts:17)被所有请求复用 `.convert()`,MathJax document 复用时内部 math 列表可能逐次累积,存在随渲染次数增长的内存隐患。

**影响**:并发或密集公式渲染时,同步 MathJax+resvg 在共享事件循环上串行阻塞,期间所有在线用户的流式回答出现可感知卡顿;math 无 mermaid 那样的队列,峰值下还可能多份 resvg 同时驻留内存。属特定场景(公式密集)下的全局停顿,随请求量恶化。

**建议**:给 math 渲染加与 mermaid 同款的串行队列(或有界并发),把 CPU 密集段移出主循环(Worker 线程/子进程),并考虑每次渲染用独立 MathJax document 或定期重建 mjDoc 以免状态累积。

### [🟡 low] 每轮 runTurn 在事件循环上做同步 fs 读(loadAddDirContext),per-session skill 目录使缓存每会话首轮必 miss

- **位置**:`agent/src/turn/turnLoop.ts:102`
- **验证**:⚪ 低危未做对抗验证

**机制**:`runTurn` 每轮都同步调用 `loadAddDirContext(input.addDirs)`(turnLoop.ts:102)。命中缓存时 O(1),但缓存键是 `addDirs.join('|')`(loader.ts:141);skill 市场引入后 claw 会话的 addDirs 含 per-session 物化目录 `<sid>.skills`(sessions.ts:112),导致**每个会话的 cacheKey 唯一**、首轮必然 miss。miss 分支里是一串同步阻塞调用:`safeRead`→`readFileSync`(loader.ts:19)读各 CLAUDE.md、`listSkillDirs`→`readdirSync`(loader.ts:27)、逐个 SKILL.md `readFileSync`,以及 `buildSkillMenu` 再对每个 addDir `readdirSync`+`safeRead`(loader.ts:67/75)。这些同步 IO 跑在所有用户共享的单一事件循环上,N 个新会话同时开首轮会串行化各自的同步读盘。

**影响**:文件小、命中后不再读,单次 miss 只有几个小文件的同步读盘(亚毫秒~毫秒级),但它落在所有租户共享的事件循环上,高并发新会话/skill 场景下叠加成可测的事件循环停顿。属小规模优化机会。

**建议**:把 loader 的 fs 读改成异步(fs/promises)并让 runTurn await;或对静态一方目录(/claw-add 等)与 per-session 目录分离缓存,避免 per-session 目录使整份缓存键失效。

### [🟡 low] agent→hub WS 发送忽略背压返回值,慢消费/hub 停顿时靠 Bun 默认 backpressure 上限兜底(丢帧)

- **位置**:`agent/src/server/ws.ts:64`
- **验证**:⚪ 低危未做对抗验证

**机制**:`safeSend` 直接 `ws.send(JSON.stringify(obj))`(ws.ts:64)且忽略 Bun ServerWebSocket.send 的返回值(<0 表示进入背压)。turnLoop 出 token 时每个 content_delta 都经 sink.frame→safeSend 同步发出(turnLoop.ts:225、ws.ts:240)。index.ts 的 `websocket` 配置(index.ts:57)未设 `backpressureLimit`/`maxPayloadLength`,采用 Bun 默认背压上限。当唯一对端(Go hub)读取变慢时,发送数据在 socket 缓冲区累积;超过 Bun 默认上限后 send 被丢弃或连接被关。当前 Go hub 侧读循环较快且对慢订阅者会主动丢弃(hub.go enqueue),故实际风险不高,但 agent 侧对背压完全无感知、无节流。

**影响**:正常情况下 hub 快速排空,影响可忽略;极端(hub 卡顿/网络拥塞)下 LLM 出 token 快于对端消费时,靠 Bun 默认背压帽兜底,可能静默丢帧或断连,而非有序节流。属健壮性/背压可观测性的小缺口。

**建议**:检查 ws.send 返回值,进入背压时暂停/节流 turnLoop 的 token 产出(或聚合发送),并显式设置合理的 backpressureLimit,超限记日志而非静默。


## agent 容器磁盘侧存储生命周期(workspace/jsonl/file-history 无 TTL 增长)

### [🔴 high] 会话 workspace 磁盘零回收:无 TTL/GC/配额,claw·smart-search 多会话按设计永久保留且无每用户会话数上限,磁盘线性增长直至打满与 MySQL/MinIO 共享的宿主分区

- **位置**:`agent/src/server/sessions.ts:107`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:每个 agent 会话创建时物化一个磁盘目录(sessions.ts:103-107 `const workDir = opts.workDir || safeSessionDir(SESSIONS_ROOT, sid); await mkdir(workDir, { recursive: true })`),此后附件(≤30MB/个)、references PDF、Bash 产物全落在里面。全 agent/src 范围 grep cleanup/prune/ttl/expire/evict 只命中 turn/context-budget.ts 的内存 token 裁剪,磁盘侧零命中——容器内无任何定时清理。后端侧同样没有:common/cleanup/cleanup.go:126 的 agent_sessions 对账明确注释「纯加法,不删任何行」,只补归属行不回收任何东西。唯一删除路径 = 用户手动删会话/Reset(agentbridge/http_handler.go:320 DELETE /sessions/:id、bridge.go:722)+ peerreview/prism 的业务级清理(peerreview/service.go:368/586/985、prism/edit.go:125);而 claw/smart-search 多会话模式旧会话按设计永久保留(repository.go:144 ListByUserFeature 无 LIMIT,claw/smartsearch/agentbridge 全量 grep 无 MaxSessions/会话数上限),workspace 随 DB 行一起永久保留。写入侧也无 agent 层上限:http.ts:244-251 PUT workspace/file 直接 `new Uint8Array(await req.arrayBuffer())` 落盘无大小检查,pushSessionFile(workspace.ts:159-169)同样不限;生产 bwrap 沙箱(sandbox/bwrap.ts,全文 118 行)无 ulimit -f/fsize/quota——对比 prism_tex/entrypoint.sh:53 专门用 `ulimit -f` 防写爆,agent 会话的 Bash 产物完全不设防。docker-compose.prod.yml agent 服务把 `./data/agent-sessions:/home/bun/sessions` 持久 bind-mount(注释自认「跨重部署不丢 cwd / 上传文件」),deploy.resources 只限 memory 1.5G/cpus 2.0/pids 512,磁盘无任何配额(bind mount 本身也无法被 docker 限容)。

**影响**:多租户 6-12 个月尺度下磁盘严格单调增长:每用户可无限建会话,每会话可沉淀数十 MB(附件 30MB/个 + 不设防的 Bash 产物),用户几乎不会主动删旧会话。开发环境单人 6 周已 74MB/174 会话;生产多租户斜率按用户数放大。终态是打满与 mysql/minio/prism-work 同一宿主分区(prism_tex 注释自认此风险),MySQL 磁盘满即全站不可写——届时是 critical 级事故,只是到达时间取决于用量。

**建议**:三层修:① 给 agent 或 backend 加会话 workspace GC——按 agent_sessions.last_accessed_at 超期(如 90 天)或每用户目录总量超限时,由 backend 调 agent 删 workspace(产物耐久真源已在 MinIO+DB,compose 注释自己写明,回收是安全的);② agent 侧给 Bash/PUT 写入加 fsize ulimit 或写后配额检查(对齐 prism_tex 的 ulimit -f 思路);③ 部署侧加磁盘水位监控告警(du data/agent-sessions + df 分区),作为 GC 落地前的兜底。

### [🟠 medium] executor 重启后删除路径静默失效:deleteSession 只认内存 Map,重启前创建的会话删除时 agent 返 404、backend 容忍后删掉 DB 行,workspace 目录成永久孤儿且无任何对账回收

- **位置**:`agent/src/server/sessions.ts:141`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:sessions.ts:138-141 `const m = sessions.get(sid); if (!m) return false;`——deleteSession 先查内存 Map(sessions.ts:96 `const sessions = new Map<...>()`,纯进程内),查不到直接返回 false 而不尝试删 `safeSessionDir(SESSIONS_ROOT, sid)` 磁盘目录;http.ts:197-201 据此回 404。executor 每次部署/重启(restart: unless-stopped)Map 清空,但生产 workspace 目录经 bind mount 持久(dev 无 volume 时可写层也被 restart 策略保留,sessions.ts:39 注释自认)。此时用户从侧边栏删除一个重启前的旧会话:backend DeleteSessionByID(bridge.go:1310-1314)对 404 显式容忍(`err != nil && !errors.Is(err, agent.ErrSessionNotFound)`,client.go:202-203 把 404 转 ErrSessionNotFound)→ 继续删 DB 行 → 目录从此无人引用。Reset 路径同样容忍(bridge.go:727-729「old session already gone (404)」只打 log)。唯一能恢复可删性的方式是用户先重新打开该会话触发 WS 的 getOrCreateEphemeral(ws.ts:134/206)重建 Map 条目——直接删则必孤儿。孤儿产生后无任何补救:agent 侧无启动 sweep(index.ts/http.ts grep readdir/sweep/orphan/reap 零命中),backend cleanup 只补行不删(cleanup.go:126),双向都不对账 SESSIONS_ROOT ↔ agent_sessions。peerreview/prism 的会话清理调用(service.go:368/586/985、edit.go:125)若跨重启同样漏删 workspace。另注:workspace.ts:148 的 `rm(abs, { recursive: true, force: true })` 只服务 DELETE /workspace/file 单路径删除(http.ts:253-255,confinePath 限 cwd 内),不是整目录回收;整 workspace 回收只有 sessions.ts:143 这一处,且被 Map 门禁挡住。

**影响**:它把发现 1 里唯一的磁盘回收路径打断,使增长严格单调:每次生产部署都把当时全部存量会话的 workspace 变成「用户直接删 = 永久孤儿」。用户视角一切正常(DB 行删了、列表消失),磁盘却只增不减;孤儿目录连管理员都没有 API 可清,只能上宿主机手动 rm。部署越频繁、存量会话越多,孤儿率越高。

**建议**:deleteSession 在 Map 未命中时回退按约定路径删除:`if (!m) { await rm(safeSessionDir(SESSIONS_ROOT, sid), {recursive, force}); await rm(safeSessionDir(...)+'.skills', ...); return true; }`(sid 已过 validSessionId + safeSessionDir 双重防穿越,安全);另加一个启动/定时 sweep:列 SESSIONS_ROOT 一级目录,与 backend agent_sessions(含 peerreview/prism 业务表)对账,删除无主目录。

### [🟡 low] 退役 cc-haha fork 的 134MB 历史数据(projects jsonl 132MB + cc-haha 1.8M + file-history 288K)归档迁移完成后永久滞留磁盘,dev/prod compose 仍常挂 /fork-data 且每次 boot 重扫

- **位置**:`docker-compose.yml:317`
- **验证**:⚪ 低危未做对抗验证

**机制**:原 cc-haha fork 已退役(compose 注释「P6:fork 已退役」),其 jsonl transcript 等数据留在 ./data/agent/(实测 projects=132MB、cc-haha=1.8M、file-history=288K)。docker-compose.yml:317 与 docker-compose.prod.yml:289 都仍把 `./data/agent:/fork-data:ro` 挂进 backend,配合 `AGENT_ARCHIVE_FROM_JSONL: ${AGENT_ARCHIVE_FROM_JSONL:-/fork-data}`(compose:285)做一次性折叠归档进 agent_session_archive——注释写明「幂等,迁完自动 no-op」,但迁移完成后没有任何步骤回收这 134MB,且每次 backend 启动仍要重扫一遍确认 no-op。当前 executor 已不写 jsonl(sessions.ts:1-2「无 transcript 真源——那在后端 journal」,agent/src 无任何 jsonl/file-history 写入代码),这份数据是纯死重。

**影响**:静态占用 ~134MB 不再增长,属一次性死重而非泄漏;顺带每次 backend boot 多一次 /fork-data 幂等扫描(启动时间小开销)。在磁盘紧张的生产分区上是白占的容量。

**建议**:确认 agent_session_archive 归档完整后(可对账 jsonl 会话数 vs archive 行数),从两份 compose 移除 /fork-data 挂载与 AGENT_ARCHIVE_FROM_JSONL 默认值,并把 ./data/agent 冷备后从生产机删除;至少在运维文档标记该目录可回收。


---

# 桥接链路(internal/agentbridge)


## Agentbridge桥接链路

### [🟠 medium] 流式热路径:replayBuf 合并对每帧 content_delta 做 O(已累积块长) 重新 marshal(持 hub 锁),长回复呈二次方开销;且每帧重复 3~4 次全量 JSON 解析

- **位置**:`backend/internal/agentbridge/hub.go:1244`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:upstreamLoop 每收一帧:①`frameType(data)`(ws.go:490 全量 json.Unmarshal 只取 type);②`broadcastAgent`(hub.go:699)在 h.mu 内调 `coalesceReplay`(hub.go:1244)——`contentDeltaText` 再整帧 unmarshal 一次,然后 `json.Marshal(map[string]string{"text": last + txt})`(hub.go:1251)把**本文本块迄今全部内容**拼串并重新 JSON 转义;③帧尾 tee 进日志时 `classifyJournalEv`→`frameType` 第 2 次解析(hub.go:953→1300);④batcher `extractDeltaText` 第 3~4 次解析(eventlog_batcher.go:343)。即一帧 delta = 3~4 次全量 unmarshal + 1 次 O(块长) marshal + 2 次 h.mu + 1 次全局 batcher 锁 + N 订阅者 channel send。coalesceReplay 的合并帧长度随流式推进单调增长:块长 L、每帧 ~25B 时总拷贝+转义量 ≈ L²/50。生产 .env 已把 4 个 feature 全切 executor(AGENT_EXECUTOR_FEATURES=smart_search,claw,prism,peerreview),迟到续流优先走 journal(hub.go:574-605),replayBuf 只是 fallback——但每帧仍全额维护,且无订阅者的 grace 期也在做。

**影响**:长文本回复(prism 生成整节 LaTeX / claw 长解读,单文本块 50–100KB、2000–4000 帧)每轮产生 50–200MB 的字符串拷贝+JSON 转义纯浪费,且发生在 h.mu 临界区内——同会话的 addSubscriber 补帧、handleUserMessage、echoToOthers 全被拖慢;多用户并发长回复时后端 CPU/GC 明显抬升。短回复(<5KB)影响可忽略,随回复长度二次方恶化。

**建议**:① replayBuf 合并改为只追加片段(存 []string 或 strings.Builder,迟到补帧时才一次性拼帧),消除每帧 O(L) re-marshal;或生产上 journal 续流已可用时,inFlight 且 readFromJournal(feature) 为真则跳过 replayBuf 维护;② 上游循环解析一次帧头后把 type/text 沿路传递,消除 frameType/contentDeltaText/extractDeltaText 的重复整帧解析(可用轻量 type 探测或一次性解出 {type,text,toolInput} 结构复用)。

### [🟠 medium] agent_turn_events 无任何 TTL/清理/分区滚动,且写侧 200ms 定时 flush 使行数≈流式时长/200ms(非注释宣称的 O(内容块)),作为『历史唯一真源』无限增长

- **位置**:`docker/mysql/migrations/0046_agent_turn_journal_fields.sql:52`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:①行放大:deltaBatcher 注释称合并为 O(content-blocks) 行,但 `batchFlushInterval=200ms`(eventlog_batcher.go:34)在持续流式时每 200ms 就 flush 一行——LLM 典型 30–80 tok/s 时每行 payload 仅 ~40–60 字节,30 秒的流式回答 ≈150 行 content_delta + 工具/思考行;②零生命周期管理:cleanup.CleanupService 只清 usage_events / llm_token_usage 等(cleanup.go:193-236),没有任何针对 agent_turn_events / agent_turns / agent_billing_ledger 的清理任务;全仓库无 ADD/REORGANIZE PARTITION 的运维脚本,分区只预建到 p2609(<2026-10-01),之后所有数据永远落进 p_future 单分区,月度分区设计名存实亡;③会话删除/重置(bridge.go:1302 DeleteSessionByID、685 ResetSession)只删 agent_sessions 行和 agent 端数据,journal 的 turns/events 成为永久孤儿。表是 JSON payload 列(含完整 tool_result 大对象),是全库增长最快的表。

**影响**:按每活跃轮 ~150-300 行、每行含 JSON payload 估算,日千轮级即 15–45 万行/日;2026-10 之后 p_future 无界膨胀,磁盘、备份(mysqldump)、以及任何按 created_at 的运维操作持续恶化;删除会话不释放存储,用户删数据存储不降。当前(2026-07)尚在预建分区内,是 2~3 个月内必然爆发的定时问题。

**建议**:① 加分区滚动任务(每月预建下月分区 + 按保留期 DROP PARTITION,追加式迁移可放 schema-sync 或后台任务);② 明确保留策略:message_complete 后可把同 turn 的多行 content_delta 压缩合并为 1 行(读侧 FoldToMessages 兼容),或将定时 flush 间隔改为『块结束/4KB 才落行、终态兜底』;③ 会话删除时级联删 agent_turns/agent_turn_events(或标记后由清理任务批删);④ 把三张 agent_* 表纳入 cleanup 服务的容量监控。

### [🟠 medium] deltaBatcher 全局单锁 + 单 writeLoop 消费者,writeCh 满时在持全局锁状态下同步写 MySQL(含最长 3 次重试 + 60ms 退避)——MySQL 抖动会拖停全平台所有会话的流式转发

- **位置**:`backend/internal/agentbridge/eventlog_batcher.go:176`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:所有 hub 的 `turns.Append` 汇入同一个 deltaBatcher(全局一把 b.mu + 一条 writeCh(2048) + 单个 writeLoop 串行单行 Create)。`enqueue` 在 writeCh 满时回落 `createWithRetry` 同步落库,而 enqueue 的所有调用点(flushDeltaLocked/flushThinkLocked/append 非流式分支/timedFlush)都在 **b.mu 持有中**(append 在 line 236/292-297 先 flush 再 Unlock)。createWithRetry 失败重试 3 次、sleep 20/40/60ms,再叠加 MySQL 网络往返。而每个 hub 的 upstreamLoop 是同步调用 Append 后才读下一帧。

**影响**:MySQL 变慢或写入突发导致 writeCh(2048)积压后,每次 flush 都变成『持全局锁同步写库』:一个会话的慢写阻塞**所有**会话的 batcher.append → 所有 upstreamLoop 卡在 Append → 全平台流式输出集体冻结(用户侧表现为所有 AI 对话同时卡住),并进一步压垮 MySQL 形成正反馈。正常状态无感,属降级场景下的放大器。

**建议**:① enqueue 的同步兜底移出 b.mu(先收集 rows,Unlock 后再写);② writeLoop 改批量插入(攒 N 行一次 CreateInBatches),提高消费速率;③ writeCh 满时优先丢 content_delta(可由下一轮终态同步写兜底)或按 turn 降级合并,只对终态事件保证同步持久;④ 给 writeCh 深度加指标/日志水位告警。

### [🟠 medium] 迟到续流补帧在 writeLoop 启动前非阻塞塞入 256 容量队列,长在途轮(journal 事件 >256 行)会静默丢弃补帧尾部——恰好丢的是最新内容

- **位置**:`backend/internal/agentbridge/hub.go:592`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:addSubscriber 在 h.mu 内用 `trySend`(非阻塞、满即丢,hub.go:1234-1240)把 user_echo + 在途轮全部事件塞进 `sub.out`(容量 subOutBuffer=256,hub.go:48),而消费者 `sub.writeLoop` 要到锁释放后的 hub.go:619 才启动——补帧阶段队列零消费。journal 路径的在途事件行数 ≈ 流式时长/200ms + 工具帧(见 batcher 200ms flush),一轮流式超过 ~50 秒即 >256 行;超出部分被 trySend 静默丢弃,且丢的是 ev_seq 靠后的最新内容。replayBuf 内存路径因块级合并通常不会超,但 journal 路径(生产默认,executor feature 全开)是常态路径。

**影响**:用户在长回答进行中(约 1 分钟以上)刷新页面或另开 tab:补帧被截断,页面上该轮中段以后内容缺失、与随后的 live 帧之间出现空洞,直到轮结束后重新拉历史才恢复。prism 长文生成 / claw 多工具长轮场景可稳定复现;既是体验问题也是白白读了 journal 又丢掉的浪费。

**建议**:① 补帧不逐帧塞队列:锁外把 jEvs 合并折叠成少量帧(content_delta 按块合并,与 replayBuf 同思路)再入队;② 或 addSubscriber 返回后先由调用方同步写完补帧再启动 writeLoop + 注册 live 广播(需要把注册与补帧拆两段);③ 至少在 trySend 丢弃时记日志并给前端发一个 resync 提示帧。

### [🟠 medium] journal 校验器(AGENT_JOURNAL_VALIDATE=on 已在 .env 打开)对比基线已随 fork 退役失效:每 60s 扫描 + 每会话 3 次 DB 读 + 全量 transcript HTTP,且对 >20 轮会话必然产生假阳性 ERROR 日志

- **位置**:`backend/internal/agentbridge/eventlog_validate.go:91`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:.env:147 `AGENT_JOURNAL_VALIDATE=on` 使 validator 常驻:每 60s 取最近完成的 ≤200 个 turn,对每个去重会话执行 `ReadRecentTurns(20)`(Count+Pluck+Find,加载 20 轮全部事件 payload)+ FoldToMessages + `client.GetSessionMessages(sid, 20)`。但该 client 现指向 executor(fork 已退役,AGENT_BASE_URL 与 AGENT_EXECUTOR_BASE_URL 同为 scholar_agent:3456):executor 的 messages 端点**忽略 limitTurns、返回内存全量视图**(agent/src/server/sessions.ts:167-193),不在内存的会话返回空 200(http.ts:216-219)。于是:内存中 >20 轮的会话 journal(20 轮)与 daemon(全量)的 user 轮数/assistant 文本/工具序列三项比对必不相等 → 每次扫描 3 条 slog.Error;executor 重启后未重连的会话返回空 → 同样假阳性。校验器的『jsonl 真源』前提已不存在,产出的只有开销和噪声。

**影响**:活跃时段每分钟对每个有完成轮的会话做一次『20 轮事件全量 MySQL 读 + executor 全量 transcript HTTP 传输 + 三次折叠比对』的纯废功,并以 ERROR 级别持续刷 journal_validate_mismatch 日志(json-file 日志量放大、真告警被淹没),mismatch 计数器失去诊断价值。

**建议**:fork 已退役、journal 已是唯一真源,该校验器使命完成:从 .env 关闭 AGENT_JOURNAL_VALIDATE(bootstrap 不再启动),或改造为轻量自洽校验(如只校验 journal 内 ev_seq 连续性/终态完整性,不再对比 executor 内存视图)。

### [🟡 low] 每条 user_message 的钩子链存在成对重复读:配额闸与预算盖章背靠背各做一次 EffectiveTier(users 表 SELECT)+ loadWindow(2 次 Redis),单条消息合计 ~5 次 MySQL + ~5 次 Redis 同步往返

- **位置**:`backend/internal/agentbridge/hub.go:1106`
- **验证**:⚪ 低危未做对抗验证

**机制**:handleUserMessage 顺序执行:①revalidateModelBeforeMessage(锁定模型时 1 次 users SELECT);②Touch(1 次 UPDATE agent_sessions);③PreUserMessage→vip.CheckDailyQuotaOverdraft:EffectiveTier(users PK SELECT,vip/service.go:91-98)+ loadWindow(Redis GET anchor + MGET used/base);④BeginTurn 影子日志(事务:SELECT + SELECT MAX(seq) + INSERT);⑤BudgetProvider→vip.RemainingBudget(vip/quota.go:290-305):**再次** EffectiveTier + loadWindow——与 ③ 完全相同的读在几微秒内重复一遍。这些都在订阅者 readLoop 同步路径上。

**影响**:消息级(人手速)而非帧级,单机负载可承受;但一半的 users 表点查和 Redis 往返是纯重复,消息发送首字节延迟白增 2~5ms,高并发时 users 表点查 QPS 翻倍。

**建议**:让 CheckQuota 与 BudgetProvider 共享一次窗口读:如 spec 层把两钩子合并为一次 `RemainingBudget` 调用(soft<=-overdraft 即拒),或给 EffectiveTier/loadWindow 加 per-user 数秒级 in-flight 缓存。

### [🟡 low] hub 每次重建(3 分钟 grace 过后用户回访即触发)都全量重组 seed_history:30 轮完整事件 payload(含 tool_result 大对象)+ 记忆 + skills 内联正文一次性重发 executor,与前端同时拉的历史形成双份全量读

- **位置**:`backend/internal/agentbridge/hub.go:462`
- **验证**:⚪ 低危未做对抗验证

**机制**:executor 无状态,首订阅者建 hub 时 seedHistoryFromJournal 执行:ReadRecentTurns(30)(3 条 SQL,载入 30 轮全部事件含 tool_result 原文)→ FoldToMessages → FindByAgentSessionID → buildCreateOptions(Picker + MemoryBlocks 1 次 SELECT + SessionSkillsProvider 读市场 skill 并**内联全文**)→ applySessionProfile → 组装一个可能数百 KB~MB 级的 seed_history 帧写上游。同一时刻前端进页面又经 GetSessionMessages 走 readHistoryFromJournal 再读一遍同样的 30 轮。claw 大 tool_result(Bash/检索输出)会显著放大帧体。这是无状态 executor 设计的固有代价,但目前每次回访都全额支付、无任何短路(如 executor 已持有该会话时跳过)。

**影响**:用户每次回访(间隔 >3 分钟)都触发一次 30 轮全量 MySQL 读 + 大帧 WS 写 + executor 端解析,叠加前端历史拉取即双份;活跃用户频繁进出页面时形成可观的重复读放大。单次量级有界(30 轮),故评 low,随 tool_result 体量与用户回访频率线性放大。

**建议**:① executor 已在内存持有该会话(可在 WS connected 握手帧带回 hasState 标志)时跳过 seed 或只补 opts;② seed 的 messages 可剔除/截断超大 tool_result(模型续聊几乎不需要完整工具原文,executor 侧 H5 滑窗最终也会裁);③ MemoryBlocks/skills 与 GetSessionMessages 的读共享短 TTL 缓存。


---

# 基础设施(Nginx/Docker)


## Nginx与Docker基础设施

### [🟠 medium] 生产 agent 容器 1.5G/2CPU 承载全部 4 个 AI feature 的多租户负载,约 2 个重会话即可 OOM 打挂整个容器

- **位置**:`docker-compose.prod.yml:376`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:scholar_agent 是单容器多租户执行器,smart_search/claw/prism/peerreview 四个 feature 的所有用户会话(LLM 流式 + Bash 子进程 + 文件操作)都跑在这一个进程组里。生产限额 `memory: 1.5G / cpus: "2.0" / pids: 512`,而配置注释自己承认「单会话峰值 ~765MiB」——即两个并发重会话(如同时做 PDF 解析/大上下文流式)就逼近 cgroup 上限,触发 OOM kill 时杀掉的是整个容器,不是单个会话。CPU 2 核同样被全部租户的 bash/编译/流式共享,饱和时 Bun 事件循环延迟拉长,应用层 25s ping/pong 断供超过 60s 还会连锁触发 backend 的 agentReadDeadline(agentbridge/ws.go:91 `const agentReadDeadline = 60 * time.Second`)整 hub 拆除。另外 dev 的 docker-compose.yml 中 agent 服务(347-410 行)完全没有 deploy.resources 块——无 memory/cpu/pids 任何限制,本机一个 runaway bash/解析任务可吃光宿主机内存。

**影响**:多用户高峰期(≥2 个重会话并发)整个 agent 容器被 OOM kill 重启:所有在线用户的进行中 AI 轮次全部中断、WS 全断、前端集体重连 resync;restart unless-stopped 虽秒级拉回,但正在执行的工具/流式输出丢失。CPU 饱和时全租户会话流式变慢并放大心跳超时连锁断连。dev 无限额则是本机资源被单容器吃光的风险。

**建议**:生产:按目标并发上调 memory(如 3-4G,至少覆盖「单会话峰值×预期并发重会话数」),或在 backend 侧加 per-user/全局并发会话准入闸(排队而非放进容器硬挤);cpus 按宿主核数放宽。dev compose 给 agent 至少补一个 memory 上限 + pids 限制(生产已有 pids: 512,dev 一并对齐)。

### [🟡 low] claw 的 WebSocket 漏在 nginx 专用长超时 WS location 之外,走通用 /api 的 60s 超时——与 prism/smart-search 不一致,长工具执行/心跳延迟时会被 nginx 掐断

- **位置**:`nginx/conf.d/user.conf:48`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:专用 WS location 的正则是 `location ~ ^/api/v1/user/(smart-search|prism)/ws/`(proxy_read/send_timeout 86400s),但后端实际注册了三条 agent WS 路由,claw 在列却不在正则里:routes_user.go:362 `api.GET("/user/claw/ws/:sessionId", h.claw.HandleWS)`,前端也确实连这条路径(features/claw/api/socket.ts:31 `…/user/claw/ws/${sessionId}?ws_token=…`)。于是 claw WS 升级落进通用 `location /api/`(user.conf:134-162),吃它的 `proxy_read_timeout 60s / proxy_send_timeout 60s`,还额外被 `limit_req zone=ip_limit burst=50` 计数。正常情况下 hub 每 25s ping agent、agent pong 经 broadcastAgent 扇出给前端(hub.go:961-963),60s 内有帧不会断;但容错余量只剩 2 个心跳周期——agent 容器 CPU 饱和/事件循环阻塞导致 pong 延迟 >60s 时 claw 前端腿被 nginx 先掐,而 prism/smart-search 有 24h 容错。配置注释自己写明了这个坑:user.conf:47 「单次工具执行可能 >60s 无帧,必须长超时(否则会被通用 /api 的 60s 掐断)」,claw 与 prism 同样跑长 Bash/文件工具,风险剖面一致却唯独没进白名单。

**影响**:claw(旗舰智能助手,最常用 AI 路径)在 agent 高负载/心跳延迟 >60s 时被 nginx 掐断 WS:用户看到生成中途卡住→重连→resync 续流的顿挫;与 prism/smart-search 行为不一致导致排查困难。多 tab/多用户同 IP 时升级请求还共享 10r/s 限流桶。

**建议**:把正则改成 `location ~ ^/api/v1/user/(smart-search|prism|claw)/ws/`(一词修复);后续新增 agent feature 的 WS 路由时同步维护这条正则(或改成 `[a-z-]+` 通配 + 后端鉴权兜底)。

### [🟡 low] nginx 限流键 $final_client_ip 信任客户端可伪造的 X-Real-IP / XFF 首段,10r/s 与 5r/s 的过载保护可被完全绕过

- **位置**:`nginx/nginx.conf:60`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:限流 zone 用 `$final_client_ip` 做键,而它的取值链是:优先取客户端请求头 X-Real-IP(map $http_x_real_ip,nginx.conf:32-35),否则取 X-Forwarded-For 的**第一个** IP(nginx.conf:26-29 `~^(?<firstip>[0-9\.]+),?.*$`)。本 nginx 是最外层入口(docker-compose.yml:551-553 直接 `"${HTTP_PORT:-5411}:80"` 对外),这两个头都是攻击者可自由填写的:每个请求换一个假 IP 即每个请求独占一个限流桶,`rate=10r/s`(ip_limit)与 `rate=5r/s`(analysis_limit)形同虚设;同时随机键会快速灌满 10m 的 zone(约 16 万条状态),nginx 开始淘汰最老条目,连带削弱对合法用户的限流准确性。全文确认没有配置 ngx_http_realip_module(无 set_real_ip_from)。既往审计只修了 backend 侧限流的 XFF 问题,nginx 层仍是裸信任。

**影响**:nginx 层对 backend 的请求洪峰保护失效:攻击者轮换伪造头即可以任意速率打到 backend/MySQL(登录、搜索、公开端点等),后端只剩自身 Gin 限流兜底;zone 被垃圾键填满后对正常 NAT 用户的限流计数也被淘汰扰动。

**建议**:边缘直连部署时限流键直接用 $remote_addr;若生产前面有可信 CDN/LB,用 realip 模块正确还原:`set_real_ip_from <可信网段>; real_ip_header X-Forwarded-For; real_ip_recursive on;` 然后限流键用 $remote_addr——绝不要取 XFF 第一段、不要信任客户端 X-Real-IP。

### [🟡 low] upstream keepalive 连接池对多数高频 location 无效:未清 Connection 头,nginx 默认向上游发 Connection: close

- **位置**:`nginx/conf.d/user.conf:311`
- **验证**:⚪ 低危未做对抗验证

**机制**:nginx.conf:77-89 精心配了 backend/frontend/umami 三个 upstream 的 keepalive 池,并注释「配合 location 中的 proxy_http_version 1.1; proxy_set_header Connection ""」。但实际只有 /api/、analysis、location / 等少数 location 设置了 `proxy_set_header Connection $connection_upgrade`;以下高频 location 只设了 proxy_http_version 1.1 而没有覆盖 Connection 头,nginx 默认向上游发送 `Connection: close`,每个请求新建并拆除一条 TCP:① 实体页 SSR 分流 location(user.conf:311-326,/paper /search /blog 等所有人类首屏文档请求)② 爬虫 SSR @ssr_backend(329-339,SEO 爬虫风暴的主要路径)③ 首页 `location = /`(344-358)④ umami 上报 `location = /umami-embed/api/send`(189-197,每次 pageview 一发)⑤ 静态资源正则(285-301,cache miss 时)⑥ sitemap/robots(266-281)。

**影响**:对这些路径 keepalive 池零命中:每次人类首屏加载、每次爬虫抓页、每次 umami 事件上报都对 docker 内网上游做一次三次握手 + TIME_WAIT;单次开销小(内网 ~0.1ms),但 SEO 爬虫风暴/高 PV 下累积成千上万短命连接与 TIME_WAIT 堆积,声明的连接池形同部分摆设。

**建议**:给上述 6 处 location 补 `proxy_set_header Connection "";`(WS 无关路径)即可让既有 keepalive 池生效;顺手可把这三行(http_version/Host/Connection)抽成 include 片段避免再漏。


## 前端容器内层 nginx 与 assets bind-mount 无限累积(已 470MB)

### [🔴 high] assets 回收以 mtime 为基准而 mtime=镜像构建时间:重启超过 7 天龄的镜像会把现役 chunk 整代删光,全站 JS/CSS 404

- **位置**:`frontend-user/docker-entrypoint.d/40-sync-site.sh:24`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:启动脚本用 `cp -a "$SRC"/. "$DST"/`(:22)把镜像内 /opt/dist 并入 web root,随后 `find "$DST/assets" -type f -mtime "+$RETAIN_DAYS" -delete 2>/dev/null || true`(:24)删除超过 7 天的旧 chunk。问题在于 cp -a 保留源文件 mtime,而源文件 mtime = `npm run build` 执行时刻(Dockerfile:31 `COPY --from=builder /app/build /opt/dist` 保留 builder 层时间戳,已在运行容器内实证:/opt/dist/assets 全部文件 mtime = Jul 17 09:28 = 本次镜像构建时间)。于是「文件新旧」实际衡量的是镜像构建时间而非部署/使用时间。当一个已运行 >7 天的镜像因任何原因重启(宿主重启、OOM、docker daemon 升级、docker-compose restart —— prod 配置 restart: unless-stopped,docker-compose.prod.yml:434),entrypoint 重跑:cp -a 先把现役一代 chunk 的 mtime 刷回 >7 天前的构建时间,紧接着 find 把它们全部删除。而 index.html 不在 bind-mount 里(compose 只挂 /assets,docker-compose.yml:480),每次启动从镜像现拷,引用的正是刚被删掉的 hash chunk → 内层 nginx `try_files $uri =404`(frontend-user/nginx.conf:26)对所有 JS/CSS 回 404 → SPA 整站白屏,且每次重启都复现,除非重新构建镜像。外层 proxy_cache(user.conf:290-295, proxy_cache_valid 200 7d)只能短期遮蔽已缓存的热 chunk,冷 chunk 立刻 404、缓存衰减后全面暴露,故障还会呈「渐进式劣化」,极难定位。另外 :24 的 `2>/dev/null || true` 把删除动作的任何异常完全静默,日志无痕。

**影响**:开发期镜像高频重建掩盖了该问题;一旦生产进入稳定期(>7 天不发版)后发生任何容器重启,前端整站不可用(所有用户、所有页面 chunk 404),且重启自愈无效、必须重新构建/推送镜像才能恢复。属于随「项目趋稳」概率趋近必然的可用性地雷。

**建议**:把保留基准从「构建时间」改为「部署时间」:cp 之后对本次构建清单显式 touch 刷新 mtime,例如 `(cd "$SRC/assets" && find . -type f -print0) | (cd "$DST/assets" && xargs -0 touch)`,再执行超龄回收;或改为按代保留 —— 每次部署写一份 manifest(本次构建文件名清单),回收时只删「不在最近 N 份 manifest 中」的文件,彻底与 mtime 解耦。同时去掉 `2>/dev/null || true`,让回收失败在 docker logs 可见。

### [🟡 low] 470MB/21,780 文件核实为「刻意且有界」的 7 天滚动窗口,任务假设的『只追加不清理』不成立 —— 但窗口纯时间无体积上限,高频部署下单目录高水位

- **位置**:`frontend-user/docker-entrypoint.d/40-sync-site.sh:18`
- **验证**:⚪ 低危未做对抗验证

**机制**:增长机制核实:每次部署(容器重建)由 40-sync-site.sh 把 hash 分包增量并入 bind-mount(docker-compose.yml:480 `./data/frontend-assets:/usr/share/nginx/html/assets`),:24 行的 find 在每次容器启动时回收超过 RETAIN_DAYS(默认 7,:18;两份 compose 均未设置 ASSET_RETAIN_DAYS 环境变量,grep 无命中)的旧 chunk。实测本机(dev):`find -mtime +7` 命中 0 个文件、最老文件 Jul 9(7.x 天)→ 回收确实在生效,470MB 不是无限累积,是当前构建频率下的稳态水位。量化:21,780 个文件平铺单目录;按 mtime 分桶,近 3 天每天净流入 97-139MB(单次构建产物 13MB,但 Vite content-hash 级联使几乎全量 chunk 每次重哈希 —— 同一页面 chunk 7 天窗口内并存 64-120 代,如 users×120、FeedbackPage×113,折算 ~10-15 次构建/天);稳态 = 部署频率 × 13MB × 7 天,随部署频率线性膨胀且无体积上限。剩余关注点:① 与 mysql/minio 同宿主分区(且该宿主还跑着 openscholay/xuanjige 等多套 compose),若未来把 RETAIN_DAYS 调大或 CI 化后构建更频繁,水位线性上涨;② 单目录 2 万+文件让每次启动的 cp -a/find 遍历、以及 rsync/备份/ls 等运维操作变慢(nginx 单文件 open() 本身是 O(1),影响小);③ 回收只在容器启动时执行一次,但流入也只发生在启动时,所以有界性成立。

**影响**:当前无实际故障:dev 机稳态 470MB、有界;生产部署频率远低于 dev,稳态会更小。真正的风险是斜率随部署频率线性增长且无体积兜底,以及与数据库/对象存储同分区的磁盘竞争 —— 属于「随规模恶化」的远期项而非现患。

**建议**:维持现有设计(stale-chunk 灰度是合理意图),两点加固:① 在时间窗口之外加体积上限兜底(回收后若目录仍超阈值,按 mtime 从老到新裁剪至阈值内);② 若采纳发现 1 的 manifest 方案,直接改成「保留最近 N 代」,时间与体积同时有界,还顺带修掉 mtime 语义 bug。RETAIN_DAYS 可显式写进 compose 便于按环境调整。

### [🟡 low] 静态资产压缩全压在外层 nginx 每请求现压(proxy_cache HIT 也重压),内层无 gzip_static;另有非 hash 文件被打 1 年 immutable、pdfjs cmaps 走 no-cache 的小缓存瑕疵

- **位置**:`frontend-user/nginx.conf:24`
- **验证**:⚪ 低危未做对抗验证

**机制**:内层 frontend-user/nginx.conf 全文无任何 gzip/gzip_static 指令(:1-40),压缩完全依赖外层 nginx/nginx.conf:131-138 的 `gzip on; gzip_comp_level 6`。nginx 的 gzip filter 在 proxy_cache 之后执行:static_cache(user.conf:290)存的是未压缩体,每次缓存 HIT 仍要对响应体做一次 level-6 gzip。实测最大 chunk:PrismPage-*.js 904KB、pdf.worker.min-*.mjs 1.0MB —— 这类文件每次命中都花约 15-25ms 单核 CPU 重复压缩,多用户并发下是纯浪费(构建期一次性预压缩即可归零)。顺带核实的相邻小问题合并在此:① 内层 :24 的扩展名正则对 web root 里的非 hash 文件(favicon.svg、og-image.png)同样打 `max-age=31536000, immutable`,外层 :299 又原样重打 —— 这些文件名不带 hash,替换后老访客最长一年拿不到新版;② pdfjs-cmaps 目录 169 个 .bcmap 文件不匹配任何静态扩展名 location,落入 SPA fallback(内层 :36-39)拿到 `no-cache, must-revalidate`,CJK PDF 渲染时每个 cmap 都要条件重验证(有 ETag,代价=每文件一次 304 RTT);③ 两层 Cache-Control 已验证不冲突(外层 :298 proxy_hide_header 后 :299 重加同值,index.html 两层皆 no-cache,属正确设计);④ 两层均未配 open_file_cache,对 2 万文件目录是可选微优化。

**影响**:常规负载下是持续的小额 CPU 税(大 chunk 每请求十几毫秒重复压缩),不构成瓶颈但纯属可归零的浪费;favicon/og-image 的 immutable 是换品牌图后老访客长期看旧图的正确性瑕疵;cmaps 重验证只影响 CJK PDF 预览首帧。

**建议**:构建期用 vite-plugin-compression 产出 .gz(可加 .br),内层 nginx 开 `gzip_static on`,外层对已压缩响应自动跳过(gzip 不会二次压缩);favicon/og-image 等非 hash 文件单列 location 改为 `max-age=86400` 级别;给 `\.bcmap$` 加一条 1y immutable location(pdfjs-cmaps 文件名即版本,内容不变)。


---

# 微信小程序(miniprogram)


## 微信小程序端性能专项(feed/search/paper 长列表 + 流式 setData + 本地缓存无界)

### [🟠 medium] claw 流式渲染 O(N²):每次 flush 对累计全文整段重 parse + 整轮 VM(含全部 html/base64)整包过 setData 桥,长回复全程掉帧

- **位置**:`miniprogram/pages/claw/claw.ts:531`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:socket 层确有节流(agent-socket.ts:30 `FLUSH_MS = 120`,~8 次/s,对齐 Web 100ms),但 diff 粒度停在 turn 级:每次 flush → onMessages → rebuild()(claw.ts:511-513, 531)→ 流式轮因 turnSig 含 `'t' + b.text.length`(claw.ts:110)必然失配 → decorateOne → decorateTurns → `mdToSegments(b.text)` 对该轮**累计全文**从头重 parse(markdown.ts:274-447,inline() 每行跑 10+ 个正则替换 markdown.ts:156-218);随后 sameVM 对新旧 html 做 O(N) 全串比较(claw.ts:144-146);patch 时整个 `turns[i]` VM(该轮全部 segs 的完整 html 串)每帧过 JS→native 桥(claw.ts:545),`<rich-text nodes="{{sg.html}}">`(claw.wxml:78)收到新字符串后 native 层整树重新解析+重排;外加每帧 scrollTop setData 贴底(claw.ts:538, 806-809)。单条 N 字符回复总开销 = flush 次数 × O(N) ≈ O(N²)。次生问题:①mathVersion()/diagramVersion() 是全局版本号且进**每一轮**的 turnSig(claw.ts:108 `'|v' + mathVersion() + '|g' + diagramVersion()`),任一公式渲完 bump 版本 → 全会话所有轮 sig 失配,150ms debounce 的每次 rebuild 都对**所有轮**全文重 parse(sameVM 只省了过桥,省不了 CPU);②与图表「base64 不进 setData」(claw.ts:593 落临时文件)不同,数学公式 PNG 是以 data:image/png;base64 内联进 html 串的(markdown.ts:185-192, 402-404),公式回填期间受影响轮每次重绘都把已回填的全部 base64 连同新图整包重新过桥——40 个公式(TOTAL 上限)按 CONC=3 陆续渲完约触发十余次 rebuild,过桥量随已回填数递增,累计可达数 MB。

**影响**:智能助手是小程序核心 AI 页,论文讲解类回复常见 1 万~3 万字符。以 3 万字符、60s 流完计:~500 次 flush × 平均 15KB html ≈ 7.5MB 累计桥序列化 + 500 次全文 markdown parse + 500 次 rich-text native 整树重排,中低端 Android 全程掉帧、输入框跟手性变差;公式密集回复在回填阶段(约 2~3s 内十余次 rebuild)再叠一波数 MB 桥流量。回复越长越糟(平方增长),短回复(<5k 字符)无感。

**建议**:三层择优:①把 diff/patch 粒度下沉到 seg 级——sameVM 已能定位到具体变化的 seg,patch 改发 `turns[i].blocks[j].segs[k]`(小程序 setData 支持该 path),流式期间通常只有最后一个 seg 在变,过桥量从 O(N) 降为 O(增量);②流式尾部增量 parse:以最后一个空行(段落边界)为界,前缀 segs 缓存复用、只重 parse 尾段(mdToSegments 本就按行扫描,易改造);③公式 PNG 对齐图表方案落临时文件、html 里放不进 rich-text 的部分拆成原生 <image> seg,同时把全局 mathVersion 改为 per-turn 版本(按该轮实际含有的 tex key 聚合),避免任一公式渲完误伤全会话 parse 缓存。

### [🟠 medium] claw 历史会话无分页无窗口化:后端支持 ?limit 且 Web 已用,小程序整包拉全量 transcript、一次 setData 全部轮并常驻挂载

- **位置**:`miniprogram/services/claw.ts:28`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:getClawHistory 不传 limit(services/claw.ts:28-33),而后端 agentbridge 明确支持「最近 N 轮」分页且缺省返回全部(backend/internal/agentbridge/http_handler.go:41-43 注释:『缺省/非法/<=0 → 0 (= 不分页, 返回全部)』);Web 端已在用该参数并注明动机(frontend-user/src/features/claw/api/session.ts:85-86『避免上万轮 transcript 一次性推给浏览器 JSON.parse + 折叠 + 渲染』、:118 `params.set('limit', ...)`)。小程序 openSession 把全量 messages 一次 JSON 解析 + replayHistoryAsTurns 折叠(claw.ts:493-495),rebuild 首次走「轮数变化 → 整包 setData」分支把所有轮 VM 一次过桥(claw.ts:539-541),claw.wxml:52 `wx:for="{{turns}}"` 无任何渲染窗口——所有轮的 rich-text 树全程常驻。小程序 setData 单次数据有 ~1MB 硬上限,长会话(几十轮、每轮数 KB html)逼近或超限时直接报错丢帧;即便不超限,节点树随会话长度线性膨胀,滚动与后续每次 patch 都变慢。Web 端已做窗口化+memo(既往记录),小程序未对齐。

**影响**:重度用户的长会话(几十~上百轮,含表格/公式)每次进入 claw 页或切会话:全量 transcript 下载 + 折叠 + 一次性 setData,首屏白屏时间随会话长度线性增长;极端会话触及 setData 1MB 上限直接渲染失败;所有轮 rich-text 常驻导致整页内存与滚动性能随会话长度持续恶化(与 Web 端已修的『超长会话窗口化』同病,小程序端复发面)。

**建议**:最小改动:getClawHistory 传 limit(如 30 轮),消费已声明的 hasMore/totalTurns,顶部加『加载更早』增量拉取(对齐 Web keepPreviousData 方案);首屏 setData 也随之天然有界。若后续会话普遍变长,再在 wxml 侧加 turn 级渲染窗口(参考 feed 页 winLo/winHi 的 wx:if 方案)。

### [🟠 medium] mermaid 图表 PNG 落 USER_DATA_PATH 永不清理:本地文件无界累积,顶到 200MB 上限后 writeFile 静默失败、图表永久回退源码卡

- **位置**:`miniprogram/pages/claw/claw.ts:597`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:saveDiagramFile 把每张 mermaid 渲染结果(注释自述『几百 KB 的 base64』,claw.ts:593)写到 `wx.env.USER_DATA_PATH + '/mmd-' + hash + '-' + len + '.png'`(claw.ts:597)。USER_DATA_PATH 是**持久**用户文件目录(非 tmp,微信不会自动回收),而全仓 grep 确认没有任何 unlink/readdir/清理逻辑(唯一 USER_DATA_PATH 引用就是这一处写入)。内容寻址只做了去重,没做淘汰——每个新图表永久占一份磁盘。微信对小程序本地文件目录有 200MB 总量上限,写满后 writeFile fail → promise reject → `.catch(() => setDiagram(code, null))`(claw.ts:585),而 diagram-cache 语义是『null = 渲染失败,永不重试』(diagram-cache.ts:3)——此后所有新图表都走同一条失败路径,用户看到的全是源码卡且无任何提示,服务端 Redis 缓存命中也救不回来(瓶颈在本地落盘)。注:math-cache/diagram-cache 本体是纯内存 Map(math-cache.ts:13、diagram-cache.ts:10),不写 wx.storage,storage 键值层无胀满风险;问题只在文件系统。

**影响**:图表用得多的老用户:本地盘按每图几百 KB 无界累积(几百张图即数十~上百 MB),最终顶到小程序 200MB 本地文件上限;之后所有 mermaid 图表静默渲染失败且被 null 缓存判死,体验永久降级,用户与开发者都无从察觉(catch 吞掉了 fail 原因);同时挤占用户手机存储。

**建议**:给 PNG 文件目录加 LRU 淘汰:启动或首次写入前 readdir 统计 mmd-*.png 总大小,超阈值(如 50MB)按 mtime 删旧;或改用 wx.getFileSystemManager 的临时目录+会话内缓存(牺牲跨启动复用,换零管理成本)。另把 writeFile 失败与『mermaid 语法错误』区分开:前者不要写入 null 永久判死,允许下个会话重试。

### [🟡 low] 论文详情 AI 翻译流式预览零节流:每个 SSE token 帧都对累计全文跑正则再整串 setData,低配机翻译期间明显卡顿

- **位置**:`miniprogram/services/api/translate.ts:146`
- **验证**:✅ 双重/单重对抗验证成立

**机制**:translatePaper 在 onChunkReceived → handleFrame 里,每收到一个 delta 就 `content += delta; onProgress(stripTags(content))`(translate.ts:145-146)——stripTags 对**累计全文**跑两个全局正则(translate.ts:51-53),然后 paper.ts:94-96 的回调直接 `this.setData({ translatePreview: preview })` 把完整累计串过桥。LLM token 流通常 20~50 帧/s,即 20~50 次/s 的 setData + O(N) 正则,零合帧零节流——与同仓 agent-socket.ts:30 的 120ms flush 约定(以及 Web 端 100ms throttle)不一致,是流式 setData 节流约定的唯一漏网点。文本量有界(标题+摘要中译,峰值约 2~4KB),所以是可感卡顿而非灾难,但翻译持续 10~20s 期间详情页(含 rich-text/引用列表)每秒被迫重渲染数十次。

**影响**:用户点「AI 翻译」后的 10~20 秒内,论文详情页以 20~50 次/s 的频率 setData,低端 Android 机型上滚动/点击明显迟滞、预览文字抖动;每次翻译累计浪费数百次桥往返(最终只需要最后一帧的结果 + 若干次预览刷新)。

**建议**:在 translate.ts 的 onProgress 派发处加 120~150ms 合帧(与 agent-socket FLUSH_MS 同款 setTimeout 节流,流结束时 flushNow 保尾帧),或在 paper.ts 回调侧节流;stripTags 顺带只在真正派发时执行。改动约 10 行。


---

# 附录:各维度覆盖范围声明


## 前端路由加载与bundle构成

已覆盖:① frontend-user 完整生产构建(npm run build 成功,10.3s,365 个 JS chunk)+ 二次 sourcemap 构建(输出至 scratchpad,hash 与正式构建一致);② 自写 sourcemap VLQ 归因脚本逐包分析了 entry/vendor/query/markdown/PrismPage/mammoth(index-BVDSgS1P)等关键 chunk 的字节构成;③ 自写静态 import 闭包脚本实测主要路由首访 JS 体量(min/gz):首页 913KB/283KB、/search 1844/589、/claw 1829/583、/m/claw 1824/581、/prism 3074/969、/library 1184/380、/peer-review 壳 917/286(增量仅 5KB,干净)、/admin 壳 931/292 + Dashboard 增量 384KB(recharts 271KB,仅 admin 承担)、/m feed 1092/350、landing 960/301、隐私/条款 1549/481、新闻详情 1553/481;④ 路由组织审计:18 个 feature routes.tsx 全部页面级 lazy(admin 36 处、settings 10、help 12 等),桌面/移动双向 UA 闸在 loader 层;⑤ 重库落点逐一核验:mermaid(动态 import,按图类型分 20+ chunk)、mathlive(816KB,MathEditorDialog 动态)、xlsx(498KB,矩阵导出/SpreadsheetPreview 动态)、mammoth(487KB 连带 jszip/bluebird/dingbat-to-unicode,DocxPreview 动态)、pdfjs(claw/library 路径动态,仅 prism/BrowserPage 静态)、recharts(全部动态边界,JournalFeedPage/SharedReceivePage 增量实测 40/38KB 无 recharts,未污染用户端)、framer-motion(独立 motion chunk,不在入口闭包,2026-07 已修的『framer 出首屏』未复发);⑥ index.html 阻塞脚本/字体策略/PDF worker(postbuild 已剥 katex 遗留字体 798KB,worker 按需加载)。未覆盖:未起浏览器做真实网络瀑布/TTI 实测(结论基于静态闭包,与运行时 modulepreload 行为一致但未计 HTTP 缓存命中);CSS 细粒度归因(入口 CSS 151KB/23KB gz 只做了总量);dev server 表现;小程序端与 scholay-minitools 不在本维度范围。


## 前端渲染性能

已覆盖(逐文件读代码核实):搜索工作台 features/search/(SearchPage、SearcherColumn、MatrixColumn、PaperListScroller、AssistantTurn、SmartSearchPanel、SmartComposer、StageFlyLayer、useStagingActions、useStagingView、useStagedFavorites、useJournalEnrichments、PaperResultCard);claw features/claw/(ClawPage、MobileClawPage 入口、MessageTurn、fold.ts、useClawConversation、ClawSidebar、ChatComposer/Composer、ClawPaperList);shared/components/chat 渲染栈(MarkdownRenderer、Bubbles/AssistantBubble、ThinkingFold、ToolCallBlock、useSettled、useThrottledValue、LibraryReferencePicker 复检);shared/hooks/useAgentSocket、useNotificationSocket、useLocalStorage、agent-stream.ts、strip-container-paths;prism(PrismWorkspace、LatexEditor、PrismChatPanel、PrismMessageTurn memo、PdfViewer);admin(DashboardPage/UserMetricsPanel/UsersPage 分页、SessionMonitorPage、refetchInterval 全仓扫描——仅 analytics 30s 前台轮询与任务态轮询,健康);library/news 列表(均分页);mobile 虚拟化使用点(MobileToolsPage/MobileFolderPage/MobileSearchOverlay/PdfViewer);全局横扫:setInterval/rAF/scroll 监听全仓 grep 逐个确认(FavoriteBurst 幂等 setState 修复在位、RouteCommitWatchdog 1s 轻量、prism 自动起名轮询有界)、自定义 Context Provider(仅 shadcn form,无全树重渲风险)、zustand 无选择器订阅扫描(全部用 selector)。既往已修项均核实未复发:LibraryReferencePicker useMemo 稳定引用仍在位、流式 markdown 已 throttle(100ms)+memo、长会话渲染窗口(RENDER_WINDOW=60)+历史分页在位、rAF 合帧与 content_delta/toolInput 合并在位、PaperResultCard 标量 memo 在位——这些不重复报。未逐行覆盖:admin 其余 ~30 个配置/列表页内部、features/browser 论文详情子组件、peer-review 页面细节、@xyflow 引文图组件、tools/feed 移动子页内部实现(仅确认其虚拟化/窗口化入口)。


## 前端资源冗余

审计范围 frontend-user/(753 个 ts/tsx 中实际扫描 748 个源文件)。(1) 依赖:package.json 全部 71 个 dependencies + 可疑 devDependencies 逐包做 import 级核对(自写 python+raw grep census,覆盖 src/、tests/、index.html、vite.config.ts,含动态 import 与子路径;注意环境的 grep 是 ugrep wrapper 会静默漏文件,已全部改用 command grep/python 复跑验证)——确认死依赖 2 个(react-table、react-select),devDeps 错位 2 个(@dnd-kit);重叠依赖逐组判定:tiptap(Prism V2 所见即所得)+codemirror(V1 LaTeX 源码编辑)双编辑器用途各自正当但被打进同一 chunk(已报);mathlive(公式编辑,动态 import)与 katex(渲染)分工正当;xlsx(表格预览,lazy chunk 497KB)、mammoth(docx,动态 import)、mermaid(动态 import,含 wardley/cytoscape 等 2.5MB+ 全懒加载子 chunk)、html-to-image(ShareSheet 海报,随 54KB lazy chunk)均单点使用且已按需加载,无需报。(2) 静态资源:du 核查 public/(og-image 64K、fonts 24K、favicon 4K、pdfjs-cmaps 1.6M 为 pdf.js CJK 按需拉取且 gitignored 由脚本拷贝)和 build/ 产物(12MB assets,katex 字体已由 postbuild 脚本裁剪 legacy 格式),无未压缩大图/遗留大文件,无 base64 内嵌图。(3) 重复实现:mobile/ 与桌面为刻意的 UA 分流双端(移动页 130-230 行薄壳、共享 hooks/api,抽查 claw/settings 未见大段复制);claw/smart-search 会话原语已收口 shared(AgentSessionList/makeAgentSessionApi 双方引用确认);唯一大块复制=peer-review record 双目录(已报);跨 feature 重名组件逐对核查,其余均为 shim 再导出(ConfirmDialog 7 行、DimensionSettingsDialog 12 行)。(4) 死代码:文件级零引用扫描+逐个人工复核(已报两条);ClawSkillPanel 删除干净无残留引用;legacy-redirects 在 router.tsx:29 活跃使用非死代码。(5) CSS:全站唯一 globals.css 24KB,构建 CSS 总 192K/主文件 gzip 22KB,无冗余。(6) 图标:lucide-react(334 文件)唯一图标体系+少量品牌 SVG(ClawBrandIcon/ProviderLogo),CLAUDE.md 提到的 SearchIcons.js 是旧 CRA 文档遗迹、文件已不存在,无多套图标。未覆盖/局限:未重新跑构建(使用当日 22:38 的既有 build/ 产物做 chunk 分析,无 sourcemap,chunk 内容靠签名字符串指纹判定);未做符号级(named export)死代码分析,只到文件粒度;移动/桌面重复度为抽样非全量 diff;入口 chunk 747KB(gzip 219KB,首屏合计约 303KB gz)的内部构成因无 sourcemap 未能完全拆解,其中未发现明显冗余库(recharts/framer/编辑器/markdown 均确认不在首屏),不属资源冗余故未立项。


## 前端数据获取层

已审(均到 file:line 落实):① react-query 全局默认值 app/providers.tsx + shared/lib/query-config.ts(staleTime 30s / focus refetch 关 / retry 1,健康);② axios 实例与拦截器 shared/lib/http.ts;③ 全部 refetchInterval 轮询点(admin/analytics 30s+background 关=正确样板、admin/feature-tools 1.5s、peer-review submissions 2s/reports 5s、prism compile 1s)与全部裸 setInterval(useCountdown/PrismWorkspace 自动起名有界5次/RouteCommitWatchdog);④ WS 层 shared/hooks/useAgentSocket(rAF 合帧、25s 心跳、指数退避 8 次封顶、无帧看门狗、displaced 自动恢复带抖动+上限,加固良好)与 useNotificationSocket(退避+抖动+上限,无惊群);⑤ 会话历史分页:claw/smart-search 均 limitTurns=100 窗口 + 加载更早,已窗口化(不重复报);admin transcript 无分页(已报);⑥ 请求瀑布:router.tsx 两个 loader 为纯同步 UA 判断、AuthBootstrap 单请求、FeedPrefetcher 手机限定+idle 延迟,无 loader 串行 await;⑦ queryKey 一致性:/user/billing/overview 五处消费方统一 ['settings','billing'] 共享缓存(良好);发现 library-browse 双缓存(已报);⑧ 防抖:suggestions/journal-suggest/PrismCitationDialog 均 280-300ms,LibraryReferencePicker 缺失(已报);⑨ 批量化:paper-enrich、favorite-check、journal-enrichment、analysis/paperBatcher 均已批量,staging 批量导入是 N+1(已报);⑩ localStorage:feed-cache/feed-position/blocked-message/model 偏好均在事件/effect 内,未见渲染热路径同步读写问题;⑪ 大文件:上传全 multipart、下载全 blob/arraybuffer 无 base64 主线程膨胀,但下载受全局 30s timeout 封顶(已报);⑫ 既往已修项核实未复发:LibraryReferencePicker useMemo 稳定引用仍在(:64)、nginx gzip 未见 gin.Gzip 建议、上传 60s 特判在。未覆盖/浅覆盖:admin 各列表页组件层(仅抽查 users/orders/usage-logs 的分页参数,均有 page_size)、mobile feed 组件层滚动细节、tests/contract、工作区未提交 diff 只审了 skills.ts/MatrixColumn/useStagingActions/PaperListScroller(动画类改动,无数据层问题);SSE(translate/sse-post)只审了用法未审实现内部。


## 后端数据库查询(代码级)

已审范围(代码静态分析 + 与 docker/mysql/migrations 索引逐条核对):agentbridge 全部 DB 触点(eventlog_store/eventlog_batcher/repository/hub/ws 热路径/admin_monitor/archive/hooks/turncoord)、vip(quota/wallet/order/repository/service)、llmusage(记账 + admin 聚合 repository_admin/service_stats)、user(auth 中间件/RecordActivity/metrics/repository 用户列表)、admin/dashboard_service、message(站内信含 unread 计数)、library(handler 分页/LIKE/share_handler)、seo + seoenrich(SSR 解析、sitemap、enrich 扫描)、hotcontent(upsert 计数 + 清理)、peerreview(repository/admin)、payment(alipay/wechat_pay 配置仓储 + payment_transactions 索引)、skillmarket、usagestat、usermemory、modelcatalog、config(code_snippets/SSR 注入缓存)、common/cleanup 与 cmd/server/background.go 定时任务、数据库连接池设置(PrepareStmt/SkipDefaultTransaction/池参数已配)。索引核对覆盖:agent_sessions、agent_turns/agent_turn_events/agent_billing_ledger、llm_token_usage、user_daily_active、user_memory_blocks、users、user_messages、seo_papers/authors/journals、hot_papers/hot_search_keywords、orders/payment_transactions、usage_events(0030 重复索引清理已确认覆盖 orders/user_messages/users)。既往已修项核实未复发:下载截断/WS deadline 不在本维度、BodyLimit 未复查(非 DB)、cleanup 批删已带 LIMIT+间隔、nginx gzip 未重复建议。未逐行覆盖(抽查未见异常或表小/低频):wechat、wechatofficial、supportcenter(IMAP)、emaillog、news、prism 读路径其余部分、claw/agentartifact/agentattach、openaccess、pdfparse、promptregistry、stagingarea(仅 handler)、clientlog、umami、announcement、featuretool(FULLTEXT 已确认)、minicod/thirdparty(Redis 缓存链路已知)。未连接活库,行数量级判断基于表语义与增长模式推断。


## 后端Go逻辑热点

已审(逐文件读代码):agentbridge 全部热路径 —— ws.go、hub.go(全文)、eventlog.go、eventlog_batcher.go、eventlog_store.go(读侧+FoldToMessages)、eventlog_validate.go(确认 env 门控后台)、turncoord.go、ws_serverside.go、bridge.go(水位/记忆/buildCreateOptions/ListSessions)、hooks.go、picker.go、skill/wstoken(粗扫);common/middleware 全部每请求中间件 —— auth.go、ratelimit.go(内存+Redis 版)、timeout.go、recovery.go、maintenance.go(bodylimit/cors/request_id/internal_agent 粗扫);ai/(service_llm.go 全文、httpclient/upstream 粗扫);agent/(client.go 关键路径、httpclient.go 全文);minicod/(client.go doPost/连接池、manager.go executeWithRetry);pdfparse(并发闸门+cappedBuffer,确认已加固);storage.go(确认全流式);agentattach/upload.go 全文;claw/artifact_harvest.go 全文;websocket/(站内信 hub SendToUser);skillmarket MaterializeForUser;config/handler_ssr.go(SSR 缓存+正则均包级,确认无问题);wechatofficial/wechat/umami/seosubmit HTTP client 构造(确认均 sync.Once 单例);user.RecordActivity。全仓 grep 验证:函数体内 http.Client{}(除单例外无)、regexp.MustCompile(仅 sms.go/prism quality.go 两处低频端点在函数体内编译,量级不足以报)、io.ReadAll/base64 全部出现点。已核实既往修复未复发:frontWriteDeadline 存在(hub.go:991)、下载走 isObjectServePath 10min 预算、BodyLimit multipart 放行未回归。未覆盖/浅覆盖:payment 内部(RSA 签名验签属必要开销,仅粗扫)、prism 编译/struct 链路细节、news/seo/hotcontent/supportcenter 内部、admin dashboard 聚合查询、各 repository 的 SQL 形态与索引(属数据库维度)、vip/llmusage 服务内部实现、agent 容器(Bun/TS)侧代码(非本维度)。


## 后端并发与多用户

已通读并核实(file:line 级):backend/internal/common/middleware/ratelimit.go(令牌桶 map 有 3min 阈值定期清理、Allow 锁粒度小、Redis 版 Lua 原子 INCR+PEXPIRE——无泄漏无热锁问题)、timeout.go(仅设 ctx,无 goroutine 包装)、internal/websocket/hub.go+handler.go+wsticket 路径(melody 站内信 hub:SendToUser/checkIdle 均已用「锁内快照、锁外写」范式,写走 melody 缓冲队列,慢客户端不阻塞;guest/user map 随断连删除)、internal/agentbridge/hub.go(全文)+ws.go+ws_serverside.go+turncoord.go+eventlog_batcher.go+eventlog_store.go+wstoken.go+bridge.go(水位/GetOrCreate/createAndPersist/buildCreateOptions 段)+hooks.go、internal/vip/quota.go+service.go(EffectiveTier)、internal/usermemory/service.go(90s 冷却=Redis SetNX 原子,无竞态)、cmd/server/background.go、common/cleanup/cleanup.go(分批 DELETE 1000+100ms,与请求路径写同表冲突已缓解)、common/database/database.go(连接池已显式配置:MaxOpen=90/MaxIdle=25/Lifetime=1h,非 Go 默认值,且有池监控)、common/cache/redis.go(主池 PoolSize=150、persist 池 50,超时齐全)、common/safego(裸 Go 带 recover + 统计/账本有界池)、internal/modelcatalog/service.go(30s 快照缓存,热路径不打 DB)、internal/llmusage/service.go(账本走 2-worker 有界池)。既往已修项复核:①「backend 重启重复扣费」已修——usage_watermark 持久化(bridge.go:151-167 回源 DB + repository.go:176-196 + 迁移 0063),不再报;② WS writeFront deadline 已存在(hub.go:991, frontWriteDeadline=30s)+慢订阅者队列满即踢(hub.go:731-739);③ 下载截断已由 isObjectServePath 10min 预算覆盖;④ gorilla 并发写均有 per-conn 写锁/单写 goroutine(hub.agentWriteMu、subscriber 单 writeLoop、serverside writeMu);⑤ get-or-create 并发建双由唯一键+孤儿回收兜住(bridge.go:1340-1385);⑥ goroutine 泄漏逐条核过(pingLoop/writeLoop/serverside ping 均有退出路径)。未覆盖:agent 容器(Bun/TS)侧并发、前端、nginx 配置、admin 低频路径(admin_monitor 等)、payment/wechat 模块的并发细节;已下线模块按要求未看。


## 后端中间件与请求链路

已全量精读:backend/internal/common/middleware/ 全部 9 个文件(auth/bodylimit/cors/maintenance/ratelimit/recovery/request_id/timeout/internal_agent);backend/cmd/server/main.go(引擎级中间件挂载顺序与 http.Server 超时);routes.go/routes_user.go/routes_admin.go/routes_scholar.go 全部中间件挂载与限流参数;internal/user/handler.go 公开路由限流。佐证性追读:utils/jwt_revoke.go(revoke MGET)、user/service.go RecordActivity(异步声明核实)、claw/artifact.go + claw/file.go(timeout 白名单遗漏的下游消费者)、agentbridge/ws.go+hub.go(WS 是否吃 request ctx——不吃,15s ctx 对 WS 无害;心跳链)、config/handler_ssr.go+service.go(NoRoute SPA 兜底——壳 5min 归一化缓存+片段 10min 缓存,无每请求打库)、config/config.go(限流/GinMode 默认值)、nginx/nginx.conf+conf.d/user.conf(链路超时/限流/body 上限)。核实为无恙(不报)的检查项:timeout.go 无 per-request goroutine、无响应体缓冲(纯 context.WithTimeout,既往审计担忧的实现方式不存在);auth 走 JWT 自包含+单次 Redis MGET,零 DB;maintenance 30s atomic 缓存+CAS 单飞不惊群;CORS 无每请求正则(gin-contrib 列表比对);RequestID/Recovery 的 UUID 成本可忽略;GIN_MODE 在 docker-compose 默认 release;未发现任何路由双重挂载同一中间件;gin 静态/参数路由共存已刻意规避同层冲突,无树退化问题;既往已修项(下载 15s 截断的 isObjectServePath、multipart 放行 UploadLimit)确认未复发——但 multipart 放行本身衍生出新的绕过面(finding 1)、isObjectServePath 有漏网路径(finding 3)。未覆盖:各业务 handler 内部查询效率、WS hub 数据面吞吐、payment/wechat webhook handler 深层逻辑、agent 容器侧(均属其他维度)。


## Agent执行性能

通读并逐行核实 agent/src 单次对话执行链路全部热路径文件:turn/(turnLoop.ts、streamText.ts、compact.ts、context-budget.ts、window.ts、runTools.ts、assembleToolUse.ts、title.ts、completion.ts、artifacts.ts)、server/(sessions.ts、ws.ts、http.ts、attachments.ts、shadowTurn.ts)、sandbox/(bwrap.ts、profile.ts、confine.ts 部分)、mcp/(mcpTools.ts、minicodClient.ts)、skills/loader.ts、tools/(registry.ts、toAnthropicTools.ts)、openai/adapter.ts、anthropic/client.ts、index.ts。针对任务清单核实并排除的项:(1) 每轮固定开销——执行器不读 jsonl(内存续接,seed_history 仅 WS 建连且 meta 为空时一次,ws.ts:131-166);system prompt 组装为静态串+addDirs LRU 缓存(loader.ts:135-197),保 prompt cache;buildTools 每 turn 一次、MCP 工具列表缓存;(2) MCP 为单例 stdio 进程、boot 预热、带 30s 超时+熔断(minicodClient.ts),非每会话起进程;(3) 标题生成(ws.ts:349-366)与记忆抽取(ws.ts:170-188)均异步 .then,不阻塞主回复,各为一次 haiku 档调用;(4) bwrap 每次 Bash spawn 新 jail(自探结果缓存,单次 jail 启动 ~10-40ms 固定开销,属安全设计代价,未列为问题);(5) 流式转发无人为缓冲(OpenAI 适配器 SSE 逐行即 yield、sink.frame 即发);(6) 既往已修项(FieldStreamer O(N²)、converter readCapped、MAX_LIVE_IMAGES 限外发图、tool round/token 双闸)确认在位未复发。未覆盖:render/math.ts 与 render/mermaid.ts 内部实现(小程序渲染代理,不在对话热路径)、server/workspace.ts、config/providerStore.ts、obs/log.ts、harness/conformance.ts、egress.ts 细节;Go 侧 journal 落盘与多端扇出(backend/internal/agentbridge,存在 eventlog_batcher.go 批量器,属后端维度未深审)及前端消费端不在本维度范围。


## Agent多租户并发

审计范围=agent 容器(Bun 单进程多租户)的并发瓶颈,只读分析。实际通读:agent/src/server/{sessions.ts, ws.ts, http.ts, workspace.ts, attachments.ts, shadowTurn.ts}、index.ts、tools/{registry.ts, toAnthropicTools.ts}、sandbox/{bwrap.ts, confine.ts, profile.ts}、turn/{turnLoop.ts, runTools.ts, compact.ts, context-budget.ts, streamText.ts, assembleToolUse.ts, completion.ts}、skills/loader.ts、render/{math.ts, mermaid.ts}、mcp/{minicodClient.ts, mcpTools.ts}、openai/adapter.ts、anthropic/client.ts、obs/log.ts;docker-compose.yml 与 docker-compose.prod.yml 的 agent 服务块(资源限额:dev memory 1G、prod memory 1.5G/cpus 2.0/pids 512);并抽查 backend/internal/agentbridge/hub.go(订阅者/grace/enqueue 背压)与 bridge.go(DeleteSession 调用点)确认会话删除时机。用 grep 全 src 确认无定时清理/LRU 淘汰/全局并发信号量。重点核对了任务列出的 8 类:(1)同步阻塞 IO=loader.ts 每轮同步读(发现4)、providerStore/bwrap 的 sync 仅冷路径/一次性已排除;(2)CPU 密集无 yield=math 同步渲染(发现3);(3)并发无上限=发现2;(4)会话/transcript 常驻不释放=发现1;(5)同会话并发互斥=inFlight+hub.beginTurn 已正确覆盖,无问题;(6)子进程超时/回收=Bash/converter/chromium/MCP 均有 killer+timeout+熔断,回收正常,未成 finding;(7)WS 背压=发现5;(8)全局单例锁/队列=mermaid 有队列而 math 无(发现3)。未覆盖:harness/conformance.ts、config/models.ts、policy/featurePolicy.ts、egress.ts、auth.ts、title.ts 细节、以及 backend hub.go 的 ping/journal 全量逻辑(超出 agent 容器并发维度)。既往已修项(下载15s截断、CPU死循环、窗口化、BodyLimit)不在本维度,未复查。


## Agentbridge桥接链路

已全文精读 backend/internal/agentbridge/ 全部 20 个文件:hub.go(1325行,扇出/回放/钩子/模型帧)、ws.go(帧解析/注入/权限裁决)、ws_serverside.go(peerreview 自驱动)、eventlog.go+eventlog_batcher.go+eventlog_store.go+journal_model.go+turncoord.go(事件持久化写读全链)、eventlog_validate.go(校验器)、bridge.go(历史读/水位记账/记忆/会话 CRUD)、http_handler.go(6+6 端点)、repository.go、admin_monitor.go、archive.go+archive_jsonl.go、skill.go、picker.go、wstoken.go、spec.go(关键段)。同时核实了周边依赖:vip/quota.go+service.go(配额闸每消息往返数)、usermemory/service.go(RenderBlocks/ShouldExtract)、modelcatalog/service.go(30s 缓存与 ValidateUserModel)、agent/client.go(GetSessionMessages)、agent 容器 src/server/http.ts+sessions.ts(messages 端点行为,用于验证 validator 假阳性)、迁移 0046/0047(表结构/索引/分区)、common/cleanup/cleanup.go(确认无 journal 清理)、cmd/server/bootstrap.go(接线与 env 开关)、.env 与 docker-compose.yml(生产开关实况:journal=shadow、executor 全 feature、VALIDATE=on)、前端三处历史拉取的 limit 传参。针对题面 7 问均已覆盖:每帧 marshal/DB/锁账目(发现1/3)、eventlog 增长与清理(发现2)、hub 慢端(确认 256 队列+30s 写超时+满即踢的既有防护,另发现迟到补帧截断=发现4)、钩子链往返数(发现6)、历史回放 payload(journal 路径默认 30 轮封顶,未见全量拉取问题)、首条注入/seed 组装成本(发现7)、归档读写放大(ArchiveFromJsonl/FromFork 为 env 门控一次性迁移,readArchive 仅老会话回退,未列为独立发现)。未覆盖:agent 容器内部 turn 执行/沙箱链路(仅为验证取证抽查)、llmusage.Record 与 Redis cache 包内部实现、admin 前端轮询频率(后端 AdminListSessions 已确认分页有索引)、P3+ 未激活的 saga/lease 字段。所有分析只读,未改动任何文件。


## Nginx与Docker基础设施

已通读并核实:nginx/nginx.conf 全文(153行)、nginx/conf.d/user.conf 全文(378行)、docker-compose.yml 全文(582行)、docker-compose.prod.yml(日志/资源限额全量 grep + agent 服务段 326-390 通读 + nginx/mysql 挂载核对,确认 prod 挂同一份 nginx 与 mysql 配置)、docker/mysql/conf.d/memory.cnf 全文。交叉验证读了:backend/internal/common/database/database.go:70-73(连接池 90/25)、backend/cmd/server/routes_user.go(三条 agent WS 路由)、backend/internal/agentbridge/ws.go 与 hub.go(25s ping/pong 扇出、60s agentReadDeadline、front 10min 读超时、订阅者队列满即踢)、frontend-user/src/shared/hooks/useAgentSocket.ts(25s 心跳/45s 看门狗)、features/claw/api/socket.ts(claw WS URL)、backend routes.go /uploads 静态路由(确认为死路径,无代码写入/生成该 URL,故静态正则遮蔽 /uploads/*.png 无实际影响,未报)。核查后确认无需报的点:worker_connections=4096(非任务假设的 1024)+ epoll/multi_accept,对 3×WS/用户足够;smart-search/prism WS 与 SSE(/stream、upload-and-resolve)location 均已 proxy_buffering off + 长超时(86400s/900s,与 backend 15min SSE 对齐);gzip 已含 application/json;client_max_body_size 50m 与后端 50MB 上传一致;静态 7d proxy_cache + 1y immutable、HTML no-cache 正确;access_log 走 /dev/stdout 受 json-file 10m×7 管控,WS 为连接级一条日志不逐帧,/health 已 access_log off;MySQL 已调优(buffer pool 900M/4 实例、max_connections 100 vs backend 90 + umami connection_limit=5 = 95 匹配、慢查询日志刻意关闭且死配置已注释澄清、default-time-zone +08:00);Redis 512MB allkeys-lru + 独立 noeviction persist 实例(192M);各容器 healthcheck 30s 轻量;网络 bridge + scholar-agent-net internal 隔离合理;既往已修项(WS writeFront deadline、gzip 双压、BodyLimit)确认未复发。未覆盖:frontend-user 容器内自带的 nginx 配置(属前端容器内部)、scripts/run-migrations.sh 执行性能、生产实际 .env 取值与外层 CDN/LB 拓扑(只读环境无法验证,rate-limit 建议已分别给出两种拓扑的修法)。


## 活库体检(容器在跑才做)

已覆盖(容器全部在跑,scholar_mysql/scholar_redis/scholar_redis_persist 均 healthy):① MySQL 全库表体积排名(top20)+data_free 碎片检查——全库数据+索引 <100MB,agent_session_archive/agent_turn_events/feature_tools 为前三大表,碎片绝对值均 ≤8MB 可忽略;② 四张热表(agent_turns/agent_turn_events/llm_token_usage/user_daily_active/feature_tools)SHOW INDEX + 对照后端真实查询代码(agentbridge/eventlog_store.go、vip/quota.go、featuretool/repository.go)逐条 EXPLAIN——llm_token_usage 按 user+日期聚合走 idx_user_created、user_daily_active 按日期走 idx_uda_date 覆盖索引、agent_turns 三条读全部走索引,均健康;仅 feature_tools 列表与 agent_turn_events 批量读见发现;③ SHOW VARIABLES/GLOBAL STATUS 基线:buffer pool 1GB(远大于全库,命中率 99.92%)、Created_tmp_disk_tables=0、Max_used_connections=18/100、Threads_running=2、Select_full_join 仅 228——连接与临时表健康;slow_query_log 关闭见发现;④ performance_schema 语句摘要(root):36h 内 DB 累计耗时 top 全是迁移重放语句(72 轮全量重放,系开发期频繁 compose 重启,单轮 14s、随迁移文件数线性增长,属已知设计取舍),应用查询无一进入 top,digest_lost=0;⑤ Redis 双实例:INFO memory/stats/keyspace/persistence、SLOWLOG、CONFIG GET、全量 key SCAN——两实例 key 全部带 TTL、无 no-TTL 大 key、无 evicted_keys、AOF 正常,maxmemory-policy 分工正确(cache=allkeys-lru,persist=noeviction);偶发命令 stall 见发现;mem_fragmentation_ratio=7.12 在 2MB 用量下无意义,不作发现;⑥ docker stats 全容器实时资源——除 umami(72.8% 内存+假 unhealthy,见发现)外,backend 35MB/1G、mysql 889MB/2G、agent 108MB、nginx 29MB、CPU 全部 <1%,健康。未覆盖:慢日志内容(已关闭无从读取)、EXPLAIN ANALYZE 实际执行计划(避免在活库上执行重查询)、MinIO/prism_tex/agent 容器内部存储(jsonl/SQLite)体检、scholar_redis_persist 之外可能存在的其他 Redis 逻辑库(两实例均仅 db0)。全过程只读(SELECT/SHOW/EXPLAIN/INFO/SLOWLOG/SCAN),未执行 ANALYZE TABLE 等任何写操作。


## agent 容器磁盘侧存储生命周期(workspace/jsonl/file-history 无 TTL 增长)

已覆盖:① agent 磁盘生命周期全链路——agent/src/server/sessions.ts(createSession/deleteSession/materializeSessionSkills)、workspace.ts(读写删/pushSessionFile,确认 :148 的 rm recursive 只服务单文件 DELETE 不是目录回收)、http.ts(DELETE/PUT/POST files 各端点)、ws.ts(getOrCreateEphemeral 再吸附)、sandbox/bwrap.ts(确认无 fsize/quota);② agent/src 全量 grep cleanup/prune/ttl/expire/evict(仅内存 token 裁剪命中);③ backend 删除调用链——agentbridge/bridge.go(DeleteSessionByID/Reset 的 404 容忍)、http_handler.go、agent/client.go(:190 注释「删 jsonl+tool-results」已过时,现执行器只删 workDir)、claw/smartsearch/prism/peerreview 各调用点、common/cleanup/cleanup.go(确认只补行不删);④ 会话数上限排查(repository.go ListByUserFeature 无 LIMIT、无 MaxSessions);⑤ docker-compose.yml + docker-compose.prod.yml agent 服务块(volumes/资源限额/restart 策略,prod 持久挂载无磁盘配额,dev 无 sessions volume 落可写层);⑥ 实测量化:data/agent-sessions 74MB/66 目录/单目录最大 26MB、data/agent 各子目录 du、DB agent_sessions=174 行(按 feature 分布),确认 DB↔磁盘双向脱钩;⑦ prism_tex/entrypoint.sh 共享分区风险注释。未覆盖:生产机实际磁盘数据(只能按机制推断斜率);backend journal/agent_session_archive 表的 DB 侧增长(属 db-live 维度,但注意:transcript 真源已移到后端 journal,其膨胀值得该维度补看);MinIO 产物生命周期;agent 内存侧 sessions Map 无淘汰(已有维度覆盖,此处只借用其与磁盘的脱钩效应);skills/loader.ts:131 提及的 dead-session 缓存(内存侧)。


## Prism 编译链路 backend 侧(runCompile 并发闸/物化放大/缓存命中率)

已审(只读):backend/internal/prism 编译编排全链 —— service.go(StartCompile/runCompile/gatherCurrent/gatherAssets/failCompile/编译 GC)、texclient.go 全文(任务目录写入+95s 轮询+RemoveAll)、repository.go/struct_repository.go(FindCachedCompile/ListStaleCompiles/AppendCurrentVersion/UpsertFileBody/SaveStructVersion)、struct_service.go(SaveStruct→materializeStruct 投影链)、handler.go(Compile/GetCompile/GetPDF)、attach.go、projector.go(\\date{\\today} 为 LaTeX 展开、不破坏哈希,已排除)、safego 实现、routes_user.go 中间件(仅通用 tieredRL,无编译专属限流)、docker-compose prism-work 共享卷;prism_tex/entrypoint.sh 仅作交叉核对(MAXPAR/timeout 沙箱侧加固不重复报);前端 features/prism:api/prism.ts(useStartCompile/useCompile 1s 轮询/prismPdfSource)、PrismWorkspace.tsx 与 PrismWorkspaceV2.tsx 全部编译触发点(手动按钮/onApplied 自动编译/auto-fix 回路/onTemplateChange/插图插公式)、StructEditor.tsx 800ms 防抖。确认前端无打字即编译的风暴触发,触发点均事件驱动。未覆盖:ws_round.go/workspace.go 的 agent 轮次铺源链(属 agent 会话维度,仅抽查)、docx.go 导出、quality/planner/cite 的 LLM 链路、MinIO storage 包内部实现、V1 旧轨 LatexEditor 细节。既往已修项(下载截断/WS deadline/BodyLimit)未见与本维度交叉复发。


## 微信小程序端性能专项(feed/search/paper 长列表 + 流式 setData + 本地缓存无界)

已按五个子维度全量覆盖 miniprogram/ 独立客户端:① 流式渲染链全读——pages/claw/claw.ts(1253 行全文)、lib/agent-chat.ts(fold/decorate 全文)、lib/markdown.ts(602 行全文,确认 mdToSegments 每次对累计全文整段重 parse)、services/agent-socket.ts(确认存在 FLUSH_MS=120 节流,任务假设的「无节流」不成立,但 turn 级整包过桥的 O(N²) 成立并立项);② 长列表——pages/feed/feed.ts+wxml(已窗口化 winLo/winHi + appendPatch + news 图 lazy-load,无 medium 以上问题)、pages/search/search.ts(appendPatch+触底守卫,行小无图,不立项)、pages/paper/paper.ts(详情页,refs 截 30,干净)、pages/news/news.ts(纯详情,干净)、library/tools 触底分页抽查(守卫齐全);真正的窗口化盲区改判在 claw 历史会话(与后端 agentbridge/http_handler.go、Web 端 claw/api/session.ts 三方对照后立项);③ lib/math-cache.ts 与 lib/diagram-cache.ts 全读——两者均为纯内存缓存(任务假设的「storage 胀满/wx.setStorage 变慢」不成立),但顺藤查到 mermaid PNG 落 USER_DATA_PATH 永不清理(全仓 grep unlink/readdir 零命中)立项;lib/claw-model-store.ts 的 per-session map 无界但每条几十字节,低危不立项;④ services/request.ts 全读(无重试逻辑→无重试风暴,默认 20s 超时,qs/absMediaUrl 干净)、services/agent-socket.ts 重连(MAX_RECONNECT=8 + 指数退避 60s 封顶 + 45s 看门狗,有界,不立项)、并发面(math CONC=3、diagram 串行、feed 串行重试,距 wx 10 并发上限余量充足);唯一漏网是 translate.ts 流式零节流,立项;⑤ app.ts 全读——onLaunch 是空函数(无任何串行 await),既往「冷启动 40s」与 onLaunch 无关;feed 冷启最坏 4 次串行 × 15s 超时(feed.ts:263-265)可解释长骨架屏但属既往已记录的换源重试设计,不重复立项。未覆盖:pages 下 author/journal/billing/login/me/profile-edit/tool-detail/change-password 等低频短页面(无长列表无流式,抽样结构与 search/library 同构)、custom-tab-bar、store/、styles/ 纯样式;既往已修项(appendPatch、content_delta 合并、vmCache/lastVMs path-set、TOTAL=40、图表 base64 不进 setData、服务端 math Redis 缓存)均已核实仍在位,未重复报。


## 论文/作者详情页(features/browser + 移动详情)渲染与请求扇出

已逐行审阅 features/browser 全部文件:pages/BrowserPage.tsx、routes.tsx、components/{PaperDetailPane,AuthorDetailPane,JournalDetailPane,BrowserTabsBar,PdfBrowserPane,QuickOpenPaperDialog}.tsx、paper-detail/ 全 6 文件、author-detail/ 全 6 文件、mobile/MobileDetailHeader.tsx;对应数据层 shared/api/{paper-detail,user-library-papers,authors,journals,quick-search,open-access(browser/api),seo,hot-content,paper-enrich,user-library-mutations}.ts、shared/lib/{query-config,library-invalidation}.ts、stores/browser-tabs.store.ts、shared/hooks/{useOpenInBrowser,useDebounce}.ts、shared/components/{JournalTrendChart,PdfViewer}(主体)及后端 backend/internal/library/handler_pdf.go + internal/storage/storage.go(ServeObject)交叉验证。任务五问的核实结论:① 论文详情扇出健康 —— 暖路径(站内点开,tab 快照命中)仅 2-3 请求(by-upstream 收藏态 1 + references 1 + 条件性 oa/resolve 1),冷路径 +1 详情 +1~2 个 sendBeacon(seo expose / hot-content track,best-effort 不阻塞);PaperReferences 每条引用纯本地渲染(generateCitation useMemo),零 per-item 请求,无 N+1(shared 的 enrichPmdAbstracts 批量器用于 quick-search,references 场景不需要;收藏批量 check(['library','check'])用于列表,详情页用单条 by-upstream,均合理);② references 单次 limit=100 有界拉取(paper-detail.ts:89)、渲染 STEP=30 分批「显示更多」(PaperReferences.tsx:24-28),无虚拟化但有上界,可接受;③ tab 切换确实卸载重挂(BrowserPage key={pathname}),但 staleTime 分级(详情 COOL 5min/references·journal COLD 10min/by-upstream FRESH 5min)+ refetchOnWindowFocus=false 保证窗口内零 refetch(例外即 finding 2 的永真 needsFetch);QuickOpenPaperDialog 搜索有 280ms debounce(quick-search.ts:49-51)且三源并行 placeholderData 防闪;④ 同一论文确有三份数据副本(search 结果 cache / browser-tabs localStorage 快照 / ['paper','detail'] query),但按「tab 快照短路 fallback」设计不产生重复请求,非 library-browse 式双请求缓存;期刊侧 useJournalDetail/useJournalFullDetail/JournalTrendChart 三 hook 共用 ['journal','detail',id] 单请求(journals.ts:61,81;JournalTrendChart.tsx:77)是正面样板;收藏 mutation 失效已用 predicate 排除 quick-search(library-invalidation.ts),既往失效风暴已修未复发;⑤ 移动/桌面同 URL 单挂载(router.tsx 仅在 AppShell 下挂 browserRoutes 一次,features/mobile 只有 feed/news 无独立详情页),双 header 仅 CSS 显隐(hidden sm:block / sm:hidden),无双份请求。未覆盖:PdfViewer 渲染管线全量细节(只读主体 130 行)、后端 SSR/SEO 注入层、features/mobile feed 页本身(非详情)、CitationProse/generateCitation 内部实现。


## 前端容器内层 nginx 与 assets bind-mount 无限累积(已 470MB)

已覆盖(全部只读):① 部署进 bind-mount 的完整链路 —— frontend-user/Dockerfile 全文(builder→/opt/dist 暂存)、docker-entrypoint.d/ 下唯一脚本 40-sync-site.sh 逐行、docker-compose.yml:460-495 与 docker-compose.prod.yml:431-455 的 frontend-user 块(bind-mount、restart 策略、prod 走 registry 镜像);确认存在 7 天回收逻辑(:24),「无限累积」假设被实测推翻(find -mtime +7 命中 0 文件),但揪出 mtime 语义 bug(发现 1)。② 现状量化 —— du 470M / 21,780 文件、mtime 逐日分桶(近 3 天日流入 97-139MB)、代数分布(users×120 等)、最大文件排序、单次构建 13MB;并进入运行中容器只读验证 /opt/dist mtime=镜像构建时间、web root 文件数与宿主一致。③ 内层 nginx.conf 全文 —— 无 gzip/gzip_static/open_file_cache,immutable/no-cache 头由内层打、外层 hide 后重打同值(验证无冲突);index.html 不在 bind-mount、每次启动从镜像现拷(正确);.mjs/wasm/字体 MIME 与 CORS 处理已核。④ 外层 nginx/nginx.conf gzip 与 proxy_cache_path 段 + nginx/conf.d/user.conf 全文 —— static_cache(1g/inactive 7d/keys_zone 10m≈8 万键)按 $uri 建键、条目只在被请求时才建,死资产极少被请求故稀释不成立,hash URI 无键冲突,且 7d 缓存反而延长了 stale-chunk 宽限:任务④核实后判定非问题,不报。另核实 frontend-user/.dockerignore 已排除 node_modules(682MB)/build,构建上下文无膨胀问题。未覆盖:生产服务器上 data/frontend-assets 的实际水位(本机为 dev 环境,生产部署频率更低、稳态应更小)、CI 构建推镜像流水线(仓库内无相关文件)、scholar_nginx 容器内 /var/cache/nginx/static 的实际占用(未进入该容器)。
