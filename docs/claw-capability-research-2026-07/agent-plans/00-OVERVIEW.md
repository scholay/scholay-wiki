# 三大重能力 agent 工程方案 · 总览

> 2026-07-24 · 15 子代理(6 路开源调研 + 3 架构师 + 3 对抗评审 + 3 修订)产出。
> 三份终稿:[01 统计分析](01-stat-lab-agent-plan.md) · [02 系统综述](02-sys-review-agent-plan.md) · [03 国自然标书](03-nsfc-grant-agent-plan.md);开源调研原文(含全部 license/包名核实与来源 URL):[APPENDIX-oss.md](APPENDIX-oss.md)。
> 每份方案都过了带代码库的对抗评审(共 26 条实质 issue 全部吸收进终稿,评审确认无编造包名/无约束违背后定稿)。

## 共同架构原则(用户红线:不许提示词+薄 skill)

三个能力共用同一套「**引擎算数,LLM 编排**」范式,与 boltslides(deck 引擎)/scidraw(compose 渲染器)同级:

| | 统计分析 stat_lab | 系统综述 sys_review | 国自然 nsfc_grant |
|---|---|---|---|
| 确定性引擎 | StatEngine `/opt/statengine`(~7000-9000 行 py + 1500 行 YAML 声明) | sysrev-engine `/opt/sysrev-engine`(~2200-2800 行 py) | nsfc-kit `/opt/nsfc-kit`(~2600 行 py) |
| 引擎管什么 | 检验选择守门(决策表)、全部统计计算、三线表 docx、APA 文案模板、数字零转写闸 numguard | 去重、筛选排序、台账状态机(sqlite)、PRISMA 数字、meta 统计、xlsx 视图 | 主张↔引用台账+签名验签、双模板骨架装配、形审 checker、函评聚合 |
| LLM 只做 | 问诊、填 AnalysisSpec、解读结果 | 读摘要给建议(排除权永在用户)、解释 | 拆主张、写 pending 条目、解释报告 |
| executor 工具 | 无(数据不出 jail,引擎 ro-bind 进 jail) | FetchCorpus(bulk 落盘不过上下文) | VerifyClaims(minicod 核验 + ed25519 签名) |
| 防伪机制 | numguard 容差匹配 + figures manifest | 排除态 actor 硬校验(AI 永不能 exclude) | executor 私钥签名,jail 内改不出合法签名 |
| 项目真源 | cwd project.json(引擎独家写,consult verb 落问诊) | cwd .sysrev/ledger.db(sqlite,xlsx 只是视图) | cwd project.json + **MinIO 快照回填**(对抗 30 天 workdir GC) |
| golden 评测 | R 全精度脚本产参考值(1e-6/1e-4 分级容差) | ASySD 去重基准 + metafor 硬编码 golden(<0.01) | formcheck A 档 100%/零误报 + claims 篡改用例 |

## 开源选型拍板(全部实测核过 license 与 Debian trixie 可装性)

- **apt 层**(一次装,三能力共享):`python3-statsmodels` 0.14.4、`python3-sklearn` 1.4.2、`python3-pyreadstat` 1.2.8、`python3-seaborn` 0.13.2、`python3-rapidfuzz` 3.12.2 —— 全 BSD/Apache/MIT。
- **vendor wheel 层**(纯 py,仿 pandoc vendor 先例,全 MIT):`tableone`(医学 Table1 引擎)、`scikit-posthocs`、`statannotations`(须 jail smoke 验 seaborn 0.13 兼容)、`lifelines`+依赖链、`bib-dedupe`(题录去重主引擎)+number-parser;P1:`semopy`、`great-tables`。
- **明确排除(GPL 派生风险)**:pingouin(GPL-3)、factor_analyzer(GPL-2)、PythonMeta(GPL)——功能由 BSD 栈 + ~200 行自写效应量覆盖。
- **R 车道**:trixie apt 有 r-base + r-cran-metafor/car/emmeans/survminer/pwr/broom(~400MB)。拍板:**MVP 纯 Python;P1 开 R 复核车道**(Rscript 子进程 + broom→JSON,GPL 子进程聚合分发合规),一次投入统计(SPSS 口径对齐)+ 综述(metafor 金标)两能力摊销。metafor golden 值离线生成硬编码,CI 不依赖 R。
- **只借设计零引码**:jamovi .a.yaml 声明式分析 spec、Tea/Tisane 约束求解、MetaGPT DataInterpreter(局部重算/self-debug≤2)、otto-SR 六段流水线、ASReview 主动学习范式(sklearn 自建)、Elicit 台账范式、AI-Scientist 函评 ensemble(license 限制)、NSFC LaTeX 模板(MIT,摘编结构)。

## 关键事实修正(对抗评审揪出,后续开发别再踩)

1. 镜像**零 pip 全 apt**;裸 `pip install` 会拉 PyPI numpy 遮蔽 apt numpy 2.2.4,打断按 Debian ABI 编译的 matplotlib/rdkit(殃及现网 sci_draw)——新包只走 apt 或 `--no-deps` vendor。
2. minicod bulk 端点**只有 stc 有**(token 游标);olx/pmd 是 offset 翻页 search;`/v1/pmd/papers/batch` 是按 ID 取详情不是搜索。
3. Bash 工具 300s 硬顶 → 长计算必须拆 verb 分轮调(stat 的 run/stability/verify 三拆)。
4. `EXECUTOR_WORKDIR_TTL_DAYS=30` 磁盘 GC 会蒸发跨月项目 cwd → 国自然必须 MinIO 快照回填;统计/综述明示「数据丢失需重传/导出项目包」。
5. peerreview 的 PersonaRandomPicker+feature_prompts **已废弃**,现行范式是 reviewer-as-skills(agent-skills 目录)——模拟函评照新范式做。
6. 「新会话检测旧项目」不成立(新会话=新 cwd);跨会话续作=同会话深链重入,或 export/import 项目包。
7. jail 内模型持有 Write/Edit,任何「只有工具能写 X」的约定都不是机制——要防伪必须 executor 侧签名(nsfc claims)或引擎侧硬校验(sysrev actor)。
8. golden 参考值不能靠人工抄 SPSS 打印输出(3 位小数撑不起 1e-6 断言)——一律脚本全精度导出。

## 排期建议(合计约 5-6 周)

1. **统计 P0(8 天,收窄为 t 族/卡方/相关三检验族)**——Dockerfile apt+vendor 层一次到位(综述的包也在里面)。
2. **综述 P0(3-4 天,≤50 条演示级闭环)**——FetchCorpus 是唯一新架构件;P1(1 周)上 xlsx 回传裁决+全文阶段后才算真实规模可用。
3. **国自然 P0a+P0b(8-10 天)**——9 月上线窗口充裕;P2 模拟函评赶 11 月(12 月预评审季)。
4. 统计 P1(2 周:anova/信度/EFA/回归/table1/.sav/R 车道)与综述 P2(meta 统计)共享 R 车道与 statsmodels,排在两个 P0 之后。

三 feature 全部走 scidraw thin wrapper 范式接 agentbridge(0034 anchor 迁移、SetVIPChecker 断言、modelcatalog 绑定、TemplateCards 卡、UnifiedSidebar 徽标),配额统一 StandardHooks→vip 日额度,零新计费代码。
