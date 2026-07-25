# 统计分析工作台(stat_lab)深度工程方案 v3(评审修订终稿)

> 基于 `docs/claw-capability-research-2026-07/designs/01-stat-lab.md`(骨架照用:FeatureKey=`stat_lab`、agentName=`scholay-stat-lab`、独立 agentbridge feature、~780 行 Go thin wrapper、TemplateCards 入口、迁移/接线三坑照办)。本版吸收全部 9 条评审意见(无一驳回),核心变化:registry.ts 改动如实声明、run/stability/verify 拆 verb 破 300s 硬顶、numguard 契约完整定义、新增 consult verb 补状态机写入通道、内存阈值降 500MB+跨会话锁、golden 参考值改 R 全精度脚本、P0 收窄为 3 检验族 8 天、DataProfile 分层、profiler 子抽样规格化。初版「不加自定义工具、skill 里放代码骨架」的轻做法维持废弃——升级为引擎资产,对标 boltslides 的 deck 引擎 / scidraw 的 compose.ts。

## 1. 总架构:引擎算数,LLM 问诊

```
用户数据(cwd/data/, ≤30MB, csv/xlsx/sav)
   │ 全量数据永不进 LLM 上下文(pandas-ai/LIDA 摘要接地范式)
   ▼
StatEngine(/opt/statengine, 纯 Python, jail 内经 Bash 调 CLI)
   profile → consult → gate(决策表守门) → run → stability → verify → report
   │ stdout 只回 JSON 摘要(capped),数字全部引擎产出
   ▼
LLM(Claude)只做四件事:AskUserQuestion 问诊取值、把用户话翻译成
AnalysisSpec JSON、解读引擎 JSON 结果写定性叙述、编排流程
```

核心裁决(调研证据支撑):StatQA 显示 LLM 主错型是「前提适用性」——恰是最易确定性化的;StatABench 显示光封装工具仍有 74% 统计错——必须再加**选择守门**;DataInterpreter 消融显示结构化计划贡献远大于工具。故采**双车道**:车道 A(默认)=AnalysisSpec 声明式 + 引擎确定性执行,覆盖高频规范分析;车道 B(受守门自由代码)=仅限数据清洗/重塑/**无统计标注的探索图**——推断统计与带显著性标注的成图一律禁入车道 B(skill 红线 + verify 扫 out/ 图产出者兜底,见 §2.6)。

## 2. StatEngine 确定性引擎(核心资产)

### 2.1 位置与形态(修订:如实声明 registry.ts 改动)
- 代码放 `agent/stat-engine/`(仓库内,随 agent 目录评审),Dockerfile `COPY stat-engine /opt/statengine`;vendor 纯 Python wheel 解包到 `/opt/statengine/_vendor/`。
- **jail 内可见,共两处小改**:①`bwrap.ts` 增 `--ro-bind-try /opt/statengine /opt/statengine`;②**`registry.ts` 动 `bashEnv()` 两行**(实查该函数定义在 registry.ts,并非 bwrap.ts——初稿「registry.ts 不动」的说法作废),追加 `PYTHONPATH=/opt/statengine:/opt/statengine/_vendor`。bashEnv 是全 feature 共用白名单(claw/scidraw/BuildDeck 的 Bash 都走它),此处**接受跨 feature 暴露**并记录裁决理由:/opt/statengine 是只读纯代码、零密钥零用户数据,其他 feature 的 Bash 多看见一个 import 路径与多看见 /usr/lib 里一个包无异,不构成攻击面;若后续评审仍有洁癖,备选方案是 bashEnv 按 workDir 前缀条件注入(stat_lab 会话 workDir 可辨),但 MVP 不做——两行无条件注入换实现最简。
- 与 boltslides 的关键差异保留:bolt 的 node_modules 不进 jail 故须 executor 工具;统计的数据**不能出 jail**,引擎必须进 jail,故走 ro-bind + Bash CLI,MVP 零 executor 工具(见 §4)。
- 体量预估:约 35 模块 / 7000-9000 行 Python(不含 vendor),外加 `registry/*.yaml` 约 1500 行声明数据。

### 2.2 模块划分
```
/opt/statengine/statengine/
├── cli.py                  # 入口:python3 -m statengine <verb>(verb 清单见 §2.4)
├── io/loader.py            # csv/xlsx/sav-dta;xlsx 一律 openpyxl read_only 流式逐行
│                           #   转 data/_converted/*.csv 落盘,pandas 只读转换产物
│                           #   (30MB xlsx 经 DOM 加载常见 10-30 倍内存膨胀,禁全量 load)
├── profile/profiler.py     # 数据画像:类型/n/缺失/离群/正态性;n>5000 固定 seed 子抽样
│                           #   跑 Shapiro(scipy 明示 n>5000 p 值失真)+偏峰度佐证,子抽样行为进 golden
├── registry/               # ★方法学真源(声明式,jamovi .a.yaml 蓝本)
│   ├── tests.yaml          # 检验注册表:id/适用前提/实现函数/效应量/事后链/非参备胎/APA模板id
│   ├── decision_tree.yaml  # 检验选择决策树(statsflowchart 逻辑固化)
│   └── spss_mapping.yaml   # SPSS 过程名→本引擎 test id(问诊翻译用)
├── gate/                   # ★守门层(Tea 式约束求解)
│   ├── schema.py           # AnalysisSpec/ConsultAnswers JSON Schema 硬校验
│   ├── resolver.py         # profile×spec 走决策表 → 合法检验白名单+首选+备胎+理由链
│   └── phack.py            # 会话累计检验计数、多重比较闸、探索/验证分流
├── run/                    # 执行层(薄封装,数值出自 statsmodels/scipy 等)
│   ├── compare.py chisq.py corr.py nonparam.py          # P0 三族+非参备胎
│   ├── anova.py regress.py reliability.py efa.py table1.py survival.py   # P1/P2
├── stability/pcs.py        # ★扰动稳定性:bootstrap CI+置换翻转检验(独立 verb,内置时间预算)
├── verify/acv.py           # ★独立校核:非参对照/换参数化复核+out/ 图产出者审计
├── report/
│   ├── apa_text.py         # 中英双语 APA 模板(数字模板插值)
│   ├── docx.py             # python-docx 确定性三线表(上下粗线+表头细线代码化)
│   ├── figures.py          # seaborn+statannotations 出图(Agg/Noto CJK/300dpi png+svg)
│   │                       #   每图写入 out/figures_manifest.json(文件名+sha256+来源verb)
│   ├── numguard.py         # ★数字零转写闸(完整契约见 §2.6)
│   └── script_export.py    # analysis.py 可复现脚本拼装(spec+代码模板+版本清单)
├── state/project.py        # project.json 状态机独家读写(§5)
└── selftest.py             # golden 回归 + jail smoke(§7)
```

**内存纪律**(修订):引擎每重计算段前后经 `resource.getrusage` 自检,**峰值预估超 500MB 即拒**并建议 usecols/抽样(1.5G 容器 2 并发槽,两会话同时 800MB 必 OOM 且 OOM 杀整容器连坐所有会话——perf 审计已列 P0);重计算段(run/stability/verify)以 `flock /opt/statengine/.lock`(只读 fd 亦可排它 flock,绕开 jail 只写 cwd 限制)**跨会话串行化**,等锁超 30s 则返回「排队中」提示模型稍后重试。

### 2.3 JSON 契约草案
**DataProfile 分层**(修订,解决 200+ 列宽数据撑爆上下文):
- `profile` verb stdout 只给**聚合摘要**(≤4KB):`{ "n_rows": 1283, "n_vars": 214, "dtype_counts": {"numeric":180,"nominal":30,"datetime":4}, "problem_vars_top": [{"name":"Q17","issue":"missing_42%"},…≤10], "grouping_candidates": ["组别","性别"], "pairing_hint": null, "warnings": [...] }`
- 全量逐变量 profile(normality/outliers/head_masked)写 `profile.full.json`,**仅供 gate 引擎侧消费**(gate 读文件不经 LLM 转手);LLM 需要看某变量时点查 `statengine profile --var 年龄`(单变量 JSON ≤1KB)。skill 明令禁止 Read profile.full.json。

**AnalysisSpec**(LLM 依问诊填写,gate 校验):
```json
{ "spec_version": 1, "design": "between|within|mixed|correlational|survival|table1",
  "question": "两组术后VAS差异", "dv": [{"name":"VAS","level":"continuous"}],
  "iv": [{"name":"组别","level":"nominal","n_levels":2}], "pairing": false,
  "direction": "two_sided", "alpha": 0.05, "family": "confirmatory|exploratory",
  "corrections": "auto", "requested_test": null }
```
`requested_test` 非空时也必须在 gate 白名单内,否则拒绝并返回理由链——**LLM 无法越过守门指定检验**。
**GateDecision**:`{ "allowed": ["welch_t","mann_whitney"], "chosen": "welch_t", "fallback": "mann_whitney", "reasons": [{"rule":"levene_p<0.05","conclusion":"方差不齐→Welch"}], "corrections_due": {"method":"fdr_bh","k":6} }`
**ResultBundle**(run/stability/verify 三 verb 增量写同一 bundle,报告唯一数字来源):
```json
{ "test_id": "welch_t", "stats": {"t": 2.31, "df": 41.2, "p": 0.0257},
  "effect": {"type":"cohens_d","value":0.68,"ci95":[0.11,1.24]},
  "descriptives": [...], "assumption_report": {...},
  "stability": {"bootstrap_ci":[...], "n_boot_effective": 2000, "degraded": false,
                "perturb_flip_rate": 0.02, "verdict":"stable"},
  "verify": {"counterpart":"mann_whitney","p":0.031,"agrees":true},
  "artifacts": ["out/fig_boxplot.svg"], "apa": {"zh":"…","en":"…"},
  "engine_version":"0.3.0","pkg_versions":{...} }
```

### 2.4 CLI、时间预算与调用(修订:破 300s 硬顶)
实查 registry.ts 的 Bash 工具 timeout 默认 120s、**上限 300_000ms 硬钳**。对 30MB 数据 + bootstrap 5000 次 + CoxPH,一把梭必超时且无部分结果。两层对策:
1. **verb 拆分**:`run`(点估计+前提+效应量,快)、`stability`(bootstrap/置换)、`verify`(非参对照)为三个独立 verb,LLM 分三轮 Bash 调(skill 规定调 Bash 时传 `timeout_ms: 300000`);单分析 3 轮 × 常见 2-4 个分析,24 工具轮预算装得下。三 verb 增量写同一 `results/<id>.bundle.json`(内容 hash 幂等,重试续跑)。
2. **verb 内时间预算**:每 verb 内置 ~240s 软预算(留 60s 余量给解释器启动与 IO),stability 按剩余预算自动降 bootstrap 次数(5000→2000→1000,下限 999),降级即在 bundle 标 `degraded: true` + `n_boot_effective`,报告「稳健性」栏如实披露;超预算仍未完成则落盘已算部分并以退出码 3(partial)返回,模型可续跑而非盲目重试。

其余 verb:`profile [--var <name>]`、`consult --answers <json>`(§5)、`gate specs/001.json`、`report --narration narration.md --out out/`、`status`。所有 verb:stdout 只输出 JSON(≤8KB,超长写文件回传路径)、退出码 0/2(守门拒绝)/3(partial)/1(错误),错误信息面向模型可行动(仿 BuildDeck 回喂编译日志)。

### 2.5 引擎级方法学守门(非 prompt 叮嘱)
七道防线全在代码/声明表里:①schema 硬校验(非法组合不进 LLM);②前提**实测**(profile 自动跑 Shapiro/Levene/期望频数/缺失/样本量);③决策表白名单(tests.yaml+decision_tree.yaml,requested_test 也必须过闸);④数字零转写(numguard,§2.6);⑤稳定性内建(PCS 扰动,报告出「稳健性」栏);⑥p-hacking 闸(phack.py 计数+强制校正+探索/验证分流,「只报显著」请求引擎层拒);⑦可复现交付(analysis.py+版本清单+spec 原文,对标 MSTATA 导出 R 码)。

### 2.6 numguard 契约(修订:完整定义,解决误拦+漏拦)
初稿「数字与 bundle diff,无源即拒」不可执行——舍入、换算、合法语境数字必然误拦,而画进图片的数字又扫不到。终稿契约:
- **提取与规范化**:从叙述文本抽全部数字 token(含全/半角、百分号、中文数词——「两组」「约三分之一」经中文数词表规范化为 2、0.33);百分比↔比例双向换算后匹配。
- **容差匹配(按叙述显示精度)**:候选数字与 bundle 内所有数值字段(含 descriptives 展开)做「同精度舍入相等」判定——叙述写 p=0.026、bundle 为 0.0257,按叙述的 3 位精度舍入 bundle 得 0.026,判有源;禁止反向放水(bundle 0.048 不匹配叙述 0.04)。
- **类别白名单**(免匹配):spec 声明值(α、CI 水平、方向)、n 与组 n(来自 profile)、年份/日期、量表题数与选项数(来自 profile 元数据)、序号/编号。白名单同样有源可溯(源=spec/profile 而非 bundle)。
- **拒绝可行动**:拦截时 stdout 回喂**具体无源数字清单+最近似 bundle 字段**(如「narration 含 0.71,bundle 最近值 effect.value=0.68,请改用引擎值或删除」),模型一轮可修,不打哑谜。
- **堵图片旁路**:推断统计图(带 p 值/星号/CI 标注)**只许 figures.py 产出**,每图登记 `out/figures_manifest.json`(sha256+来源);车道 B 仅限无统计标注探索图;`verify` 扫 out/ 全部图文件,发现 manifest 外的图→标记 `unverified_figure`,report 拒绝将其纳入交付并提示重出。skill 红线同步写明。

### 2.7 LLM 已知错误模式 → 工程防线映射
| 实证错误(来源) | 防线 |
|---|---|
| 适用性错误主错型(StatQA 64.83%)| ②前提实测 + ③白名单,LLM 不判前提 |
| 给工具仍 50% 选错(StatABench)| ③gate 选择,LLM 只确认或在白名单挑 |
| 结果解读错 24% | apa_text 模板产结论句,LLM 只加定性语境 |
| 幻觉数字(引用编造 18-55%)| ④numguard 契约 + 报告数字全模板插值 |
| 单次结论不稳(PCS 6/11 翻转)| ⑤stability 独立 verb 内建 |
| forking paths(BLADE F1~40%)| spec 显式 family 字段 + phack 分流 |
| 复杂模型崩(泊松等)| tests.yaml 未收录方法引擎直接拒 → AskUserQuestion 升级人工 |

## 3. 开源集成
**采用(进镜像)**:apt 层——`python3-statsmodels` 0.14.4(BSD-3,主计算后端)、`python3-sklearn` 1.4.2(BSD-3,EFA/聚类)、`python3-pyreadstat` 1.2.8(Apache-2.0,.sav/.dta 入口)、`python3-seaborn` 0.13.2(BSD-3,图形层);vendor wheel 层(`agent/stat-engine/_vendor/`,构建期解包,全 MIT)——`tableone` 0.9.6(Table 1 引擎)、`scikit-posthocs`(事后比较)、`statannotations` 0.7.2(显著性标线,**进镜像前必须 jail 内跑 seaborn 0.13 兼容 smoke,不兼容则自写 ~150 行标线器**)、`lifelines` 0.30.3+依赖链 autograd/autograd-gamma/formulaic(生存);源码内置——`reliabiliPy`(MIT 单文件,ω 信度,拷进 reliability.py 保留版权头)。P1 追加 vendor:`semopy`(MIT,CFA/SEM)、`great-tables`(MIT,HTML 报告)。**排除**:pingouin(GPL-3)、factor_analyzer(GPL-2)——功能由 BSD 栈+自写效应量(~200 行)覆盖,引擎 import GPL 形成派生风险,不值得。
**借鉴(零代码引入)**:jamovi .a.yaml→registry 声明式;Tea/Tisane→gate 约束求解与问诊消歧;DataInterpreter→DAG 局部重算/self-debug≤2 次后改 spec/ACV 验证;LIDA/pandas-ai→摘要接地;DS-Agent→配方库(P2);AutoGen critic→折叠成引擎 checklist(2 并发槽不开多 agent)。
**R 复核车道取舍**:调研判可行(trixie 全 apt:r-base-core+metafor/car/emmeans/survminer/pwr/broom,~400MB)。**拍板:MVP 纯 Python 主车道;R 车道 P1 随「系统综述 metafor 刚需」一并开通,一次投入两能力摊销**。形态零新范式:引擎 `run/r_bridge.py` 模板生成 R 脚本→Rscript 子进程(jail 内,需补 `--ro-bind /usr/lib/R` `/etc/R`,复刻 /etc 三 bind 先例+smoke)→broom/jsonlite 落 JSON 回 Python。定位「医学可信度复核」:Type-III ANOVA(car,对齐 SPSS)、出版级 KM(survminer)、功效(pwr);GPL 合规=子进程+镜像聚合分发,附 license 清单。

## 4. 工具契约
- **executor 自定义工具:MVP 零个**(有意为之,写进设计评审记录):BuildDeck 存在的理由是 node_modules 不进 jail;StatEngine 反之——数据受 PHI 约束不可出 jail,引擎 ro-bind 进 jail 后 Bash 即够,stdout 天然回喂。避免 ws.go permissionAllowed 加 case、executor 进程读用户数据两件事;registry.ts 仅动 bashEnv 两行(§2.1,如实计入而非声称零改动)。
- **jail 内 Bash**:唯一执行通道,AllowBash=true;skill 规定所有统计调用必须走 `python3 -m statengine`(耗时 verb 传 `timeout_ms: 300000`),车道 B 自由 python 仅限清洗与无标注探索图(numguard+figure manifest 兜底)。
- **AskUserQuestion**:问诊主工具(registry.ts 已上线,引用符号名不引行号——行号随代码漂移,本方案文档一律以符号定位)。
- **MCP 白名单:空**(`AllowedMcpTools: []`,纯统计不触 minicod;用户要文献解释方法时提示转 claw)。DisallowedTools 照初版:WebFetch/WebSearch/Task/BuildDeck/NotebookEdit 禁,Read/Write/Edit/Glob/Grep/Bash/ReadDocument/ExportDocument/AskUserQuestion 留。

## 5. 状态机与项目持久化(多天/多会话)
cwd 契约(**project.json 是唯一真源**,引擎 state/project.py 独家读写,LLM 只读):
```
data/raw.xlsx  data/_converted/  profile.json  profile.full.json
specs/001.spec.json|001.gate.json  results/001.bundle.json
narration/001.md(LLM 叙述稿)  out/(交付物+figures_manifest.json)  project.json
```
`project.json`:`{ "phase": "INIT|PROFILED|CONSULTED|PLANNED|RAN|REPORTED", "analyses": [{"id":"001","spec":"specs/001.spec.json","status":"done|partial|gated|failed|retracted","test_id":"welch_t"}], "consult_answers": {...}, "test_count_family": {...} }`
- **问诊写入通道**(修订,补初稿契约洞):新增 `statengine consult --answers '<json>'` verb——LLM 把 AskUserQuestion 收到的答案整理为 ConsultAnswers JSON(schema:设计/分组/配对/方向/family 五题+自由备注),引擎 schema 校验后写入 `consult_answers` 并推进 phase→CONSULTED。LLM 自始至终不直接写 project.json,唯一真源不破;答案落库后重开会话不重问。
- **恢复**:会话重开(或 `/claw/:sessionId` 深链回来),skill 首条指令=先跑 `statengine status`,引擎输出「当前阶段+已完成分析+下一步建议」摘要,LLM 据此续跑。workdir 被磁盘 GC 后 status 报 missing→引导重传数据(数据文件不进产物收割,丢了只能重传,skill 明示)。
- **可重入**:profile/gate/run/stability/verify/report 全部幂等——run 族以 spec 内容 hash 命名结果,重跑同 spec 直接命中;partial(退出码 3)续跑增量补全;改 spec=新增 `002.spec.json`(**append-only,不改旧文件**),对应 DataInterpreter「局部重算」:report 只聚合 status=done 的最新版分析。
- **用户改主意回滚**:spec 版本化天然支持;「撤掉分析 001」=引擎 verb 标 `retracted`,report 排除之,p-hack 计数**不回退**(方法学上做过的检验就计入 family,刻意设计)。

## 6. skills 分层(`agent-skills/stat-lab-skills/`,compose 挂 `/stat-lab-add/.claude/skills:ro`)
- `workbench/SKILL.md`(流程+守门解释):问诊协议(Tisane 式逐题消歧:设计→分组→配对→方向→探索/验证)、问完即调 `consult --answers` 落库、**verb 编排顺序与 timeout_ms 传法**、gate 拒绝时如何向用户解释理由链、PHI 脱敏提醒与 p-hacking 拒绝话术(引擎拒是硬闸,skill 教「怎么好好说」)、禁 Read profile.full.json。
- `interpret/SKILL.md`(解读手艺):拿 ResultBundle 写定性叙述的口径(效应量的领域语境、稳健性栏与 degraded 披露怎么讲、agrees=false 时如何呈现分歧)——**只教解释,不教计算**;numguard 拒绝回喂后的修稿流程。
- `reporting/SKILL.md`(交付):narration.md 写法(留 `{{apa.zh}}` 插值槽)、report verb 用法、推断图只许 figures.py 出的红线、返修补分析场景模板(流转 Prism wl-data-results)。
- 铁律:skill 里**零统计代码骨架**(代码在引擎里);skill 的 allowed-tools frontmatter 不生效,闸门只认 spec.DisallowedTools。

## 7. 质量评测(上线闸)
- **golden 回归**(修订:参考值可复现化):`agent/stat-engine/tests/golden/` 放 12 个 fixture 数据集(自造中文医学/问卷模拟数据);参考值**一律由 R 脚本产出**——`tests/golden/ref/*.R`(car/emmeans/survival + `jsonlite::toJSON(digits=15)` 全精度导出)生成 `expected/*.json`,脚本进仓库保证任何人可复现再生成;**SPSS 降级为人工抽查对照**(license 是否在手未证实,且其 3 位小数打印输出根本撑不起 1e-6 断言),不进自动断言。容差分级:对 R 全精度参考,统计量/效应量 1e-6,p 值 1e-4;子抽样 Shapiro(§2.2)行为固定 seed 后同样进 golden。`selftest.py --golden` **docker build 期跑**(不过不出镜像),外加 bwrap.ts 启动 `smokeTestStatLabDeps`(真实 jail 内 import statsmodels+tableone+lifelines+statannotations 并跑一次微型 t 检验+标星图,复刻 smokeTestSciDrawDeps,07-21 教训)。
- **端到端 eval**:`docs/…/evals/stat-lab/` 30 个场景脚本(数据+用户话术→期望 test_id+期望产物清单),半自动跑(人审叙述质量);上线验收=①gate 选择与专家标注一致 ≥28/30 ②方差不齐/期望频数不足样例 100% 自动分流并解释 ③numguard 对抗样例(无源数字注入+舍入合法样例不误拦+图片旁路)100% 判定正确 ④p-hacking 话术样例 100% 拒 ⑤golden 全绿+jail smoke 绿。
- **线上监控**:usagestat 记 `stat_lab/message`;每周抽 10 会话审计五指标——gate 拒绝率(过高=决策表太严)、numguard 误拦率(有源被拒即契约 bug)、self-debug >2 占比、verify.agrees=false 率、degraded 降级率;llmusage 看单会话 token 分布防超预算。

## 8. 交互、交付与成本
会话流:上传→引擎 profile(分层摘要,数据不进上下文)→AskUserQuestion 问诊(2-4 题)→`consult` 落库→LLM 填 spec→gate 回决策+理由链→用户确认计划(AskUserQuestion)→run→stability→verify(三轮 Bash)→LLM 写 narration→report 产 `out/`:`table1.docx`、`fig_*.svg/png`、`results_双语.md`、`analysis.py`、`结果解读.md`(全部现有 artifact-format.ts 可预览,autoOpenLatestArtifact=true)。成本:问诊 2-3 轮+分析 6-10 工具轮(verb 拆分多 2 轮但换来无超时重试浪费),input 8-20 万 token,StandardHooks 接 vip 日额度+有界透支,超额 `code=quota_exceeded`。

## 9. 风险登记簿
**技术**:①statannotations×seaborn 0.13 未官宣兼容→进镜像前 jail smoke,败则自写标线器(150 行,列 P0 备用任务);②内存:阈值 500MB 自检+xlsx 流式转存+flock 跨会话串行化(§2.2);**「双槽同时重算」为已知残余风险**——锁化解重算撞车,但两会话同时轻载仍可能叠到告警线,monitor-memory.sh -c 纳入巡检;③Bash 300s 硬顶→verb 拆分+240s 软预算+partial 退出码,风险降级为「降级披露」而非失败;④R 车道 bwrap bind 未知坑→P1 独立 smoke,败不阻塞 Python 主车道;⑤vendor wheel 与 Python 3.13 兼容→构建期 selftest 全绿才出镜像。**合规**:⑥GPL 零引入(pingouin/factor_analyzer 排除;R=子进程聚合分发+license 清单);⑦PHI:数据只在 jail,LLM 只见 masked head 与聚合摘要;skill+prompt 双层脱敏提醒;⑧vendor 包 LICENSE 全文进镜像 `/opt/statengine/_vendor/LICENSES/`。**质量**:⑨决策表本身错=系统性错→tests.yaml 每条规则附教科书出处注释,统计学背景同事评审窗口**显式排进 P0 D5(评审可与 D6-7 并行,不卡关键路径)**+golden 覆盖;⑩LLM 绕过引擎手算 p 值或车道 B 出统计图→numguard+figure manifest+抽样审计盯该项;⑪用户坚持不合法检验→gate 退出码 2+理由链,skill 教「解释而非从命」,绝不加 override 旋钮。

## 10. 里程碑(修订:P0 收窄+如实排期)
- **P0(8 天,范围收窄为三检验族)**:D1-2 引擎地基(cli/loader 流式/profile 分层+子抽样/state/consult + tests.yaml 首版 ~12 条,每条附出处)+registry.ts bashEnv 两行+bwrap 两 bind;D3 gate 三件(schema/resolver/phack)+run.compare/chisq/corr+nonparam 备胎;D4 stability/verify 独立 verb+numguard 完整契约+apa_text+docx 三线表;D5 golden 6 集(R ref 脚本先行)+Dockerfile(apt 三包+COPY+vendor tableone/scikit-posthocs/statannotations+build 期 selftest)+smokeTestStatLabDeps,**同日把 tests.yaml 交统计背景同事评审**;D6 backend `internal/statlab/{spec,handler,artifact}.go`+`prompts/stat_lab.go`+迁移两条(0034 anchor 排除+modelcatalog 绑定)+bootstrap/routes/compose 接线;D7 前端(api/hook 克隆 scidraw+STAT_LAB_CFG+TemplateCards 卡)+三 skill;D8 eval 首 15 场景+验收缓冲。**信度/EFA/anova/table1 全推 P1**——初稿把 20 条规则+6 个 run 模块塞 D1-2 是自估 7000-9000 行的近半、必烂尾在评测,此为刻意砍量而非乐观压缩。验收=§7 五条。
- **P1(约 2 周)**:anova.py+事后链、reliability/efa、regress 回归族、table1(SMD/分层)、.sav 三处同步(pyreadstat+agentattach 白名单+前端 accept)、R 复核车道(apt 6 包+r_bridge+jail smoke)、tests.yaml 扩到 ~25 条、golden 扩 12 集、eval 扩 30 场景。
- **P2**:survival.py(lifelines 主+survminer 图)、semopy CFA/SEM、DS-Agent 式配方库(成功 spec 按设计×形态入库检索改写)、great-tables HTML 报告车道、多文件合并。

关键文件索引:引擎 `/Users/youngp/mypro/fuck_副本/scholar/agent/stat-engine/`(新建);`agent/Dockerfile`(apt/vendor/selftest 层);`agent/src/sandbox/bwrap.ts`(ro-bind+smoke);**`agent/src/tools/registry.ts`(bashEnv 两行 PYTHONPATH,如实计入)**;`backend/internal/statlab/`(仿 `backend/internal/scidraw/spec.go` 范式);`agent-skills/stat-lab-skills/`。
