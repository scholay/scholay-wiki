# 统计分析工作台 — 落地设计

> verdict: adjust

## 核实结论
【核实方法】实读了 agent-skills/claw-add/guides/{data-figures,methods-stats}/SKILL.md、prism-lenses 全目录+wl-data-results 正文、reviewer-lenses/lens-statistics-rigor、agent/Dockerfile、agent/src/sandbox/{bwrap.ts,profile.ts}、agent/src/tools/registry.ts、backend/internal/{scidraw/spec.go,agentbridge/spec.go,agentattach/upload.go,claw/handler.go}、docker-compose(.prod).yml、frontend-user 的 artifact-format.ts 与 useComposerAttachments.ts,并在运行中的 scholar_agent 容器实测 Python 包、经 packages.debian.org 逐个核对 trixie 仓库。【重叠度=低,增量真实】① 两个 guide 各仅 40-50 行,是按需加载的建议文本:无问诊流程、无强制前提检验/多重校正守门、无三线表 docx/双语段落/可复现脚本交付、无返修补分析——升级成重模式的增量成立;且 data-figures 第 28 行写「scipy/statsmodels 做检验与建模」,其中 statsmodels 实测容器里没有(ModuleNotFoundError),文档与现实的落差确认存在,但 scipy 其实已装(1.15.3),原 scope「现镜像只有 numpy/pandas」表述不准。② Prism 的 wl-data-results 是「数字保真转写」写作 lens(明确不算数、派生值标「计算值请核对」),wl-rl-stats-language 是语言规范;reviewer 的 lens-statistics-rigor/multiple-comparisons 是审稿批判视角——全部不跑真计算,与本能力互补不重叠,且工作台产出的 Results 段可流转 Prism 形成闭环。③ backend 无任何模块做统计计算。【容器可行性=基本可行,细节需修正】镜像 Debian 13/Python 3.13.5,已有 numpy/pandas/matplotlib/scipy/openpyxl/python-docx;apt(trixie)可装 statsmodels 0.14.4/sklearn 1.4.2/pyreadstat 1.2.8(已实测 packages.debian.org 200+版本号),pingouin/factor_analyzer/lifelines/semopy 确认 No such package(pip-only,与现 apt-only 构建约定冲突)。bwrap jail 已为 numpy/matplotlib bind 好 /etc/alternatives(BLAS 软链)/etc/matplotlibrc /etc/fonts,statsmodels 同栈应可跑但须进启动 smoke test。claw AllowBash=true+net open+cwd jail,生产限额 1.5G/2CPU/512pids(docker-compose.prod.yml:73)。上传:后端 agentattach 单文件 30MB(非 50MB),.sav 现被前后端白名单双重拒收。交付物全部可预览:artifact-format.ts 支持 docx(DocxPreview)/xlsx-csv(SheetJS)/pdf/png/svg/md/py 代码高亮,./out/ 卡片是 claw 现成惯例;pandoc→docx 有启动自检兜底,python-docx 可编程产三线表。AskUserQuestion 工具已上线(含 ask 收尾协议),问诊交互原生支持。【合规=无阻断】matplotlib 数据渲染图与 sci_draw B 车道同性质,不触生成式图像禁令(charts/SKILL.md 红线是禁伪造病理/blot 证据图,统计图不在列);PHI 靠沙箱隔离+「数据不出平台」成立,但需 skill 层加脱敏提醒;「教学式陪跑」定位与 methods-stats 现有红线(不捏造/美化、建议咨询统计师)一致,直接升格复用即可。【结论】六维判断成立、冷启动成本确实可控(scidraw 先例 ~780 行 Go+skill+前端卡片),verdict=adjust:方向照做,按 adjusted_scope 的 5 处修正落地。

## 调整后边界
形态与主体 scope 维持原案(claw 一级重模式,MVP=单文件上传→设计问诊→六大检验+信度→三线表docx+图+双语段落+可复现脚本),但按代码现实做 5 处修正:【1】前置工程修正:scipy 1.15.3 已在镜像(勿重复列为缺项),真缺的是 statsmodels——Debian trixie apt 有 python3-statsmodels 0.14.4,按现有 apt+阿里云镜像惯例一层装入即可;python3-sklearn(1.4.2)与 python3-pyreadstat(1.2.8)同为 apt 可装。而 pingouin / factor_analyzer / lifelines / semopy 均不在 Debian 仓库(pip-only),会引入镜像构建的新安装通道(现约定 apt-only,pypi 走 clash 网络有风险)——MVP 砍掉这四个:Cronbach α 用 numpy 十行手算、EFA 用 statsmodels.multivariate.factor(带旋转)、功效用 statsmodels.stats.power、中介调节用 statsmodels 回归+bootstrap 手写;CFA/SEM 因 semopy pip-only 降为二期再评估项(最大不确定点,若届时仍难装就砍)。【2】文件约束修正:实际单文件上限是 30MB(agentattach 校验),50MB 只是 body-limit 中间件;scope 文案改「单文件≤30MB」。.sav 支持需三处同步改:镜像装 pyreadstat + backend agentattach 白名单加分支(现 default 分支直接拒收,原则「收=能读」)+ 前端 useComposerAttachments.ts 的 ATTACHMENT_ACCEPT 加 .sav(可顺带 .dta/.xpt)。【3】工程要求追加:扩展 bwrap.ts 的启动 smoke test 在真实 jail 内 import statsmodels(+二期 pyreadstat)——2026-07-21 事故教训是裸 docker exec 全绿≠jail 内能跑。【4】落地范式确认:完全仿 scidraw/boltslides 做独立 agentbridge feature(scidraw 全模块仅 ~780 行 Go:spec 151+handler 261+artifact 372,外加 prompts 文件、agent-skills 目录、compose 挂载、前端 TemplateCards 入口),复用 ConversationWorkspace 自动获得 AskUserQuestion 分步问诊面板(该工具已上线,registry.ts:896);三个已知坑:migration 0034 anchor 须排除新 feature key、SetVIPChecker 必须接线(bootstrap 有 VIPCheckerWired 断言)、modelcatalog 加绑定。【5】合规微调:守门 skill 加两条硬约束——PHI 脱敏提醒(建议用户先去标识,行级数据片段会进 LLM 上下文)+ 明确拒绝「把 p 调显著/只报显著」类 p-hacking 请求(methods-stats 现有红线原文升格进重模式 prompt)。

---

# claw「统计分析工作台」(stat_lab)端到端落地设计

## 0. 定位
data-figures + methods-stats 两个轻 guide 合体升级为一级重模式:从「按需加载的建议文本」变成「跑真检验 + 出投稿级交付物」的端到端闭环,教学式陪跑不做黑盒。完全仿 scidraw/boltslides 的 agentbridge feature 范式。FeatureKey=`stat_lab`,agentName=`scholay-stat-lab`。

## 1. 用户故事与交付物形态
典型输入:**单个数据文件(csv/xlsx,≤30MB)** + 一句研究问题。典型输出(落 `./out/`,全部前端现成可预览):
- `table1.docx` — python-docx 编程产 APA 三线表(DocxPreview 预览)
- `fig_*.svg/png` — matplotlib 出版级统计图(会话内联)
- `results_双语.md` — 中英 Results 段落(效应量/95%CI/精确 p)
- `analysis.py` — 可复现脚本(读原始文件即重跑,代码高亮预览)

三个场景:
1. **医生**:两组术后数据 → 问诊确认分组/是否配对 → 正态性+方差齐性前提检验 → t/Welch/Mann-Whitney 自动分流 + 卡方 → 三线表+双语段落。
2. **教育学研究生**:问卷 5 量表 → Cronbach α(numpy 手算)+ EFA(statsmodels.multivariate.factor 带旋转)+ 相关矩阵 + 回归/中介(bootstrap 手写)→ 整套信效度报告。
3. **返修补分析**:上传原数据+审稿意见 → 补 Cohen's d/η²、Bonferroni/FDR 校正 → 更新三线表与 Results 段(可流转 Prism wl-data-results 闭环)。

## 2. 交互设计
- **入口**:`/claw` 空态 TemplateCards 扇形加「统计分析」卡(与制作PPT/科研绘图并列),点卡切自包含 `StatLabWorkspace`(共享 ConversationWorkspace 布局 + WorkspaceConfig)。
- **会话流**:上传文件(enableAttachments=true,claw 方案B 推原始文件)→ agent 先用 python 读数出「数据概况」(变量/类型/n/缺失)→ **AskUserQuestion 分步问诊**(研究设计/分组变量/配对与否/假设方向;该工具已上线 registry.ts:896,ConversationWorkspace 自带问诊面板)→ 陈述分析计划待确认 → 跑检验 → 产物卡+内联图。
- **产物**:`autoOpenLatestArtifact=true` 自动打开三线表;多会话 + `/claw/:sessionId` 深链 resolve 反查照抄。

## 3. agent 侧
### 3.1 skills(`agent-skills/stat-lab-skills/`,compose 挂 `/stat-lab-add/.claude/skills:ro`,spec AddDirs 注入)
- `workbench/SKILL.md`(总守门+流程):问诊协议、**前提检验强制**(正态/方差齐/独立性)、参数/非参分流表、多重比较必校正、效应量+CI 必报;两条硬红线:①**PHI 脱敏提醒**(行级数据片段会进 LLM 上下文,建议先去标识)②**明确拒绝 p-hacking**(「调显著/只报显著」,methods-stats 现有红线原文升格)。
- `tests/SKILL.md`:六大检验(t/ANOVA/卡方/相关/回归/非参)的 scipy+statsmodels 代码骨架与报告口径。
- `reliability/SKILL.md`(P1):Cronbach α numpy 十行手算、EFA=statsmodels.multivariate.factor、功效=statsmodels.stats.power、中介调节=回归+bootstrap 手写模板。
- `reporting/SKILL.md`:python-docx 三线表金标代码、matplotlib 规范(Agg + Noto Sans CJK **JP**)、APA 双语段落模板。

### 3.2 工具与依赖
- **不加自定义工具**,registry.ts 不动(Bash+python 足够);featurePolicy.ts 不改;MCP 白名单 MVP 留空(纯统计不需检索)。
- DisallowedTools:WebFetch/WebSearch/Task/BuildDeck/NotebookEdit;保留 Read/Write/Edit/Glob/Grep/Bash/ReadDocument/ExportDocument/AskUserQuestion;AllowBash=true。
- **Dockerfile(apt-only,阿里云镜像,单独小层防 OOM)**:新增 `python3-statsmodels`(0.14.4)、`python3-sklearn`(1.4.2);二期 `python3-pyreadstat`(1.2.8)。**scipy 1.15.3 已在镜像,勿重复装**。pingouin/factor_analyzer/lifelines/semopy 为 pip-only 与 apt-only 约定冲突,MVP 全砍(替代见 3.1);CFA/SEM 降二期。
- **bwrap.ts 启动 smoke test 扩展:在真实 jail 内 `import statsmodels`**(二期加 pyreadstat)—— 07-21 教训:裸 docker exec 全绿 ≠ jail 内能跑。

## 4. backend 侧
- **新独立 feature(非 claw mode)**:`internal/statlab/{spec,handler,artifact}.go` + `prompts/stat_lab.go`,照 scidraw 抄(~780 行量级)。
- spec 旋钮:InjectPromptOnFirstMsg=true、PermissionAuto、AllowBash=true、AddDirs=["/stat-lab-add"]、StandardHooks(vip.CheckDailyQuotaOverdraft + usagestat 新常量 FeatureStatLab)+ BudgetProvider + **SetVIPChecker 必接**(VIPCheckerWired 启动断言)。
- 附件走现有 agentattach(**实际单文件上限 30MB**,50MB 只是 body-limit);二期 .sav 须 agentattach 白名单加分支(default 现直接拒,原则「收=能读」)。
- artifact.go:收割 `./out`,docx/svg/py/md 全进列表。
- **迁移(幂等)**:`00XX_agent_sessions_statlab_multi.sql` 把 `stat_lab` 加入 0034 `user_feature_anchor` 生成列排除集;`00XX_statlab_defaults.sql` 用 INSERT IGNORE 给 modelcatalog 加 `chat_default.stat_lab`(+`.free`)绑定。无新业务表。
- 接线:bootstrap `agentBridge.For(spec)`;routes_user.go 15 REST+1 WS(`/user/stat_lab/*`);resolve 可见集加 key;compose `AGENT_EXECUTOR_FEATURES` 加 key;无自定义工具故 ws.go permissionAllowed 不用加。

## 5. frontend 侧
- `api/stat-lab-session.ts`:复用 shared `makeAgentSessionApi` 工厂,BASE `/user/stat_lab`,queryKey `stat_lab`。
- `hooks/useStatLabConversation.ts`:从 useSciDrawConversation 机械克隆(继承 ACK/stop/stall 看门狗全套)。
- ClawPage 加 `STAT_LAB_CFG`:**enableAttachments=true**(与前两重模式不同,附件须透传 activeSessionId,照抄 claw 而非 boltslides)、artifactBasePath='/user/stat_lab'、autoOpenLatestArtifact=true。
- TemplateCards 加卡 + feature-meta.ts 图标 + UnifiedSidebar 徽标。
- **预览零新建**:artifact-format.ts 已覆盖 docx/xlsx/svg/py/md。二期 .sav:useComposerAttachments.ts 的 ATTACHMENT_ACCEPT 加 `.sav`(顺带 .dta/.xpt)。

## 6. 风险与坑
1. **0034 anchor**:迁移先行,否则建第二个会话即撞唯一索引。
2. **SetVIPChecker 漏接**→启动断言 panic(刻意设计,别绕过)。
3. **bwrap bind**:statsmodels 同 numpy 栈依赖 /etc/alternatives BLAS 软链,必须 jail 内 smoke test 验证。
4. **skill 的 allowed-tools frontmatter 不生效**,闸门只认 spec.DisallowedTools + AllowedMcpTools。
5. 改 prompts/skill 须 restart scholar_agent(bind-mount 陈旧坑)。
6. **内存天花板 1.5G/2 槽**:30MB csv pandas 峰值可达数百 MB,skill 强制大文件 usecols/dtype 降载,bootstrap 重采样 ≤5000 次。
7. 附件断链 P0 已知坑:须透传 activeSessionId。
8. 合规:统计图属数据渲染,不触 Nature 生成式图像禁令;PHI+p-hacking 红线写进 prompt 与 skill 双层。

## 7. MVP 切法
- **P0(2-3 天)**:Dockerfile 两包+jail smoke test;statlab 三件+迁移+接线;前端卡+workspace+api/hook;workbench/tests/reporting 三 skill;csv/xlsx→问诊→六大检验→四类产物。验收:①真实 csv 全流程产 docx+图+双语段落+脚本且可预览 ②方差不齐样例自动转 Welch/非参并解释 ③p-hacking 请求被拒 ④jail smoke test 绿 ⑤超额回 quota_exceeded。
- **P1(约 1 周)**:信度/EFA/功效/中介调节(纯 statsmodels+numpy);返修补分析模板;.sav/.dta 三处同步(镜像 pyreadstat + agentattach 分支 + 前端 accept)。验收:量表全流程 + .sav 直读。
- **P2**:生存分析改用 statsmodels.duration(SurvfuncRight 做 KM + PHReg 做 Cox,绕开 lifelines);CFA/SEM 评估 semopy 安装通道(仍难装则砍);多文件合并。

## 8. 成本与配额
- 单会话估算:数据本体不进上下文(只喂 python 输出摘要),问诊 2-3 轮 + 分析 4-8 工具轮,input 约 8-20 万 token、output 1-3 万,较 claw 普通会话重 2-3 倍;受单轮 5M token 与 24 工具轮上限天然有界。
- 配额:StandardHooks 接 vip tier-aware 日额度(CheckDailyQuotaOverdraft 有界透支 max(15%,20万)),超额前端 `code=quota_exceeded`;usagestat 记 `stat_lab/message`;llmusage 三咽喉点自动入账;modelcatalog 绑 chat_default(free 档走 `.free`)。
