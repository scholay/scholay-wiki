import type { WikiArticle } from "../types";

export const infrastructureArticles: WikiArticle[] = [
  {
    slug: "agent-executor-internal-api",
    title: "Agent Executor 内部接口与状态归属",
    summary:
      "独立 Executor 负责模型回合和工作区工具，Go 后端的 durable journal 才是可恢复对话的规范真相源。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["开发者", "平台管理员", "运维人员"],
    aliases: ["Agent Executor", "内部 Agent API", "Durable Journal"],
    sourcePaths: [
      "agent/src/server/http.ts",
      "agent/src/server/ws.ts",
      "agent/src/server/sessions.ts",
      "backend/internal/agentbridge",
      "docker/mysql/migrations/0046_agent_turn_journal_fields.sql",
      "docker-compose.prod.yml",
    ],
    related: ["agent-runtime", "agent-runs"],
    sections: [
      {
        id: "ownership",
        title: "状态归属",
        markdown: `Executor 是当前唯一的 Agent 模型执行后端，负责模型流、工具调用、技能、临时工作区和上下文压缩。Go 后端保存用户与 feature 的会话映射，并通过 durable journal 保存可恢复历史；Executor 进程内的消息视图和磁盘工作区都不是产品唯一真相源。旧 cc-haha、fork 进程和 JSONL transcript 已退出主链路，data/agent 仅是历史迁移归档。`,
      },
      {
        id: "http",
        title: "内部 HTTP 面",
        markdown: `除 GET /health 外，接口要求 Bearer token。现行接口包括同步和流式补全、数学与 Mermaid 渲染、Provider 增删改和激活、模型与准入查询、会话增删改查、工作区文件与目录、Agent 定义，以及 HTML 幻灯片到 pptx、pptx-native 或 pdf 的导出。GET /api/sessions/:id/messages 只返回内存视图；遗留 chat、chat-status、patch、list 等未实现路由由兜底处理返回 501。`,
      },
      {
        id: "websocket",
        title: "回合 WebSocket",
        markdown: `入站协议支持 user_message、stop_generation、permission_response、set_runtime_config、seed_history、prewarm_session、extract_memory 与 ping。出站帧覆盖连接、模型流、工具过程、权限请求、busy/error、标题、记忆与上下文用量、回合完成和 resync。一个会话连接同一时间只执行一个回合；重连时由后端从 durable journal 重新播种历史，而不是依赖 Executor 保持永久内存。`,
      },
      {
        id: "lifecycle",
        title: "会话与 Provider 生命周期",
        markdown: `Compose 把会话工作区放在 /home/bun/sessions，并持久化到 data/agent-sessions。进程内会话默认空闲 30 分钟后清扫、最多 200 个；磁盘工作区默认保留 30 天。Provider 支持 main、haiku、sonnet、opus 档位和 Anthropic/OpenAI 两种协议格式；本地 providers.json 只是 best-effort 缓存，数据库配置由后端重新推送才是规范来源。`,
      },
    ],
  },
  {
    slug: "agent-tool-and-sandbox-boundary",
    title: "Agent 工具、沙箱与出站网络边界",
    summary:
      "17 个内建工具共用权限判定和工作区约束；bubblewrap 限制主机访问，但允许 Bash 的档位目前仍可直接访问公网。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["开发者", "安全人员", "平台管理员"],
    aliases: ["Agent Tools", "bubblewrap", "Bash 沙箱", "Executor Egress"],
    sourcePaths: [
      "agent/src/tools/registry.ts",
      "agent/src/tools/permissionParity.test.ts",
      "agent/src/server/workspace.ts",
      "agent/src/sandbox/bwrap.ts",
      "agent/src/sandbox/confine.ts",
      "agent/src/sandbox/egress.ts",
      "agent/src/sandbox/childEnv.ts",
      "agent/Dockerfile",
      "scripts/enable-bwrap-host.sh",
    ],
    related: ["agent-runtime", "service-policies"],
    sections: [
      {
        id: "catalog",
        title: "17 个内建工具",
        markdown: `当前注册表固定包含 **Read、Write、Edit、Glob、Grep、Bash、ReadDocument、ExportDocument、BuildDeck、TodayDate、Skill、AskUserQuestion、EvidenceGet、SubmitAnswer、DeclareInsufficient、StatRun、StatReport**。Minicod MCP 工具以 mcp__minicod__ 前缀动态加入。模型是否看得见工具和运行时是否允许执行使用同一个权限函数，denylist 优先；Bash 只有在目标 Agent 档位明确允许时才可见。`,
      },
      {
        id: "workspace",
        title: "文件和文档边界",
        markdown: `文件工具进行规范化路径、realpath 和符号链接逃逸检查。单文件默认上限 64 MiB，单会话 1 GiB、2,000 个文件。ReadDocument 支持 PDF、DOCX、XLSX、PPTX、ODT、RTF、EPUB、HTML、Markdown 和 TeX，最大提取约 400,000 字符，不提供 OCR，也不承诺旧 DOC、XLS、PPT、ODS 或 ODP。ExportDocument 只写入 out，BuildDeck 生成单文件 HTML 后再导出。`,
      },
      {
        id: "bubblewrap",
        title: "bubblewrap 隔离",
        markdown: `高风险执行使用 bubblewrap 的 unshare-all、无 proc、tmpfs、最小只读挂载和单一可写工作区；环境变量会被清空后按白名单重建，模型供应商密钥不会进入 Bash。生产缺少可用 bubblewrap 时会拒绝 Bash 和导出，并禁止使用显式不安全覆盖。宿主仍需运行 AppArmor user namespace 配置脚本；普通 /health 不证明 bwrap、Pandoc 或 Chromium 可用。`,
      },
      {
        id: "egress",
        title: "出站网络风险",
        markdown: `允许 Bash 的回合使用 share-net，Agent 又连接可直接出网的 egress-net；仓库没有默认强制代理、域名 allowlist 或逐工具网络策略。因此“密钥不注入 shell”不等于“用户文件不会外传”：命令仍可主动把工作区内容发送到任意公网地址。生产应补充网络授权、目的域限制、出站审计和可强制 net=none 的敏感任务档位。`,
      },
      {
        id: "parser-risk",
        title: "解析器不是同一沙箱",
        markdown: `ReadDocument 和 extract-head 使用固定 argv 与受限路径，但 pdftotext、openpyxl 等外层转换进程不在 bubblewrap 内；Pandoc 只依赖自身 sandbox。恶意文档解析风险应通过独立低权限转换服务、每任务挂载、资源限制和恶意样本回归测试处理，不能把 Bash 的隔离结论直接套用到文档解析器。`,
      },
    ],
  },
  {
    slug: "research-evidence-kernel",
    title: "研究证据内核与声明核验",
    summary:
      "在模型回答前预取文献、建立只读证据账本并要求显式退出，但跨主题路由和声明核验仍属于实验性保障层。",
    category: "research-ai",
    kind: "architecture",
    status: "experimental",
    audience: ["研究者", "开发者", "AI 质量人员"],
    aliases: ["Evidence Kernel", "证据账本", "Claims Audit"],
    sourcePaths: [
      "agent/src/policy/researchTurn.ts",
      "agent/src/evidence/ledger.ts",
      "agent/src/evidence/prefetch.ts",
      "agent/src/evidence/deliver.ts",
      "agent/src/turn/turnLoop.ts",
      "agent/src/turn/verifyClaims.ts",
      "scripts/check-evidence-mirror.sh",
    ],
    related: ["smart-search", "agent-runtime", "paper"],
    sections: [
      {
        id: "flow",
        title: "证据回合流程",
        markdown: `确定性路由器把纯检索表面或文献意图送入 evidence phase。Executor 在第一次模型调用前向 Minicod 做预取，默认 semantic source、limit 5、超时 8 秒；失败不阻断回合。成功结果进入只读账本并获得 E1、E2 等 ID，模型通过 EvidenceGet 读取元数据、全文或片段，最后必须调用 SubmitAnswer 或 DeclareInsufficient 退出。`,
      },
      {
        id: "trust",
        title: "它能保证什么",
        markdown: `账本可以让引用对象和工具证据可追踪，也能阻止 evidence phase 仅用普通文本悄悄结束；它不能证明来源本身正确、覆盖完整或支持模型的每一句推断。用户仍应打开原论文核对论点、研究设计和数据。`,
      },
      {
        id: "limitations",
        title: "实验性限制",
        markdown: `账本一旦非空，后续回合当前会进入 ledger_grounded chat，而不会可靠判断用户是否切换了研究主题，旧证据可能污染新问题。claims honesty audit 默认开启但只观察和记录，不会触发纠错回合或阻断回答。由于这两个限制，证据内核已经在现行路径运行，但其“事实保障层”状态仍标为 experimental。`,
      },
    ],
  },
  {
    slug: "stat-lab-method-boundary",
    title: "Stat Lab 方法与复核边界",
    summary:
      "StatKit 当前承诺 14 种检验、4 类假设检查和 15 条决策规则，不应从已安装依赖推断出回归或生存分析能力。",
    category: "research-ai",
    kind: "architecture",
    status: "current",
    audience: ["研究者", "统计方法审核人员", "开发者"],
    aliases: ["StatKit", "统计方法卡", "StatRun", "Numcheck"],
    sourcePaths: [
      "agent/src/tools/statsEngines.ts",
      "agent/src/tools/statReportBundleGate.test.ts",
      "agent/stat-kit/statkit/cards/methods",
      "agent/stat-kit/statkit/cards/checks",
      "agent/stat-kit/statkit/cards/rules",
      "agent/stat-kit/statkit/engines",
      "agent/stat-kit/statkit/verbs",
      "agent-skills/stat-lab-skills",
    ],
    related: ["research-data-analysis", "agent-tool-and-sandbox-boundary"],
    sections: [
      {
        id: "methods",
        title: "真实方法目录",
        markdown: `两组方法包括 student_t、welch_t、mann_whitney、paired_t、wilcoxon；多组方法包括 oneway_anova、welch_anova、kruskal_wallis；分类资料包括 chi2_pearson、chi2_yates、fisher_exact、chi2_rxc、mcnemar_exact、cochran_armitage。假设检查为 shapiro_by_group、levene_center_median、shapiro_diff、expected_frequencies，并有 D-01 至 D-15 决策规则。`,
      },
      {
        id: "workflow",
        title: "计算与报告",
        markdown: `StatRun 按方法卡读取数据、检查假设并把可复查 bundle 写入 analysis；StatReport 基于 bundle 生成 cn-core 或 apa 风格的结构化报告。统计工具写 analysis 使用专门权限，普通工具不能把证据和分析保留区当成任意工作目录。`,
      },
      {
        id: "limits",
        title: "能力和门禁边界",
        markdown: `镜像虽然安装 statsmodels、scikit-learn、lifelines 等依赖，当前方法卡并未承诺回归、混合模型、时间序列或生存分析。numcheck 默认是 observe，只有 STATKIT_NUMCHECK_ENFORCE=1 才硬阻断；现行 Compose 和 env 示例没有启用该开关。报告仍需研究者复核数据编码、假设、效应量和多重比较。`,
      },
    ],
  },
  {
    slug: "agent-skill-catalog-and-loading",
    title: "Agent 技能目录与装载上限",
    summary:
      "109 个 SKILL.md 分为 always-on 和按需 guide；单文件、菜单和总上下文上限共同决定模型实际能看到什么。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["技能作者", "开发者", "AI 质量人员"],
    aliases: ["Agent Skills", "SKILL.md", "技能装载器", "Guide Loading"],
    sourcePaths: [
      "agent/src/skills/loader.ts",
      "agent/src/skills/skillSize.test.ts",
      "agent/src/server/composeVolumeParity.test.ts",
      "agent-skills/claw-add/CLAUDE.md",
      "agent-skills/claw-add/guides",
      "agent-skills/prism-lenses",
      "agent-skills/prism-personas",
      "agent-skills/prism-skills",
      "agent-skills/reviewer-lenses",
      "agent-skills/reviewer-skills",
      "agent-skills/sci-draw-skills",
      "agent-skills/smart-search-skills",
      "agent-skills/stat-lab-skills",
      "agent-skills/bolt-slides-add",
    ],
    related: ["community-skills", "agent-runtime"],
    sections: [
      {
        id: "inventory",
        title: "109 个技能的分组",
        markdown: `当前目录由 **bolt-slides-add 1 个、claw-add guides 6 个、prism-lenses 31 个、prism-personas 14 个、prism-skills 4 个、reviewer-lenses 13 个、reviewer-skills 33 个、sci-draw-skills 3 个、smart-search-skills 2 个、stat-lab-skills 2 个**组成，总计 109 个 SKILL.md。

Claw guides 为 citation-audit、data-figures、methods-stats、paper-explain、rebuttal、topic-selection。Prism 核心为 library-reference、prism-citation-grounding、prism-edit-discipline、prism-writing-core；31 个写作镜头覆盖论证、清晰度、数据结果、文献综述、数学叙事、段落结构、翻译、投稿包，以及主张—证据、伦理、复现、统计语言等研究诚信面。Reviewer 集合由 reviewer-roster、26 个领域角色和 integrity、methodology、novelty、reproducibility、theory、writing 等通用评审角色组成。`,
      },
      {
        id: "complete-index",
        title: "完整技能名称索引",
        markdown: `以下名称按当前目录逐项列出，既用于 Wiki 搜索，也用于防止新增、删除或改名后清单静默漂移。

- **bolt-slides-add（1）**：slides
- **claw-add（6）**：citation-audit、data-figures、methods-stats、paper-explain、rebuttal、topic-selection
- **prism-lenses（31）**：wl-argument、wl-blank-page、wl-clarity、wl-data-results、wl-de-slop、wl-eal-chinglish、wl-expand-compress、wl-figure-narrative、wl-lit-synthesis、wl-math-narrative、wl-paragraph-flow、wl-related-work-structure、wl-revision-strategy、wl-rl-claim-calibration、wl-rl-claim-evidence、wl-rl-ethics-irb、wl-rl-eval-contamination、wl-rl-figure-integrity、wl-rl-limitations-scope、wl-rl-preregistration-harking、wl-rl-related-work-fairness、wl-rl-reporting、wl-rl-reproducibility、wl-rl-stats-language、wl-signposting、wl-structure、wl-submission-pack、wl-title-abstract、wl-translate、wl-venue-adapt、wl-voice-register
- **prism-personas（14）**：pw-biomedical-empirical、pw-cs-systems-ml、pw-doc-cover-letter、pw-doc-grant、pw-doc-rebuttal、pw-doc-registered-report、pw-doc-thesis-chapter、pw-engineering-systems、pw-experimental-stem、pw-humanities-argumentative、pw-math-proof-theory、pw-qualitative-social、pw-quant-social-psych-econ、pw-systematic-review
- **prism-skills（4）**：library-reference、prism-citation-grounding、prism-edit-discipline、prism-writing-core
- **reviewer-lenses（13）**：lens-causal-inference、lens-data-code-availability、lens-ethics-irb、lens-eval-contamination、lens-external-validity、lens-fairness-bias、lens-figure-integrity、lens-multiple-comparisons、lens-preregistration-harking、lens-related-work-fairness、lens-reporting-standards、lens-stat-reporting、lens-statistics-rigor
- **reviewer-skills（33）**：reviewer-roster、rv-domain-astronomy、rv-domain-biomed、rv-domain-biostat、rv-domain-cheminformatics、rv-domain-clinical-ai、rv-domain-earth-climate、rv-domain-ecology-evobio、rv-domain-econometrics、rv-domain-economics-finance、rv-domain-epidemiology、rv-domain-evidence-synthesis、rv-domain-genomics、rv-domain-hci-user-study、rv-domain-materials、rv-domain-ml、rv-domain-neuroscience、rv-domain-nlp-llm、rv-domain-physics-sim、rv-domain-proteomics、rv-domain-psychology-behavioral、rv-domain-pure-math、rv-domain-quantum、rv-domain-rct、rv-domain-singlecell、rv-domain-social-science、rv-domain-software-systems-security、rv-integrity、rv-methodology、rv-novelty、rv-reproducibility、rv-theory、rv-writing
- **sci-draw-skills（3）**：charts、figures、molecules
- **smart-search-skills（2）**：library-reference、minicod-search-strategy
- **stat-lab-skills（2）**：interpret、workbench`,
      },
      {
        id: "loading",
        title: "Always-on 与按需加载",
        markdown: `Loader 会直接读取每个 addDir 的 CLAUDE.md 和 .claude/skills/*/SKILL.md，组成 always-on 上下文；guides/*/SKILL.md 只先进入短菜单，模型调用 Skill 后才加载正文。平台市场技能每个会话最多启用 5 个，每份输入最多 20,000 字节；加入会话 guide 后仍然受原有工具权限约束。`,
      },
      {
        id: "limits",
        title: "上下文限制",
        markdown: `单个 always-on 技能最多 12,000 字符，always-on 总量最多 40,000 字符，guide 菜单最多 2,500 字符，Skill 懒加载正文最多 16,000 字符，addDir 缓存最多 256 项。本次 109 个文件均低于单文件上限，但没有从 Compose 解析真实组合并断言 40,000 总上限的测试，未来新增目录可能让靠后的技能静默截断。`,
      },
      {
        id: "mounting",
        title: "挂载与选择性注入",
        markdown: `Claw 根目录、Prism 核心与 guides、Smart Search、Bolt Slides、Sci Draw 和 Stat Lab 以只读目录挂入 Agent。Reviewer 技能、镜头和 Prism personas 由后端按评审人选择性注入；Reviewer 全集远超 40,000 字符，所以没有整体挂成 always-on 是有意设计。Claw 的 CLAUDE.md 还要求结构图优先 Mermaid、科研图可用 SVG、结构文本用 GFM、公式用 KaTeX。`,
      },
      {
        id: "maintenance",
        title: "维护缺口",
        markdown: `scripts/lint-writing-skills.py 仍把单文件限制写成 8,000 字符，与运行时 12,000 不一致；Reviewer 与 writing lint 未接入现行 pre-push，也未发现仓库级 CI。技能目录的 Wiki 清单应从文件自动生成或定期核对，不能长期手工维护数量。`,
      },
    ],
  },
  {
    slug: "mini-program-runtime-and-parity",
    title: "微信小程序页面、端间差异与内容安全",
    summary:
      "原生小程序已有 15 个页面和完整 Claw 会话，但真机直接连接生产，且内容安全与自动化构建仍有明确边界。",
    category: "mobile",
    kind: "architecture",
    status: "current",
    audience: ["微信用户", "产品人员", "开发者", "审核人员"],
    aliases: ["小程序运行面", "Mini Program Pages", "小程序 Parity"],
    sourcePaths: [
      "miniprogram/app.ts",
      "miniprogram/app.json",
      "miniprogram/pages",
      "miniprogram/pages/claw/claw.ts",
      "miniprogram/services/agent-socket.ts",
      "miniprogram/services/request.ts",
      "miniprogram/services/wechatsec.ts",
      "miniprogram/config/env.ts",
      "miniprogram/project.config.json",
      "miniprogram/sitemap.json",
    ],
    related: ["wechat-mini-program", "claw", "feature-tools"],
    sections: [
      {
        id: "pages",
        title: "15 个注册页面",
        markdown: `四个 tab 是 **浏览 Feed、AI Claw、功能、我的**。完整注册路径为：pages/feed/feed、pages/claw/claw、pages/tools/tools、pages/me/me、pages/login/login、pages/search/search、pages/paper/paper、pages/journal/journal、pages/author/author、pages/news/news、pages/tool-detail/tool-detail、pages/library/library、pages/billing/billing、pages/profile-edit/profile-edit、pages/change-password/change-password。应用启动不强制登录，需要账户的动作按需进入认证；app/page 活跃事件以 60 秒门控上报。`,
      },
      {
        id: "claw",
        title: "小程序 Claw",
        markdown: `Claw 支持会话创建、列表、切换、重命名、删除、历史恢复、流式 thinking/Markdown/表格/公式、工具过程、停止、模型选择、图片和文件上传、文献库引用及产物抽屉。AgentSocket 使用一次性 ticket，25 秒 ping、45 秒无帧失活判断、最多 8 次指数退避，并支持 resync；目录类产物仍提示到 Web 端处理。`,
      },
      {
        id: "environment",
        title: "环境与请求规则",
        markdown: `微信开发者工具默认请求 http://localhost:5411；真机、预览、体验和审核统一请求 https://www.scholay.com/api/v1，没有独立 staging。请求层支持 GET、POST、PUT、DELETE，默认超时 20 秒，在 HTTP 401 或 409 时清除登录态；业务码 6010 引导用户查看额度。sitemap 当前允许全部页面，账户与账单路由是否需要索引应逐页复核。`,
      },
      {
        id: "parity",
        title: "与 Web 的能力差异",
        markdown: `小程序覆盖 Feed、论文与期刊检索、详情、文献库、工具目录、Claw、账户和账单，但没有独立 Smart Search、Peer Review、Prism、Bolt Slides、Sci Draw、Stat Lab 页面，也没有购买支付结账和完整内嵌学术 PDF 阅读器。Feed 筛选按钮仍为“即将上线”。这些差异应进入正式 parity matrix，而不是从 Web 功能推断小程序等价支持。`,
      },
      {
        id: "safety",
        title: "内容安全边界",
        markdown: `用户文本在客户端做预检；生成内容后检只取前 2,000 字符，wechatsec 在接口或网络错误时 fail-open，附件媒体尚未纳入统一策略。客户端检查不能替代服务端合规门禁。应在服务端做完整文本分块检查、失败待审或重试、附件同策略和可审计处置。`,
      },
      {
        id: "quality",
        title: "测试与设计镜像",
        markdown: `小程序 package 没有 test、lint、build 或微信上传脚本，仓库也未发现小程序自动化测试与微信 CI，因此当前提交不能仅凭代码证明审核构建可用。app.wxss 是 Web globals.css 的手工 token 镜像，只有全仓设计 guard 能检查跨端差异。`,
      },
    ],
  },
  {
    slug: "prism-tex-file-compiler",
    title: "Prism TeX 文件队列编译器",
    summary:
      "无网络的 TeX 容器通过共享目录和原子状态文件编译 PDF，隔离较强，但崩溃后的 processing 任务缺少回收协议。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["Prism 用户", "开发者", "运维人员"],
    aliases: ["Prism TeX", "LaTeX Compiler", "文件队列"],
    sourcePaths: [
      "prism_tex/Dockerfile",
      "prism_tex/entrypoint.sh",
      "prism_tex/texmf.cnf",
      "docker-compose.prod.yml",
      "backend/internal/prism",
      "backend/internal/prism/compile_notify.go",
      "backend/cmd/server/bootstrap.go",
      "frontend-user/src/features/prism/api/prism.ts",
      "frontend-user/src/shared/hooks/useNotificationSocket.ts",
      "frontend-user/src/shared/lib/compile-events.ts",
    ],
    related: ["prism", "agent-artifacts"],
    sections: [
      {
        id: "protocol",
        title: "文件协议",
        markdown: `Prism TeX 不提供 HTTP 或 WebSocket。后端在共享 /work 中创建任务目录并原子写 .request；watcher 把它移动为 .processing，调用 latexmk，再写 PDF、日志或错误文件，并原子提交 status.json。后端轮询状态、上传交付物并清理目录。main 只能是 basename，engine 只有精确 xelatex 才使用 XeLaTeX，其他值回落为 pdflatex。`,
      },
      {
        id: "limits",
        title: "资源与超时",
        markdown: `默认单任务超时 60 秒、单输出文件最多 100 MiB、最大并发 3、轮询间隔 0.5 秒。watcher 每秒写 heartbeat，30 秒内更新被视为健康。镜像包含 TeX Live、ctex、BibLaTeX 和 TikZ 等，体积约 2 GiB。`,
      },
      {
        id: "isolation",
        title: "隔离",
        markdown: `生产服务 network_mode 为 none，根文件系统只读，/tmp 为 tmpfs，capabilities 全部移除，启用 no-new-privileges，以 UID 1001 运行，并限制为 2 CPU、1.5 GiB 内存、384 pids。shell escape 从命令行、环境和 texmf.cnf 三层关闭，openin_any 与 openout_any 使用 p 策略。`,
      },
      {
        id: "recovery",
        title: "恢复缺口",
        markdown: `watcher 会跳过已经存在的 .processing。若容器在编译中崩溃，任务没有 lease、超时 reclaim、重试或死信状态，可能永久滞留；heartbeat 也只证明循环存活，不证明单任务可恢复。文件协议还没有显式版本字段和失败产物保留 SLA。`,
      },
      {
        id: "status-delivery",
        title: "编译状态怎样到达前端",
        markdown: `编译服务完成数据库状态写入后，CompileNotifier 会 best-effort 向当前用户的通知 WebSocket 推送完整编译对象。前端把 \`compile_status\` 转为页面事件，命中任务后立即刷新；推送失败不回滚数据库，也不改变编译结果，页面仍以轮询兜底。因此 WebSocket 只缩短可见延迟，数据库记录与 PDF 产物才是事实来源。`,
      },
    ],
  },
  {
    slug: "feature-tools-coldstart-governance",
    title: "scholay广场冷启动包与下载治理",
    summary:
      "201 条兼容性冷启动记录用于批量导入工具目录，但大量网盘下载和明确 cracked 条目使其不能未经复核直接发布。",
    category: "history",
    kind: "legacy",
    status: "compatibility",
    audience: ["内容运营", "管理员", "安全与法务人员"],
    aliases: ["Feature Tools Seed", "工具广场种子", "冷启动数据"],
    sourcePaths: [
      "feature-tools-coldstart/feature-tools.json",
      "feature-tools-coldstart/README.txt",
      "feature-tools-coldstart/images",
      "backend/internal/featuretool",
      "docker/mysql/migrations/0121_feature_tools_seo_review.sql",
    ],
    related: ["feature-tools", "service-policies"],
    sections: [
      {
        id: "inventory",
        title: "当前包的精确统计",
        markdown: `feature-tools.json 有 201 条记录和 201 个同 slug 图片；201 条全部为 published，featured 为 0，54 条 needs_review，35 条缺 official_url，201 条 logo 字段为空。访问类型为 download 128、both 65、website 8；前两类共 193 条，全部含 pan.baidu.com。价格模型为 free 99、paid 58、freemium 26、trial 17、edu 1，并存在两个 MATLAB 和两个 ClustalX 展示名。`,
      },
      {
        id: "import",
        title: "兼容性导入用途",
        markdown: `导入器按 source_topic_id 或 slug 幂等 upsert，并把本地图片上传到 MinIO，所以空 logo 字段不代表缺本地图片。该目录适合迁移和冷启动，不是持续更新的权威工具源；仓库当前也没有 README 所称的 feature-tools-coldstart.zip，10k 或 5,000 条扩展包只有生成脚本而没有成品。`,
      },
      {
        id: "p0",
        title: "P0：破解下载",
        markdown: `slug **chemcad52cracked** 发布 ChemCAD 5.2 百度网盘破解下载，说明文本本身提及破解、法律和安全风险，但 data_quality.needs_review 仍为 false。该条目以及其他来源不明、非授权镜像在公开发布前必须下架或转为待审；“写了免责声明”不能替代软件授权和恶意文件检查。`,
      },
      {
        id: "gate",
        title: "应建立的发布门禁",
        markdown: `每个下载至少需要权利来源、许可证、文件哈希、恶意软件扫描、最后验证时间和下架机制；needs_review 必须成为服务端发布门禁。导入器还应拒绝 cracked、keygen、破解器等高风险模式，持续检查失效链接、重复名、过旧版本和缺失官方 URL，并为图标记录来源与许可证。`,
      },
    ],
  },
  {
    slug: "production-service-topology",
    title: "生产服务与三网络拓扑",
    summary:
      "生产栈由 11 个服务、三张用途不同的网络和多类持久数据组成，Agent 与数据库面保持网络隔离。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["开发者", "运维人员", "平台管理员"],
    aliases: ["Docker Compose", "11 服务", "三网络拓扑"],
    sourcePaths: [
      "docker-compose.yml",
      "docker-compose.prod.yml",
      ".env.example",
      "agent/src/server/composeVolumeParity.test.ts",
    ],
    related: ["platform-topology", "agent-runtime"],
    sections: [
      {
        id: "services",
        title: "11 个服务",
        markdown: `开发与生产都定义 **mysql、minio、redis、redis-persist、schema-sync、backend、agent、prism-tex、frontend-user、umami、nginx**。MySQL 保存主业务数据，MinIO 保存对象，redis 用于可淘汰缓存，redis-persist 使用 noeviction 保存正确性状态，schema-sync 执行迁移；Backend 负责业务和 journal，Agent 执行模型与工具，Prism TeX 隔离编译，Frontend 提供用户界面，Umami 接收分析事件，Nginx 是仓库内入口。`,
      },
      {
        id: "networks",
        title: "三张网络",
        markdown: `scholar-network 连接应用与数据服务；scholar-agent-net 是只含 Backend 与 Agent 的 internal 网络；egress-net 为 Agent 提供公网出口。Agent 不加入数据网络，不能直接连接 MySQL、Redis 或 MinIO。生产 scholar-network 使用固定 /24，并固定 Backend、Frontend、Umami 地址，以避免 Nginx 长期缓存失效容器地址。`,
      },
      {
        id: "resources",
        title: "资源与持久化",
        markdown: `生产 Agent 限制约 2 CPU、4 GiB、512 pids，Prism TeX 为 2 CPU、1.5 GiB、384 pids；Redis AOF everysec，普通 Redis 采用 allkeys-lru，redis-persist 采用 noeviction。所有主要容器使用 10 MiB × 7 的 json-file 日志轮转，Nginx 静态缓存为 1 GiB 命名卷，Agent 会话持久化到 data/agent-sessions。`,
      },
      {
        id: "configuration",
        title: "关键环境约束",
        markdown: `.env.example 覆盖数据库、对象存储、内部 token、七个 Executor feature、模型、期刊、Umami、支付、SEO 和并发。生产必须设置 AGENT_INTERNAL_TOKEN；CORS_ALLOWED_ORIGINS 默认仍是 * 且没有 fail-fast。Agent Provider 的本地 JSON 不是规范存储，小程序真实设备又固定连接生产域名，这些都应进入环境变更清单。`,
      },
    ],
  },
  {
    slug: "nginx-edge-and-seo-boundary",
    title: "Nginx 接入、实时连接与 SEO 边界",
    summary:
      "Nginx 统一承接 API、WebSocket、SSE、静态缓存和公开 SSR，并通过真实 404、noindex 与旧 URL 重定向约束索引。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["运维人员", "SEO 运营", "开发者"],
    aliases: ["Nginx Edge", "反向代理", "SEO 路由"],
    sourcePaths: [
      "nginx/nginx.conf",
      "nginx/conf.d/user.conf",
      "nginx/conf.d/security-headers.inc",
      "docker-compose.prod.yml",
      "backend/internal/seo",
      "backend/internal/seosubmit",
      ".env.example",
      "backend/internal/common/config/config.go",
      "backend/cmd/server/routes.go",
      "backend/internal/config/handler_ssr.go",
      "backend/internal/config/ssr_onmiss_gate.go",
      "backend/internal/config/ssr_link_frontier_test.go",
      "frontend-user/src/features/home/NotFoundPage.tsx",
    ],
    related: ["platform-topology", "device-routing"],
    sections: [
      {
        id: "routing",
        title: "API 与实时路由",
        markdown: `通用 API 约 10 req/s、burst 50，分析类约 5 req/s、burst 30，最大请求体 50 MiB。Nginx 代理通知 WebSocket，以及 smart-search、prism、claw、boltslides、sci_draw、stat_lab 的 feature WebSocket；stream、upload-and-resolve、export-pptx 等 SSE 路径关闭缓冲并允许约 900 秒。/api/v1/internal/* 明确禁止公网访问。`,
      },
      {
        id: "seo",
        title: "环境级索引闸门",
        markdown: `索引资格先由环境决定：\`APP_ENV=prod\` 默认可索引，\`test\` / \`dev\` 默认不可索引，显式 \`SEO_INDEXABLE\` 可以覆盖；为兼容旧部署，未设置 \`APP_ENV\` 时仍按 prod。当前 \`RequestIndexable\` 不按 Host 区分，所以同一进程里的域名共享这个决定。

不可索引时，\`robots.txt\` 仍返回 200 但只有全站 \`Disallow: /\`，所有 sitemap 与 IndexNow key 文件返回 404，SSR 同时带 \`noindex,nofollow\` 响应头和 meta。可索引也不代表任何页面自动合格：私有 SPA 路径继续 noindex，未知公开路径由后端返回真实 404。Nginx 还转发 sitemap、robots 和 IndexNow；移动 User-Agent 访问根路径时 302 到 \`/m/feed\`。`,
      },
      {
        id: "seo-on-miss",
        title: "按需补全与链接前沿",
        markdown: `公开论文、作者或期刊在 SEO 库未命中时，已知爬虫不会触发昂贵上游补全；普通访客按默认全局 200 次/小时、每 IP 10 次/小时的门禁尝试。闸门拒绝时返回真实 404/noindex，不用空壳 200 欺骗索引。

SSR 相关实体只有在目标已经落库并可路由时才生成链接；尚未落地的作者、期刊或论文只渲染为纯文本，避免爬虫沿虚假链接扩张无穷前沿。旧 \`search-results\`、\`advanced-search\`、\`latex-writer\`、\`assistant\`、\`chat\`、\`peer-review-v2\`、\`qa\`、\`skills\` 等路径仍使用显式兼容重定向。`,
      },
      {
        id: "assets",
        title: "缓存与分析入口",
        markdown: `Minicod 图片代理、上传资源、品牌资源和 hashed 静态文件使用不同缓存策略。Umami 只暴露跟踪脚本和事件发送，不暴露管理 UI。长期缓存只适合内容地址稳定或带哈希的资源，用户上传与鉴权资源不能因为代理缓存绕过权限。`,
      },
      {
        id: "security",
        title: "安全头和外层 TLS",
        markdown: `仓库内配置包含 nosniff、SAMEORIGIN、Referrer-Policy 与 Permissions-Policy，但没有 CSP。生产 Nginx 只监听 127.0.0.1，由宿主 Caddy 终止 TLS；Caddy 配置不在仓库，因此无法从 checkout 证明证书、HSTS 或 TLS 版本。real_ip 信任 172.16.0.0/12 与本机，也应与真实代理拓扑联合复核。`,
      },
      {
        id: "legacy-file",
        title: "不要加载旧重定向片段",
        markdown: `仓库里曾经放过一份未加载的旧重定向片段，含主配置没有的 paper、author 到首页以及 admin 重定向。那份文件已经删除。现行重定向只以 Nginx 主配置和前端兼容路由为准，不要按记忆补回旧片段。`,
      },
    ],
  },
  {
    slug: "database-migration-replay",
    title: "数据库迁移重放模型",
    summary:
      "schema-sync 每次启动按词法顺序重放 128 个顶层 SQL，依赖脚本幂等而没有独立 applied migration ledger。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["后端开发者", "数据库管理员", "运维人员"],
    aliases: ["Schema Sync", "MySQL Migrations", "迁移账本"],
    sourcePaths: [
      "docker/mysql/migrations",
      "docker/mysql/migrations/0000_utils.sql",
      "docker/mysql/migrations/0011_feature_tools_fulltext.sql",
      "docker/mysql/migrations/0011_prism_edits.sql",
      "docker/mysql/migrations/0126_seo_journals_full_ingest_indexes.sql",
      "docker/mysql/schema-baseline.fp",
      "docker-compose.prod.yml",
    ],
    related: ["platform-topology"],
    sections: [
      {
        id: "current",
        title: "当前执行方式",
        markdown: `docker/mysql/migrations 有 128 个顶层 SQL，编号从 0000 到 0126。schema-sync 在启动时按文件名字典序执行所有顶层迁移；archive 子目录不重放。系统没有单独记录每次迁移的 applied ledger，因而要求每个 SQL 自身可重复执行。`,
      },
      {
        id: "numbering",
        title: "编号并非唯一主键",
        markdown: `目录同时存在 0011_feature_tools_fulltext.sql 与 0011_prism_edits.sql。它们会按完整文件名稳定排序，但说明四位数字不是全局唯一迁移 ID。文档和排障不能只说“已到 0011”，而应记录完整文件名、内容哈希和执行结果。`,
      },
      {
        id: "risk",
        title: "重放风险",
        markdown: `每次启动重放全目录，会让非幂等 DDL/DML 在服务重启时才暴露；没有 applied ledger 也难以回答某个实例实际执行过哪一版。建议引入唯一 ID、校验和、执行账本、失败恢复与 schema fingerprint 门禁，同时保留当前幂等性测试。`,
      },
    ],
  },
  {
    slug: "container-release-pipeline",
    title: "容器构建与生产发布链路",
    summary:
      "当前脚本构建四类 amd64 镜像并由 Compose 发布，能够固定版本，但尚未形成签名、SBOM、扫描和强制 CI 的供应链门禁。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["发布工程师", "运维人员", "安全人员"],
    aliases: ["Build and Push", "生产部署", "镜像供应链"],
    sourcePaths: [
      "scripts/build-and-push.sh",
      "scripts/deploy.sh",
      "scripts/check-design-system.sh",
      "scripts/check-evidence-mirror.sh",
      ".githooks/pre-push",
      ".githooks/README.md",
      "VERSION",
      "docker-compose.prod.yml",
    ],
    related: ["production-service-topology", "agent-tool-and-sandbox-boundary"],
    sections: [
      {
        id: "build",
        title: "镜像构建",
        markdown: `build-and-push 为 Backend、Agent、Frontend 和 Prism 构建 linux/amd64 镜像，更新 VERSION，并推送版本标签与 latest。脚本硬编码 ACR 主机、命名空间和用户名，并使用交互式登录；当前没有生成或验证镜像签名、SBOM、漏洞扫描结果和 provenance attestation。`,
      },
      {
        id: "deploy",
        title: "部署行为",
        markdown: `deploy 使用显式镜像标签并在服务器本地构建 Nginx，不会自动 git pull。默认完整 down/up，脚本说明预估停机 1 至 3 分钟，也提供 rolling 选项。它仍创建并 chown data/agent 且称之为活跃 .claude 目录；该目录已是历史归档，当前会话路径为 data/agent-sessions。`,
      },
      {
        id: "gates",
        title: "质量门禁",
        markdown: `pre-push 只覆盖设计 guard 和有限 evidence/cross-package 检查；Hook 需要手工安装，检查工具返回 2 时可按“未运行”继续，--no-verify 也没有仓库内审计。Reviewer/Writing lint 和 Backend conventions 未接入，且未发现仓库级 CI。生产发布应在服务端强制 typecheck、测试、技能组合、迁移、镜像扫描和 Agent readiness。`,
      },
      {
        id: "readiness",
        title: "运行准备度",
        markdown: `Agent 镜像构建会 typecheck，启动也执行若干依赖 smoke test，但普通健康检查不证明 bubblewrap、Pandoc、Chromium、统计或导出链路可用。部署完成的验收应区分 liveness 与 readiness，并对七个 feature 的关键内部依赖做只读探针。`,
      },
    ],
  },
  {
    slug: "backup-and-restore-boundary",
    title: "备份、恢复与故障证据边界",
    summary:
      "现有脚本能导出部分核心数据，但仍混用旧 Agent JSONL 叙事，未覆盖所有正确性状态，也没有一致快照与自动恢复演练。",
    category: "history",
    kind: "legacy",
    status: "compatibility",
    audience: ["运维人员", "平台管理员", "审计人员"],
    aliases: ["Backup", "Restore", "灾难恢复", "RPO RTO"],
    sourcePaths: [
      "scripts/backup-all.sh",
      "scripts/backup-cron.sh",
      "scripts/install-backup-cron.sh",
      "scripts/RESTORE.md",
      "scripts/export-logs.sh",
      "docker-compose.prod.yml",
    ],
    related: ["production-service-topology", "agent-runtime"],
    sections: [
      {
        id: "coverage",
        title: "当前备份覆盖",
        markdown: `backup-all 会导出 MySQL，并归档 data/agent、data/agent-sessions 和 MinIO。data/agent 只是旧迁移归档，不能单独恢复全部对话；当前可恢复会话依赖 MySQL durable journal，相关文件还分布在 agent-sessions 与对象存储中。`,
      },
      {
        id: "missing",
        title: "缺失状态",
        markdown: `脚本没有形成对 Umami、redis-persist 正确性数据和 Redis AOF 的明确备份矩阵。MySQL dump、MinIO 和文件目录也不是同一时间点快照；默认流程缺少校验和、加密、异地副本、PITR、保留验证及定期自动恢复演练。cron 安装是手工步骤，deploy 不检查最近一次备份是否成功。`,
      },
      {
        id: "restore",
        title: "恢复文档兼容性",
        markdown: `RESTORE.md 仍把旧 Agent .claude/JSONL 目录当作主要恢复对象，已经不能完整描述当前 durable journal 架构。恢复顺序需要重新定义 MySQL、对象存储、redis-persist、Agent 工作区和服务配置的一致点，并用真实会话、交付物和配额状态验证 RPO/RTO。`,
      },
      {
        id: "logs",
        title: "故障证据",
        markdown: `export-logs 仍引用已移除的 frontend_admin，并遗漏 agent、prism-tex、minio、redis-persist、umami 和 schema-sync。日志导出应从 Compose 动态枚举服务，同时保存版本、容器状态、迁移结果、readiness 和外层 Caddy 证据。`,
      },
    ],
  },
  {
    slug: "design-source-of-truth",
    title: "设计依据与历史交互资料",
    summary:
      "运行时 CSS 决定当前界面 token；外部 Pen、仓库 Pencil 和 Remotion 仍可作为设计参考。日期型交互规格已从仓库移除。",
    category: "history",
    kind: "architecture",
    status: "current",
    audience: ["设计师", "前端开发者", "产品人员", "文档维护者"],
    aliases: ["Design SSOT", "Pencil", "Interaction Specs", "设计基线"],
    sourcePaths: [
      "CLAUDE.md",
      "frontend-user/src/styles/globals.css",
      "miniprogram/app.wxss",
      "design/pencil/scholay-global.pen",
      "design/pencil/scholay-mobile.pen",
      "design/pencil/form_loading.pen",
      "design/remotion/claw-agent-flow/README.md",
      "design/remotion/peer-review-flow/README.md",
      "design/remotion/prism-writing-flow/README.md",
    ],
    related: ["product-map", "device-routing"],
    sections: [
      {
        id: "authority",
        title: "权威顺序",
        markdown: `根 CLAUDE.md 把外部 dev.pen 指定为上游设计源；Web 实际使用的 token 来自 frontend-user/src/styles/globals.css，miniprogram/app.wxss 与 Agent 幻灯片资源是对应镜像。发生冲突时，当前代码、配置和测试优先于说明文档；用户最终看到的 Web 样式以 globals.css 为准。`,
      },
      {
        id: "reproducibility",
        title: "可复现性缺口",
        markdown: `上游 dev.pen 位于 /Users/youngp/Downloads/scholay设计源文件/dev.pen，不在 Git 仓库。新 checkout 无法证明该文件版本或内容哈希，也无法完整复现设计决策。仓库应保存版本化源文件或不可变导出及哈希，并记录与 runtime token 的同步提交。`,
      },
      {
        id: "repository-assets",
        title: "仓库内设计资产",
        markdown: `scholay-global.pen v2.13 含 97 个顶层 frame，scholay-mobile.pen v2.13 含 26 个，form_loading.pen v2.11 含 17 个；它们覆盖桌面、移动和评审表单状态，但只是设计参考，不证明路由已经实现。三个 Remotion 目录提供 Claw、Peer Review、Prism 的短流程参考；README 说明 GIF 曾由 Pillow fallback 生成，它们不参与产品运行。`,
      },
      {
        id: "historical",
        title: "历史文档冲突",
        markdown: `旧交互稿、工具目录说明和设计快照已经从仓库移除。它们曾把智能写作、智能助手、工具或文献库写成未开发、ComingSoon 或 mock，并使用旧路由。agent/README 仍可能残留 fork 共存和仅 smart_search/claw 切换；miniprogram/README 也可能残留历史描述。功能是否存在，只以当前路由、配置和测试为准。`,
      },
      {
        id: "maintenance",
        title: "Wiki 维护规则",
        markdown: `每个架构和产品词条应记录适用提交、最后验证日期、源路径、负责人和已知限制。日期型审计、研究记录、渲染截图和动效原型只作为证据；功能是否存在必须回到当前路由、协议、配置和测试核验。`,
      },
    ],
  },
];
