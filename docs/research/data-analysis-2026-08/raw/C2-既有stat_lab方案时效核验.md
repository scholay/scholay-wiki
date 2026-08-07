# C2 · 既有 stat_lab 方案时效核验(2026-08-04)

> 核验对象:2026-07-24 产出的三份文档
> ①[REPORT.md](../../../claw-capability-research-2026-07/REPORT.md) §5.1
> ②[designs/01-stat-lab.md](../../../claw-capability-research-2026-07/designs/01-stat-lab.md)(落地设计,verdict=adjust)
> ③[agent-plans/01-stat-lab-agent-plan.md](../../../claw-capability-research-2026-07/agent-plans/01-stat-lab-agent-plan.md)(StatEngine 深度方案 v3)
> 外加 APPENDIX-oss.md「统计 · 可嵌入库 / 统计 · agent 项目与论文」、APPENDIX-research.md §A-1 / §B-3 / §F。
>
> 核验方法:**实读 2026-08-04 工作区代码 + 运行中的 `scholar_agent` 容器实测**,不引用文档结论作为事实。
> 所有代码事实标 `文件:行号`;容器实测标「实测」。仓库当前分支 `main`,HEAD=`04f45d4f0`,
> ⚠️ 工作区有大量未提交改动(`git status` 200+ 文件),本核验以**工作区**为准,与线上可能有落差。

---

## 〇 · 三句话结论

1. **方向仍然成立,但那份方案的"前置工程"章节已经过期一半** —— 它列的最大一块前置(镜像装
   statsmodels/sklearn/scipy)在 2026-08-01「证据账本 P0-a 运行时诚实化」里**已经做完并部署到本地容器**
   (`agent/Dockerfile:71-77`,容器实测 statsmodels 0.14.4 / sklearn 1.4.2 / lifelines 0.30.3 全部可用,
   且**在真实 bwrap jail 内**通过启动自检)。P0 的 D5 那一天基本可以划掉。
2. **StatEngine 的核心裁决(引擎算数、LLM 只问诊和解读)不但仍然对,而且被 2026-08 的三份新材料
   独立复证了三次** —— 证据账本终稿把它抽象成「引擎产值 → 模型只能写句柄 → 交付边界展开」的通用三段式
   ([agent-evidence-architecture-2026-08.md:91-101](../../../agent-evidence-architecture-2026-08.md)),
   数值那一格(`{{r:run_7.p}}` / RunAnalysis)**在那份终稿里就是 P1,今天全仓零实现**(grep `RunAnalysis` 零命中)。
   但 **7000-9000 行 / P0 8 天的估算不现实**,且现在存在两条明显更便宜的等价路径(§Q2)。
3. **Run 引擎不应该做数据分析的底座 —— 至少现在不应该。** 它今天是 `AGENTRUN_ENABLED` **默认关**的
   opt-in(`backend/internal/agentrun/engine.go:71`)、`coverage.go` **不存在**、`ExitCriteria` 零读者、
   `MaxRounds` 是死旋钮(`adapter.go:109` `_ = maxRounds`)、`run/` 目录**不在保留区**(模型可随意覆写)。
   数据分析该用的是**普通 turn + 拆 verb**(方案 v3 §2.4 本来就是这么设计的),Run 是**以后**的迁移目标(§Q3)。

---

## Q1 · 方案里今天已不成立 / 需要更新的工程事实

按「影响大小」排序。✅=方案已被现实实现(可删)、🔴=方案的事实错了或已反转、🟡=仍成立但口径要改。

### ✅ 1. 「statsmodels/sklearn 缺失,MVP 需 apt 加两包」—— 已完成,且比方案要的更多

- 方案原文:designs/01-stat-lab.md:45「新增 `python3-statsmodels`(0.14.4)、`python3-sklearn`(1.4.2);
  二期 `python3-pyreadstat`」;agent-plan §3「apt 层……」。
- 今天:`agent/Dockerfile:71-77` 有一整层「统计建模运行时(2026-08 证据账本 P0-a)」:
  `python3-scipy python3-statsmodels python3-sklearn` + **pip 装 `lifelines==0.30.3`**,并带构建期 import 断言。
- **容器实测**(`docker exec scholar_agent python3 -c "import ..."`):
  numpy 2.2.4 / scipy 1.15.3 / pandas 2.2.3 / matplotlib 3.10.1 / **statsmodels 0.14.4** /
  **sklearn 1.4.2** / **lifelines 0.30.3** / openpyxl 3.1.5 / python-docx 1.1.2 全部 OK。
  **seaborn / tableone / pingouin / pyreadstat 仍 MISSING;`which R` = no R。**
- 而且**jail 内可用已被机械保证**:`agent/src/tools/statsEngines.ts:56-120` 的 `probeStatsEngines()`
  用**生产同一条 `buildBwrapArgv` 路径**在真 jail 里逐个 import;`docker logs scholar_agent` 实测
  `统计引擎自检通过(声明的库全部可 import) sandbox=bwrap engines=numpy,pandas,scipy,matplotlib,statsmodels,sklearn,lifelines,openpyxl`。
- ⇒ **方案 §7「bwrap.ts 启动 smoke test 扩展:jail 内 import statsmodels」这一项已经有了**(形态还更好:
  它是一张声明清单 `DECLARED_ENGINES`,与 SKILL.md 的能力口径对咬)。P0 的 D5 里那一格可以删。

### 🔴 2. 「pip-only 与 apt-only 构建约定冲突 ⇒ pingouin/lifelines/semopy/tableone 全砍」—— **该约定已被打破**

- 方案两处都把「现约定 apt-only,pypi 走 clash 网络有风险」当成硬约束,并据此砍掉 lifelines、
  把 CFA/SEM 降二期、把 tableone/statannotations 归入「vendor wheel 层」这条更贵的路
  (designs:45、agent-plan §3)。
- 今天 `agent/Dockerfile:73-74` 直接 `pip3 install --break-system-packages --no-cache-dir
  -i https://mirrors.aliyun.com/pypi/simple/ lifelines==0.30.3`,注释明写选阿里云 PyPI 镜像正是为了
  「规避生产 clash fake-ip 拉包超时」。**pip 通道已经开通、已有先例、已钉版本。**
- ⇒ tableone / scikit-posthocs / statannotations / semopy 不再需要「vendor wheel 解包 + PYTHONPATH」
  那套自造机制,直接进同一条 pip 行即可(**并且落在 `/usr/local/lib/python3*/dist-packages`,
  已被 `bwrap.ts:93 --ro-bind /usr /usr` 覆盖 —— lifelines 就是活证据**)。
  这条反转直接砍掉方案 §2.1 的一半复杂度,见 §Q2 的「更便宜路径 A」。
- ⚠️ 保留成立的部分:**pingouin(GPL-3)/ factor_analyzer(GPL-2)的排除理由是 license 不是安装通道**,
  这条不受影响,仍应排除。

### 🔴 3. 「registry.ts 只需动 bashEnv 两行加 PYTHONPATH」+「bwrap 加 `--ro-bind-try /opt/statengine`」—— 现在**可以做到零改动**

- 方案 §2.1 把这两处写成「如实计入的改动」,并为「bashEnv 是全 feature 共用白名单」写了一段裁决理由。
- 实读:`agent/src/tools/registry.ts:105-114` 的 `bashEnv()` 白名单里确实没有 `PYTHONPATH`;
  `agent/src/sandbox/bwrap.ts:93-128` 的 ro-bind 集是 `/usr` `/bin` `/lib` `/lib64` + `/etc` 若干,
  **没有 `/opt`**。所以方案说的两处改动确实是必要的 —— **前提是引擎放 `/opt/statengine`**。
- 但既然 pip 通道已开(见 2),把引擎打成一个普通 python 包 `pip3 install ./stat-engine`
  装进 `dist-packages`,则 `python3 -m statengine` 天然可用:**bwrap 零改动、bashEnv 零改动、
  跨 feature 暴露面的那段裁决理由也不需要了**。这是方案写作时(pip 通道未开)不存在的选项。

### 🔴 4. 「modelcatalog 加 `chat_default.stat_lab`(+`.free`)绑定」—— 迁移形态已废弃

- 方案 designs:53 / agent-plan §10 D6 要求「`00XX_statlab_defaults.sql` 用 INSERT IGNORE 给 modelcatalog
  加 `chat_default.stat_lab`(+`.free`)绑定」。
- 今天 `docker/mysql/migrations/0082_prune_merged_model_bindings.sql:17-32` 已经把
  `chat_default.boltslides` / `chat_default.sci_draw` / **全部 `chat_default.*.free`** 从 admin 可配绑定里删掉,
  改由代码里的 `purposeAlias` 归并到主 purpose(`backend/internal/modelcatalog/model.go:67-69`)。
- ⇒ 新 claw 家族 feature **不加迁移**,而是:`modelcatalog/model.go` 的 `purposeAlias` 加一行
  → `chat_default.claw`;`modelcatalog/handler.go:97` 的 feature 白名单 case 加一个串。
  **`.free` 那一档整套不存在了,写进方案的那句是错的。**

### 🟡 5. 「0034 anchor 迁移先行」—— 仍成立,但**要抄的是 0070/0076 那种"条件化改老列"的写法**

- `docker/mysql/migrations/0034_agent_sessions_user_feature_anchor.sql:23` 的生成列排除集初版只排除 `claw`;
  之后 `0070_agent_sessions_smart_search_multi.sql`、`0076_agent_sessions_boltslides_multi.sql` 各追加了一次,
  且 `0076:11` 明写:**新库建列即正确、既有库要 `MODIFY COLUMN` 重建**。今天排除集 = claw / smart_search /
  boltslides / sci_draw(migrations grep 实测)。
- ⇒ 坑仍在,且已被踩过两次(记忆里 0.0.66 发布事故同源)。方案 §6 风险 1 成立,但要更新为
  「照抄 0076 的条件化 MODIFY 写法」,而不是简单「加一条迁移」。

### 🟡 6. 「单文件 30MB / .sav 三处同步」—— 全部仍成立,且 .sav 一处也没做

- `backend/internal/agentattach/upload.go:60 MaxFileBytes = 30 * 1024 * 1024`,:168-170 的注释还专门
  纠正了「50MB 只是路由层 MaxBytesReader」的旧文案 —— **方案的修正是对的且已被代码注释确认**。
- `.sav/.dta/.xpt` 仍不在白名单:`upload.go:325-336` 的文本扩展名集、`:330-348` 的 `isOffice` 都不含,
  落到 default 分支拒收。容器实测 `import pyreadstat` → ModuleNotFoundError。
  ⇒ 「镜像 + agentattach 白名单 + 前端 accept 三处同步」这条**逐字仍然成立**(只是现在装 pyreadstat
  可以走 pip 或 apt 任一条)。

### 🟡 7. 「Bash 工具 timeout 上限 300s 硬钳 ⇒ 必须拆 verb」—— 仍逐字成立

- `agent/src/tools/registry.ts:369` `const timeoutMs = Math.min(Number(input.timeout_ms) || 120_000, 300_000);`
  —— 默认 120s、硬顶 300s,与方案 §2.4 的实查一致,**未变**。
- `agent/src/turn/turnLoop.ts:36 MAX_TOOL_ROUNDS = 24` 也未变。
- ⇒ 方案的 `run / stability / verify` 拆三 verb + 240s 软预算 + 退出码 3(partial)这套设计**今天照样必要**。

### 🟡 8. 「AskUserQuestion 已上线 registry.ts:896」—— 工具在,行号漂了

- 今天在 `agent/src/tools/registry.ts:980-988`。方案自己在 §4 写过「本方案文档一律以符号定位」,
  但 designs 那份仍写了行号 —— 引用时按符号找。
- ask wind-down 的机械行为仍在(下一轮强制清空工具),这是问诊交互能成立的前提。

### 🟡 9. 「scidraw 全模块仅 ~780 行 Go」—— 实测 784 行,**精确成立**

`wc -l backend/internal/scidraw/*.go` = artifact 372 + handler 261 + spec 151 = **784**。
`boltslides` 同形态 875 行。⇒ 「thin wrapper ~780 行」这个成本锚点可以继续用。

### 🟡 10. 「两个 guide 各仅 40-50 行,是按需加载的建议文本」—— 仍成立(50 / 59 行)

`agent-skills/claw-add/guides/data-figures/SKILL.md` 50 行、`methods-stats/SKILL.md` 59 行。
但内容已被 P0-a 修正过口径:`data-figures/SKILL.md:20` 现在列的运行时清单
(`numpy pandas scipy statsmodels sklearn lifelines matplotlib openpyxl docx`)**与镜像实况一致**了 ——
2026-08 证据账本终稿点名的「skill 正在生产环境骗模型」那条已消除。
⇒ 「升级成重模式的增量成立」这一判断不受影响(guide 仍无问诊/无守门/无交付物)。

### 🟡 11. 「backend 无任何模块做统计计算」—— 仍成立

`ls backend/internal/` 实测 48 个模块,无 statlab / sysrev / 任何统计模块;`grep RunAnalysis|DesignCheck`
全仓零命中。**方案假定的空白仍是空白,一年内没有人往这里放过东西。**

### 🟡 12. 「生产限额 1.5G/2CPU/512pids、2 并发槽」—— 全部未变,且现在有更硬的口径

`docker-compose.prod.yml:425-427` memory 1.5G / cpus 2.0 / pids 512;
`agent/src/server/admission.ts:13` `MAX_CONCURRENT_TURNS = 2`,文件头注释「单会话峰值 ~765MiB,
约 2 个重会话即打爆 1.5G 容器」。
⇒ 方案 §2.2 的「内存阈值 500MB 自检 + flock 跨会话串行化」不但仍必要,而且是**唯一**能防止
「两个统计会话同时重算 → OOM 杀整容器连坐所有租户」的手段(2026-08 架构文档把这个列为待测未知数)。

### 🔴 13. 一条**新增**的、方案完全没预料到的约束:证据保留区已经上线

- `agent/src/sandbox/confine.ts:66-69 inReserved()` + `:91-96`:`evidence/` 是**引擎独占只读区**,
  用 **canonical 路径**判定(`ln -s evidence x` 绕不过);`agent/src/sandbox/bwrap.ts:118-122` 用
  `--ro-bind`(非 `-try`)在 jail 内遮蔽;`bwrap.ts:173-208` 有真 jail 启动自检,
  实测日志「证据保留区 jail 自检通过(真实 bwrap jail 内 evidence/ 只读,三种写法全部被拒)」。
- ⇒ 对 stat_lab 的含义有两条:
  ① **「引擎独占目录」这个模式已经有生产实现可抄**,`results/*.bundle.json` 想做成不可伪造,
     只需把 `results` 加进 `evidence/paths.ts` 的保留集(今天 `paths.ts:21` 只有 `EVIDENCE_DIR = "evidence"`);
  ② 但 stat_lab 若要在 jail 内跑引擎并**写** `results/`,写入者是 Bash 进程 —— 与「保留区只读」冲突,
     需要走「引擎经 executor 侧写」或「保留区按前缀区分 rw 引擎/ro 模型」,方案里没有这一格。

### 🔴 14. 「不加自定义工具、MCP 白名单留空」—— 结论仍对,但**理由要更新**

方案 §4 说「MVP 零 executor 工具」是因为数据不能出 jail。今天多一条更硬的收益:
`agent/src/policy/researchTurn.ts:78-88` 的 Router 以「本轮实际发给模型的工具名」判形态,
`hasRetrieval` 需要 `mcp__` 前缀工具。**`AllowedMcpTools: []` ⇒ 恒判 `chat` ⇒ 引擎预检索不触发**
(`agent/src/evidence/prefetch.ts:162` `if (!a.toolNames.includes(PREFETCH_TOOL)) return unavailable`)。
即:纯统计 feature 天然不会被证据管线加一枪检索开销。
⚠️ 反面教材已写在 [agent-architecture-research-capability-2026-08.md:540-546]:sci_draw / boltslides
**没配 `AllowedMcpTools`**,执行器语义「空 = 不限制」⇒ 76 个 minicod 工具全量灌进每轮 tools[]。
**`AllowedMcpTools: []`(空切片)与"不设该字段"在这里语义相反,stat_lab 必须显式设空并加断言。**

---

## Q2 · StatEngine 的核心裁决今天还对吗?7000-9000 行 / 8 天现实吗?

### 2.1 核心裁决:**仍然对,而且被 2026-08 的三份材料独立复证了三次**

| 复证来源 | 复证了什么 |
|---|---|
| [agent-evidence-architecture-2026-08.md:91-101](../../../agent-evidence-architecture-2026-08.md) | 把它抽象成通用三段式:**① 引擎产值(模型不参与)→ ② 模型只能写句柄 → ③ 交付边界展开(展不开=没有产物)**。表里「数值」那一行的值所有者写死是 `results/run_7.json`(引擎真跑,带 `data_sha256`),与 StatEngine 的 ResultBundle 同构 |
| 同上:211 | 「**同时把统计能力真装上**(statsmodels/sklearn/lifelines),缺库的方法从候选表消失而不是让模型撞 ImportError」——已在 P0-a 兑现一半(库装了,候选表没做) |
| 同上:79 | 生产实证:claw「用户上传 PDF 前就产出 31 条效应量荟萃数据集」,机械成因就是"没有引擎、只有散文" |
| [agent-architecture-research-capability-2026-08.md:520](../../../agent-architecture-research-capability-2026-08.md) | ⑤分析/统计环节评级 🟡→线上近 ❌;⑥可视化是"最扎实的一环",**因为它恰恰是三车道确定性渲染**——同一个仓库内部的对照实验,支持"确定性引擎 > 自由生成" |

一条**新的**、方案没写的支撑:`agent/src/tools/statsEngines.ts:44` 的 `engineSupported` 至今
**零消费者**(`grep` 除 `index.ts:102-104` 的 fire-and-forget 外无引用)。架构文档已点名这是
「引擎造好没接线」的第 N 次复发。**「装了库」到「模型只能用引擎支持的方法」之间那一段,今天完全是空的
—— 这正是 StatEngine 的位置。**

### 2.2 估算:**7000-9000 行 / P0 8 天不现实**,但方案自己已经打了一次折

- 方案 §10 已经把 P0 收窄成三检验族并自陈「初稿把 20 条规则 + 6 个 run 模块塞 D1-2 是自估的近半、
  必烂尾在评测,此为刻意砍量」。所以 8 天对应的**不是** 7000-9000 行,而是其中大概 1/3。
- 但 8 天里还塞了:golden 回归(要先写 R 参考脚本 —— 而**容器里没有 R**,得在本机另装)、
  Dockerfile 层、backend 三件 + 两条迁移、前端 api/hook/卡片、三份 skill、15 个 eval 场景。
  按本仓库既往同规模 feature 的实际节奏(scidraw 784 行 Go + skill + 前端),**光"thin wrapper 那一半"
  就不止 2 天**,而 8 天里给它的是 D6+D7 两天。
- 我的判断:**按方案原样走,P0 现实工期是 15-20 天**,主要低估在:
  ① golden 参考值链路(要装 R、写 R 脚本、定容差、做子抽样固定 seed)——方案自己列成 D5 的半天;
  ② tests.yaml 的统计学同事评审是**外部依赖**,排在 D5「与 D6-7 并行」,现实里它是阻塞项;
  ③ 30 个 eval 场景的数据集是要**造**的(方案说"自造中文医学/问卷模拟数据")。

### 2.3 三条更便宜的等价路径(按便宜程度排序)

**路径 A · 引擎照做,但去掉三处自造机制(省约 2-3 天 + 一整块风险)**
1. 引擎打成 pip 包装进 `dist-packages`,**不放 `/opt`** ⇒ 省掉 bwrap ro-bind + bashEnv PYTHONPATH
   两处跨 feature 改动,以及为它写的那段裁决理由(§Q1-3)。
2. tableone / scikit-posthocs / statannotations 走**同一条 pip 行**,不做 vendor wheel 解包(§Q1-2)。
3. jail smoke test **不新写**,把这几个包名加进 `statsEngines.ts:31-39` 的 `DECLARED_ENGINES`
   —— 那套探测已经是"生产同一条 argv 路径 + 缺库大声 error"的正确形态。

**路径 B · 先做"守门 + 报告"两层,把"计算层"留给模型的自由 Python(省一半代码,拿走 80% 的质量收益)**
证据:
- StatQA 的主错型是**前提适用性**、StatABench 的 74% 失败是**选错/解读错**,
  **纯计算本身不是主要错源**(APPENDIX-oss「统计 · agent 项目与论文」§三)。scipy/statsmodels 的 API
  模型本来就写得对。
- ⇒ 最小可用引擎 = `profile`(前提实测)+ `gate`(决策表白名单)+ `report`(APA 模板插值 + docx 三线表)
  + `numguard`;`run` 一族**允许模型写 Python**,但**必须把结果写成引擎认识的 bundle JSON**,
  由 `verify` 做非参对照复核。这样 `run/*.py` 那 6 个模块(方案里体量最大的一块)可以先不写。
- 代价:数字的"不可伪造性"从**结构保证**降级为**对账保证**(模型可以在自己的 Python 里编一个 bundle)。
  但只要 `results/` 进保留区、bundle 由引擎的 `run` verb 落盘,这个降级就可以后补而不返工。
- ⚠️ 这条路径与方案 §1 的"双车道"**不是同一件事**:方案的车道 B 只放清洗与无标注探索图;
  这里是把推断统计的**执行**也放进车道 B,只保留守门与报告的确定性。是刻意的取舍,不是误读。

**路径 C · 不新建 feature,先做成 claw 的一个 skill 包 + 一个引擎 CLI(1-2 天出可用版)**
- 今天 claw 已经:AllowBash=true(`backend/internal/claw/spec.go:235`)、
  statsmodels/lifelines 可用、附件上传可用、docx/xlsx/svg/py 预览可用
  (`frontend-user/src/features/claw/components/preview/artifact-format.ts:92-126`)。
- 缺的只有:问诊协议、守门决策表、报告模板 —— 这三样**都可以先以 skill + 一个 pip 装的 CLI 存在**,
  不需要 backend 三件、不需要两条迁移、不需要前端卡片。
- 用途:**在投入 15-20 天之前,先用真实用户验证"问诊 → 守门 → 三线表 docx"这条闭环值不值得独立 feature**。
- 已知风险(必须写进去):skill 是**条件加载**的,609 轮里 methods-stats 只命中 29 次(4.4%,
  见 evidence 终稿:81)。所以路径 C 验证的是"能力",不是"触达率"——触达率必须靠独立入口解决。

---

## Q3 · Run 引擎(agentrun)该不该做数据分析的底座?

### 判断:**不该。数据分析的多步应当用「普通 turn + 拆 verb」实现;Run 是 6-12 个月后的迁移目标,不是现在的底座。**

### 3.1 形状确实像,但 Run 今天缺的恰好是数据分析最需要的三格

实读 `backend/internal/agentrun/`(1850 行,唯一一次提交 `545c75746`):

| Run 引擎今天的实况 | 代码位置 | 对数据分析意味着什么 |
|---|---|---|
| **默认关**(opt-in),打开前有三个明写的前置(接配额 / 前端进度卡 / 采完 P0 基线) | `engine.go:56-73` | 想用它就得先替它把这三件做完,**成本转嫁给数据分析立项** |
| **`coverage.go` 不存在**;`ExitCriteria` 只有结构没有读者 | `template.go:41-57`(定义)+ `ls backend/internal/agentrun/` 实测无 coverage.go;`engine.go:309` 无条件 `CompleteStep` | 「这一步做完没有」今天 = **执行器没返错就算完成**。数据分析恰恰最需要"守门"(前提检验跑了没、多重校正做了没),而 Run 给不了 |
| **`MaxRounds` 是死旋钮** | `adapter.go:100-109` `_ = maxRounds`(注释自述是刻意降级);接收端 `turnLoop.ts:430` 已写好,断的是 backend→agent 那一段 | Run 的核心收益「轮尽=分页」拿不到;每步仍退回 24 轮 |
| **`MaxRetry` 也是死旋钮**,引擎用全局 `defaultMaxRetry()` **默认 8**(方案要求硬设 2) | `engine.go:41-46`、`:242` | 一步最坏 8 次认领 × 24 轮 |
| **`run/` 不在保留区** | `confine.ts:66-69` 只判 `evidence`;`evidence/paths.ts:21` 只有 `EVIDENCE_DIR` | 模型可以覆写任何一步的历史产物。方案 §5.1① 写的 `RESERVED_WRITE_SUBTREES={"evidence","run"}` 只实现了一半,**文档未同步** |
| **prompt 对模型说了一件不成立的事**:「你看不到前面几步的对话内容」;实际 `handler.go:69` 用 `GetOrCreateSession` 复用用户当前 claw 会话,每步都发同一个 sessionID | `prompt.go:26-27` vs `handler.go:69` + `engine.go:292` | Run 的上下文**单调累积**,长任务必然撞 compact 滚动摘要 —— 而 compact 正是这批改造认定的"证据消失的地方" |
| **零真实负载**:唯一模板声明在 `claw/spec.go:196`,peerreview 影子归位未做 | grep `RunTemplates` 全仓 5 处 | 崩溃续跑 / 租约回收 / 让路闸**全部未经真实流量验证** |

(以上多数与 [remaining-gaps-2026-08-02.md](../../../remaining-gaps-2026-08-02.md) W1-W7、W12 一致;我已逐条复读代码确认。)

### 3.2 更根本的理由:数据分析的"多步"与 Run 的"多步"不是同一种多步

- Run 解决的是**跨轮的墙**:`MAX_TOOL_ROUNDS=24`(`turnLoop.ts:36`)、TurnTimeout 15min、IDLE_TTL 30min
  ([research-kernel-architecture-2026-08.md:16](../../../research-kernel-architecture-2026-08.md))。
  它的典型负载是**几十轮、跨小时的检索型任务**。
- 数据分析的一次完整分析,方案自己估的是「问诊 2-3 轮 + 分析 6-10 工具轮」(agent-plan §8)。
  **装得进 24 轮**。真正的墙是**单个 Bash 调用的 300s**(`registry.ts:369`),
  而那堵墙的正解就是方案已经写好的 **verb 拆分 + 240s 软预算 + partial 退出码**,
  **与 Run 完全正交** —— 拆 verb 是在一条 turn 内部拆,Run 是在 turn 之间拆。
- 更关键:数据分析是**强交互**的(问诊 → 确认计划 → 看结果 → 改主意 → 补分析)。
  Run 的语义是「后台跑、不占前台槽、用户看进度条」(`engine.go:162-185` 的让路闸:
  `inUse >= max-1` 就不认领)。**把一个需要用户 3 次确认的流程放进后台队列,是形态错配**。
  Run 自己的 `awaiting_user` 状态在 Phase 1 **压根不产生**(`model.go:33` 注释自述)。

### 3.3 那什么时候该用 Run?

三个条件同时满足时迁移(不必现在决定,但要**现在就不做妨碍迁移的事**):
1. `coverage.go` + `ExitCriteria` 真实装上(Phase 3)—— 那时"前提检验做了没"可以做成 ExitCriteria;
2. `MaxRounds` 透传打通(Phase 2)+ `MaxRetry` 默认改 2;
3. 出现真正的长任务形态:**批量分析**(一份数据 × 20 个结局变量)、**meta 分析全流程**、
   **蒙特卡洛/bootstrap 大规模重采样跨小时**。这些才是"跑一夜"的形状。

**现在就该做的兼容动作**(零成本):把每一步做成**幂等的 verb + spec 内容 hash 命名的 bundle**
(方案 §5 已经这么设计),那么将来把 verb 序列声明成 `RunTemplate.Steps` 是纯声明工作。
⇒ **方案 §5 的状态机设计本身就是 Run-ready 的,这是它今天最有价值的部分之一。**

---

## Q4 · 证据账本能不能复用来做 numguard 的等价物?

### 判断:**机制可以整套复用,而且这正是证据账本终稿自己规划的路;但今天可复用的是"形状"不是"代码",数值那一格一行都没写。**

### 4.1 可以直接复用的四件(已在生产)

| 件 | 位置 | 复用方式 |
|---|---|---|
| **句柄展开器** | `agent/src/evidence/render.ts:282-305 expandCitations()`(纯函数、零 I/O) | 正则从 `[[E<n>]]` 换成 `{{r:<runId>.<field>}}`,查表从 ledger 换成 bundle。**形状逐字同构** |
| **交付边界胶水**(三个边界共用一份) | `agent/src/evidence/deliver.ts:28 resolveTextForDelivery` / `:44 resolveFileForDelivery`;调用点 = ExportDocument / BuildDeck / `artifacts.ts` emitArtifacts | 数值展开挂同一个函数即可,**不用新建第四条交付路径** |
| **可行动的硬失败文案**(缺失 id + 有效区间 + 下一步动作) | `render.ts:307-315` 的 `citationFailureText` | 方案 §2.6 要的「narration 含 0.71,bundle 最近值 effect.value=0.68」正是这个形态,已有先例 |
| **引擎独占只读目录**(两道闸 + 真 jail 自检) | `confine.ts:66-96` + `bwrap.ts:118-128` + `bwrap.ts:173-208` | `results/` 加进保留集即得「bundle 不可伪造」 |

### 4.2 但有四条硬缺口,必须写进立项

1. **数值那一格今天是零**:`grep RunAnalysis|DesignCheck|{{r:` 全仓零命中。
   证据账本终稿把它排在 P1(:337),**从未开工**。所以是"照着一份已验证的图纸建第二栋",不是"复用一栋现成的"。
2. **numguard ≠ 展开器**。展开器只保证"模型写的句柄有源";
   **numguard 要解的是"模型在句柄之外自己敲了一个数字"** —— 那是一个**扫描+匹配**问题,
   证据账本这边的对等物是 `citation_audit`(带外标注、observe 两周再开 chip,
   [research-kernel-architecture-2026-08.md:278-289]),**同样从未实现**(grep 零命中)。
   ⇒ numguard 的容差匹配 / 中文数词归一 / 白名单那套(agent-plan §2.6)**没有任何现成代码可抄**,
   是真正的新增工作量,且是方案里最容易做出误拦的一块。
3. **写入者冲突**:证据账本能做到"引擎独占"是因为**写入者是 executor 进程**(`runTools.ts` 咽喉点),
   而 StatEngine 的 bundle 是 **jail 内 Bash 子进程**写的。保留区对 Bash 是 `--ro-bind` 全禁 ——
   **同一套机制不能原样套用**。要么 bundle 落 workDir 普通目录 + 由 executor 侧校验搬运进保留区,
   要么给保留区做"引擎可写/模型只读"的区分(bwrap 层做不到,只能靠 executor 中转)。**这一格方案里没有。**
4. **图片旁路**(方案 §2.6「堵图片旁路」+ figures_manifest)在证据账本里**没有对等物** ——
   证据账本只管文本。这块是纯新增。

### 4.3 结论一句话

**复用的是"三段式 + 展开器 + 交付胶水 + 保留区"这四件基础设施(省掉大概 1/3 的引擎外围工作量),
但 numguard 本体(扫描/容差/白名单/图片旁路)是全新的,且是全方案误拦风险最高的一块。**
建议:数值句柄化(`{{r:}}`)先做、numguard 扫描后做,**两者拆开发布** ——
前者是结构保证(便宜、无误拦风险),后者是启发式(必须先跑 observe 模式)。
这与证据账本对 `citation_audit` 的处理(先 observe 两周看假阳性率再开)是同一条纪律。

---

## Q5 · P0 范围(3 个检验族)切错了吗?

### 判断:**切错了一刀,而且切在了最贵的地方 —— 把 Table 1 与信度/量表推到 P1,是把"中文用户最高频的两个入口"推出了 MVP。**
(下述为本文档单方判断,待与需求侧调研合并后复核。)

方案 P0 = `run/compare.py`(t/Welch/Mann-Whitney)+ `chisq.py` + `corr.py` + 非参备胎;
**`table1.py` / `reliability.py` / `efa.py` / `anova.py` 全推 P1**(agent-plan §10)。

**反对理由三条,全部有本仓库自己的调研做证:**

1. **Table 1 是医学论文的"每篇必备",不是进阶功能。** APPENDIX-oss §一③ 自己写的:
   「tableone……**它就是 Table 1 的确定性引擎**」;方案 §1 的三个用户故事里,场景 1(医生两组术后数据)
   的第一个交付物就是三线表。而 P0 交付物清单里 `table1.docx` **在**、`table1.py` **不在** ——
   这是一处内部不自洽:P0 的验收标准①要求"真实 csv 全流程产 docx",但产 docx 的模块被推到了 P1。
2. **信度/量表是"毕业季超高频"且方案自己排过序。** APPENDIX-research §F 五节的原文优先级是
   「统计分析工作台 > **问卷/量表分析(毕业季超高频)** > Meta 分析 > 样本量与设计助手」;
   §B-3 引的 SPSSAU 200 万用户 / 覆盖 95% 高校、问卷星"免费版最多分析 1000 份"都是量表场景的证据。
   把 Cronbach α + EFA 推到 P1,等于 MVP 不覆盖研究生这个最大人群。
3. **生存分析现在变便宜了**,而方案把它排在 P2 且写着"绕开 lifelines 用 statsmodels.duration"——
   **lifelines 0.30.3 今天已在镜像里且 jail 内可 import(实测)**。P2 那条绕路方案作废,
   KM/log-rank/Cox 现在是"接一个 verb"的成本。医学用户的第三大入口因此从 P2 变成 P1 甚至 P0 候选。

**我建议的重切法**(供与需求侧合并时讨论):
- **P0 = 描述性 + Table 1 + 两组比较三件套**(t/Welch/Mann-Whitney + 卡方/Fisher)。
  理由:Table 1 是**所有**医学场景的公共前缀,且它是"不需要问诊就能出的第一个交付物" ——
  用户上传数据后 30 秒内看到一张三线表,是这个产品的 aha moment。
- **P0.5 = 信度(Cronbach α,numpy 十行)+ 相关矩阵**。α 的实现成本极低而覆盖整个问卷人群。
- **P1 = ANOVA + 事后 + 回归族 + EFA + 生存**(lifelines 已在)。
- 相关(corr)从 P0 挪到 P0.5:它单独出现的场景少,通常伴随量表。

---

## 附 · 本次核验实测清单(可复现)

```bash
# 统计库(容器内,非 jail)
docker exec scholar_agent python3 -c "import numpy,scipy,pandas,statsmodels,sklearn,lifelines; print('ok')"
# → ok;seaborn / tableone / pingouin / pyreadstat 均 ModuleNotFoundError;which R → no R

# jail 内真值(启动日志)
docker logs scholar_agent | grep "统计引擎自检"
# → 统计引擎自检通过(声明的库全部可 import) sandbox=bwrap engines=numpy,pandas,scipy,matplotlib,statsmodels,sklearn,lifelines,openpyxl

docker logs scholar_agent | grep "证据保留区"
# → 证据保留区 jail 自检通过(真实 bwrap jail 内 evidence/ 只读,三种写法全部被拒)
```

关键文件索引(本次实读):
- `agent/Dockerfile:44-77`(统计层)· `agent/src/tools/statsEngines.ts`(探测,零消费者)
- `agent/src/sandbox/confine.ts:55-100` · `agent/src/sandbox/bwrap.ts:64-128,154-250`
- `agent/src/tools/registry.ts:105-114(bashEnv),369(timeout),980(AskUserQuestion)`
- `agent/src/turn/turnLoop.ts:36,430` · `agent/src/policy/researchTurn.ts:62-88`
- `agent/src/evidence/{render.ts:282,deliver.ts:28,paths.ts:21,prefetch.ts:159-180}`
- `backend/internal/agentrun/{model.go,template.go:41-57,engine.go:41-73,162-185,242-315,adapter.go:100-124,prompt.go:22-69,handler.go:55-98}`
- `backend/internal/claw/spec.go:150-250` · `backend/internal/scidraw/*.go`(784 行)
- `backend/internal/agentattach/upload.go:60,168,275-370`
- `backend/internal/modelcatalog/model.go:64-70` · `docker/mysql/migrations/{0034,0070,0076,0082}`
- `backend/cmd/server/bootstrap.go:282-311` · `docker-compose.prod.yml:425-427` · `agent/src/server/admission.ts:13`
