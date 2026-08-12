# Agent、小程序与运行基础设施审计

> 审计基线：scholay-wiki 分支，提交 f23d00032af9718f1fd31189e317a5622549f8cc（2026-08-11，优化更新）
> 审计日期：2026-08-12
> 范围：agent、agent-skills、miniprogram、prism_tex、feature-tools-coldstart、Docker Compose、Nginx、scripts、设计资料与 interaction specs。
> 不在范围：backend 与 frontend-user 的内部页面和业务实现；但为解释协议、挂载、网络和运行关系，本文会引用两者的边界配置。
> 判定优先级：当前代码、配置和测试 > 根目录 CLAUDE.md > 当前设计规范 > 日期型审计、研究和交互快照。

## 结论摘要

本仓库已经不是早期文档描述的单一 Web 原型。当前运行面包括一套独立 Agent Executor、七个 Agent 功能入口、109 个可装载技能文件、一套原生微信小程序、隔离的 TeX 编译服务、11 服务 Compose 栈，以及一个包含 201 条工具记录的冷启动数据包。

最需要优先处理的风险不是“功能缺失”，而是能力边界和治理边界：

1. feature-tools-coldstart 的 201 条记录全部标记为 published，其中 193 条提供百度网盘下载；还存在一个明确标为 cracked 的 ChemCAD 5.2 条目，却未标记 needs_review。这是发布、版权、供应链和用户安全的高优先级问题。
2. Claw 档位允许 Bash 时，沙箱会共享网络命名空间，且没有默认域名白名单或代理出口。虽然供应商密钥不会注入命令环境，工作区中的用户文件仍可被命令主动发送到任意外部地址。
3. 备份与恢复脚本仍以已退役的旧 Agent JSONL 目录为主要叙事，未形成覆盖 MySQL、MinIO、redis-persist、Umami 和当前 agent-sessions 的一致、可验证恢复方案。
4. 生产 Agent 依赖 bubblewrap，但健康检查并不证明 Bash、文档导出或沙箱自检可用，部署脚本也没有把这项能力作为上线门禁。
5. 小程序已经有 15 个页面和完整 Claw 会话，但没有自动化测试或微信 CI；内容安全检查存在网络错误时放行、生成内容只检查前 2,000 字符、附件媒体未纳入同一策略等边界。
6. 多份 README、interaction spec、旧审计和运维脚本明显落后于当前实现。它们只能作为历史背景，不能作为产品或运行事实来源。

## 1. Agent Executor

### 1.1 定位与边界

agent 是当前唯一的 Agent 执行后端。它以 Bun 和 TypeScript 实现，使用 Anthropic Messages 风格的内部协议，但可配置 Anthropic 或 OpenAI 格式的模型供应商。Backend 负责 durable journal、身份、配额和面向产品的编排；agent 负责模型回合、工具执行、会话工作区、技能注入、证据账本、统计分析和导出。

旧的 cc-haha、fork 进程和 JSONL 转录链路已经退出主运行路径。data/agent 只应视为历史迁移归档，不是当前对话真相源。

当前通过 EXECUTOR_ENABLED_FEATURES 启用七个功能：

| 功能键 | Executor 侧职责 | 主要能力包 |
| --- | --- | --- |
| smart_search | 检索意图、证据预取、证据账本与引用式回答 | smart-search-skills |
| claw | 通用研究助理、工作区文件、命令、文档与问答 | claw-add |
| prism | 学术写作、改写与文档导出 | prism-skills、prism-lenses、prism-personas 的边界注入 |
| peerreview | 评审回合所需的模型和工具执行；具体评审人编排在 Backend | reviewer-skills、reviewer-lenses 由 Backend 按需读取 |
| boltslides | HTML 幻灯片构建及 PPTX、PDF 导出 | bolt-slides-add |
| sci_draw | 图表、科研示意图与分子图指导 | sci-draw-skills |
| stat_lab | 统计方法选择、计算、检查和报告 | stat-lab-skills、agent/stat-kit |

源路径：

- agent/package.json
- agent/src/index.ts
- agent/src/server/http.ts
- agent/src/server/ws.ts
- agent/src/turn
- agent/src/tools
- agent/src/evidence
- agent/src/policy
- agent/src/sandbox
- agent/stat-kit
- docker-compose.yml
- docker-compose.prod.yml

### 1.2 HTTP、WebSocket 与会话接口

HTTP 面向内部服务使用。除 GET /health 外，所有接口都要求 Bearer token。

| 类别 | 当前接口 |
| --- | --- |
| 模型补全 | POST /api/complete、POST /api/complete/stream |
| 渲染 | POST /render/math、POST /render/mermaid |
| Provider | GET/POST /api/providers、PUT /api/providers/:id、POST /api/providers/:id/activate |
| 模型与准入 | GET /api/admission、GET /api/models |
| 会话 | GET/POST /api/sessions、PATCH/DELETE /api/sessions/:id、GET /api/sessions/:id/messages |
| 影子回合 | POST /api/turn，目前是保留但非主产品链路 |
| 工作区 | POST files、GET/PUT/DELETE file、GET tree、GET inspection、POST extract-head |
| Agent 定义 | GET/POST /api/agents、GET/PUT /api/agents/:id |
| 幻灯片导出 | POST /api/sessions/:id/export-pptx，支持 pptx、pptx-native、pdf |

GET /api/providers 会隐藏密钥。GET /api/sessions/:id/messages 返回的是进程内会话视图，不是 durable journal 的替代品。未实现的旧 /api/* 路由统一返回 501；旧文档中 chat、chat-status、patch、list 等接口族不能再假设可用。

WebSocket 入站消息：

- ping
- stop_generation
- permission_response
- set_runtime_config
- seed_history
- prewarm_session
- extract_memory
- user_message

WebSocket 出站消息包括连接与心跳、历史播种、模型流式片段、工具调用、权限询问、错误与 busy、上下文压缩和记忆提取用量、标题更新、回合完成及 resync。每个会话连接同一时间只运行一个回合；重连依赖 Backend 把 durable history 再次播种给 Executor。

### 1.3 内建工具

当前注册表中有 17 个内建工具。Minicod MCP 工具在运行时以 mcp__minicod__ 前缀加入，并受到同一套 allowlist、denylist 判定。

| 工具 | 能力与运行规则 |
| --- | --- |
| Read | 读取 UTF-8 文本，默认最大约 256 KiB；拒绝明显二进制或乱码内容 |
| Write | 在会话工作区内写文件；受路径和权限策略约束 |
| Edit | 对工作区文本做局部编辑 |
| Glob | 在工作区内匹配路径 |
| Grep | 在工作区内搜索文本 |
| Bash | 执行命令；只有允许 Bash 的 Agent 档位可见和可执行 |
| ReadDocument | 提取 PDF、DOCX、XLSX、PPTX、ODT、RTF、EPUB、HTML、Markdown、TeX 文本 |
| ExportDocument | 通过 Pandoc 导出 DOCX、PPTX、ODT、RTF、EPUB、HTML、PDF，输出固定在 out |
| BuildDeck | 构建单文件 HTML 幻灯片，随后可导出 PPTX 或 PDF |
| TodayDate | 返回平台当前日期 |
| Skill | 按名称懒加载 guides 下的 SKILL.md |
| AskUserQuestion | 发出 1 至 4 个结构化问题 |
| EvidenceGet | 按 E1、E2 等证据 ID 读取元数据、全文或片段 |
| SubmitAnswer | 在证据回合满足退出条件时提交回答 |
| DeclareInsufficient | 明确声明证据不足并结束证据回合 |
| StatRun | 执行统计方法或检查，将产物写入 analysis |
| StatReport | 根据统计 bundle 生成结构化报告 |

所有工作区工具都进行规范化路径和 realpath 检查，并防止通过符号链接逃逸。Bash 是否暴露给模型和是否允许实际执行使用同一个权限函数，denylist 优先于 allowlist。

ReadDocument 的具体边界：

- PDF 使用 pdftotext，并支持 first_pages。
- XLSX 使用 openpyxl。
- 其余主要格式使用 Pandoc；Pandoc 启用自身 sandbox。
- 最大提取文本约 400,000 字符。
- 不提供 OCR。
- 旧 DOC、XLS、PPT、ODS、ODP 不在支持表内。

文件转换器以固定 argv 和已约束路径调用，但 ReadDocument 与 extract-head 的外层转换进程并不在 bubblewrap 内。恶意解析器输入的风险因此不同于 Bash 沙箱，仍需单独防护。

### 1.4 研究证据流程

研究回合使用确定性路由器：

1. 首轮若被识别为纯检索表面或文献型意图，则进入 evidence phase。
2. Executor 在第一次模型调用前通过 Minicod 预取，默认 semantic source、limit 5、超时 8 秒。
3. 预取失败不阻断回合；成功结果进入只读证据账本，并分配 E1、E2 等 ID。
4. 模型只能通过 EvidenceGet 读取证据详情。
5. evidence phase 必须以 SubmitAnswer 或 DeclareInsufficient 退出。
6. 一旦账本已有证据，后续回合当前会被路由为 ledger_grounded chat，而不会重新判断是否已切换研究主题。

因此，证据账本能约束“引用了什么”，但不能自动解决跨主题对话中的证据污染。主题切换识别是已知覆盖缺口。

Claims honesty audit 默认开启，但当前只记录观察结果，不会触发纠错回合或阻断输出。它是诊断信号，不是事实性保证。

关键源路径：

- agent/src/policy/researchTurn.ts
- agent/src/evidence
- agent/src/turn/turnLoop.ts
- agent/src/tools/registry.ts
- agent/src/evidence

### 1.5 统计实验室

agent/stat-kit 是 Python CLI，提供 doctor、assume、run、report、numcheck、vocabulary、situations。

当前方法卡覆盖：

- 两组独立或配对：student_t、welch_t、mann_whitney、paired_t、wilcoxon
- 多组比较：oneway_anova、welch_anova、kruskal_wallis
- 分类资料：chi2_pearson、chi2_yates、fisher_exact、chi2_rxc、mcnemar_exact、cochran_armitage
- 假设检查：shapiro_by_group、levene_center_median、shapiro_diff、expected_frequencies
- 决策规则：D-01 至 D-15

报告支持 cn-core 与 apa 体系。数值复核 numcheck 默认 observe；只有设置 STATKIT_NUMCHECK_ENFORCE=1 才会硬阻断，而当前 Compose 和 env 示例没有启用该开关。仓库安装了 statsmodels、scikit-learn、lifelines 等更广泛依赖，但方法卡并未承诺回归、混合模型、时间序列或生存分析；产品文案不应根据依赖包推断这些能力已经可用。

关键源路径：

- agent/stat-kit/statkit/__main__.py
- agent/stat-kit/statkit/verbs
- agent/stat-kit/statkit/cards/methods
- agent/stat-kit/statkit/cards/checks
- agent/stat-kit/statkit/cards/rules
- agent/stat-kit/statkit/engines
- agent/stat-kit/statkit/report
- agent-skills/stat-lab-skills

### 1.6 会话、文件、上下文与 Provider

| 规则 | 当前值或行为 |
| --- | --- |
| Compose 会话目录 | 容器 /home/bun/sessions，宿主 ./data/agent-sessions |
| 源码默认会话目录 | /tmp/executor-sessions |
| 单文件上限 | 64 MiB |
| 单会话磁盘上限 | 1 GiB |
| 单会话文件数量 | 2,000 |
| 原始文件预览上限 | 20 MiB |
| 文本预览上限 | 1 MiB |
| 图片预览上限 | 5 MiB |
| 进程内会话空闲 TTL | 30 分钟 |
| 进程内会话数量上限 | 200 |
| 进程内清扫间隔 | 5 分钟 |
| 磁盘工作区 TTL | 30 天 |
| 磁盘清扫最短间隔 | 6 小时 |
| 用户市场技能 | 每会话最多 5 个，每个输入最多 20,000 字节 |
| 图片附件 | JPEG、PNG、GIF、WebP；每张最多 6 MiB；最多保留最近 3 张活跃图片 |

用户市场技能会被物化为会话 guides，再由 Skill 工具懒加载。上下文按字符估算 token，在靠近上下文上限时生成滚动摘要，并保留重要文件路径、证据 ID 和近期回合。压缩、记忆提取和标题生成使用较低成本的模型档位。

Provider 支持 main、haiku、sonnet、opus 分层，配置格式为 anthropic 或 openai，并可设置 reasoning replay。Executor 的本地 providers.json 只是 best-effort 缓存，Compose 未为其单独持久化；Backend 数据库才是规范来源，并在需要时重新推送。

### 1.7 沙箱与网络

Executor 没有一个可随意切换的 SANDBOX_MODE。它启动时探测 bubblewrap，并在可用时用以下策略执行高风险工具：

- unshare-all
- 不挂载 proc
- 临时 tmpfs
- 仅会话工作区可写
- evidence 与 analysis 默认只读；StatRun 对 analysis 有专门写权限
- 清空并显式重建环境变量
- 不把模型供应商密钥注入 Bash 环境

生产环境若没有可用 bubblewrap，会拒绝 Bash 和导出；显式不安全覆盖不能在 production 启动模式中使用。生产 Compose 使用自定义 seccomp，同时设置 apparmor=unconfined；宿主需要运行 scripts/enable-bwrap-host.sh 处理 AppArmor user namespace 限制。

所有回合当前以 net=open 运行。允许 Bash 时 bubblewrap 使用 share-net，Agent 连接 egress-net 直接出网；仓库中没有强制代理、域名 allowlist 或每工具网络策略。这意味着密钥隔离已经存在，但用户文件的主动外传仍是能力本身允许的行为，必须由产品授权、审计和网络策略补足。

GET /health 只证明进程活着，不证明 bubblewrap 自检、Bash、Pandoc、Chromium 或导出链路可用。镜像启动有若干 smoke test，但失败主要记录日志，没有统一进入服务健康状态。

### 1.8 镜像与测试

Agent 镜像基于 Debian 与 Bun，安装 bubblewrap、Pandoc 3.10.1、Poppler、Chromium、Noto CJK/Emoji 字体、openpyxl、python-docx、WeasyPrint，以及统计、绘图、化学结构相关 Python 包。镜像构建阶段运行 TypeScript typecheck，最终以 bun 非 root 用户运行。

仓库内有约 40 个 Agent TypeScript 测试文件，stat-kit 另有 4 个较大的 Python 测试模块。本次针对边界的本地抽样执行结果：

- skillSize、composeVolumeParity、evidence parse mirror 相关测试通过。
- 共记录 11 个通过。
- permissionParity 在当前工作树未能执行完成，原因是本地 node_modules 缺少 @modelcontextprotocol/sdk/client/index.js；这不能被记录为全套测试通过，也不能直接归因于产品代码失败。

## 2. Agent Skills

### 2.1 装载模型

技能分成两类：

1. Always-on 技能：Loader 读取每个 addDir 的 CLAUDE.md，以及 .claude/skills/*/SKILL.md，直接放入系统上下文。
2. Lazy guide：guides/*/SKILL.md 只生成短菜单；模型调用 Skill 后才载入正文。

当前限制：

| 限制 | 数值 |
| --- | --- |
| 单个 always-on 技能截断线 | 12,000 字符 |
| 所有 always-on 技能总上限 | 40,000 字符 |
| guide 菜单总上限 | 2,500 字符 |
| Skill 懒加载正文上限 | 16,000 字符 |
| addDir 缓存数量 | 256 |

本次盘点的 109 个 SKILL.md 均低于单文件 12,000 字符限制。最大者为 bolt slides，约 10,588 字符；stat workbench 约 9,981 字符。仓库目前没有把 Compose 中真实 addDir 组合与 40,000 字符总上限绑定的自动化测试，因此未来增加技能时，尾部技能仍可能被静默截掉。

### 2.2 挂载关系

| 能力 | 容器路径与装载方式 |
| --- | --- |
| Claw | claw-add 根目录挂到 /claw-add；CLAUDE.md always-on，6 个 guides 懒加载 |
| Prism 核心 | prism-skills 挂为 /prism-add/.claude/skills |
| Prism 写作镜头 | prism-lenses 挂为 /prism-add/guides |
| Smart Search | smart-search-skills 挂为对应 addDir 的 .claude/skills |
| Bolt Slides | bolt-slides-add 挂为 .claude/skills |
| Sci Draw | sci-draw-skills 挂为 .claude/skills |
| Stat Lab | stat-lab-skills 挂为 .claude/skills |
| Peer Review | reviewer-skills、reviewer-lenses 和 prism-personas 由 Backend 读取并按评审人注入，不整体挂入 Agent always-on 上下文 |

Reviewer 技能集合明显超过 40,000 字符总上限，因此“不整体挂入 Executor”是有意设计，不是漏挂载。Compose 注释仍保留早期体积数字，与当前文件实测不一致，但设计理由仍成立。

### 2.3 技能清单

当前共 109 个 SKILL.md。

#### bolt-slides-add：1

- slides

#### claw-add guides：6

- citation-audit
- data-figures
- methods-stats
- paper-explain
- rebuttal
- topic-selection

claw-add/CLAUDE.md 规定：结构化流程优先 Mermaid，科研图可使用 SVG，结构化文本使用 GFM，数学公式使用 KaTeX；不要用 ASCII 图或 HTML 规避 Markdown 能力。

#### prism-lenses：31

- wl-argument
- wl-blank-page
- wl-clarity
- wl-data-results
- wl-de-slop
- wl-eal-chinglish
- wl-expand-compress
- wl-figure-narrative
- wl-lit-synthesis
- wl-math-narrative
- wl-paragraph-flow
- wl-related-work-structure
- wl-revision-strategy
- wl-rl-claim-calibration
- wl-rl-claim-evidence
- wl-rl-ethics-irb
- wl-rl-eval-contamination
- wl-rl-figure-integrity
- wl-rl-limitations-scope
- wl-rl-preregistration-harking
- wl-rl-related-work-fairness
- wl-rl-reporting
- wl-rl-reproducibility
- wl-rl-stats-language
- wl-signposting
- wl-structure
- wl-submission-pack
- wl-title-abstract
- wl-translate
- wl-venue-adapt
- wl-voice-register

#### prism-personas：14

- pw-biomedical-empirical
- pw-cs-systems-ml
- pw-doc-cover-letter
- pw-doc-grant
- pw-doc-rebuttal
- pw-doc-registered-report
- pw-doc-thesis-chapter
- pw-engineering-systems
- pw-experimental-stem
- pw-humanities-argumentative
- pw-math-proof-theory
- pw-qualitative-social
- pw-quant-social-psych-econ
- pw-systematic-review

#### prism-skills：4

- library-reference
- prism-citation-grounding
- prism-edit-discipline
- prism-writing-core

#### reviewer-lenses：13

- lens-causal-inference
- lens-data-code-availability
- lens-ethics-irb
- lens-eval-contamination
- lens-external-validity
- lens-fairness-bias
- lens-figure-integrity
- lens-multiple-comparisons
- lens-preregistration-harking
- lens-related-work-fairness
- lens-reporting-standards
- lens-stat-reporting
- lens-statistics-rigor

#### reviewer-skills：33

- reviewer-roster
- rv-domain-astronomy
- rv-domain-biomed
- rv-domain-biostat
- rv-domain-cheminformatics
- rv-domain-clinical-ai
- rv-domain-earth-climate
- rv-domain-ecology-evobio
- rv-domain-econometrics
- rv-domain-economics-finance
- rv-domain-epidemiology
- rv-domain-evidence-synthesis
- rv-domain-genomics
- rv-domain-hci-user-study
- rv-domain-materials
- rv-domain-ml
- rv-domain-neuroscience
- rv-domain-nlp-llm
- rv-domain-physics-sim
- rv-domain-proteomics
- rv-domain-psychology-behavioral
- rv-domain-pure-math
- rv-domain-quantum
- rv-domain-rct
- rv-domain-singlecell
- rv-domain-social-science
- rv-domain-software-systems-security
- rv-integrity
- rv-methodology
- rv-novelty
- rv-reproducibility
- rv-theory
- rv-writing

#### sci-draw-skills：3

- charts
- figures
- molecules

#### smart-search-skills：2

- library-reference
- minicod-search-strategy

#### stat-lab-skills：2

- interpret
- workbench

### 2.4 技能维护规则与缺口

- agent-skills/claw-add/CLAUDE.md 是 Claw 输出规范的一部分，修改该能力时必须与 guides 一起复核。
- scripts/lint-writing-skills.py 仍写着单技能 8,000 字符上限，而 Loader 当前是 12,000；脚本说明中的“镜像运行时限制”已经不准确。
- scripts/lint-reviewer-skills.py 与 scripts/lint-writing-skills.py 没有接入当前 pre-push hook，也未发现仓库级 CI 配置。
- 单文件大小 guard 能发现过大的 SKILL.md，但没有测试 Compose 的完整组合、加载顺序和总上下文截断。
- Reviewer 和 Prism persona 依赖 Backend 选择性注入。仅查看 Agent 容器挂载会错误判断它们“未部署”。

源路径：

- agent/src/skills
- agent/src/server/composeVolumeParity.test.ts
- agent/src/skills/skillSize.test.ts
- agent-skills/claw-add/CLAUDE.md
- agent-skills/claw-add/guides
- agent-skills/prism-lenses
- agent-skills/prism-personas
- agent-skills/prism-skills
- agent-skills/reviewer-lenses
- agent-skills/reviewer-skills
- agent-skills/smart-search-skills
- agent-skills/bolt-slides-add
- agent-skills/sci-draw-skills
- agent-skills/stat-lab-skills
- scripts/lint-writing-skills.py
- scripts/lint-reviewer-skills.py

## 3. 微信小程序

### 3.1 产品面

miniprogram 是原生 TypeScript、WXML、WXSS 工程，不是 Web 页面壳。app.json 注册 15 个页面，并使用自定义 tab bar。

| 页面 | 路由 | 当前能力 |
| --- | --- | --- |
| 学术流 | pages/feed/feed | 论文、期刊、资讯混合卡片；左右滑动；缓存、刷新、加载更多、收藏和分享 |
| AI Claw | pages/claw/claw | 会话、流式回答、工具过程、附件、文献引用、产物和模型选择 |
| 功能广场 | pages/tools/tools | 分类、搜索、分页和功能卡片 |
| 我的 | pages/me/me | 用户资料、会员周期、额度、积分、重置券、兑换与账户导航 |
| 登录 | pages/login/login | 微信登录、邮箱密码、邮箱验证码 |
| 搜索 | pages/search/search | 论文/期刊模式、URL 模式、多维筛选、排序与分页 |
| 论文详情 | pages/paper/paper | 元数据、开放获取、领域、参考文献、DOI/PDF、引用格式、AI 翻译 |
| 期刊详情 | pages/journal/journal | JCR、IF、CAS、新锐、CCF、预警、OA、范围和投稿信息 |
| 作者详情 | pages/author/author | 统计、单位、ORCID 与代表作 |
| 资讯详情 | pages/news/news | 资讯正文和来源 |
| 功能详情 | pages/tool-detail/tool-detail | 资源、场景、教程、FAQ、免责声明和复制操作 |
| 文献库 | pages/library/library | 文件夹、分页、移除和打开条目 |
| 账单 | pages/billing/billing | 交易与订单两类记录、状态展示 |
| 编辑资料 | pages/profile-edit/profile-edit | 资料更新与手机号绑定入口 |
| 修改密码 | pages/change-password/change-password | 密码更新 |

自定义 tab bar 为“浏览、AI Claw、功能、我的”。app.ts 不会在启动时强制登录；需要身份的动作由页面按需调用登录流程。应用和页面活跃事件通过 60 秒门控发送 POST /user/activity。

### 3.2 关键用户流程

#### Feed 与发现

Feed 对论文、期刊、资讯生成混合计划，只渲染当前卡片附近的有限窗口。论文卡片支持收藏到文件夹和分享。筛选按钮目前显示“即将上线”，不应在 Wiki 中描述为已完成筛选功能。

#### 搜索与详情

论文搜索支持来源、时间、排序、OA、最低引用、23 个学科和 10 种类型。期刊搜索与论文搜索共用页面模式。论文详情可以复制 DOI/PDF 链接和多种引用格式，并通过流式接口执行 AI 翻译。小程序没有完整的内嵌学术 PDF 阅读器，当前主要依赖外部链接打开或复制。

#### Claw

Claw 页面提供：

- 游客状态登录引导
- 新建、列表、切换、重命名、删除会话
- 历史恢复和向前加载更早消息
- thinking、Markdown、表格、公式和工具过程的流式展示
- Mermaid 服务端 PNG 渲染与缓存
- 停止生成、busy 和额度不足后的重试
- 模型选择
- 图片与文件上传
- 从文献库添加引用
- 产物抽屉与产物卡片
- 图片预览、文档打开、文本查看；目录产物提示到 Web 端处理

AgentSocket 先获取 /user/claw/ws/:sessionId 的一次性 ticket，再建立 WebSocket。它使用指数退避，最多重试 8 次；25 秒发送 ping，每 10 秒检查一次，45 秒无任何帧判定失活；流式 UI 约每 120 毫秒批量刷新，并支持 resync 和截断恢复。

#### 会员与账单

“我的”页面展示会员、周期、额度、积分、重置券和兑换入口。账单页展示最多 50 条交易或订单。当前小程序没有完整的购买或支付结账界面，因此“可看订单”不等于“可在小程序内完成购买”。

### 3.3 API 与环境

miniprogram/config/env.ts 的策略：

- 微信开发者工具：默认 http://localhost:5411
- 真机、预览、体验和审核：统一 https://www.scholay.com
- API 前缀：/api/v1

这解决了审核包误连局域网的问题，但仓库没有独立 staging 或体验环境配置。真机预览即访问生产环境。

请求封装支持 GET、POST、PUT、DELETE，不提供 PATCH；默认超时 20 秒。它解包统一的 code、message、data 响应，携带 Bearer token，并在 HTTP 401 或 409 时清除登录态。业务码 6010 会提示额度不足并引导到“我的”。

project.config.json 使用 AppID wx22f32e2f6f9a44b8，关闭 urlCheck，基础库选择 latest，并启用 TypeScript 编译和上传 sourcemap。sitemap.json 当前允许所有页面被索引。

源路径：

- miniprogram/app.ts
- miniprogram/app.json
- miniprogram/app.wxss
- miniprogram/custom-tab-bar
- miniprogram/pages
- miniprogram/services
- miniprogram/lib
- miniprogram/config/env.ts
- miniprogram/project.config.json
- miniprogram/sitemap.json

### 3.4 内容安全与质量边界

用户输入在客户端做内容安全预检。生成内容的后检只取前 2,000 字符；services/wechatsec.ts 在接口或网络错误时明确 fail-open；附件媒体的统一安全检查尚未落实。客户端检查本身也不应被视为服务端合规边界。

建议将以下规则移到或复制到服务端：

- 对完整生成文本分块检查，不只检查开头。
- 网络失败时进入可重试或待审核状态，而不是默认放行。
- 图片、文档附件和从文件提取出的文本纳入一致策略。
- 记录命中规则、版本、处置和复核链路，同时避免日志泄露完整敏感内容。

### 3.5 小程序覆盖缺口

- 没有发现页面、请求层或 WebSocket 自动化测试。
- package.json 只有 TypeScript 开发依赖，没有 test、lint、build 或微信上传脚本。
- 未接入微信 CI，无法从仓库证明当前提交能通过编译、预览和审核构建。
- 没有单独 staging；真机预览直接使用生产 API。
- sitemap 允许全部页面，需确认登录、账户和账单路由是否应被索引。
- Feed 筛选仍是占位。
- 没有购买支付流程。
- 相比 Web，未提供独立 Smart Search、Peer Review、Prism、Bolt Slides、Sci Draw、Stat Lab 页面。
- app.wxss 是 Web token 的手工镜像。全仓设计 guard 能发现差异，但单独修改小程序时没有专属自动同步机制。

## 4. Prism TeX 编译服务

### 4.1 协议与能力

prism_tex 不是 HTTP 服务。它与 Backend 共享 /work，以文件为协议：

1. Backend 创建任务目录并写入源文件。
2. Backend 原子写入 .request，内容包含 main basename 和 engine。
3. entrypoint watcher 把请求原子移动为 .processing。
4. watcher 调用 latexmk，engine 只接受 xelatex；其他值回落为 pdflatex。
5. 任务目录产生 PDF、日志或错误文件。
6. watcher 原子写 status.json。
7. Backend 轮询状态、上传结果并清理任务目录。

默认参数：

| 配置 | 默认值 |
| --- | --- |
| 单任务超时 | 60 秒 |
| 单输出文件上限 | 100 MiB，由 ulimit -f 约束 |
| 最大并发 | 3 |
| 轮询间隔 | 0.5 秒 |
| heartbeat 间隔 | 1 秒 |
| 健康判定 | heartbeat 小于 30 秒 |

镜像包含较完整的 TeX Live、ctex、XeLaTeX、BibLaTeX、TikZ 等，镜像体积约 2 GiB。主文件名拒绝斜杠和前导 ..。shell escape 同时从命令行参数、环境和 texmf.cnf 三层关闭，openin_any 与 openout_any 设置为 p。

### 4.2 运行隔离

生产 Compose 对 prism-tex 设置：

- network_mode: none
- 只读根文件系统
- /tmp 使用 tmpfs
- cap_drop: ALL
- no-new-privileges
- UID 1001
- 2 CPU、1.5 GiB 内存、384 pids

这是本仓库中边界最清晰的专用执行服务之一。Dockerfile 中仍有“Phase 0 先 root”的旧注释，但当前 Compose 已明确使用 UID 1001，注释不是运行事实。

### 4.3 已知缺口

- watcher 永久跳过已有 .processing 的目录。如果容器在编译中崩溃，残留任务没有 lease、超时回收或重试协议。
- heartbeat 只能证明 watcher 循环存活，不能证明某个任务不会永久卡在 .processing。
- 文件协议缺少显式版本字段；Backend 与镜像升级需靠兼容约定。
- 任务目录的保留、失败证据和清理时限没有形成可审计 SLA。

源路径：

- prism_tex/Dockerfile
- prism_tex/entrypoint.sh
- prism_tex/texmf.cnf
- docker-compose.yml
- docker-compose.prod.yml

## 5. 功能广场冷启动数据

### 5.1 当前数据集

feature-tools-coldstart/feature-tools.json 当前有 201 条记录，201 个同名 slug 图片文件与记录一一对应。

| 指标 | 当前值 |
| --- | ---: |
| 总记录 | 201 |
| published | 201 |
| featured | 0 |
| needs_review | 54 |
| 缺失 official_url | 35 |
| 空 logo 字段 | 201 |
| download 或 both | 193 |
| 含 pan.baidu.com 链接 | 193 |

分类：

| 分类 | 数量 |
| --- | ---: |
| general-utility | 51 |
| chem-materials | 25 |
| stats-econometrics | 25 |
| bio-life | 19 |
| viz-plotting | 16 |
| engineering-cad | 15 |
| lit-manage-pdf | 15 |
| math-numerical | 15 |
| medical-reference | 7 |
| writing-latex | 7 |
| journal-metrics | 3 |
| other | 3 |

价格模型：

| 模型 | 数量 |
| --- | ---: |
| free | 99 |
| paid | 58 |
| freemium | 26 |
| trial | 17 |
| edu | 1 |

访问方式：

| 方式 | 数量 |
| --- | ---: |
| download | 128 |
| both | 65 |
| website | 8 |

数据中存在两个 MATLAB 和两个 ClustalX 展示名。logo 字段为空是当前导入设计：图片由导入流程上传到 MinIO，不代表 201 条都没有本地图片。

### 5.2 导入流程

README 描述的导入过程按 source_topic_id 或 slug 幂等 upsert，并把本地图片上传到 MinIO。仓库还有用于扩展学术工具规模、生成候选和替换图标的脚本，但对应 10k、5,000 条成品包没有出现在当前树中。

feature-tools-coldstart.zip 当前不存在。任何文档或运维步骤如果要求直接上传该 zip，都无法从当前 checkout 执行。

源路径：

- feature-tools-coldstart/feature-tools.json
- feature-tools-coldstart/README.txt
- feature-tools-coldstart/images
- scripts 中 feature tools 生成、导入与图标相关脚本
- docs/feature-plaza

### 5.3 发布与治理风险

最严重的具体条目是 slug chemcad52cracked。它发布了 ChemCAD 5.2 的百度网盘破解下载，描述本身也提到破解、法律和安全风险，但 data_quality.needs_review 仍为 false，且全数据集统一为 published。

在进入公共功能广场前，至少需要：

1. 立即取消 cracked、破解、非授权镜像和来源不明下载的 published 状态。
2. 对 193 个网盘链接建立许可证、权利来源、文件哈希、恶意软件扫描、最后验证时间和下架机制。
3. 把 needs_review 作为发布门禁，而不是信息性标签。
4. 对重复名称、版本过旧、官方 URL 缺失和下载链接失效做持续检查。
5. 记录图标来源与许可证。README 所称“真实图标”和“fallback 图标”的比例没有写入记录，无法机械验证。
6. 由服务端导入器拒绝明显的 cracked、keygen、破解器等高风险模式，不能只依赖人工清单。

## 6. Compose、Nginx 与运行体系

### 6.1 服务拓扑

开发和生产 Compose 都定义 11 个服务：

| 服务 | 职责 | 关键持久化或限制 |
| --- | --- | --- |
| mysql | 主业务数据库 | 内部网络，约 2 GiB 限额 |
| minio | 用户文件与对象存储 | 内部网络，约 512 MiB 限额 |
| redis | 缓存与可淘汰状态 | AOF everysec，maxmemory 512 MiB，allkeys-lru |
| redis-persist | 不可淘汰的正确性状态 | AOF，maxmemory 128 MiB，noeviction |
| schema-sync | 启动迁移 | 按文件顺序执行 migrations |
| backend | API、身份、配额、journal 与产品编排 | 约 1 GiB |
| agent | Agent Executor | 生产 2 CPU、4 GiB、512 pids |
| prism-tex | 隔离 TeX 编译 | 2 CPU、1.5 GiB、384 pids、无网络 |
| frontend-user | 用户 Web 构建与 SSR 边界 | 开发约 128 MiB，生产约 256 MiB |
| umami | 分析事件接收 | 约 512 MiB |
| nginx | 唯一仓库内入口与静态缓存 | 约 256 MiB，1 GiB static cache |

所有主要容器使用 json-file 日志，单文件 10 MiB、保留 7 个，并挂载时区文件。nginx-static-cache 是命名卷。

### 6.2 网络边界

- scholar-network：数据和应用网络。
- scholar-agent-net：internal 网络，只连接 Backend 与 Agent。
- egress-net：允许 Agent 主动访问互联网。
- Agent 不连接数据网络，因此不能直接访问 MySQL、Redis 或 MinIO。
- 生产 scholar-network 固定为 /24，并给 Backend、Frontend 和 Umami 固定地址，避免 Nginx 长期持有已失效的容器 DNS 地址。

开发 Nginx 默认只绑定 127.0.0.1:5411，可配置。生产也只绑定 127.0.0.1，由宿主 Caddy 终止 TLS。Caddy 配置不在仓库中，所以本仓库不能独立证明证书、HSTS、TLS 版本或公网反代规则。

### 6.3 Nginx 路由与保护

当前 Nginx 提供：

- API 通用限流约 10 req/s、burst 50。
- 分析类接口约 5 req/s、burst 30。
- 最大请求体 50 MiB。
- WebSocket：通知 /api/v1/ws，以及 smart-search、prism、claw、boltslides、sci_draw、stat_lab 的功能 WS。
- SSE：stream、upload-and-resolve、export-pptx 等长连接路径，最长约 900 秒并关闭代理缓冲。
- 拒绝公网访问 /api/v1/internal/*。
- Minicod webhook 使用独立高 burst 限流。
- Minicod 图片代理、上传文件缓存、sitemap、robots、IndexNow、品牌资源和 hashed 静态资源缓存。
- Umami 只暴露跟踪脚本与事件发送，不暴露管理 UI。
- 旧 URL 重定向，包括 search-results、advanced-search、journals、latex-writer、assistant、chat、peer-review-v2、features/latex-writer、qa、skills。
- 私有 SPA 路径统一 noindex；公开页走 SSR；未知公开页面由 Backend 返回真实 404。
- 移动端访问根路径时重定向到 /m/feed。

响应头覆盖 nosniff、SAMEORIGIN、Referrer-Policy 和 Permissions-Policy，但仓库内没有 CSP。HSTS 应由外层 Caddy 提供，无法在此处验证。real_ip 信任 172.16.0.0/12 和本机，应与实际代理拓扑一起复核，防止非预期内网客户端伪造转发头。

docs/nginx-legacy-redirects.conf 不会被当前 Nginx 自动加载，而且与实际配置不一致。它包含当前主配置没有的 paper、author 到首页及 admin 重定向，只能视为旧的手工片段，不能直接复制到生产。

源路径：

- nginx/nginx.conf
- nginx/conf.d
- docs/nginx-legacy-redirects.conf
- docker-compose.yml
- docker-compose.prod.yml

### 6.4 环境配置

.env.example 覆盖数据库、MinIO、Redis、内部 token、七个 Agent 功能、期刊数据、Prism 构建期开关、Umami、支付测试模式、SEO 和并发参数。

需要特别注意：

- CORS_ALLOWED_ORIGINS 默认是 *，注释要求生产改值，但没有 production fail-fast。
- AGENT_INTERNAL_TOKEN 生产必须设置；Agent 生产模式会拒绝空 token。
- EXECUTOR_ENABLED_FEATURES 应保持七功能集合，executorFeatures.test.ts 对此有回归检查。
- Provider 本地缓存不是持久规范数据，不应只备份 agent 容器文件。
- 小程序真实设备固定使用 www.scholay.com，环境变更需同步审核域名和微信后台配置。

### 6.5 数据库迁移

docker/mysql/migrations 当前有 128 个顶层 SQL 文件，编号范围 0000 至 0126，并存在两个 0011 文件：

- 0011_feature_tools_fulltext.sql
- 0011_prism_edits.sql

schema-sync 每次启动按词法顺序遍历全部迁移，没有独立的 applied migration ledger，依赖 SQL 自身幂等。archive 子目录不会重放。

风险：

- 重复编号让人误以为迁移序号全局唯一。
- 每次重放全部文件使“已执行到哪一版”难以独立审计。
- 新迁移如果不是严格幂等，会把问题推迟到重启时暴露。
- 应增加迁移清单、哈希、执行记录和失败恢复策略。

### 6.6 构建、发布与运维脚本

#### build-and-push

构建脚本为 Backend、Agent、Frontend、Prism 构建 linux/amd64 镜像，推送版本标签和 latest，并更新 VERSION。它硬编码 ACR 主机、命名空间和用户名，使用交互式登录。当前没有镜像签名、SBOM、漏洞扫描或 provenance attestation。

#### deploy

生产部署使用显式镜像标签并本地构建 Nginx。默认执行完整 down/up，注释预估 1 至 3 分钟停机；也提供 rolling 选项。脚本不会自行 git pull。它仍创建和 chown data/agent，并把它描述成活跃的 .claude 目录；当前该路径只是 Backend 挂载的历史归档，现用会话目录是 data/agent-sessions。

#### backup 与 restore

backup-all 会备份 MySQL、data/agent、data/agent-sessions 和 MinIO。脚本说明仍声称所有对话转录位于旧 JSONL 目录，这已经不成立。

当前缺失或不足：

- 未覆盖 Umami 数据。
- 未明确备份 redis-persist 的正确性数据。
- Redis AOF、MySQL dump、MinIO 与会话目录之间不是统一时间点快照。
- 没有默认校验和、加密、异地副本、保留验证或恢复演练。
- cron 安装是手工步骤，deploy 不检查备份是否存在或最近一次是否成功。
- RESTORE 文档仍沿用旧 Agent .claude 和 JSONL 叙事。

#### 日志与测试辅助脚本

- export-logs 仍引用已移除的 frontend_admin，并遗漏 agent、prism-tex、minio、redis-persist、umami、schema-sync。
- test-seed-data 会修改 subscription_plans，并读取不存在的 /docker-entrypoint-initdb.d/migrations/0003_initial_defaults.sql；当前不可按文档执行，也不应在非隔离数据库运行。
- pre-push 只执行设计 guard 和有限 evidence/cross-package 检查。Hook 需要手工启用，检查工具返回 2 时会按“未运行”继续 push，git push --no-verify 也不会留下仓库内审计记录。
- reviewer 和 writing skill lint、Backend conventions 没有接入当前 hook。
- 未发现 GitHub Actions、GitLab CI 或其他仓库级持续集成配置。

其他运维脚本覆盖内存监控、AI crawler 统计、artifact baseline、bubblewrap 宿主设置、资讯 seed、文献库分享测试、迁移与 schema fingerprint、功能广场数据生成等；它们是专项工具，不等于统一发布门禁。

源路径：

- scripts/build-and-push.sh
- scripts/deploy.sh
- scripts/backup-all.sh
- scripts/RESTORE.md
- scripts/export-logs.sh
- scripts/test-seed-data.sh
- scripts/install-backup-cron.sh
- scripts/backup-cron.sh
- scripts/check-design-system.sh
- scripts/check-evidence-mirror.sh
- .githooks/pre-push
- .githooks/README.md
- docker/mysql/migrations
- .env.example

## 7. 设计资料与交互规范

### 7.1 当前权威关系

根目录 CLAUDE.md 指定：

- 上游设计源：/Users/youngp/Downloads/scholay设计源文件/dev.pen
- Web 运行时 token 真相源：frontend-user/src/styles/globals.css
- 小程序镜像：miniprogram/app.wxss
- Agent 幻灯片模板镜像：相关 bolt-slides 资源

上游 dev.pen 位于个人目录，不在 Git 仓库。新 checkout 无法复现该设计源，也不能审计它与当前提交的版本关系。仓库内 .pen、规范文档和运行时 CSS 只能组合提供旁证。

### 7.2 仓库内 Pencil 资料

| 文件 | 版本与规模 | 覆盖 |
| --- | --- | --- |
| design/pencil/scholay-global.pen | v2.13，97 个顶层 frame | 首页、搜索、文献库、评审、Prism、工具、设置等桌面/全局界面 |
| design/pencil/scholay-mobile.pen | v2.13，26 个顶层 frame | 基础、分享、Claw、工具、评审、文献库、Feed、资讯等移动界面 |
| design/pencil/scholay-form_loading.pen | v2.11，17 个顶层 frame | 主要是评审表单及加载状态 |

这些文件是设计参考，不是路由或运行能力真相源。是否已实现仍要回到当前代码验证。

### 7.3 Remotion 交互参考

design/remotion 下有 claw-agent-flow、peer-review-flow、prism-writing-flow 的 TSX/source 和约 5 秒、960×540、20 fps GIF。README 说明当时本机没有 Remotion 或 ffmpeg，GIF 是 Pillow fallback 生成。它们用于解释交互，不参与产品运行，也不证明实际页面与动效一致。

### 7.4 文档新鲜度

| 文档或目录 | 判定 | 主要问题 |
| --- | --- | --- |
| docs/pen-design-spec-2026-08.md | 当前参考，含历史段落 | 2026-08-08 Google Sans 章节已被 2026-08-11 规则覆盖；最终以 globals.css 为准 |
| docs/figma-design-spec-2026-07.md | 历史参考 | 早于当前 Pencil 和运行时 token |
| docs/design-audit、migration ledger、render audit 的 2026-07 文档 | 历史审计 | 当时路由集合和工作树状态与当前不同；render audit 还明确记录过 304 个未提交文件 |
| docs/interaction-spec | 2026-05-30 快照 | 混合当时开发环境和仓库状态，多处与现状冲突 |
| docs/remaining-gaps-2026-08-02.md | 历史 backlog | 仍基于旧 Run、fork 架构 |
| docs/research | 研究、方案和审计证据 | 不应当作当前功能承诺 |

interaction-spec 的具体陈旧项：

- 06 peer-review 记录了私有开发 IP 和完整流程，而当时仓库页面仍是 ComingSoon；不能据此判断当前生产状态。
- 07 把 Prism 描述为未开发或静态页面，与当前功能体系不符。
- 08 把工具广场和 Claw 描述为 ComingSoon 或规格漂移，已落后于当前实现。
- 05 把文献库描述为 mock。
- 03 引用了不存在的 docs/testing/smart-search-functional-test-report-2026-05-30.md。
- overview 使用 /journals、/journals/:id 等路径，与当前 /journals/search、/journal/:id 命名不一致。

### 7.5 其他明确陈旧的文档

| 文件 | 陈旧内容 |
| --- | --- |
| agent/README.md | 仍称只有 smart_search 和 claw 切到 Executor，prism/peerreview 延后，fork 共存，P6 待完成；当前已是七功能 Executor |
| agent/src/server/http.ts 文件头说明 | 仍概括为多数路由 501，但实际已有 Provider、会话、工作区、Agent 定义、渲染和导出接口 |
| miniprogram/README.md | 仍称 P0 骨架，列出不存在的 pages/index、pages/profile，并把搜索、详情和 mp-html 当下一步；当前已有 15 页和自定义渲染 |
| miniprogram/README.md 环境说明 | 仍出现 tourist appid 和 api.scholay.com；当前 AppID 与生产域名不同 |
| docs/feature-plaza | 在 202、201 条之间摇摆，needs_review 和图标比例与当前数据不符，引用旧管理端口 5455，并声称 feature-tools-coldstart.zip 已存在 |
| docs/nginx-legacy-redirects.conf | 未加载且与实际 Nginx 规则不同 |
| .githooks/README.md | 对 pre-push evidence 测试范围的描述少于当前脚本实际内容 |
| scripts/backup-all.sh 与 RESTORE.md | 把旧 Agent JSONL 和 .claude 目录当作当前转录真相源 |
| scripts/export-logs.sh | 引用已移除 frontend_admin，漏掉多个当前服务 |
| prism_tex/Dockerfile 注释 | 仍称早期阶段使用 root，而 Compose 当前以 UID 1001 运行 |
| scripts/lint-writing-skills.py | 仍使用 8,000 字符上限，运行时已是 12,000 |

## 8. Coverage Gaps

下面的优先级表示“进入公开生产和成为 Wiki 事实源之前”的建议，不等同于现有团队排期。

### P0：发布或数据安全风险

| 缺口 | 证据 | 建议验收条件 |
| --- | --- | --- |
| 功能广场发布非授权或破解下载 | 201 条全 published；193 条百度网盘；chemcad52cracked 未标 needs_review | 高风险条目下架；每个下载有权利来源、哈希、扫描和复核记录；发布器硬门禁 |
| Bash 可把工作区内容发送到任意公网 | Agent 连接 egress-net；Bash 使用 share-net；无默认 allowlist 或强制代理 | 明确网络授权模型；按 Agent/工具限制域名；记录出站目的与批准；敏感任务可强制 net=none |
| 备份恢复不覆盖当前完整状态 | 旧 JSONL 叙事；Umami、redis-persist 等缺口；无一致快照与恢复演练 | 定义 RPO/RTO；全组件备份矩阵；校验、加密、异地保存；自动恢复演练有证据 |

### P1：可靠性、合规和质量门禁

| 缺口 | 影响 | 建议验收条件 |
| --- | --- | --- |
| Agent 健康检查不覆盖沙箱和导出 | 进程健康但 Bash、Pandoc、Chromium 可能不可用 | readiness 包含 bubblewrap、只读探针和关键依赖；deploy 阻断失败实例 |
| ReadDocument 转换器不在 bwrap 外层隔离 | 恶意文档可能攻击解析器并看到共享会话卷 | 独立低权限转换服务或每任务 mount namespace；文件类型和资源限制；恶意样本测试 |
| 小程序内容安全 fail-open 且只检查前 2,000 字符 | 后半段或附件违规内容可能展示 | 服务端全量分块检查；错误闭合或待审；附件同策略；可审计处置 |
| 小程序没有测试和微信 CI | 无法从提交证明编译、核心流程和审核包可用 | 最小单测、请求层测试、WS 状态机测试、开发者工具 CI 构建与冒烟 |
| 统计 numcheck 和 claims audit 仅观察 | 数值或事实问题只记录、不纠正 | 对高风险输出启用 enforce 或二次复核；明确失败体验 |
| 研究主题切换复用旧证据账本 | 新问题可能被旧证据错误约束 | 检测主题变化并新建或清空 ledger；加入多轮回归测试 |
| Prism TeX 残留 .processing 不恢复 | 容器崩溃可造成永久挂起任务 | lease、超时 reclaim、幂等重试和死信状态 |
| 技能总上下文无组合测试 | 新增技能可能静默截断 | 从 Compose 解析真实 addDir，断言顺序、总长度和必需技能存在 |
| Hook 可选且无仓库 CI | 设计、权限、技能和测试回归可绕过 | 服务端 CI 必跑；区分失败和工具缺失；保护主分支 |
| CORS 默认 *、CSP 缺失、TLS 配置外置 | 安全基线无法由仓库复现 | 生产配置 fail-fast；版本化 Caddy/TLS 基线或自动外部验证；制定 CSP |

### P2：产品覆盖、可维护性和可复现性

| 缺口 | 影响 | 建议验收条件 |
| --- | --- | --- |
| 旧 Agent HTTP 家族仍为 501，文档却混合新旧接口 | 接入者容易调用错误协议 | 发布正式 API 清单；删除或明确 deprecated 文档与路由 |
| 小程序与 Web 功能面不对等 | 移动端无法使用多个研究能力 | 形成明确 parity matrix；决定原生实现、Web 跳转或明确不支持 |
| 小程序无 staging，真机预览直连生产 | 测试行为污染生产数据 | 增加可审核的 staging 域名和构建环境选择 |
| sitemap 允许全部小程序页面 | 账户或账单页面可能被不必要索引 | 按微信索引策略逐页审查 |
| Feed 筛选和购买支付仍缺失 | UI 暗示能力大于实际能力 | 隐藏或清晰标注；实现后增加端到端验证 |
| 数据库迁移重复编号且无 applied ledger | 迁移可追踪性弱 | 唯一 ID、校验和、执行账本和回滚说明 |
| 镜像发布没有签名、SBOM 和扫描 | 无法证明供应链完整性 | CI 生成 SBOM、扫描、签名并在 deploy 验证 |
| 上游 dev.pen 不在仓库 | 新 checkout 无法复现设计基线 | 将版本化源文件或不可变导出纳入受控存储，并记录内容哈希 |
| 多份历史文档没有显著状态标签 | Wiki 容易把旧事实再传播 | 增加 historical/deprecated 标头和替代链接；建立文档新鲜度检查 |
| feature coldstart zip 缺失且 README 数量失真 | 运维无法按说明导入 | 生成可校验 artifact 或删除 zip 步骤；从 JSON 自动生成统计 |
| 日志导出清单落后于 Compose | 故障证据不完整 | 从 Compose 动态枚举服务；覆盖 Agent、TeX、存储和迁移日志 |

## 9. Wiki 建议的事实拆分

为避免把不同层次混在一起，后续 Wiki 可将本文拆成以下稳定条目：

1. Agent Executor 能力与 API：只记录当前接口、会话真相源和兼容策略。
2. Agent 工具安全模型：文件边界、Bash、网络、权限、bubblewrap、转换器。
3. Evidence Kernel：路由、预取、账本、退出门与已知主题切换限制。
4. Stat Lab 方法目录：只列方法卡真实覆盖，不用依赖包推断能力。
5. Skill Catalog：从文件自动生成 109 项清单，并单独记录装载方式。
6. 微信小程序页面与能力矩阵：页面、登录要求、API、Web parity 和审核环境。
7. Prism TeX 文件协议：请求状态机、隔离、超时、恢复。
8. 功能广场数据治理：来源、许可证、审核、扫描、发布和下架。
9. 运行拓扑：11 服务、三网络、持久卷、健康检查和资源限制。
10. 发布、备份与恢复：镜像、迁移、RPO/RTO、恢复演练。
11. 设计真相源：外部 Pen、仓库 Pen、runtime token 和历史规范的优先级。

每个条目都应包含“适用提交或版本”“最后验证日期”“代码源路径”“负责人”“已知限制”，避免再次把日期型审计当成永久事实。

## 10. 本次核验边界

本次结论来自当前 checkout 的静态代码、配置、数据统计和有限本地测试。已核对：

- Git 分支与提交基线。
- Agent 路由、工具注册、权限、证据和统计实现。
- Docker Compose 开发与生产服务、网络和挂载。
- 109 个 SKILL.md 的目录清单与文件长度。
- 小程序 app.json、页面、服务、WebSocket、环境与工程配置。
- TeX watcher、镜像和 Compose 隔离配置。
- feature-tools.json 的 201 条记录及图片 slug 对应关系。
- Nginx、迁移和主要运维脚本。
- 仓库 Pencil、Remotion、设计规范和 interaction specs。

未执行生产部署、微信审核构建、真实模型回合、真实 Minicod 检索、TeX 恶意样本测试、数据库恢复演练、Caddy/TLS 检查或对象存储扫描。因此本文对这些外部运行状态不作“已通过”结论。
