# 数据分析能力卡片 · P0 开工方案(方案 R · statkit-registry)

> **状态**:开工文档。取代此前四份并行设计稿在范围/工期/接口上的分歧。
> **成稿**:2026-08-05。所有仓库事实为当日实读(文件:行号)+ `docker exec scholar_agent` 实测。
> **上游**:[PLAN-方案选型.md](./PLAN-方案选型.md) · [SYNTHESIS-产品形态.md](./SYNTHESIS-产品形态.md) · [SYNTHESIS-需求.md](./SYNTHESIS-需求.md) · [SYNTHESIS-竞品与行业做法.md](./SYNTHESIS-竞品与行业做法.md)
> **冲突时**:本文件是**范围、工期、接口、验收**的唯一真源;产品形态与需求侧仍是**产品判断**的真源;
> 竞品文是**外部事实**的真源。本文件与它们冲突处已在正文逐条标注「就地更正」。

---

## 〇 · 开工须知(一页)

### 0.1 选了什么

**方案 R · statkit-registry**:把统计方法学做成**声明式注册表**(YAML 方法卡 + policy 层 + system 层),
`statkit/core/` 是一个**不认识任何方法名**的通用执行器。三轴正交:

- **方法**沿 `registry/methods/*.yaml` 长(加一张卡 ≈ 半天)
- **学科**沿 `registry/policies/discipline/*.yaml` 长(加一个学科 ≈ 0.6 天,**方法卡一张不动**)
- **格式**沿 `registry/systems/*.yaml` 长(加一套体系 ≈ 1.25 天,**模板一个不动**)

这个赌注只在「会长到 40+ 方法 / 4 套体系 / 5 学科」时成立 —— 用户已拍板③确认会长到那里,故成立。

### 0.2 用户已拍板的八条(2026-08-05,不可推翻)

> 后四条(⑤–⑧)是 2026-08-05 第二轮拍板,直接消解了 §附 的 Q1/Q2/Q3/Q5 四条硬阻塞。
> **Q6(Methods 段标签的一句话定稿)仍未答**,是目前唯一剩下的硬阻塞。

| # | 拍板内容 | 本文件怎么落实 |
|---|---|---|
| **①** | **数字锁做成机制**(接受 +4 天):`analysis/` 升引擎保留区(jail 内 `--ro-bind`,**非 `-try`**),bundle 只能由 jail 外的 executor 内建工具写入,交付闸接 `artifacts.ts` | §四 D1 / D2。⚠️ **红队已证「不发 artifact 帧」是假闸**,D2 已改为三层(工具主路径 / 咽喉点改写 tool_result / 盘上文件隔离),见 §四-D2 |
| **②** | **方法学评审交给 agent**(无人类统计学家签字)。`reviewed_by` 语义重设计,**渲进 Methods 段的标签必须如实** | §三。**并且更严**:Methods 段**只放警告、不放背书**;禁词表**双向**(既禁「统计学家复核」,也禁 Methods 段出现「自动化方法学核对」) |
| **③** | **长期投入**,确认选 R,三轴正交必须保住 | §十。正交做成 `statkit doctor --assert-orthogonal <ref>` 子命令(0.25 天),**不是靠 code review** |
| **④** | **工期可以更长,P0 要更完整**,但必须有明确边界与不做清单 | §五 + §六。P0 = **闭合 2 条完整学科链 + 1 条 5/6**,不做清单 16 条逐条给边际工期 |
| **⑤** | 🔴 **工期不是约束**(原话「不需要考虑工期」)。**解决 §附 Q2** | §0.3 的 62–75 天仍是**估算**,但所有「压到 X 天就砍 Y」的降级选项**全部作废**:§六-6.3 的三档砍法(砍二连表 / 砍 D8 预言机 / 砍批量合并)不再是候选,按最完整口径做。⚠️ **但「工期不是约束」≠「范围无上限」**——§五的不做清单仍然有效,任何扩范围必须同比例扩验收预算(§4.1.3 的 152 格教训) |
| **⑥** | **出处走 OA-primary 路线**:系统性把 primary 换成开放获取文献,教科书降 secondary。**解决 §附 Q3** | §三-3.2。**必须在写卡前做完**(阻塞 B2),要改写 D-01~D-22 的出处列。附带收益:OA 链接可直接写进 Methods 给审稿人查,且 `provenance` 的 `access: oa` 让 doctor V0-⑥ 真正可校验 |
| **⑦** | **base 默认走 `pretest-classic`**(先测 Levene/Shapiro 再分流,把依据链一起交付);`welch-always` 作为用户可选 doctrine 并在 Methods 段如实写明。**解决 §附 Q1** | §三-3.8 + §二-2.11 的 `default_doctrine` 已定值,去掉「待拍板」标记。理由:中文核心期刊主流写法,审稿人原话就是问「How did you test normality?」;两派都如实披露,不存在悄悄替用户选一派 |
| **⑧** | **宿主机给 agent 容器抬到 4G**。**解决 §附 Q5** | §四-D10 的算式成立:4G + `StatRun` 信号量=1。`docker-compose.prod.yml` 的 `mem_limit` 要改,**dev/prod 成对改**。30MB 上传上限的实际可用性保住 |

### 0.3 P0 工期结论(单一数字,禁止分节再改口)

> 🔴 **此前四份设计稿各自写「P0 因此从 30–36 变为 X」,X 分别是 38–46 / 36–42 / 39–45 / 42–50,
> 而它们从未互相读过、各自只替换了 30–36 里的一块。按块去重后重算的结果见下表 —— 这是唯一有效的数字。**

| 块 | 分项 | 天 |
|---|---|---|
| **A · 地基与接线** | A1 三份 hook 工厂化收敛 2.5 · A2 上传通道 + xlsx 真 jail 实测 1.5 · A3 Dockerfile/pip 层(含 PyYAML/Jinja2/pin 定版)1.0 · A4 backend thin wrapper 2.5 · A5 前端 2.5 · A6 skill×3 + system prompt 1.5 | **11.5** |
| **B · 引擎内核与卡片** | B1 `core/`(含 E1–E4 四项 schema 扩展)5.0 · B2 28 张卡全量(卡 + adapter + 模板 + golden,**按逐卡表自底向上**)19.5 · B3 批量 × 合并 1.5 · B4 二连表表形 1.5 | **27.5** |
| **C · 机械防线 D1–D12** | 12.5 + 真 jail 首跑缓冲 1.5 + per-profile 保留区 0.5 + 资源前置项 0.5 | **15.0** |
| **D · 方法学评审 agent** | schema/persona/编排/lint 5.0 · 变异验证 1.0 · 首轮真跑 **50 单元** + 按结论修卡 5.0 | **11.0** |
| **E · 验收与上线闸** | V0–V9 全闸 + §5.4 的验收预算 | **5.0** |
| **合计** | | **70.0** |

**⇒ P0 = 62–75 工作日(单人 13–15 周);承诺基线取 68。**
**⇒ 双人并行 = 36–40 工作日(约 7.5–8 周);承诺基线取 38。** 切法见 §六-6.2。

**与 `PLAN §7.1` 的 30–36 天差 +34(基线):**
① 卡片块自底向上重估 13 → 27.5(+14.5,其中 E1–E4 内核扩展 +1、28 卡而非 21 卡 +6.5、批量合并与二连表 +3、golden 三条新 R 链路 +1、adapters 自写统计 355 行而非 200 行 +2);
② 防线块 5 → 15(+10,**D8–D12 在 §7.1 工期表里一行都没有**,D2 从「不发帧」1.5 天变成三层 3 天);
③ 评审块 0.25 → 11(+10.75,用户拍板②,选型稿完全没有这块);
④ 验收块从「T7 里的 2–3 天」提到独立 5 天(+2.5,§4.1.3 的 152 格教训:**范围扩了验收没扩 = 假绿灯**);
⑤ 接线块小幅上调(+1.5,实读 sci_draw **无** upload 路由、前端接触点 21 个而非 12 个)。

### 0.4 什么条件下要停下来重新讨论

三个止损点,判据与当天降级动作见 **§八**。此处只给触发条件:

| 止损点 | 何时判 | 触发条件 |
|---|---|---|
| ✅ ~~**A · 依赖装不上**~~ | ~~第 1 周末~~ **2026-08-05 已通过** | 判据原文:`docker compose build agent` 不过 / PyYAML·Jinja2·scikit-posthocs 任一装不进 / pip 顶掉 Debian numpy。**四项全过**:镜像构建 exit 0;`yaml 6.0.2` `jinja2 3.1.6` `seaborn 0.13.2` `scikit_posthocs 0.14.0` 全部装入;Debian numpy/scipy/pandas/matplotlib/seaborn/yaml 均未被顶掉;容器启动 `统计引擎自检通过` + `sandbox: bwrap`(**真实 jail 内 import,非裸 docker exec**)。落地改动:`agent/Dockerfile` 同层加装 + 构建期正反双向断言、`agent/src/tools/statsEngines.ts` 的 `DECLARED_ENGINES` 补四项 |
| **B · 声明式内核塞不下** | 第 5 周(B2 的 logistic 完成时) | 加 `logistic` 使 `core/` 增量 > 200 行,**或**加第二张回归卡 `ols_linear` 仍需改 `core/` |
| **C · 数字锁不成立** | 第 7 周(C 块完成时) | V5 四条任一不过(jail 内非 EROFS / `confinePath` 未拒 / `check-evidence-mirror.sh` 非 exit 0 / forge docx 仍被交付) |

**三个止损点都不会让工期爆炸**(A 当天降级、B 净 −1.5 天、C 只改对外话术),这是本切法的设计目标之一。

### 0.5 开工前必须先有答案的问题

**§附 的 16 条**。原本 4 条硬阻塞,**2026-08-05 第二轮拍板已消解 3 条**(见 §0.2 的 ⑤–⑧):

| 原硬阻塞 | 状态 |
|---|---|
| `Q1` 前置检验学派 | ✅ **已拍板**:base = `pretest-classic`,`welch-always` 作可选 doctrine |
| `Q3` 出处可及性路线 | ✅ **已拍板**:走 **OA-primary**,教科书降 secondary。**这是当前第一个开工项**(阻塞 B2 写卡) |
| `Q5` 宿主内存 | ✅ **已拍板**:抬到 **4G**,配 `StatRun` 信号量=1 |
| `Q6` Methods 段标签的一句话定稿 | 🔴 **仍未答 —— 目前唯一的硬阻塞**。工程侧只能保证两条 lint(不出现「统计学家/专家/人工复核」、Methods 段不出现背书句),**写什么必须由能对这句话负责的人给**。最晚 T14 |

另 `Q2`(工期/人力)已由拍板⑤消解:**工期不是约束**,所有按工期砍范围的选项作废。
其余 12 条可以边做边定,但都标了「最晚何时要答案」。

---

## 一 · 总体形态

### 1.1 结构图

```
┌─────────────────────────── 用户(前端 /stat_lab)──────────────────────────┐
│  上传 xlsx/csv → 问诊卡片 → 候选方法表(含被排除的理由)→ 交付物下载        │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ WS(ws_token)
┌───────────────────────────────▼──────────────────────────────────────────┐
│ backend/internal/statlab   ← thin wrapper(spec.go + handler.go +          │
│                               artifact.go,克隆 sci_draw 三件)            │
│   · FeatureSpec{ SandboxNet:"none", BashTimeoutMsDefault, TurnTimeout:25m }│
│   · agentbridge.Bridge.For(statlab.Spec)                                  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ agent HTTP + WS pipe
┌───────────────────────────────▼──────────────────────────────────────────┐
│ scholar_agent (executor 进程,bun)                                        │
│                                                                          │
│  模型 ──Write──▶ plan/spec-03.json      (普通可写区,允许)                │
│  模型 ──StatRun{spec:"plan/spec-03.json"}──▶ ┌─ executor 进程内(jail 外)│
│  模型 ──StatReport{bundle:..., system:...}──▶│   ① confinePath 解 spec    │
│                                              │   ② spawn bwrap jail:      │
│                                              │      python3 -I -m statkit │
│                                              │   ③ 读子进程 stdout        │
│                                              │      (**不经模型**)      │
│                                              │   ④ 校验 reports.required  │
│                                              │   ⑤ 自己写 analysis/*.json │
│                                              │   ⑥ tool_result 只回摘要   │
│                                              └────────────────────────────┘
│                                                                          │
│  ┌──── bwrap jail(net:none,--unshare-all)────────────────────────────┐  │
│  │  /work            ← --bind   会话 cwd(唯一可写)                   │  │
│  │  /work/evidence   ← --ro-bind(既有保留区)                         │  │
│  │  /work/analysis   ← --ro-bind(本次新增保留区)★ 数字物理边界      │  │
│  │  python3 -I -m statkit {profile|consult|assume|run|report}           │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.2 数据流(一次完整分析)

```
① 上传        POST /stat_lab/upload  → agentattach 推文件进会话 cwd(uploads/)
② profile     Bash: python3 -I -m statkit profile --file uploads/x.xlsx
              → stdout:列类型/缺失/分布/n。**准入在这一步**(见 §四 D10)
③ consult     Bash: python3 -I -m statkit consult   → 必答字段缺失即非零退出
              → 模型用 AskUserQuestion 问用户(设计/配对/嵌套/学科/体系)
④ assume      Bash: python3 -I -m statkit assume --spec plan/spec-03.json
              → stdout:候选表 + 每条 blocked 的中文理由 + 下一步该调什么(D11)
⑤ StatRun     builtin:jail 内真跑 → 校验 → 写 analysis/<spec_hash>.bundle.json
                                            + 追加 analysis/mc_ledger.jsonl
⑥ StatReport  builtin:jail 内从 bundle 渲染 → 直接落 out/table1.docx
⑦ 交付        artifacts.ts 发帧 → backend harvestSession 收割 out/ → MinIO
```

**唯一权威的数字来源是 bundle。** 模型在整条链上能碰的只有:spec(它写的)、stdout 摘要(引擎给的)、
产物路径。**它碰不到 bundle 的字节,也碰不到 docx 的字节。**

### 1.3 目录树

```
agent/statkit/                                  ← 新增(pip 装进镜像;开发机可直接跑)
├── pyproject.toml
├── statkit/
│   ├── __main__.py                             ← 🔴 OMP_NUM_THREADS 必须在 import numpy 之前钉
│   ├── cli.py                                  ← verb 分发:profile/consult/assume/run/report/doctor/explain/oracle
│   ├── core/                                   ← **不认识任何方法名**(test_no_method_names_in_core.py 咬)
│   │   ├── facts.py      (~200)  base facts + derived facts 闭合词表
│   │   ├── loader.py     (~140)  YAML → 内存对象 + JSON Schema 校验
│   │   ├── expr.py       (~120)  ast.parse + 节点白名单求值器(**无 Call 节点**)
│   │   ├── solve.py      (~260)  design 角色匹配 → 候选集
│   │   ├── gate.py       (~220)  requires 分相(pre/post_fit)执行
│   │   ├── rank.py       (~150)  policy 层合并 → default(**不改 allowed[]**)
│   │   ├── dispatch.py   (~120)  engine.backend 缺库 → 加载期 enabled:false
│   │   ├── bundle.py     (~230)  reports.required 路径语言校验 + 落盘
│   │   ├── render.py     (~200)  确定性格式化函数 f.p / f.stat / f.effect / f.dispersion
│   │   ├── mc.py         (~90)   多重比较记账(D5)
│   │   └── explain.py    (~110)  决策表快照生成
│   ├── stats/                                  ← 自写统计(~355 行,见 §2.6)
│   ├── adapters/                               ← 薄适配(每个 ~8–20 行)
│   └── registry/                               ← **方法学知识的唯一真源**
│       ├── schema/       method@1.json / policy@1.json / system@1.json /
│       │                 check@1.json / effect@1.json / bundle@1.json /
│       │                 facts@1.json / review@1.json
│       ├── methods/      28 张卡
│       ├── checks/       14 张
│       ├── effects/      9 张
│       ├── policies/     base.yaml + doctrine/{pretest-classic,welch-always} +
│       │                 discipline/{med,agri,psy,econ,general}
│       ├── systems/      cn-core / apa7 / ama / sampl
│       ├── templates/    56 个 .j2(族 × 语言 × 类别;**与体系数无关**)
│       ├── reasons/      zh.yaml / en.yaml(中文依据句;卡里只写 reason_id)
│       ├── provenance/   refs.yaml(citation id → 出处元数据,含 access/role)
│       ├── sources/      manifest.yaml(+ 可及的本地 PDF;见 §三-3.2)
│       └── reviews/      <id>.review.yaml(评审留痕,**不写进卡片**)
└── tests/
    ├── golden/           fixtures/ + ref/*.R(**R 不进镜像**,开发机跑)
    ├── oracle/           20 份公开数据集 × 外部工具期望值(D8)
    └── derived/          decision_table.md + render_snapshots/(快照,进仓库)

agent/src/statkit/                              ← 新增(TS 侧)
├── paths.ts                                    ← ANALYSIS_DIR 常量(叶子模块零依赖)
├── statRun.ts / statReport.ts                  ← 两个 builtin
├── numscan.ts                                  ← D2 的数字集合抽取
└── deliveryGate.ts + deliveryGate.test.ts

backend/internal/statlab/                       ← 新增(克隆 sci_draw 三件)
├── spec.go / handler.go / artifact.go
```

### 1.4 三条不变式(整个方案的地基,写在这里因为它们跨章节)

| # | 不变式 | 判定 | 强制点 |
|---|---|---|---|
| **I-1** | **policy 只能改 `default` 与排序,绝不改 `allowed[]` 的集合** | 【机制】双闸 | `policy@1.json` 无任何「移除」语义的键;`core/rank.py` 出口 `assert set(after) == set(before)`,违反抛 `PolicyViolation` |
| **I-2** | **`core/` 里不出现任何方法名** | 【机制】构建期 + pre-push | `tests/test_no_method_names_in_core.py`:扫 `core/*.py`,与 `registry/methods/*.yaml` 的 `id ∪ name.zh ∪ name.en` 取交集,非空即红。**这是「卡片绑定行为」这个论证的唯一硬证据** |
| **I-3** | **数字只能由 jail 外的 executor 内建工具写入 `analysis/`,交付物的数字必须 ⊆ bundle** | 【机制】三闸 | `confinePath` 保留区拒写 + `bwrap --ro-bind`(非 `-try`)+ D2 交付闸三层。缺任一道等于没有,理由逐字见 `agent/src/evidence/paths.ts:14-19` |

---

## 二 · 方法卡 schema 与第一批卡片

### 2.1 `method@1` 字段总表

文件位置 `agent/statkit/statkit/registry/methods/<id>.yaml`,一卡一文件,**文件名 stem 必须 == `id`**
【机制:`loader.py` 加载期断言 + `doctor` 报错】。

| 字段 | 类型 | 必填 | 语义 | 谁消费 |
|---|---|---|---|---|
| `schema` | const `"statkit/method@1"` | ✅ | 版本化;字段增删必升版 | `loader` |
| `id` | `^[a-z][a-z0-9_]{1,39}$` | ✅ | 全局唯一;是 `bundle.decision.allowed[]` / `chosen` 的取值域 | 全链 |
| `name` | `{zh, en}` | ✅ | 用户可见名。**core/ 里不得出现**(I-2 咬的就是它) | `render` / `assume` stdout |
| `family` | enum | ✅ | `descriptive│two_group│multi_group│posthoc│categorical│correlation│reliability│regression│survival│factor` | `bundle`/`render`/`mc` |
| `status` | `enabled│draft│deprecated` | ✅ | `draft` 不进候选;`doctor --strict` 只对 `enabled` 强制 `golden` 非空 | `solve`/`doctor` |
| `design` | object | ✅ | **角色化**适用条件,见 2.2 | `solve` |
| `derive` | `[<fact id>]` | ⭕ | 本卡需要的**派生事实**名(闭合词表),见 2.3 | `facts` |
| `gate` | `[<expr>]` | ⭕ | 硬适用性。任一为假 → 本卡**不进候选**且不出现在 `blocked[]`(它压根不适用) | `solve` |
| `blocked_when` | `[{when, reason_id}]` | ⭕ | 进候选后被**明确排除**并给中文依据句 | `gate` |
| `requires` | `[<check ref>]` | ⭕ | 前提检验引用,带**分相**,见 2.4 | `gate`/`run` |
| `default_rank` | int 0–999(小者优先) | ✅ | base 层族内默认排序 | `rank` |
| `policy_points` | `[enum]` | ✅ | **本卡允许被 policy 覆盖的键白名单**;不在表里的键 policy 改不动【机制:`rank.py` 断言】 | `rank` |
| `engine` | object | ✅ | 底层实现,见 2.5 | `dispatch`/`run` |
| `effects` | object | 推断类必填 | 效应量与 CI 方法 | `run`/`bundle` |
| `reports` | `{required[], optional[]}` | ✅ | bundle 必填字段的**族增量**(不重列公共必填),路径语言见 2.6 | `bundle` |
| `multiplicity` | object | ⭕ | D5 的卡侧接口,见 2.7 | `mc`/`render` |
| `fallbacks` | `[{to, when, reason_id}]` | ⭕ | 被降级时的建议去向 | `rank`/`assume` stdout |
| `templates` | `{methods, results, table?}` | ✅ | **只到「族 id」,不含语言、不含体系** | `render` |
| `golden` | `[<fixture id>]` minItems 1 | ✅(`enabled` 时) | 空则 `doctor` 拒绝启用 | `doctor`/V1 |
| `tolerance` | `{statistic, p, effect}` | ⭕ | 覆盖默认容差;迭代/随机化方法必须显式放宽并说明 | golden |
| `provenance` | `{citations[], decision_rows[], notes_zh}` | ✅ | 出处。**`citations[]` 是对象数组,含 `access`/`role`**,见 2.8 | `render`/评审 |
| `review` | object | ✅ | 评审留痕**指针 + hash**,见 §三-3.5 | `rank`/`render`/bundle |
| `mem` | `{class, cells_max, note}` | ✅ | D10。`solve` 阶段剔卡 | `solve` |
| `runtime` | `{expected_ms_per_1e4, hard_timeout_s}` | ⭕ | verb 自己钳,不靠模型传 `timeout_ms` | `cli` |

### 2.2 `design` —— 角色匹配(E1)

```yaml
design:
  units: independent          # independent │ paired │ repeated │ single_sample
  roles:                      # role → 约束;未列出的角色默认 arity: 0(出现即不匹配)
    dv:    {arity: 1, scale: [continuous], role_required: true}
    group: {arity: 1, scale: [nominal, binary], levels: {eq: 2}, min_per_level: 3}
  min_n: {total: 6, per_group: 3}
```

- **角色词表(闭合)**:`dv │ iv │ group │ subject │ time │ event │ duration │ item │ covariate │ offset`。
  P1 追加 `mediator│moderator│within_factor` 时**必须同时**扩 `facts@1` 与 `spec` 的字段,不允许只改卡。
- **`scale` 词表(闭合)**:`continuous │ binary │ nominal │ ordinal │ count │ time_to_event`。
- **`arity` 支持 `{min,max}`** —— 这是 logistic / Cox 能用**一张卡**同时覆盖单因素与多因素的原因。
- 🔴 **为什么必须第一天做**:`solve()` 的匹配器直接建在这套词表上。等 P1 再角色化 = 28 张卡全部重写 + 匹配器重写。

### 2.3 `derive` 与事实词表(E2)—— 替代 `gate: py:` 的那件东西

`gate` / `blocked_when` / `tolerance.when` 里的表达式**只能引用两个命名空间**:`design.*` 与 `facts.*`。

| 层 | 来源 | 例 |
|---|---|---|
| **base facts** | `profile` 直接产出,与 spec 无关 | `n_total` `n_missing` `col.<name>.scale` `col.<name>.n_unique` |
| **derived facts** | `core/facts.py` 从 (base × spec) 计算,**闭合词表** | `min_group_n` `group_ratio` `dv_heavy_tail` `dv_ties_ratio` `expected_min` `n_events` `n_nonevents` `k_model_df` `epv` `iv_max_levels` `iv_min_cell_n` `dv_event_rate` `n_items` `n_complete_cases` `censoring_rate` `n_pairs` |

新增一个派生事实 = `facts.py` 加一个函数 + `facts@1.json` 加一条,**不动任何卡**。

🔴 **表达式语言的硬约束**【机制】:

1. `gate:` 值 **schema 层拒绝 `^py:` 前缀**(`method@1.json` 的 `pattern`),写了直接加载失败;
2. 求值器用 `ast.parse` + **节点白名单**(`Compare/BoolOp/UnaryOp/Name/Attribute/Constant/Tuple/In`),
   **无 `Call` 节点、无 `eval`**。单测断言 `"len(x) > 3"` 与 `"__import__('os')"` 都抛 `UnsafeExpression`;
3. `tests/test_expr_grammar.py` 对 28 张卡的全部表达式做一次解析,任何白名单外节点 → 构建失败。

⚠️ **红队指出的真实风险**:算术搬进 `facts.py` 后,`facts.py` 有可能长成当初要避开的那 350 行分支。
对策是 **D7-c 判据**(见 §八 止损点 B):`derive` 词表的新增条数进 `doctor` 输出,
**每族 ≤3 条**是软上限,超过要在 `doctor` 打红横幅并写书面豁免。logistic 一张卡加 8 条 —— 它是**族首**,
豁免理由写进 `docs/OPEN-METHODOLOGY-QUESTIONS.md`;若 `ols_linear`(同族第二张)还要加,那就是止损点 B 触发。

### 2.4 `requires` —— check 引用,带分相(E3)

```yaml
requires:
  - check: shapiro_wilk       # → registry/checks/shapiro_wilk.yaml
    on: dv_by_group           # 闭合词表:dv │ dv_by_group │ diff │ residuals │ table │ model
    phase: pre                # pre(拟合前) │ post_fit(拟合后)   ★ E3
    stance: required          # required │ not_required │ informational
    args: {alpha: 0.05}
    on_violated: demote
    reason_id_violated: R.shapiro_violated
    tolerance:
      - when: "facts.min_group_n >= 30"
        verdict: waived
        reason_id: R.clt_large_n
```

`on_violated` 五档语义(**这是 I-1 的地基**):

| 值 | 效果 | policy 能不能改 |
|---|---|---|
| `block` | 从 `allowed[]` 移除 | ❌ **绝不**【机制:I-1】 |
| `demote` | 留在 `allowed[]`,`rank` 后移 | ✅ 可被 doctrine 放宽到 `none` |
| `warn` | 进 `bundle.assumptions[]` + Methods 段,不影响候选 | ✅ |
| `block_result` | **拟合成功但结果不得出稿**:`StatRun` 拒收(退出码 2),回执带精确原因 | ❌ |
| `none` | 只记录 | — |

`stance: not_required` 的用途:Welch t **不要求方差齐,但仍报告 Levene** —— 因为 Levene 结果本身就是分流依据,
是「把分流依据一起交付」这个卖点的载体。不报它,卖点就没了。

### 2.5 `engine`

```yaml
engine:
  backend: statsmodels        # scipy │ statsmodels │ lifelines │ sklearn │ scikit_posthocs │ statkit
  adapter: statkit.adapters.regression:logit_binary
  formula_builder: glm_additive   # none │ glm_additive
  kwargs: {family: binomial, link: logit, method: newton, maxiter: 100}
  deterministic: true
  seed_required: false
```

- `backend` **必须 ⊆ `agent/src/tools/statsEngines.ts:31-40` 的 `DECLARED_ENGINES`**
  【机制:`doctor` 第③条 + V0 构建期硬失败】。缺库的卡在 `dispatch.py` 加载期**自动从候选集消失**并写明原因
  —— 这正是 `statsEngines.ts:44-47` 注释预留的消费方(「未探测」与「探测为 false」必须可区分)。
- 🔴 **`formula_builder` 是「公式不写进卡片」的关键**:卡片声明用哪种构造器(闭合枚举),
  真正的 `y ~ x1 + C(x2, Treatment("对照"))` 由 `core` 从 `spec.iv[]` + `spec.ref_levels{}` 生成。
  **卡片里没有一个字符是 patsy 语法。** P0 只有 `glm_additive`(纯加法主效应);
  交互项/随机效应/时变协变量 → `formula_method@1`(P1,已定价 2–3 天)。

### 2.6 `reports` —— 路径语言(E4)

```yaml
reports:
  required: [statistic, df, p_exact, effect.ci_method, terms[].effect.ci_low, ...]
```

- **只列族增量**。公共必填(`schema/spec_hash/system/n{}/assumptions[]/decision{}/software{}/multiplicity{}/method.review`)
  由 `bundle@1` 自身强制,卡片**不得重列**【机制:`doctor` 检出重列即报错,防两处漂移】。
- 路径语法三种:`a.b`(对象)· `a[]`(数组**每个元素都要有**)· `a[].b.c`(数组元素的嵌套字段)。
  `StatRun` 逐条校验,缺任一项**拒收 + 退出码 2**。**这是「数字锁」的执行点。**
- 🔴 `terms[]` 是 logistic 能进 `method@1` 的关键之一:两组比较的效应量是标量,回归的效应量是每系数一条。

**自写统计清单**(全部在 `statkit/stats/`,**~355 行**):
CLD 双水平字母 ~40 · Duncan 多重极差 ~50(scipy `studentized_range` 实测可用)· 非中心 t 的效应量 CI ~60 ·
Hosmer-Lemeshow ~40 · Box-Tidwell ~30 · Cronbach α + CITC ~35 · KMO + Bartlett 球形度 ~50 ·
Cochran-Armitage 趋势 ~25 · 分离检测 ~25。
**已从清单剔除**:Welch-ANOVA(实测 `statsmodels.stats.oneway.anova_oneway(use_var='unequal')` 可用)。

### 2.7 `multiplicity` —— D5 的卡侧接口(键名已收口)

```yaml
multiplicity: {family_scope: session, contributes: true, adjust_default: bh}
```

**键名冲突已裁决**:`PLAN §6.1-D5` 用 `mc.family_key`/`mc.alpha_spent`,`SYNTHESIS §4.1.1` 用
`multiplicity.{tests_in_session, method, q_values}`。**按 §4.1.1(bundle 真源)收口并把 D5 两键并入**:

```
bundle.multiplicity = {tests_in_session, family_key, alpha_spent, method, q_values[]}
```

这是 bundle 公共必填字段,**改一次要升 bundle schema 版本** —— 现在定死,后面不许再改。

### 2.8 `provenance` —— 出处必须可核对(评审机制的字段基座)

> 🔴 红队指出:此前设计稿的 `provenance: {citations: [id, id], ...}` 是**字符串数组**,
> 而评审机制的 doctor V0-⑥ 要读 `access`/`role` —— **没有可校验的字段,整条评审在 schema 层就跑不起来**。
> 本稿把它改成对象数组,这是 §三 能成立的前提。

```yaml
provenance:
  citations:
    - {id: delacre2017, role: primary,   access: oa,        doi: "10.5334/irsp.82"}
    - {id: altman1991_ch9, role: secondary, access: print,  locator: "ch.9"}
  decision_rows: [D-01, D-03]
  notes_zh: >- ...
```

- `role ∈ {primary, secondary}` · `access ∈ {oa, paywalled, print, local_pdf}`
- **【机制 · doctor V0-⑥】每条规则至少有一条 `role: primary` 且 `access ∈ {oa, local_pdf}` 的出处**,
  否则该规则 `review.status` 直接落 `escalated`(不阻断构建,只降级)。
- `citations[].id` 必须在 `registry/provenance/refs.yaml` 可解析【机制:`doctor`】。

### 2.9 完整卡片一 · `welch_t`(两组独立样本)

```yaml
# agent/statkit/statkit/registry/methods/welch_t.yaml
schema: statkit/method@1
id: welch_t
name:
  zh: "Welch t 检验(两独立样本,不假定方差齐)"
  en: "Welch's unequal-variances t-test"
family: two_group
status: enabled

design:
  units: independent
  roles:
    dv:    {arity: 1, scale: [continuous], role_required: true}
    group: {arity: 1, scale: [nominal, binary], levels: {eq: 2}, min_per_level: 3, role_required: true}
    subject: {arity: 0}          # 出现 subject 角色 = 配对/重复测量 → 本卡不匹配
  min_n: {total: 6, per_group: 3}

derive: [min_group_n, max_group_n, group_ratio, dv_heavy_tail, dv_ties_ratio]

gate:
  - "design.units == 'independent'"
  - "facts.min_group_n >= 3"

blocked_when:
  - when: "facts.dv_ties_ratio > 0.5"
    reason_id: R.too_many_ties          # 半数以上取值重复 → 实为有序/计数资料

requires:
  - check: shapiro_wilk
    on: dv_by_group
    phase: pre
    stance: required
    args: {alpha: 0.05}
    on_violated: demote
    reason_id_violated: R.shapiro_violated
    tolerance:
      - when: "facts.min_group_n >= 30"
        verdict: waived
        reason_id: R.clt_large_n
  - check: levene
    on: dv_by_group
    phase: pre
    stance: not_required                # ★ 本法不要求方差齐,但必须报告——它就是分流依据本身
    args: {center: median}
    on_violated: none
    reason_id_violated: R.levene_violated

default_rank: 20                        # student_t=10 / welch_t=20 / mann_whitney=30(base 层)
policy_points: [default_rank, effects.default, effects.ci.method]

engine:
  backend: scipy
  adapter: statkit.adapters.two_group:welch_t
  formula_builder: none
  kwargs: {equal_var: false, nan_policy: omit, alternative: two-sided}
  deterministic: true
  seed_required: false

effects:
  default: hedges_g
  allowed: [hedges_g, cohens_d, glass_delta]
  ci: {method: nct, level: 0.95, fallback: normal}

reports:
  required:
    - statistic                          # t
    - df                                 # Welch-Satterthwaite,小数
    - p_exact                            # float 原值,绝不存格式化字符串
    - effect.name
    - effect.value
    - effect.ci_low
    - effect.ci_high
    - effect.ci_method
    - descriptives[].group
    - descriptives[].n
    - descriptives[].mean
    - descriptives[].sd
  optional:
    - mean_diff
    - mean_diff_ci_low
    - mean_diff_ci_high
    - nonparam_crosscheck.method         # 非参对照复核:同时跑 Mann-Whitney,不一致就如实说
    - nonparam_crosscheck.p_exact
    - nonparam_crosscheck.agrees

multiplicity: {family_scope: session, contributes: true, adjust_default: bh}

fallbacks:
  - to: mann_whitney
    when: "facts.min_group_n < 10 or facts.dv_heavy_tail == true"
    reason_id: R.small_n_heavy_tail
  - to: student_t
    when: "facts.group_ratio <= 1.2"
    reason_id: R.balanced_equal_var_ok

templates:
  methods: methods/two_group
  results: results/t_like
  table:   tables/two_group

golden: [g_two_group_unequal_var, g_two_group_unbalanced, g_two_group_n3_edge]
tolerance: {statistic: 1.0e-12, p: 1.0e-10, effect: 1.0e-9}

provenance:
  citations:
    - {id: delacre2017,   role: primary,   access: oa,    doi: "10.5334/irsp.82"}
    - {id: welch1947,     role: secondary, access: paywalled, doi: "10.2307/2332510"}
    - {id: altman1991_ch9, role: secondary, access: print, locator: "ch.9"}
  decision_rows: [D-01, D-03]
  notes_zh: >-
    Delacre 等(2017)主张两组比较**无条件**默认 Welch;本卡的 base 层保留「先测 Levene 再分流」
    (中文期刊主流写法、审稿人要依据链)。切换到无条件 Welch 请启用 doctrine `welch-always`,
    它只改 default 与 check stance,不改 allowed[](不变式 I-1)。

review:
  status: unreviewed                     # 见 §三-3.5;评审脚本回写,不手改
  ref: null
  card_hash: null

mem: {class: o_n, cells_max: null, note: "两列 float64;cells_max 在 A3 周实测后回填"}
runtime: {expected_ms_per_1e4: 12, hard_timeout_s: 60}
```

**体量判读**:93 行,其中 30 行是注释与 `notes_zh`。同族第 2–13 张卡各 ~55 行。
28 卡 + 14 checks + 9 effects + 8 policies + 4 systems ≈ **2600 行 YAML**。

### 2.10 完整卡片二 · `logistic`(D7 体检口)

> ⚠️ **相对此前设计稿的一处硬更正**:`ci: {method: profile}` **在 P0 不可实现** ——
> 实测 `statsmodels` 的 `Logit` **没有 profile-likelihood CI**(`hasattr(sm.Logit,'profile')` = `False`,
> `conf_int()` 是 Wald)。留着它会让 `terms[].effect.ci_method` 永远报 `wald` 而卡片声明 default 是
> `profile` —— **默认值是假的**,而这个字段会被写进 Methods 段。**P0 改成 `wald` 并在 `notes_zh` 写清;
> profile CI 自写约 80 行,挪 P1。**

```yaml
# agent/statkit/statkit/registry/methods/logistic.yaml
schema: statkit/method@1
id: logistic
name: {zh: "二分类 logistic 回归", en: "Binary logistic regression"}
family: regression
status: enabled

design:
  units: independent
  roles:
    dv: {arity: 1, scale: [binary], levels: {eq: 2}, role_required: true}
    iv: {arity: {min: 1, max: 20}, scale: [continuous, binary, nominal, ordinal], role_required: true}
    offset:  {arity: 0}
    subject: {arity: 0}          # 有 subject = 重复测量 → GEE / GLMM(P1),本卡不匹配
  min_n: {total: 30}

derive: [n_events, n_nonevents, k_model_df, epv, iv_max_levels, iv_min_cell_n,
         dv_event_rate, n_complete_cases]        # ⚠️ 8 条,族首豁免,见 §2.3

gate:
  - "facts.n_events >= 5"
  - "facts.n_nonevents >= 5"
  - "facts.k_model_df <= 20"
  - "facts.n_complete_cases >= 30"

blocked_when:
  - when: "facts.epv < 5"
    reason_id: R.epv_below_hard_floor
  - when: "facts.iv_min_cell_n == 0"
    reason_id: R.empty_cell_categorical

requires:
  - {check: epv_min,           on: model, phase: pre,      args: {min: 10}, stance: required,
     on_violated: warn,          reason_id_violated: R.epv_below_10}
  - {check: separation,        on: model, phase: post_fit, args: {abs_coef_max: 15, se_max: 100},
     stance: required, on_violated: block_result, reason_id_violated: R.separation_detected}
  - {check: vif_max,           on: model, phase: post_fit, args: {max: 10}, stance: required,
     on_violated: warn,          reason_id_violated: R.multicollinearity}
  - {check: hosmer_lemeshow,   on: model, phase: post_fit, args: {groups: 10}, stance: informational,
     on_violated: warn,          reason_id_violated: R.gof_poor}
  - {check: linearity_of_logit, on: model, phase: post_fit,
     args: {method: box_tidwell, apply_to: continuous_iv}, stance: informational,
     on_violated: warn,          reason_id_violated: R.logit_nonlinear}

default_rank: 10
policy_points: [default_rank, effects.ci.method, requires.epv_min.args.min]

engine:
  backend: statsmodels
  adapter: statkit.adapters.regression:logit_binary
  formula_builder: glm_additive           # ★ 公式由 core 从 spec 生成,卡里零 patsy 语法
  kwargs: {family: binomial, link: logit, method: newton, maxiter: 100, cov_type: nonrobust}
  deterministic: true
  seed_required: false

effects:
  default: odds_ratio
  allowed: [odds_ratio]
  ci: {method: wald, level: 0.95, fallback: wald}   # ⚠️ P0=wald(statsmodels 无 profile),见上

reports:
  required:
    - model.n_obs
    - model.n_events
    - model.converged
    - model.llr_chi2
    - model.llr_df
    - model.llr_p
    - model.pseudo_r2.name                 # nagelkerke │ mcfadden;名字必报,数值不可比
    - model.pseudo_r2.value
    - reference_coding                     # 每个分类 IV 的参照水平,缺它整张表不可读
    - terms[].variable
    - terms[].level
    - terms[].ref_level
    - terms[].coef
    - terms[].se
    - terms[].wald_z
    - terms[].p_exact
    - terms[].effect.name
    - terms[].effect.value                 # OR
    - terms[].effect.ci_low
    - terms[].effect.ci_high
    - terms[].effect.ci_method
    - terms[].type3.chi2
    - terms[].type3.df
    - terms[].type3.p_exact
    - diagnostics.separation
    - diagnostics.vif_max
    - diagnostics.hosmer_lemeshow.chi2
    - diagnostics.hosmer_lemeshow.df
    - diagnostics.hosmer_lemeshow.p_exact
    - diagnostics.epv
  optional: [model.aic, model.bic, model.auc, diagnostics.cooks_max, terms[].std_coef]

multiplicity: {family_scope: within_card, contributes: false, adjust_default: none}

fallbacks:
  - to: fisher
    when: "facts.k_model_df == 1 and facts.iv_max_levels <= 2 and facts.epv < 5"
    reason_id: R.too_few_events_use_exact

templates:
  methods: methods/regression
  results: results/regression_binary
  table:   tables/regression

golden: [g_logistic_mixed_iv, g_logistic_multilevel_cat, g_logistic_separation, g_logistic_low_epv]
tolerance: {statistic: 1.0e-8, p: 1.0e-8, effect: 1.0e-8}   # IRLS 迭代,收敛容差主导

provenance:
  citations:
    - {id: peduzzi1996,    role: primary,   access: paywalled, doi: "10.1016/S0895-4356(96)00236-3"}
    - {id: vansmeden2016,  role: primary,   access: oa,        doi: "10.1186/s12874-016-0267-3"}
    - {id: hosmer2013_ch1_5, role: secondary, access: print,   locator: "ch.1,5"}
  decision_rows: [D-16, D-17]
  notes_zh: >-
    EPV≥10 出自 Peduzzi 1996;近年有 EPV 可放宽到 5~9 的模拟证据(van Smeden 2016),
    故 <10 设为 warn、<5 设为 blocked,而不是一刀切。
    完全分离时 statsmodels **会"收敛"**并给出 OR≈1e8、CI 覆盖 (0, ∞) 的荒谬结果 ——
    这是本产品能印出的最危险的数字,故 separation 是 block_result 而不是 warn。
    OR 的 CI 在 P0 用 Wald:statsmodels 的 Logit 无 profile-likelihood CI(2026-08-05 实测),
    自写 profile CI 挪 P1。Firth 惩罚似然修正不在 P0(statsmodels 无实现)。

review: {status: unreviewed, ref: null, card_hash: null}
mem: {class: o_nk, cells_max: null, note: "设计矩阵 n×(k+1) float64 + IRLS 约 4 份中间量"}
runtime: {expected_ms_per_1e4: 400, hard_timeout_s: 120}
```

**D7 判定**:logistic **能**在零 `gate: py:` 下用 `method@1` 表达,代价是 schema 必须从第一天长成 E1–E4。
明确表达不了的三样(**这是边界,不是失败**):交互项/多项式项(P1 `formula_method@1`)·
随机效应/时变协变量(第二类卡)· 「单因素筛选 → 多因素」二连表(P0 走 §5.2-B4 的**表形**,不建 pipeline 层)。

### 2.11 `policy@1`(学科默认值覆盖)

```yaml
# registry/policies/discipline/agri.yaml
schema: statkit/policy@1
id: discipline.agri
layer: discipline                 # base │ doctrine │ discipline │ user(层序固定,后者覆盖前者)
applies_to: {subject_field: [农学, 食品科学, 园艺, 植物保护]}

default_overrides:
  - slot: posthoc_after_anova
    to: duncan
    caveat_id: C.duncan_fwer      # ★ 偏离 base 默认时**必填**(JSON Schema if/then 强制)
    citations: [duncan1955, a3_field_convention]

rank_overrides:
  - {id: duncan, delta: -30}
  - {id: lsd,    delta: -10}

check_stance_overrides: {}
effect_preferences: {multi_group: eta_squared}
table_preferences:   {multi_group_cell: "mean_sd_with_letters"}
```

| # | 硬约束 | 判定 | 实现 |
|---|---|---|---|
| **P-1** | policy 只能改 `default` 与 `rank`,不能改 `allowed[]` | 【机制】双闸 | `policy@1.json` 无任何「移除」语义的键 + `rank.py` 出口断言(I-1) |
| **P-2** | 偏离 base 默认必须带 `caveat_id` | 【机制】 | `policy@1.json` 的 `if/then: required:[caveat_id]`;`doctor` 断言 caveat 在 `reasons/{zh,en}.yaml` 双语存在 |
| **P-3** | caveat 必须渲进 Methods 段,且不可被模板吞掉 | 【机制】 | caveat_id 进 `bundle.decision.caveats[]`(公共必填);`render` 从 bundle 取,模板无自由文本槽 |

**`slot` 词表(闭合)**:`two_group_independent │ two_group_paired │ multi_group │ posthoc_after_anova │
posthoc_after_welch_anova │ posthoc_after_kruskal │ contingency_2x2 │ contingency_rxc │ correlation_method │
regression_binary │ regression_continuous │ survival_group │ survival_covariate │ mc_adjust_method │
effect_default.<family>`。
新增 slot = 改词表 + 至少一张卡把它列进 `policy_points`【机制:`doctor` 断言每个 slot 至少被一张 enabled 卡认领,
否则是死旋钮】。

**层合并**:`base ← doctrine ← discipline ← user`,逐 slot 后者覆盖前者,并在 `explain`/`assume` stdout 里保留
provenance:必须能说出「默认 `duncan` 由 `discipline.agri` 第 12 行设定,base 层原为 `tukey`」(D11)。

### 2.12 `system@1`(四套报告体系)

```yaml
# registry/systems/apa7.yaml
schema: statkit/system@1
id: apa7
name: {zh: "APA 第 7 版(心理/教育)", en: "APA 7th"}
lang_default: en

p_format:
  leading_zero: false            # p = .034
  case: lower
  italic: true
  decimals: {gt_01: 2, between_001_01: 3}
  min_display: 0.001             # p < .001
  ns_policy: exact               # exact │ forbid_ns(SAMPL 明令 Do NOT report NS)

dispersion:
  continuous_symmetric: {stat: mean_sd,    notation: "M ± SD"}
  continuous_skewed:    {stat: median_iqr, notation: "Mdn [Q1, Q3]"}
  forbid_in_paren: []            # AMA/SAMPL 在这里放 [se]

ci:    {render: "95% CI [{low}, {high}]", decimals: 2}
stars: {enabled: false, thresholds: [[0.05, "*"], [0.01, "**"], [0.001, "***"]]}
table: {style: three_line, header_lang: en, decimals: {statistic: 2, effect: 2}, df_style: parenthetical}

required_reports: [n, effect, ci, p_exact, assumptions, missing_and_software]
statistic_symbols: {t: "t", F: "F", chi2: "χ²", p: "p", n: "n"}
italic_symbols: true
```

**四套 vs 两套的裁决**:`README.md` 的单一真源表写「P0 只实现中文核心 + APA 两套」,依据是
`SYNTHESIS §4.1.3` 的 152 格模板矩阵。**该依据在本 schema 下不成立** —— 模板与体系正交(见 2.13),
模板数 = 族 × 语言 × 类别 = **56**,4 套与 2 套模板数一样。
**本稿取 4 套**(cn-core / apa7 / ama / sampl),并为此付 **+0.5 天验收预算**(§5.4)。
⚠️ **README 与 §4.1.3 那两行需就地更正** —— 这是本文件对上游文档的唯一一处主动改口,列入 §附 Q9 供确认。

### 2.13 「模板 ⟂ 体系」怎么成立(这是判定 2 的全部含金量)

三件事同时为真才成立:

1. **模板正文里不允许出现数字字面量、符号选择、p 值写法**。模板长这样(`results/t_like.zh.j2`):
   ```jinja
   {{ ctx.gate_sentence }}采用 {{ m.name_zh }}:{{ f.stat(b.statistic, 't', b.df) }},
   {{ f.p(b.p_exact) }},{{ f.effect(b.effect) }}。
   ```
   `f.stat`/`f.p`/`f.effect` 是 `render.py` 里吃 `(值, system)` 的**确定性格式化函数**。
2. **必报项校验不在模板里** —— `report` verb 对照 `system.required_reports` 与 bundle 做集合比较,
   缺项在产物面板标红。所以「AMA 要 X、APA 不要 X」不产生模板分叉。
3. **表格结构由 `table.style` + bundle 字段组决定**,docx 三线表由 `render/docx.py` 排版,不由模板文本决定。

**lint 硬闸**【机制】:`tests/test_templates_are_system_agnostic.py` 扫 56 个模板,出现
① 数字字面量(除 Jinja 索引)② `.` 开头的小数写法 ③ `±`/`*`/裸 `P`/`p` 符号 ④ 任何 system id → **构建失败**。
**没有这条闸,「⟂」会在三周内被一次「就这一处特判」掏空。**

**唯一已知反例(诚实写出来)**:经济学的多模型并列回归表(SE 入括号、星号替代 p 列、多模型横向并排)
改的是**表形**不是格式 → 需要 `systems/_shapes/regression_multi.yaml`,已在 P1 定价 +2 天。
准确表述:**P0 八个族 ⟂ 成立;第一个反例是经管表形,已在 P1 定价。**

### 2.14 第一批卡片清单(28 张)

> 排序依据 = `SYNTHESIS-需求 §1.2.1` 的五条默认链逐步骤,**不按教科书章节**。
> 「链闭合」的口径:**链上每一步都被覆盖才算闭合,没有「闭合了 80%」**。

#### (a) 公共前缀(五条链都要走,17 张)

| # | 卡片 | 族 | 服务的链步骤 | 依赖 | 工期 |
|---|---|---|---|---|---|
| 1 | `table1` | descriptive | 五条链共同第 3 步;兼任医学链「单因素筛选」(以结局分组) | pandas + scipy | 1.5d(族首) |
| 2 | `desc_summary` | descriptive | 经管「论文固定第一张表」 | pandas | 0.25d |
| 3 | `student_t` | two_group | 医/心/生/工 第 4 步 | scipy | 0.5d(族首摊入) |
| 4 | `welch_t` | two_group | 同上(D-03 分流) | scipy | 0.5d |
| 5 | `mann_whitney` | two_group | D-02 | scipy | 0.3d |
| 6 | `paired_t` | two_group | D-04 | scipy | 0.3d |
| 7 | `wilcoxon` | two_group | D-05 | scipy | 0.3d |
| 8 | `anova` | multi_group | **A3 生科第一卡点**(D-06) | statsmodels | 0.5d |
| 9 | `welch_anova` | multi_group | D-07。⚠️ **不需自写**(`anova_oneway(use_var='unequal')` 实测可用) | statsmodels | 0.3d |
| 10 | `kruskal` | multi_group | D-08 | scipy | 0.3d |
| 11 | `tukey` | posthoc | D-10 默认 | `scipy.stats.tukey_hsd` ✅实测 | 0.4d |
| 12 | `duncan` | posthoc | **D-09 农学/食品默认**(A3 硬约束) | **自写**(`studentized_range` ✅实测) | 0.8d |
| 13 | `games_howell` | posthoc | D-11(方差不齐) | scikit-posthocs 或自写 | 0.4d |
| 14 | `dunn` | posthoc | D-12(非参 + BH) | scikit-posthocs 或自写 | 0.4d |
| 15 | `dunnett` | posthoc | 多组对单一对照 | ⚠️ `scipy.stats.dunnett` ✅实测已有 | 0.3d |
| 16 | `chi2` | categorical | 医/心/工 第 4 步(D-13) | scipy | 0.8d(族首) |
| 17 | `fisher` | categorical | D-14 | scipy | 0.3d |

#### (b) 生科农林链的闭合件(0 张新卡)

| 能力 | 落在哪 | 说明 |
|---|---|---|
| **CLD 字母标记(含大小写双水平)** | posthoc 族卡 `reports.required` 的 `cld.groups`/`cld.order` | ✅ **库调用,不自写**。2026-08-05 在**实际安装产物**上实测:`scikit_posthocs.compact_letter_display` 存在(`_grouping.py`,吃任意 `posthoc_*` 的 p 值矩阵 → 组名到字母串的 Series,**原生 52 字母 = a-z 再 A-Z,即「大小写双水平」**,Piepho 2004 sweep-and-absorb 等价算法)。~~该包只有 `sign_array`~~ 与 ~~必须自写 ~40 行~~ 均为本文件成稿时的误记,已更正;`README.md` 修订记录第②条其实是**对的**。golden 断言仍用「同字母组的集合划分等价」而非字符串相等(不同实现的字母可以都对但不同) |
| **Duncan / Games-Howell** | `duncan` / `games_howell` 卡的 `engine` | ⚠️ **这两个才是必须自写的**(各约 60-80 行,`scipy.stats.studentized_range` 提供 q 分布)。发布版 0.14.0 **没有** `posthoc_duncan`(D-09 农学/食品默认)与 `posthoc_games_howell`(D-11 方差不齐默认),它们**只在 GitHub master、从未进发布版**。🔴 **踩坑记录**:先读 master 源码看到 `posthoc_duncan` 就以为有,构建期断言当场 ImportError ——「某库有没有某函数」一律以 tag/发布产物为准,并让构建期断言复核。Dockerfile 已加反向断言:哪天这几个进了发布版就当场提示改为库调用 |
| **多 sheet/多指标批量 + 合并表** | `emit --batch-key` / `report --merge`(verb 参数,不是卡) | A3 独有能力,V3b 的验收对象 |
| **伪重复(嵌套)结构确认** | `consult` 的必答字段 `nesting` | 缺字段 → 非零退出 + 异常正文即该问的题 |

→ **A3 生科农林链在这 17 张卡 + 上述三件下闭合** ✅

#### (c) 医学链的闭合件(+5 张)

| # | 卡片 | 族 | 依赖 | 工期 |
|---|---|---|---|---|
| 18 | `chi2_yates` | categorical | scipy | 0.2d |
| 19 | `cochran_armitage` | categorical | 自写 ~25 行 | 0.4d |
| 20 | `mcnemar` | categorical | `statsmodels...mcnemar` ✅实测 | 0.3d |
| 21 | **`logistic`** | regression | statsmodels(patsy 1.0.1 / formulaic 1.2.2 ✅实测)+ 自写 HL | **3.0d** |
| 22 | `ols_linear` | regression | statsmodels。**兼任止损点 B 的判据卡** | 0.75d |

#### (d) 医学链「预后」分支(+2 张)

| # | 卡片 | 族 | 依赖 | 工期 |
|---|---|---|---|---|
| 23 | `km_logrank` | survival | **lifelines 0.30.3 ✅实测在镜像** | 2.0d(族首) |
| 24 | `cox_ph` | survival | lifelines(单/多因素**同一张卡**) | 1.0d |

→ **A1 医学链闭合** ✅(profile → Table1 → 单因素筛选 → logistic → KM/Cox → Methods)

#### (e) 问卷社科链(+4 张,闭合到 5/6)

| # | 卡片 | 族 | 依赖 | 工期 |
|---|---|---|---|---|
| 25 | `cronbach_alpha` | reliability | numpy 自写(含 CITC) | 0.5d |
| 26 | `correlation` | correlation | scipy | 0.5d |
| 27 | `efa` | factor | `statsmodels.multivariate.factor.Factor` ✅实测 + KMO/Bartlett 自写 | 2.0d(族首) |
| 28 | `harman_single_factor` | factor | 复用 efa 引擎(1 因子不旋转) | 0.5d |

→ **A2 问卷链闭合 5/6,断在「中介/调节」**(理由见 §五)

#### (f) 配套资产与新增决策行

| 资产 | 数量 |
|---|---|
| **check 卡** | **14**:`shapiro_wilk` `levene` `expected_min` `normality_of_diff` `group_balance` `epv_min` `separation` `vif_max` `hosmer_lemeshow` `linearity_of_logit` `ph_assumption`(Schoenfeld) `kmo` `bartlett_sphericity` `outcome_events_min` |
| **effect 卡** | **9**:`hedges_g` `cohens_d` `eta_squared` `epsilon_squared` `cramers_v` `rank_biserial` `odds_ratio` `hazard_ratio` `correlation_r` |
| **policy 包** | **8**:`base` + doctrine{`pretest-classic`,`welch-always`} + discipline{`med`,`agri`,`psy`,`econ`,`general`} |
| **system 包** | **4** |
| **模板** | **56**(Results 14 形态×2 语言 · Methods 8 族×2 · 表 6 类×2) |
| **新增决策行** | **D-16~D-22**:D-16 二分结局+≥1 自变量→`logistic`;**D-17 见下方 🔴 已改**;D-18 连续结局+≥1 自变量→`ols_linear`;D-19 生存资料+组→`km_logrank`;D-20 生存+协变量→`cox_ph`;D-21 量表≥3 题→`cronbach_alpha`;D-22 量表+KMO≥0.6→`efa`。**与 D-01~D-15 一并进评审对象 ⇒ 评审单元 = 28 卡 + 22 规则 = 50** |

#### 🔴 2026-08-05 决策表修正(来源:[REGISTRY-OA出处.md §七](./REGISTRY-OA出处.md#七--对开工方案的回写清单))

OA 出处改写原本只是「换引文」,实际做下来**查出 7 个 default 没有可辩护的一次文献**。
下表是**写卡前必须落定的修正**;未落定的行不得进 T2b。

| 规则 | 原写法 | 🔴 改为 | 依据 |
|---|---|---|---|
| **D-17 fallback** | `blocked` + **建议 `fisher`** | fallback 改 **`firth_logistic`**;statsmodels 无原生实现 → P0 降级为「精简自变量 + 强制披露 EPV」,`fisher` **从该规则移除** | **规则本身写错了**:找不到任何文献主张「低 EPV 改用 Fisher」;文献一致对策是 Firth 惩罚似然(van Smeden 2016 讨论段)。Fisher 解决的是**期望频数过小**,与 EPV 过低是两个问题,被混在了一起 |
| **D-17 阈值** | `EPV<5` → **blocked**(硬拒) | 降为 **`caveat`**:照跑,但强制在 Methods 段披露 EPV 与其不确定性 | 所引 primary 的标题就是 "**No rationale for** 1 variable per 10 events criterion" —— 它在**反对**把 EPV 当硬门槛。硬拒 = 替用户对一个学界无共识的门槛做决定 |
| **D-08 default** | `kruskal`(隐含有据) | default 不变,但 `provenance.role` 标 **`convention`** | 找不到任何 OA 一次文献主张「非正态时应优先 Kruskal-Wallis 而非 Welch-ANOVA」。是教科书惯例,不是有据可循的建议 |
| **D-06 default** | `anova` | default **不变**,但必须把 **Delacre et al. 2019 登记为 `contested` 的另一派**,且 Methods 段如实写明「采用惯例口径」 | 与本族最强的现代 OA 文献**公开冲突**(该文主张即便方差看起来齐也默认 Welch's F)。中文期刊惯例是真实约束故不改 default,但不披露就会被懂行的审稿人问住 |
| **D-22 阈值** | `KMO≥0.6` | 门槛下调到 **0.50**(有出处的那条线),0.60 作为 `caveat` 分界 | 没有 primary 把 0.6 定为准入门槛;Kaiser 1974 只把 .60s 标为 **"mediocre"**、<.50 才是 "unacceptable" |
| **D-21 条件** | `量表≥3 题` | 标 **`convention`**,或改为「题数过少时 α 失真」的 caveat | 没有任何文献给出 3 这个数字作为硬门槛(Tavakol & Dennick 2011 p.54 有可引原文,但说的是趋势不是阈值) |
| **D-14 条件** | `N>40` | 标 **`convention`**;真正有出处的是**期望频数**判据,分流条件收敛到期望频数上 | 找不到任何 OA、甚至任何英文同行评议的 primary 支撑这个总样本量阈值 |
| **D-09 措辞** | policy 里写「农学/食品**审稿人默认要求** Duncan」 | 改为「该学科**最常用**」 | 现有证据只支撑**描述性**事实(Heliyon 2024 Table 1:农业 32.68%、营养与食品安全 46.08% 为该学科使用最多的事后检验),**不支撑规范性主张**。拿描述当规范是本次差点犯的错 |

🔴 **连带的 schema 改动(必须在 §2.8 `provenance` 落地)**:现只有 `role: primary|secondary` 两档,
装不下上面这五条「**有惯例、无一次文献**」的情形。**加第三档 `role: convention`**,并让 `doctor` 对
「以 `convention` 为唯一依据的 default」**强制要求 Methods 段披露**「本默认依学科惯例而非文献建议」。
不加这一档,这五条就只能在 `primary` 与 `secondary` 之间二选一 —— 无论选哪个都是在撒谎。

### 2.15 决策表是**派生产物**,不是第二份真源

【机制 I-4】`bundle.decision.rule_id` 不由卡片声明,而由 `explain` 生成的**决策表快照**反查:
core 对 (design 签名 × gate 判决签名) 算一个 key,在快照里查 D-xx;查不到 → `rule_id: null` + `rule_match: "unlisted"`。
V2-a 的验收是「22 个具名 fixture 全部产出**非空且互不相同**的 rule_id」。

---

## 三 · 方法学评审 agent 机制

> 本章回答一件事:**在没有人类统计学家签字的前提下,方法卡与决策表的方法学正确性由什么承担。**
> `PLAN §2` 把「团队里没有能签字的统计学评审人」逐字列为「推荐方案 R 是错的」四个条件之一。
> 用户已拍板②用 agent 顶上,本章因此必须说清它顶掉了哪一块、**顶不掉哪一块**。

### 3.1 三句话结论

1. **agent 评审顶掉的是「依据错」,顶不掉「缺席错」与「争议裁决」。**
   它能核对「D-01 声称依据 Altman ch.9,那本书第 9 章到底支不支持这句话」;
   它核对不出「决策表少了一整格」(那一格 100% 由 §四-D8 外部预言机承担),
   也无权裁决「前置检验该不该做」(那一格由 doctrine 层显式披露承担,见 3.8)。
2. **产品姿态不是「全绿上线」而是「逐格降级」**:通不过核对的规则进 `escalated`,该规则**永不指向 default**,
   用户在那一格拿到的是候选表而不是推荐值。escalate 计数是可度量的退路。
3. 🔴 **最大的现实风险不是循环论证,是「出处根本不可及」。** 见 3.2 —— 它会**反过来改动决策表的出处列**,
   是设计约束不是流程细节,**必须在写卡之前做完**。

### 3.2 🔴 出处可及性(P0 的第一个开工项)

对 22 条决策表逐条核过出处形态:

| 可及性 | 条数 | 例 | S1 能做什么 |
|---|---|---|---|
> 🔴 **本表已过期(2026-08-05)。** 它是改写**之前**的可及性估算。实际改写后
> **22 条规则全部拿到 OA 或 free_to_read 的 primary**(逐条见 [REGISTRY-OA出处.md §〇](./REGISTRY-OA出处.md)),
> 「2/3 单元会原地 escalate」的预期一并作废。下表保留仅为记录改写前的起点。
> ⚠️ 但 `access: free_to_read` **不等于** `oa`(如 D-22 的 Watkins 2018 是作者站镜像,非出版社 OA),
> schema 要能区分,别把两者抹平成同一档。

| **OA / 可检索全文** | 4–5 | Delacre 2017 *IRSP*(D-03)· Campbell 2007 *Stat Med*(D-13)· van Smeden 2016 *BMC MRM*(D-17) | 真核对,可给 `supports` |
| **付费期刊(有 DOI,摘要可得)** | 5–6 | Duncan 1955 · Dunn 1964 · Games & Howell 1976 · Cochran 1954 · Peduzzi 1996 | 只能核到摘要级 ⇒ 至多 `partially_supports` |
| **纸质教科书** | ~7 | Altman ch.9/ch.12 · Field 5e ch.6 · Zar 5e ch.10–11 · Agresti 3e ch.3/ch.5 · Hosmer 2013 | `unverifiable_by_agent` |
| **未刊手稿** | 1 | **Tukey 1953**(D-10)—— 从未正式出版 | 只能改引二手 |

**对策(必须进 P0,会改动卡片的出处列)**:

| # | 动作 | 判定 |
|---|---|---|
| **(a)** | `provenance.citations[]` 加 `access`/`role`(已在 §2.8 落定);**doctor V0-⑥**:每条规则至少一条 `role: primary` 且 `access ∈ {oa, local_pdf}`,否则 `review.status` 直接 `escalated` | **机制** |
| **(b)** | **优先引可核对的出处**:能引 Delacre 2017(OA)就不把 Altman 当 primary;教科书降 `secondary`。**这会实际改写 D-01~D-22 的出处列,必须在 B2 写卡之前做完**,否则评审轮会有 2/3 单元原地 escalate | 【约定】谁保证:立项负责人;怎么发现违反:doctor V0-⑥ 的 escalated 计数 |
| **(c)** | `registry/sources/manifest.yaml` 登记 `{citation_id, file, pages, sha256}`;doctor 校验声明的文件真实存在且 hash 对得上,声明了没文件 = warn + 该规则 escalate | **机制**(校验部分);**⚠️ 约定 + 待拍板**(谁去买电子版/扫页、版权边界 → §附 Q3) |
| **(d)** | 二手替代:找一篇引用了该教科书这条规则的 OA 综述,标 `via: <doi>`。S1 对 `via` 引用的最高判定是 `partially_supports`,不能给 `supports` | **机制**(判定上限) |

> ⚠️ **Q3 不拍板,后面所有编排设计都是空转。** 三条路二选一即可(见 §附)。

### 3.3 评审对象与粒度

#### (a) 字段四级分类

| 级 | 字段 | 谁审 |
|---|---|---|
| **R1 · 必审(方法学断言)** | `requires[].check` 的选取 · `on_violated`(demote/block)· `tolerance[].when` 的**阈值** · `stance: not_required` · `fallbacks[].when` 的阈值 · `effects.default` 与 `ci.method` · policy 的 `default` 指派 · `blocked_when[].reason_id` 的因果句 · `caveat` 正文 · 决策表 D-01~D-22 的 `条件 → allowed[] → default` | S1 + S2 + S5 |
| **R2 · 需审但不是统计学问题** | `templates/*.j2` 的句式 · `systems/*.yaml` 的格式规则 · 中文可读性 | S4(P0 **不做**,见 §五) |
| **R3 · 不审(golden 咬住)** | `adapters/*.py` · `stats/*.py` 的数值实现 · p 值格式化函数 | **无人**。【机制】persona prompt 把 R3 路径列为禁区,编排器对落在 R3 路径上的 finding **直接判无效并计数**(计数非零 = persona 漂了,要修 prompt) |
| **R4 · 不审但机械登记** | `engine.backend ⊆ DECLARED_ENGINES` · `golden` 非空 · `mem` 量级 | `statkit doctor` |

#### (b) 两类评审单元(**只按卡评审会漏掉最贵的一类错**)

```
card:<id>     一张方法卡的 R1 字段            28 个单元
rule:<D-xx>   一条决策表行:条件 → allowed[] → default → 出处   22 个单元
                                              ───────────────
                                                 合计 50 单元
```

**为什么必须有 `rule:`**:D-03「方差不齐 → default = welch_t」涉及 `welch_t`/`student_t`/`mann_whitney` 三张卡。
三张卡各自都对、**合起来的默认指派仍可能错**(比如 min(n)<10 时更该走 Mann-Whitney)。
只按卡审,这类错误在每张卡的视野之外。

> ⚠️ **单元数从 36 改成 50**(此前设计稿按 21 卡 + 15 规则算)。C/F 两项工期与 V8 阈值分母随之重算。

### 3.4 编排

#### (a) 三视角(P0;职责不重叠,工具面刻意不同)

| id | 角色 | 有无检索 | 唯一合法输出形态 | 参与判定 |
|---|---|---|---|---|
| **S1** | 出处核对员 | ✅ minicod MCP + WebFetch + 本地 `registry/sources/` | 每条 citation 一个 `verdict ∈ {supports, partially_supports, does_not_address, contradicts, not_found, unverifiable_by_agent}` + **1–3 句原文摘录** + locator | ✅ |
| **S2** | 统计学正确性 | ❌ 无网(只读卡 + S1 摘录) | **一个可执行的反例 spec**(`{n_by_group, dist, var_ratio, …}`),不是散文意见 | ✅ |
| **S5** | 对抗反驳 | ✅ 检索 | 输入是 **S1/S2 的结论**(不是卡片);对每条 `supports` 的反驳尝试:出处其实没这么说 / 说的是相反的 / 版次不同 / 摘录断章 | ✅ |

S2 的设计是本章最重要的一处改造:**把「你觉得这条规则对吗」换成「给一个能跑的反例」。**
意见不可机械验证,反例可以 —— 反例 spec 直接喂 statkit **并且**喂 R 参考实现,两边一致地显示默认方法给出
误导结论,才算 `counterexample_status: confirmed`。**模型的「我觉得不妥」在这个协议下不产生任何后果。**

**S3(学科惯例)/ S4(期刊可接受性)P0 不做**(只入 `notes_non_binding`,不参与判定),边际 +1.5 天。
S4 将来复用 `agent-skills/reviewer-skills/rv-domain-biostat/SKILL.md` 的 `<<<SCORING_PERSONA>>>` 段,不重写。

#### (b) 不投票:fail-closed 的连结条件

**明确不用多数票** —— 同源模型的多数票是伪独立,三票同错会产生一个比一票同错**更自信**的假绿。

一个单元判 `pass` 需**同时**满足:
**(a)** S1 至少一条 `role: primary` 的 citation 判 `supports`,且带可定位摘录;
**(b)** S2 未产出 `counterexample_status: confirmed` 的反例;
**(c)** S5 未推翻 (a) 中那条唯一支撑。

任一不满足 → 结论**不是 `fail`**,而是 `escalate`(3.7)或 `positions_verified`(3.8)。
**刻意没有 `fail` 这个终态**:一个「被判错」的规则和一个「没审明白」的规则,产品行为完全一样(不做 default),
分两个词只会诱发「想办法把它从 fail 弄成 pass」的动机。
⚠️ 这一条推翻了某设计稿的 `verdict: fail ⇒ 卡从候选集物理消失` —— 那与 I-1「统计上站得住的选项不因流程状态消失」直接冲突。

**分歧记录:不合并、不平均、不取中位数。** 每个视角的原始判定逐条落 `findings[]`;
「S2 提了反例、S5 认为反例构造本身错了」是**两条并列记录 + 一条 `disagreements[]`**。
口径与 `agent/src/tools/statsEngines.ts:44-47` 一致:**「未探测」与「探测为 false」必须可区分**。

#### (c) workflow 形态

跑在**开发机**,不在 `scholar_agent` 容器里(该容器对 stat_lab 按 D4 是 `net:"none"`,且那是生产面)。

```
scripts/statkit-review/
├── run-review.mjs          编排器 ~600 行
│     ① 枚举待审单元:对每个 card/rule 算 hash,与 reviews/*.review.yaml 对比,只跑漂移的
│     ② 按 S1→S2→S5 串行,视角间传结论;单元之间并发(默认 4)
│     ③ 每次调用要 JSON,不合法就带「只输出合法 JSON」强约束重发,上限 3 次
│        —— 抄 backend/internal/peerreview/service.go 的 chatWithRetry(含「每次重试前重置 slot」那个已踩过的坑)
│     ④ 断点续跑:落 .review-state.json(50×3 次调用,不可重来)
│     ⑤ **只读挂载 registry/**(评审者不得写被评审对象)
├── personas/  s1-citation.md  s2-statistician.md  s5-redteam.md
├── schema/review@1.json
└── README.md               怎么跑、要什么密钥、跑一次多少钱
```

检索工具面按 peerreview 的做法收敛成**正向白名单**(参照 `service.go` 的 `reviewerAllowedMcpTools` 13 项),
不给全部 76 个 minicod 工具 —— 每轮灌满 `tools[]` 会挤掉正事。

#### (d) 触发点(这是本机制唯一的「自动执行点」问题)

`.githooks/pre-push:20-22` 逐字:「**往下面加闸时,秒级是硬预算。加一个要跑 30s 的闸 = 亲手养出绕过习惯**」。
一轮真评审是**小时级** ⇒ **评审本身绝不进 pre-push**。

进 pre-push 的只有两条**毫秒级**的:
① `hash 一致性检查`(算 card_hash 与 review 文件比对,~几十毫秒);
② `scripts/lint-review-labels.py`(禁词表,~几十毫秒)。
按 `scripts/check-evidence-mirror.sh` 的三档退出码契约(0 通过 / 1 失败 / 2 没能检查),
往 `.githooks/pre-push` 的 `GATES` 数组(:44 起)加一行。

**评审本身 = 手动触发的批处理**,发布前跑一次。
⚠️ 这留下「没有自动执行点」的已知弱点 —— 缓解是 hash 检查会把改过的卡打成 `stale`,而 `stale` 在 rank 层
与 `unreviewed` 同等对待(不做 default),**改了卡不重评的代价是那张卡当场失去 default 资格**,自然有动力去跑。
是否要加「对改动过的卡做增量评审」进 pre-push(+0.5 天,push 时多等约 5 秒)→ §附 Q11。

#### (e) 一轮的成本

50 单元 × 3 视角 = 150 次 agent 调用;S1 带检索,单次 3–8 分钟。
并发 4 ⇒ 墙钟约 **4–8 小时**,金钱约**几十美元量级**。增量轮(只跑 hash 漂移的单元)通常 <10 单元。

### 3.5 留痕与失效

#### (a) 结论存在**卡片旁边的独立文件**,不存卡片里

```
registry/methods/welch_t.yaml        ← 被评审对象(~93 行)
registry/reviews/welch_t.review.yaml ← 评审留痕(200–400 行)
registry/reviews/D-03.review.yaml    ← rule: 单元
```

三条理由:① 结论写进被评审对象会让 hash 自指(改结论 → 改 hash → 触发重审 → 死循环);
② review 含摘录/反例/分歧,几百行,塞进卡会淹没评审对象本身;③ git 历史独立可读。

卡片里只留**指针 + hash**:

```yaml
review:
  status: reviewed_agentic | positions_verified | escalated | unreviewed | stale
  ref: reviews/welch_t.review.yaml
  card_hash: sha256:…                     # 评审当时的卡片规范化 hash
```

> **字段名从 `reviewed_by` 改成 `review`**。`reviewed_by` 读起来就是「**谁**审的」,把 agent 结论填进去,
> 字段名本身在撒谎。将来真有统计学家签字时是**新增** `status: reviewed_human` + `reviewer:{name,affiliation,at}`,
> 而不是把 agent 结论塞进一个看起来像人的字段。
> ⚠️ 这动 bundle 公共必填字段(`bundle.method.review`),**要升 `bundle@1` 版本号** —— 现在定死,后面不改。

#### (b) `statkit/review@1` 字段

```yaml
schema: statkit/review@1
unit: card:welch_t                        # 或 rule:D-03
card_hash: sha256:…
reviewed_at: 2026-09-12T10:22:11+08:00
pipeline_version: statkit-review@1.2.0    # persona 集版本 —— prompt 改了要能识别哪些结论过期
models:
  - {role: s1_citation, model: "…", effort: high}
verdict: pass | escalate | positions_verified
findings:
  - agent: s1_citation
    target: "requires[0].tolerance[0].when"          # 指到字段路径,不是「整张卡」
    verdict: supports
    source: {citation: delacre2017, access: oa, role: primary,
             locator: "§3.2, p.7", doi: "10.5334/irsp.82", quote: "…（1–3 句原文）…"}
  - agent: s2_statistician
    target: "default"
    verdict: counterexample_proposed
    counterexample: {spec: {…}, expected_problem: "…"}
    counterexample_status: confirmed | refuted | unverified
  - agent: s5_redteam
    target: "findings[0]"
    verdict: upheld | rebutted
    argument: "…"
disagreements:
  - {between: [s2, s5], about: "default", summary: "…"}
escalation: {required: true, reason: "…", resolved_by: null}
human_spotcheck: {at: null, by: null, checked: []}
notes_non_binding: []
```

#### (c) 失效与重审【机制】

- `card_hash = sha256(canonical_yaml(card 去掉 review 块))`。
  **规范化必须钉死在一个函数里 + 一条单测**:key 按字典序、剥注释、float 归一化(`0.05` 与 `5e-2` 同值)、行尾统一。
  不钉,一次格式化就把 50 个单元全变成 stale。
- `rule_hash = sha256(涉及的各 card_hash 有序拼接 + 该行 policy 片段的规范化文本)`。
- 🔴 **用 `card_hash` 而不是「`review.at` vs 卡片 mtime」** —— mtime 在 `git checkout` 后会全量翻新,
  会把 50 个单元一次性变 stale。(此前某设计稿用 mtime,已推翻。)
- **`statkit doctor` V0-⑥**:`review.card_hash` 与当前算出的不一致 ⇒ 该卡 status **降级 `stale`**,
  `stale` 在 rank/render 层与 `unreviewed` **同等对待**。
- 🔴 **降级,不是构建失败。** 改一个 tolerance 就让 `npm run build`/Docker 构建红,三周内必然长出
  `SKIP_STATKIT_REVIEW=1`,然后整条闸被掏空。

#### (d) 人工抽样 —— **本稿把它从「吵但不阻断」升为发布闸**

> 🔴 红队指出的最贵的一条:`human_spotcheck` 是**唯一检查 S1 有没有编造摘录的东西**。
> 它非阻塞 + 「citations 先于规则体写定」也是约定 ⇒ **`reviewed_agentic` 可以 100% 由幻觉摘录构成而所有闸全绿**,
> 然后这个状态被渲进用户的 Methods 段。**本稿据此改判。**

| 项 | 本稿口径 |
|---|---|
| 覆盖 | **10% 抽样 + 100% 的 escalate 单元** |
| 内容 | **打开 S1 给的 locator,确认那句 quote 真的在那一页上**。检的是「有没有编出处」,不是「规则对不对」——**不需要统计学训练** |
| 可行性保障【机制】 | **只允许 `access ∈ {oa, local_pdf}` 的 primary 出处产生 `reviewed_agentic`**(3.2-a 的 V0-⑥ 已强制)⇒ 抽查 = 打开 PDF ctrl-F,2 小时以内 |
| 判定 | **机制(发布闸 V6-⑤)**:`human_spotcheck.at` 为空的单元数 > 0 时,`doctor --strict` 在发布模式下**非零退出** |
| 谁做 | 立项负责人(见 §附 Q4) |

### 3.6 🔴 对外标签:警告进 Methods,背书不进(改动了 D6 的一半)

用户会把这句话贴进论文。这是诚信问题,不是文案问题。

#### (a) 一条刻意的不对称

| 状态 | Methods 段(会进论文) | 产物面板 / `analysis.py` 头注释 / ICMJE 披露段 |
|---|---|---|
| `unreviewed` / `stale` / `escalated` | ✅ **强制警告** | ✅ 同时显示 |
| `reviewed_agentic` / `positions_verified` | ❌ **不加任何背书句**,只写方法学出处本身 | ✅ 在这里写复核状态 |

三条理由:
1. **警告必须在最贵的位置。** 用户会把 Methods 段整段贴进论文,他必须**在那里**看到警告;删掉它的动作本身就是知情。
2. **正面背书不能进论文。** 「本方法已经过复核」写进 Methods 段 = 我们替用户向期刊做一个我们做不到的担保;
   而且它会主动招来「你用 AI 做统计?」。**审稿人真正关心的是「你为什么用 Welch」——那是出处,不是我们内部谁签了字。**
3. **语义误导。** 「本方法的默认选择依据 Delacre 2017,并经自动化方法学核对」会被读成「本次分析经过核对」,
   而实际含义是「这张卡片的引文在 2026-09 被核对过一次」,与这份数据、这次分析、这个 n **无关**。

#### (b) 三档的确切措辞

**① 已复核 · 产物面板 / ICMJE 披露段(不进 Methods 正文)**

> 中:方法选择依据:规则 D-03(Delacre, Lakens & Leys, 2017)。该规则所引出处已由**自动化方法学核对流程**
> 逐条验证(核对记录 `reviews/welch_t.review.yaml`,2026-09-12)。**本流程不是人类统计学家的审阅**,
> 仅核对规则与其所引文献是否一致,**不构成对本次分析结论的背书**。

> EN: Method-selection rule: D-03 (Delacre, Lakens & Leys, 2017). The source cited for this rule was verified
> item-by-item by an **automated methodological source-check** (record: `reviews/welch_t.review.yaml`, 2026-09-12).
> **This is not a review by a human statistician**; it verifies only that the rule matches the literature it cites,
> and does not endorse the conclusions of this analysis.

**② 未复核 / stale / escalated · Methods 段(强制)**

> 中:本分析中〔方法名〕的选择规则尚未完成方法学核对,建议由具统计学背景者复核。

> EN: The rule used to select 〔method〕 in this analysis has not completed methodological source-checking;
> review by someone with statistical training is recommended.

**③ ICMJE 披露段追加**

> 中:统计方法的选择依据来自平台内置的方法学规则库;规则所引文献出处经自动化核对流程逐条验证,
> **未经人类统计学家审阅**。作者已核验全部结果的准确性并对内容负全部责任。

**④ `positions_verified`(争议方法学)· Methods 段**

> 中:两组间比较一律采用 Welch t 检验,未做方差齐性前置检验(Delacre et al., 2017)。
> (—— 只写所选 doctrine 的做法与出处,**不提复核状态**;两派的对照说明留在产物面板。)

⚠️ 上述 ①③ 的正文需要**能对这句话负责的人**定稿(§附 Q6)。工程侧只保证 lint。

#### (c) 禁词表是**双向**的【机制】

> 🔴 红队指出:此前四份设计稿的 lint(四个不同文件名做同一件事)全部只禁「统计学家/专家/人工复核」,
> 而**明确放行**「自动化方法学核对」⇒ **V6 全绿,误导句照发。这条 lint 守的是一个不会发生的失效模式。**

**合并成一个** `scripts/lint-review-labels.py`(照 `scripts/lint-reviewer-skills.py` 的形态,该文件 116 行),
**按模板所属段落类型分档**,不是全仓一套词表:

| 扫描范围 | 禁什么 |
|---|---|
| **全部**(`registry/templates/**` `registry/systems/**` `registry/reviews/**` `backend/internal/prompts/*.go` + 前端该卡片文案) | 经统计学家复核 / 统计学专家 / 专家审核 / 专家审定 / 方法学专家 / 人工复核 / 已验证正确 / 权威认证 / 保证正确<br>reviewed by a statistician / expert-reviewed / expert-validated / statistically validated / certified / verified correct |
| **仅 Methods 段模板**(`templates/methods/**`) | ➕ 自动化方法学核对 / 核对流程 / 已核对 / automated methodological / source-check |
| 产物面板 / 披露段模板 | 上一行**豁免**(它们就该出现在这里) |

命中即 `exit 1`,挂 `.githooks/pre-push` 的 `GATES`。

#### (d) 标签由 `render` 查表生成,模板里没有这句话的自由文本槽【机制】

1. `bundle.method.review.status` 是**公共必填字段**(不是模板里的一句话:放模板里换体系就丢);
2. 该句由 `render.py` 的**三个字符串常量**按状态查表生成;
3. Jinja2 用 `StrictUndefined`,缺值直接渲染失败。

### 3.7 什么情况下升级到人,以及没有人时的降级

#### (a) 升级触发条件【机制,`run-review.mjs` 判定并写进 review 文件】

1. S1 对**全部** `role: primary` citations 判 `not_found`/`does_not_address` —— 卡片声称的依据不存在;
2. S1 任一条判 `contradicts`;
3. S1 对全部 primary 判 `unverifiable_by_agent`(3.2 的纸书情形,且 `sources/` 里没有扫描件);
4. S2 产出 `counterexample_status: confirmed` 的反例;
5. S5 推翻了唯一支撑该规则的那条 `supports`;
6. 同一 `target` 上出现 `supports` 与 `contradicts` 并存;
7. **D8 外部预言机与卡片 `default` 不一致,且 `blocked_when` 里没有对应理由** —— 两条绳互相打架,
   这是最有信息量的一类信号,**不允许任何一方自动获胜**;
8. 该规则涉及跨学科的社会事实(D-09 农学 Duncan 那种)。

> 注:「规则被标 `contested`」**不在**升级清单里,它走 3.8 的独立通道 —— 争议方法学升级给人也没有答案
> (人也会分成两派),塞进 escalate 只会稀释掉真正需要人的那几条。

#### (b) 没有人可升级时的降级行为(当前的真实处境)

| # | 行为 | 判定 |
|---|---|---|
| 1 | `review.status = escalated` | 【机制】 |
| 2 | `rank()` **永不**把 escalated 的卡指为 `default` | 【机制】 |
| 3 | 该卡**仍进 `allowed[]`** —— I-1 同理适用:统计上站得住的选项不因流程状态消失 | 【机制,写进 `policy@1.json`】 |
| 4 | `assume` 的 stdout(D11)在该卡后附一行:`⚠ 该方法的选择规则未通过自动核对(原因:…),若选用请自行复核` | 【机制,机器注入,不依赖模型读 skill】 |
| 5 | 产物面板显式列出本次分析用到的全部 escalated 卡 | 【机制】 |
| 6 | `tests/derived/decision_table.md` 该行加 `⚠ escalated` 列 —— 让它出现在**评审对象本身**里,而不是躺在一个没人看的 review 文件里 | 【机制】 |
| 7 | 每个 escalated 单元在 `docs/OPEN-METHODOLOGY-QUESTIONS.md` 留一行 | 【约定】谁保证:立项负责人;doctor 比对 escalated 计数与该文件行数,不等即 warn |

#### (c) 一个必须承认的失败模式 + 上线闸 V8

如果 22 条规则里 escalate 了 15 条,产品在那些格子上退化成「只给候选表」。**因此设一条上线闸:**

> **V8**:`rule:` 单元中 `escalated` 数 **≤ 6/22**,且 D-01 / D-04 / D-13(三条最高频路径)必须
> `pass` 或 `positions_verified`。超出即**停下来找人**,不带着 15 条警告上线。

⚠️ **6/22 这个数字是拍的**(按 4/15 等比例换算),没有依据 → §附 Q12。

### 3.8 争议方法学的承载形态(前置检验悖论)

D-01~D-03 的「先测 Levene 再分流」vs Delacre 2017 的「无条件 Welch」—— **不是对错题,agent 和人都裁决不了。**

#### (a) 规则层增加 `contested` 块(结构,不是 boolean)

```yaml
contested:
  question: "两组比较前是否应先做方差齐性检验再分流"
  positions:
    - id: pretest-classic
      stance: "先测 Levene,不齐改 Welch"
      sources: [{id: altman1991_ch9, access: print, role: secondary}]
      cost: "两阶段流程扭曲名义 α(Rasch/Kubinger/Moder 2011;Zimmerman 2004)"
    - id: welch-always
      stance: "一律 Welch,不做方差齐性前置检验"
      sources: [{id: delacre2017, access: oa, role: primary, doi: "10.5334/irsp.82"}]
      cost: "Methods 段不出现分流依据链,部分中文期刊审稿人会追问"
  resolution: doctrine                    # ← 由 policy 链的 doctrine 层选,不由评审裁决
  default_doctrine: pretest-classic       # ✅ 已拍板(2026-08-05,§0.2 ⑦);welch-always 作用户可选 doctrine
  default_rationale: "中文核心期刊主流写法。这是产品裁决,不是统计学正确性判断。"
```

这套结构在 R 的架构里已有位置:`policies/doctrine/{pretest-classic, welch-always}` 本来就在 P0 范围。
`contested` 块只是把「为什么有两个 doctrine」从口头知识变成注册表里的数据。

#### (b) 评审 agent 在 `contested` 规则上的任务**变了**

| 视角 | 常规规则 | contested 规则 |
|---|---|---|
| S1 | 核对本规则的出处 | **两侧都核对**,包括 `cost` 那句话的出处 |
| S2 | 找反例 | 改成「这两条路在什么数据形态下差异最大」——产出可跑的**对照** spec |
| S5 | 反驳 supports | 改成「有没有**第三条路**被漏掉」(bootstrap / 稳健方法) |
| verdict 值域 | `pass`/`escalate` | **`positions_verified`/`escalate`,没有 `pass`** |

#### (c) 产品行为

- `assume` 命中 contested 规则时,stdout 多回一段两派说明(D11);
- `report` 按**所选 doctrine** 渲对应句式,且两种写法都必须自洽。
  **【机制】模板层断言:`welch-always` doctrine 下的 Methods 模板中不得出现 Levene 相关占位符**
  (V4 单测),否则会渲出「一律 Welch」后面跟着一句 Levene 结果的自相矛盾段落;
- **`positions_verified` 在 default 语义上视同已复核**(可以做 default)——理由是它的默认值由 doctrine 层
  **显式选定**且两派都被如实披露。**附带硬条件**:产物面板必须呈现两派对照,否则退回 `escalated`【机制】。
  ⚠️ 这与「有争议就升级到人」的直觉相反 → §附 Q13。

### 3.9 防循环:三条绳必须互不相关(含红队指出的两处断裂)

| 绳 | 咬哪一类错 | 期望值来自 | 介质 | 结构上看不见的 |
|---|---|---|---|---|
| **golden**(R:car/emmeans/agricolae/multcompView/survival/psych/ResourceSelection) | **算错** | R 脚本的**执行输出** | R 代码 + 自造 fixture | **选错** |
| **D8 外部预言机** | **选错**,含**缺席型** | 外部工具的**实际输出** | 公开数据集 | **依据错** |
| **评审 agent** | **依据错** | **出处原文摘录** | 文献文本 | **缺席型**;数值 |

**唯一共因是卡片本身**,切断靠一条硬纪律:**三条绳的期望值都不由卡片作者提供**
(golden = R 跑出来的;D8 = **公开数据集**而非我们造的 fixture;评审 = 出处原文摘录)。

🔴 **红队指出的两处断裂,本稿的处置**:

| 断裂 | 处置 |
|---|---|
| **golden 的「参数选择」不独立**:`welch_t.yaml` 写 `levene args:{center: median}`,R 参考脚本也会写 `leveneTest(center=median)` —— 同一个作者。Hedges g 修正因子、ddof、CLD 排序约定同理 | 【约定 + 一条机制】golden 的 R 脚本**必须由与写卡不同的一轮写**,且 `tests/golden/ref/*.R` 里**禁止 `source()` 卡片 YAML**(机制:lint)。**残余共因如实登记**:参数化口径仍可能同源,这是已知债 |
| **D8 的三家里有两家可能不是预言机**:`rstatix` 是 tidy 包装器(`t_test`/`wilcox_test` 由分析者点名调用),**没有推荐链**;JASP 显示 assumption checks 但检验仍由人选 | **第一周做 30 分钟验证**(§八 止损点 A 的一部分)。不成立则 D8 降为「二源对拍 + 一份教科书判据表」,**并如实改对外材料**(不能再说「独立第二意见」)→ §附 Q7 |

**「citations 必须先于规则体写定」这条约定的诚实评估**:此前设计稿说靠「git 历史里 citation 与规则体同 commit = 可疑」检测。
**红队指出这在实操上恒真**(28 张卡会被一次性成批写出,信号饱和 = 无信号)。
本稿**放弃这个检测**,改为承认它是已知漏洞,由 3.5(d) 的人工抽样(现已升为发布闸)兜底 —— 抽查检的正是
「出处是不是编的」,而事后合理化的出处大概率也编不出可定位的原文摘录。

### 3.10 变异验证:三条绳可能一起是假绿,必须实测【机制】

种入 3 个**已知错误**,断言三条绳各自的红绿如预期:

| 变异 | golden | D8 | 评审 agent |
|---|---|---|---|
| **M1**:D-13 的 default 从 `chi2` 改成 `chi2_yates`(Campbell 2007 明确反对无条件 Yates) | 应绿 | 应红或至少不一致 | **应红**(出处原文反对) |
| **M2**:D-01 的 CLT 豁免阈值从 `n≥30` 改成 `n≥5` | 应绿 | 可能绿 | **应红**(没有任何教科书这么写) |
| **M3**:删掉 D-11(方差不齐的事后比较)整行 | 应绿 | **应红**(缺席型) | **应绿**——它看不见缺席 |

**M3 是这张表的价值所在**:它用实测坐实「D8 不可裁掉」,把这件事从辩论变成数据。
**变异验证不做,三条绳的独立性主张就只是一段文字。** 计 1 天。

### 3.11 机制 vs 约定 · 逐条清单

| # | 规矩 | 判定 | 谁保证 / 怎么发现违反 |
|---|---|---|---|
| 1 | 评审 agent 不得写 `methods/*.yaml` | **机制** | 编排器对 `registry/` 只读挂载 |
| 2 | 落在 R3(数值实现)路径上的 finding 无效 | **机制** | 编排器路径前缀过滤 + 计数;计数非零 = persona 漂了 |
| 3 | 每条规则至少一条 `role: primary` 且 `access ∈ {oa, local_pdf}` | **机制** | `doctor` V0-⑥ |
| 4 | `sources/manifest.yaml` 声明的文件必须存在且 hash 对得上 | **机制** | doctor;声明了没文件 = warn + 该规则 escalate |
| 5 | card_hash 漂移 ⇒ 降级 stale ⇒ 不做 default | **机制** | doctor + `rank()`;**刻意不构建失败** |
| 6 | pre-push 只跑 hash 一致性 + 禁词 lint(毫秒级) | **机制** | `.githooks/pre-push` 的 `GATES` + 三档退出码 |
| 7 | 禁词黑名单**双向**(Methods 段禁背书句) | **机制** | `scripts/lint-review-labels.py` |
| 8 | escalated 卡仍进 `allowed[]` | **机制** | `policy@1.json` + I-1 |
| 9 | `welch-always` doctrine 的 Methods 模板不含 Levene 占位符 | **机制** | 模板层断言(V4 单测) |
| 10 | **人工抽样 ≥10% + 100% escalate** | **机制(发布闸)** | `doctor --strict --release`;⚠️ 但**执行人是约定**(§附 Q4) |
| 11 | **citations 必须先于规则体写定** | ⚠️ **约定 · 已知漏洞** | 无有效检测(信号饱和)。由第 10 条兜底 |
| 12 | `OPEN-METHODOLOGY-QUESTIONS.md` 与 escalated 列表同步 | ⚠️ **约定** | doctor 计数比对不等即 warn |
| 13 | 改了 persona prompt 要升 `pipeline_version` | ⚠️ **约定** | 无自动检测(prompt 内容 hash 可做,P1) |
| 14 | golden 的 R 脚本不得 `source()` 卡片 YAML | **机制** | lint |

---

## 四 · 必装机械防线 D1–D12

> 每条:① 现状(实读引用)② 改什么(精确到函数/行)③ 为什么不破坏其它 feature ④ 验收命令。
> **没有验收命令的防线一律删掉或降级为「已知债」**(§九-9.2)。

### 〇 · 开工前必须接受的五条口径修正

| # | 修正 | 证据 |
|---|---|---|
| **M-1** | **D2 的「不发 artifact 帧」是假闸** | `agent/src/turn/artifacts.ts:300-310` 注释逐字判死过一次;实读复核成立:`backend/internal/claw/artifact.go:200` `GetSessionArtifacts` → `artifact_harvest.go:34` `harvestSession` 直接 `ListWorkspaceFiles(ctx, sessionID, artifactDir)`(`artifact.go:44` `artifactDir = "out"`),**与 artifact 帧无关**。压掉帧只让用户「照样下载到文件、却少一张卡和任何解释」⇒ **D2 唯一有权威的动作是改写/移走落在 `out/` 的那份文件本身** |
| **M-2** | **`ensureReservedDir` 这个函数不存在** | 全仓 grep 无此符号。真实形态是 `agent/src/sandbox/bwrap.ts:69` —— `buildBwrapArgv` **自己**在函数第一行 `mkdirSync(join(profile.cwd, EVIDENCE_DIR), {recursive:true})`,`:63-68` 注释逐字:「在**用它的这一点**上自己保证,是本仓库反复吃亏后的定式:别把不变式托付给远处的调用方」。⚠️ `bwrap.ts:127` 那条注释里写的「见 sandbox/profile 的 ensureReservedDir」是**陈旧注释**,顺手更正 |
| **M-3** | **D3 与 D4 共用同一条六跳字段管线** | `agent/src/server/sessions.ts` 的 `SessionMeta` **没有 feature key**;`ws.ts:477` 的 `net: "open"` 是**字面量**;`allowBash` 靠 `allowBashFor(meta)` 从 denylist 反推。⇒ 合并为一条「会话沙箱剖面」管线,只走一遍六层 |
| **M-4** | **`StatRun` 必须是「执行者」不是「抄写员」** | 若 `statkit run` 的 stdout 经 Bash 进 `tool_result`(即进模型上下文)、模型再把数字打给 `StatEmit`,**数字就完整经过了模型的手**,D1 的物理边界当场失效且失效方式极隐蔽(bundle 里的数字确实过了 schema 校验,只是值可以是模型改的) |
| **M-5** | **`PyYAML` 与 `Jinja2` 在 `scholar_agent` 镜像里都没有** | 2026-08-05 `docker exec scholar_agent python3 -c "import yaml"` → `ModuleNotFoundError`;`jinja2` 同。**整个注册表读不了 YAML、模板渲不了 = P0 硬 DOA。** 且 `pip3` 已被 `agent/Dockerfile:75` purge(实测 `which pip3` → 空) |

---

### D1 · `analysis/` 升引擎保留区 + bundle 写入者搬出 jail 【机制】· 3.5 天

#### (a) 现状:`evidence/` 保留区的四件套(逐行)

| # | 位置 | 干什么 |
|---|---|---|
| ① 常量 | `agent/src/evidence/paths.ts:21` `export const EVIDENCE_DIR = "evidence"` | 叶子模块、零依赖,故 `sandbox/confine.ts` 可 import 它而不成环(`paths.ts:1-2` 注释明写这是它单独存在的理由) |
| ② 进程内写面 | `agent/src/sandbox/confine.ts:67` `inReserved()` + `:94-95` 的 `forWrite` 分支 | 用 **canonical** 路径判定(`:53-64` 的 `canonicalize()`),故 `ln -s evidence x` 绕不过 |
| ③ jail 内写面 | `bwrap.ts:112` `--bind profile.cwd /work` **之后**,`:122` `--ro-bind join(cwd,EVIDENCE_DIR) /work/evidence` | bwrap 按参数顺序应用、后者盖前者;`:114-121` 注释写死为什么**不能**用 `-try`(源缺失静默跳过 = 永远绿的规则) |
| ④ 真 jail 自检 | `bwrap.ts:173` `smokeTestEvidenceReadonly()`(`index.ts` 启动时调) | argv 断言(`reserved.test.ts:87-118`,共九条)只能证明参数在场,证明不了内核真拦住了;这条在真 jail 里试三种写法(`>>` / `touch` / `mkdir`) |

写入者在 jail 外:`evidence/ledger.ts:112-114` 的 `dirOf(workDir)`(实读 `:112` `function dirOf`) 直接 `join(workDir, DIR)`,**不过 `confinePath`** ——
保留区写入者必须绕开 forWrite 闸,这是既定形态不是漏洞。

#### (b) 改什么(9 个落点)

| # | 文件:行 | 改法 |
|---|---|---|
| **D1-a** | 新建 `agent/src/statkit/paths.ts` | 照抄 `evidence/paths.ts` 形态:`export const ANALYSIS_DIR = "analysis"`,**叶子模块零依赖**,文件头写清「它是『数字不经模型手』这条立论的唯一物理边界」 |
| **D1-b** | `agent/src/sandbox/profile.ts:7-12` `SandboxProfile` | 加 `reservedDirs: string[]`(默认 `[EVIDENCE_DIR]`);`profileFor()` 第三参已有 `roBinds` 的先例,照抄加第四参。**全仓只有两个真调用点**:`registry.ts:361`(Bash)与 `:527`(`runConverterConfined`),改动面可控 |
| **D1-c** | `agent/src/sandbox/confine.ts:8` / `:67` | `inReserved()` 改成对 `profile.reservedDirs`(或传入的目录集)循环判定。**`:95` 的报错文本要带上具体目录名**(现在硬编码 `EVIDENCE_DIR`),否则模型看到 evidence 的错却是写 analysis 被拒,会去改错地方 |
| **D1-d** | `bwrap.ts:69` | `mkdirSync` 改成对 `profile.reservedDirs` 循环。理由与 `:63-68` 注释同(存量会话跨重启存活,prod 有 `./data/agent-sessions` 绑定挂载) |
| **D1-e** | `bwrap.ts:122` | `--ro-bind` 改成对 `profile.reservedDirs` 循环。**必须在 `:112` 的 `--bind` 之后、`:123` 的 `--chdir` 之前;非 `-try`** |
| **D1-f** | `bwrap.ts:173` `smokeTestEvidenceReadonly` | 泛化成 `smokeTestReservedReadonly(dirs)`,对两个保留区各跑一遍。跳过分支(`:174-180`)的告警文案要同时点名两个目录 |
| **D1-g** | `agent/src/sandbox/reserved.test.ts` | 新增一个 `describe` 平行覆盖 `analysis/`,**现有九条一条都不能少**(直写拒 / 目录本身拒 / `ln -s analysis x` 拒 / 嵌套软链拒 / `/work/analysis/...` 别名拒 / **读允许** / `analysis-notes` 不误伤 / ro-bind 在可写 bind 之后 / 非 `-try` / 目录缺失不 throw)——现有每条都对应一个真实绕过路径 |
| **D1-h** | `agent/src/tools/registry.ts` 的 `all[]` | 注册 `StatRun` / `StatReport` 两个 builtin,`builtinRegistry` 自动生效 |
| **D1-i** | `backend/internal/agentbridge/ws.go` `permissionAllowed`(:298) | 加两条显式 case(形态照抄 `:352-360` 的 EvidenceGet 段,含「为什么这个放行面安全」的注释)。**漏加即命中 `:391` 的 `default: return false` = DOA** |

#### (c) 🔴 `StatRun` / `StatReport` 的正确形态(M-4)

```
模型 → Write plan/spec-03.json                    （普通可写区,允许）
模型 → StatRun { spec: "plan/spec-03.json" }
        └─ executor 进程内(jail 外):
           ① confinePath(spec, forWrite=false) 拿 canonical 路径
           ② buildBwrapArgv(profile, ["python3","-I","-m","statkit","run",
                                      "--spec","/work/plan/spec-03.json"])
              → jail、net:none、固定 argv、无 shell、软预算 240s / 硬杀 300s
           ③ 解析 stdout 的 MethodResult JSON（**不经模型**）
           ④ 按 card.reports.required 校验;缺项 → 退出码 2 + 精确差额
           ⑤ 自己写 <workDir>/analysis/<spec_hash>.bundle.json（绕开 confinePath,同 ledger.ts）
              + 追加 <workDir>/analysis/mc_ledger.jsonl（同一次动作、同一把锁）
           ⑥ tool_result 只回:落盘路径 + 决策依据句 + **格式化后**的关键结论摘要
```

`StatReport` 同型:jail 内跑 `python3 -I -m statkit report --bundle /work/analysis/x.bundle.json
--system cn-core --out /work/out/table1.docx`。**docx 由引擎在 jail 内直接落 `out/`,模型全程碰不到字节。**
这是 D2 的主路径 L1。

**🔴 `-I` 不是可选项【机制】。** `python3 -m statkit` 会把 **cwd 放进 `sys.path[0]`**,而 bwrap 是
`--chdir /work`(`bwrap.ts:129`)、`/work` 是唯一可写目录 ⇒ 模型只要
`mkdir statkit && echo 'print(fake)' > statkit/__main__.py` 就能**劫持整个引擎,且所有闸同时失效且全绿**。
`python3 -I`(隐含 `-P` + `-E`)移除 cwd 与环境影响。同理 D2 的内联抽取脚本必须写成 `python3 -I -c`。
(现有 `registry.ts` 的 `python3 XLSX2TEXT_SCRIPT p` 不受影响:`sys.path[0]` 是脚本目录 `/app/src/tools`,模型写不到那里。)

**两个 builtin 而不是一个带 `verb` 参数的 `Statkit`**:放行面各自可读、tool 描述更窄(模型更少误用),
与 `SubmitAnswer`/`DeclareInsufficient` 成对的先例一致。

#### (d) `permissionParity.test.ts` 自动覆盖(零改动)

`agent/src/tools/permissionParity.test.ts:55` 逐个遍历 `builtinRegistry.keys()`,`:58` 用带引号的
`body.includes('"' + name + '"')` 在 `ws.go` 的 `permissionAllowed` 函数体里找。**注册即被咬,测试文件一行不改。**
`scripts/check-evidence-mirror.sh` 的 `TESTS_REL`(:60-62)已含该文件,`.githooks/pre-push` 的 `GATES`(:44-47)调它。

⚠️ 但注意 `permissionParity.test.ts:19-24` 的诚实声明:agent 的 Docker 构建 context 只有 `./agent` ⇒
backend 源码不在场 ⇒ **构建里这条规则整族 skip**。**构建绿灯 ≠ 接线正确。唯一真校验点是 pre-push / 手跑脚本。**
⇒ **每台机器必须跑一次 `./scripts/install-git-hooks.sh`**,否则这条规则一次都不会自动跑。

#### (e) 为什么不破坏其它 feature

1. **`analysis/` 无碰撞**(实测):`grep -rn '"analysis"' agent/src --include='*.ts'` 唯一命中是
   `agent/src/mcp/sanitizeMinicod.ts:124` 的英文停用词表(与路径无关);
   `grep -rn "analysis/" agent-skills/ backend/internal/prompts/` **零命中**。
2. **per-profile 而非全局**:全局 ro-bind 会让 claw/prism/boltslides/sci_draw 的 `analysis/` **静默变只读**
   —— 失败方式是「写文件静默 EROFS」,本仓最讨厌的那一类。
   ⚠️ per-profile 的代价是「漏传一处 = 静默敞口」,消解办法见下条。
3. **使用点自守卫【机制】**:`registry.ts:344` `bashTool.run` 开头加
   `if (ctx.statkitSession && !profile.reservedDirs.includes(ANALYSIS_DIR)) return fail(...)`。
   理由是 `bwrap.ts:67` 那条定式:**别把不变式托付给远处的调用方**。六跳里任何一跳漏了,这里当场炸而不是静默敞口。
4. **写面收紧是净收益**:`workspace.ts` 的三处 backend 推送写面也走 `confinePath(forWrite=true)`,
   顺手把「后端推文件覆盖 bundle」这条路一并封死,零额外代价。
5. **产物面必须同步排除**(漏了就是线上事故复现):`artifacts.ts:228-234` 已为 `evidence/` 打过这个补丁,
   注释记着 2026-08-02 的实测事故 ——`evidence/INDEX.md` 被当 stray 每轮复制成 `out/INDEX-3.md`、`INDEX-4.md`。
   改三处:`artifacts.ts:25` `ROOT_SKIP_DIRS` 加 `ANALYSIS_DIR`;`:30-33` `DEEP_SKIP_DIRS`(它由 ROOT_SKIP_DIRS
   派生,确认新常量确实进来);`:233` `relocateStrays` 的 stray 过滤条件加 `ANALYSIS_DIR`。

> 🔴 **顺手修一个既有 bug(照抄会带过来)**:`artifacts.ts:233` 的 `strays` 只用于
> `:235` 的早退判断(`if (strays.length === 0) return decls;`),而 `:254` 的复制循环遍历的是 **`decls`**
> ⇒ **只要存在任何一个别的 stray,`evidence/*.md` 仍会被复制进 `out/`**。
> 修法:把两个保留区加进 `ROOT_SKIP_DIRS`/`DEEP_SKIP_DIRS`(从源头不进快照),并让复制循环遍历过滤后的集合。
> **补一条测试** —— evidence 的同款排除**至今没有测试**(2026-08-02 是在生产里发现的),照抄 = 照抄一次事故。

#### (f) 验收

```bash
# ① 单测:两个保留区各九条不变式
cd agent && bun test src/sandbox/reserved.test.ts
# ② 跨包接线(会真的比对 ws.go)—— 必须在完整仓库根跑
./scripts/check-evidence-mirror.sh            # 期望 exit 0,且输出里没有"被跳过的规则"
git push --dry-run                            # 确认钩子真的被调用
# ③ 真 jail 自检(启动日志)
docker logs scholar_agent | grep -E "保留区.*自检"
#    期望:「…自检通过(真实 bwrap jail 内 evidence/ analysis/ 只读,三种写法全部被拒)」
#    出现「已跳过」= 沙箱没起来,D1 当前不成立
# ④ jail 内写入必须 EROFS(真实 stat_lab 会话里)
#    echo x > analysis/bundle.json        → Read-only file system
#    Write file_path=analysis/bundle.json → tool_result 含 "engine-reserved"
docker logs scholar_backend | grep "unknown tool"   # 出现 StatRun/StatReport = ws.go 漏接
# ⑤ artifacts 排除(新测试)
cd agent && bun test src/turn/artifacts.reserved.test.ts
```

---

### D2 · 交付闸(三层,缺一层就退化成假闸)【机制】· 3 天

#### (a) 现状

- **产物检测**:`artifacts.ts:96` `snapshotOut()` 扫 `out/` 顶层 + `:126` `scanRootDeliverables()` 递归扫会话根
  (深度 6 / 400 文件 / 2000 目录三上限);`turnLoop.ts` 在 `finally` 里 `emitArtifacts`。
  文件头 `:5` 逐字:「**工具无关 —— 覆盖 Write/Edit/ExportDocument/Bash/Python 全部(检测的是文件,不是工具名)**」。
- **收割真源**:见 M-1。`out/` 目录本身是权威,帧不是。
- **判据形态的合法范式**:`agent/src/tools/deliveryGate.test.ts:3-7` 逐字钉死「闸的判据必须是**引擎对账本的计数**,
  零 LLM、零内容判断」+「不过闸时回执必须带**精确差额 + 可执行的下一步**」。

#### (b) 三层设计

| 层 | 位置 | 性质 | 干什么 |
|---|---|---|---|
| **L1 主路径** | `StatReport` 内建工具 | 【机制】 | 交付物由引擎在 jail 内从 bundle 渲染,**模型不经手字节**。有 tool_result 回路 ⇒ 失败是**硬失败 + 自救指引** |
| **L2 回路** | `agent/src/turn/runTools.ts:53` `runOne` 内、**`capToolResult`(:123) 之前** | 【机制】 | 任何 `Bash` 返回后,若 `out/` 顶层新增/变更了 `.docx/.xlsx/.md`,就地抽数字集合比对 bundle。不过 ⇒ **改写该条 tool_result 为 `is_error` + 精确差额**,模型当轮就能改。位置理由与 `:104-110` 的证据账本咽喉点完全同构 |
| **L3 兜底** | `artifacts.ts:339` `emitArtifacts`,在 `relocateStrays` 之后、`resolveCitations`(:341) 之前 | 【机制】 | 兜住 L2 漏掉的路径(`Write` 直接写 md、跨轮遗留)。**动作是隔离,不是压帧**:把文件重命名成 `out/.rejected-<ts>-<name>`(前导点 ⇒ `snapshotOut` 与 `artifact_harvest.go:44` 的 `strings.HasPrefix(e.Name, ".")` 双双跳过),并发一条用户可见的 `artifact_blocked` 帧说明原因 |

**L2 存在的第二个理由(不能只做 L3)**:`GetSessionArtifacts` 是用户点开面板就触发的,而 `emitArtifacts` 只在轮末跑。
轮中途用户点一下面板 ⇒ 违规 docx 已被 harvest 进 MinIO,而 harvest 是 **upsert-only、永不按 live 工作区删**
(`artifact_harvest.go:28-32` 注释逐字说明为什么)⇒ 那行在 DB 里**永久留着**。
L2 把这个窗口从「一整轮」压到「一次 Bash 调用」。
🔴 **剩余窗口无法归零 —— 这是本闸的已知残留敞口,写进 §九-9.2,不许假装没有。**

#### (c) 数字集合怎么抽

```ts
// agent/src/statkit/numscan.ts（新）
// 走 registry.ts:496 的 runConverterConfined —— jail、net:none、固定 argv、无 shell。
// 内联 -c 而非独立 .py：jail 里没有 /app 的 bind（bwrap.ts:93-111 只 ro-bind /usr /bin /lib /etc/*），
// 独立脚本在 jail 内根本不存在。-I 见 D1(c)（防 /work/docx.py 劫持 import）。
const CODE = `
import sys,re,json,zipfile
p=sys.argv[1]
def texts(p):
    if p.endswith('.docx') or p.endswith('.xlsx') or p.endswith('.pptx'):
        z=zipfile.ZipFile(p)
        for n in z.namelist():
            if n.endswith('.xml'): yield z.read(n).decode('utf8','ignore')
    else:
        yield open(p,encoding='utf8',errors='ignore').read()
NUM=re.compile(r'-?\\d+(?:[.,]\\d+)*(?:[eE][-+]?\\d+)?')
out=set()
for t in texts(p):
    t=re.sub(r'<[^>]+>',' ',t)          # 剥 XML 标签：w:val="240" 这类排版属性在尖括号内，随标签一起消失
    for m in NUM.finditer(t): out.add(m.group())
print(json.dumps(sorted(out)))
`;
```

**为什么直接读 zip 里的 XML 而不用 python-docx**:① python-docx 只读 `word/document.xml`,读不到表格以外的域、
页眉、批注;② zip 读法一次覆盖 docx/xlsx/pptx 三种;③ 少一层依赖 = 少一个可劫持面。

**比对规则(确定性,零 LLM)**:
```
交付集 D = numscan(file)          规范化：去千分位逗号、去前导零、统一小数点
基准集 B = bundle 里所有数值字段的**多档格式化展开**
          （原值 / 2位 / 3位 / 去前导零的 .034 / 百分比 ×100 / 整数化）
判定：D \ (B ∪ W) ≠ ∅  →  拒
```

**误判风险清单与消解(W = 白名单)**:

| 风险 | 例 | 消解 |
|---|---|---|
| 年份 / 版本号 | `Python 3.13.5`、`2026` | 软件版本本来就在 bundle 的 `software` 字段里,天然进 B;年份加进 W(1900–2100 的四位整数) |
| 页码 / 表号 / 图号 | `Table 1`、`第 3 页` | W:`1..99` 的裸整数(代价:真实小 n 也会被放过,但 n 必在 B 里,不构成漏检增量) |
| 排版数值 | docx 的 `w:w="2400"` | 已被剥标签消掉 |
| 四舍五入档不一致 | bundle `p_exact=0.00412`,正文 `0.004` | B 的多档展开覆盖;覆盖不到的档 = 渲染层用了未登记的格式化函数,**那正是该红的** |
| **引擎自算的派生量** | 差值、百分比、组合区间 | 🔴 **工程侧强烈建议:一律不许,全部落 bundle 字段。** 否则白名单会随每个新模板增长,一年后 D2 就是一条永远绿的规则。代价:bundle 字段表变长、report 模板不能做任何算术 → §附 Q14 |
| CJK / 全角数字 | `一二三`、`０．０３` | **不抽**(只抽 ASCII)。**已知漏检面,登记 §九-9.2** |

**上线策略【机制 + 灰度】**:第一周 `STATKIT_DELIVERY_GATE=observe` 只记日志不拦,采到假阳性率后切 `enforce`。
🔴 **这个 env 不能靠「两周内记得删」** —— 本仓的 `SKIP_*` 文化会在三周内把它变成常态。
**做法:代码里硬编码到期日**,过期后 `observe` 模式启动即抛错(`throw new Error("STATKIT_DELIVERY_GATE=observe 已于 <日期> 到期")`),
**把「记得删」从约定变成机制**。

**🔴 bundle 集为空时走 observe 而不是拒**(30 天 GC 的连带,见 §九-9.1):
回执文案换成「本会话的分析数据已超过保留期,无法核对数字来源;请重新上传数据」,
否则返修用户会撞到一句完全看不懂的差额报错。

#### (d) 验收

```bash
# ① 旁路必须拿不到产物卡**也拿不到文件**（真实会话里让模型跑）
python3 -c "import docx; d=docx.Document(); d.add_paragraph('P=0.003'); d.save('out/x.docx')"
#   期望：Bash 的 tool_result 变成 is_error，含「out/x.docx 里的 0.003 不在本会话任何 bundle 中」
#   期望：out/ 下只剩 .rejected-*-x.docx
docker exec scholar_agent ls -la /home/bun/sessions/<sid>/out/
#   期望：产物面板刷新后看不到它
# ② 正路径必须畅通（防过度拒绝把功能拆了）
#   StatRun → bundle → StatReport → docx → 产物卡正常出现
# ③ 单测：判据零 LLM、零内容判断
cd agent && bun test src/statkit/deliveryGate.test.ts
#   照 deliveryGate.test.ts:72-85 的形态写一条：同一份 docx，在有 bundle 的会话放行、
#   在空 bundle 的会话必拒（observe 模式下记日志）—— 证明判据不在看内容
```

---

### D3 · 300s 兜底不能靠模型传参 【机制】· 与 D4 合并计 1 天

**现状**:`agent/src/tools/registry.ts:369` 逐字
`const timeoutMs = Math.min(Number(input.timeout_ms) || 120_000, 300_000);` —— **不传就是 120s,无 env 可调**。
`input_schema`(:339)里 `timeout_ms` 是可选的,模型忘传是常态。
失败方式是 `proc.kill()` **静默截断被当成完整结果**:拿到 exit≠0 就回一条普通失败,模型不知道是超时截断。

**改法**:
1. `ToolCtx`(registry.ts:39-49)加 `bashTimeoutMsDefault?: number`,从 `TurnInput` 透传(管线见 D4);
2. `:369` 改为 `Math.min(Number(input.timeout_ms) || ctx.bashTimeoutMsDefault || 120_000, 300_000)`。上限 300s 不动;
3. **超时要可区分**:killer 里置 `timedOut` 标志,失败文案改成「命令在 Ns 后被强制中止(超时),已产出的部分输出如下;
   **不要把它当成完整结果**,请拆成更小的步骤重跑」。当前完全没有这句。

**checkpoint 的正确形态**:实读 `bwrap.ts:72` 是 `--unshare-all`(含 pid ns),bwrap 自己是 jail 内的 pid 1 监控进程;
`proc.kill()` 打到的是 bwrap 而不是 python,**SIGTERM 能不能及时传到 python 是未验证的**。
⇒ **statkit 自带墙钟软预算(默认 240s),到点把 `{"partial":true, ...已算部分}` flush 到 stdout 后自行退出(退出码 3)。**
理由:`registry.ts:380-391` 的 `readCapped` 在 kill 之后仍会 resolve 已读到的字节 ⇒
**stdout 上的东西一定拿得到,信号语义则不一定。不依赖信号 = 不依赖未验证的行为。**

**验收**:
```bash
Bash {command: "python3 -I -m statkit run --spec plan/big.json"}   # 模型直跑路径
# 期望：拿到 exit 3 的 partial + 已算部分，而不是空结果；文案明确说了"被中止"
```

---

### D4 · `net` 按 feature 分流,stat_lab = `"none"` 【机制】

#### (a) 现状:`net` 的完整传递链路(实读五跳)

```
① agent/src/server/ws.ts:477            net: "open",         ← 字面量，与 feature 无关
② turn/types.ts TurnInput.net           →
③ turn/runTools.ts:96                   net: input.net       → ToolCtx
④ tools/registry.ts:361                 profileFor({workDir, net: ctx.net, allowBash})
⑤ sandbox/bwrap.ts:135                  if (profile.net === "open") args.push("--share-net")
```

`--unshare-all`(bwrap.ts:72)本已断网,`--share-net` 是**重新共享**。agent 容器接在 `egress-net` 上
(`docker-compose.prod.yml:432`)⇒ jail 内可经 NAT 直连公网。
消费方只有 `bwrap.ts:135`(`runConverterConfined` 在 `registry.ts:527` 已硬编码 `net:"none"`)
⇒ **改 `net` 的爆炸半径 = 只有 Bash 的 jail**,claw 现有行为完全不受影响。

#### (b) 改法:一条「会话沙箱剖面」管线(D3 + D4 合并,六跳)

| 跳 | 文件 | 改法 |
|---|---|---|
| 1 | `backend/internal/agentbridge/spec.go` `FeatureSpec` | 加 `SandboxNet string`(`""`=沿用 open,`"none"`=断网)、`BashTimeoutMsDefault int`、`ReservedDirs []string`。**零值 = 逐字现状,这是零回归的全部保证** |
| 2 | `backend/internal/agent/client.go` `CreateSessionOptions` | 加三个 `json:",omitempty"` 字段;body 组装加三个 if |
| 3 | `backend/internal/agentbridge/hub.go` `hasOpts` + seed payload | 新字段进 `hasOpts` 判定。**不进 `hasOpts` 的后果**:那条 `if len(msgs)==0 && title=="" && !hasOpts { return }` 会让全新会话根本不发 seed 帧 |
| 4 | `agent/src/server/sessions.ts` `CreateOpts` + `SessionMeta` + 组装 | 加字段;**默认值 `"open"` 保留**(其它 feature 行为逐字不变) |
| 5 | `agent/src/server/ws.ts` `handleSeedHistory` | 回填。**必须用 `disallowedTools` 那一档语义:控制面下发即权威、无条件覆盖**,不能用 `allowedMcpTools` 的「仅 meta 空时接受」——后者会让 executor 重启后 `getOrCreateEphemeral` 造出的保守 meta(net 默认 open)永久生效 |
| 6 | `ws.ts:477` | `net: meta.sandboxNet ?? "open"` |
| 7 | `registry.ts:344` `bashTool.run` 开头 | **使用点自守卫【机制】**:`if (STATKIT_SESSION && ctx.net !== "none") return fail(...)` |

#### (c) 为什么不破坏其它 feature

- **MCP 检索不受影响**(最容易误判的一点):`agent/src/mcp/minicodClient.ts` 用 `StdioClientTransport`
  **spawn 一个 executor 进程的子进程**,它**不进 jail**。`net:"none"` 只掐 Bash 的 jail,检索照常。
- **导出不受影响**:`runConverterConfined` 本来就 `net:"none"`,weasyprint/pandoc 全本地渲染
  (`agent/Dockerfile:87-92` 选 weasyprint 的理由逐字写着「纯本地渲染(jail net:none 可用)」)。
- **claw/prism/boltslides/sci_draw 零改动**:零值 = open。

**附带价值**:「用户未发表的原始数据全程不出网」在合规叙事里是最便宜的一句真话,而且它是**机制**(bwrap 参数)不是承诺。

**验收**:
```bash
Bash {command: "curl -m3 -sS https://example.com || echo NET_BLOCKED"}   # 期望 NET_BLOCKED
Bash {command: "getent hosts example.com || echo NO_DNS"}                # 期望 NO_DNS
# 反向：同一轮的 mcp__minicod__search_papers 必须仍能用（证明只掐了 jail）
```

---

### D5 · 多重比较记账 【机制】· 1 天

**现状**:R 的结构里无处安放 —— 方法卡描述的是**一次**分析,而 α 预算是**跨调用**的会话级状态。

**落点**(三处,全在引擎侧,backend/agent 零改动):

1. **状态住哪**:`analysis/mc_ledger.jsonl`(保留区内、追加式)。**由 `StatRun` 在写 bundle 的同一次
   executor 侧动作里追加** —— 与 bundle 同一个写入者、同一个进程、同一把锁,不会出现「bundle 写了账没记」。
   形态照抄 `agent/src/evidence/ledger.ts:123-136` 的 `withLock`(单会话串行锁,理由:`runTools.ts:37` 是 `Promise.all` 并行批)。
   ⚠️ **不要**每张卡落一个 checkpoint 文件:`workspace.ts` 的 `SESSION_FILE_MAX_COUNT=2000`,
   且 `assertSessionQuota` 每次写入跑**全目录递归**。`ledger.ts` 文件头「硬约束 2」为同一个理由做过让步。
   **单文件追加 = 零文件数增长。**
2. **卡片侧**:posthoc / 多组卡的 `reports.required` 增 `multiplicity.family_key` / `multiplicity.alpha_spent`;
   `StatRun` 校验缺字段即拒收(退出码 2)。
3. **渲染侧**:`render` 在 Methods 段**强制**输出家族定义与已用 α 预算。「强制」的机制化写法:
   做成模板的**必填插值变量**(Jinja2 `StrictUndefined`),缺值直接渲染失败 —— 不是「模板里写了一句话」。

**验收**:
```bash
# 同一会话连跑 3 个两组比较
jq -e '.multiplicity.alpha_spent > 0' analysis/<3rd>.bundle.json
grep -q "族系错误率\|family-wise" out/Methods_*.md
wc -l analysis/mc_ledger.jsonl          # 期望 3
```
**缺这条,R 的「三夺权」只有两项,而卖点里已经写了三项。**

---

### D6 · `review` 非阻塞标记 + 如实标签 【机制】· 0.5 天

三条,缺一条闸就空:
1. 未复核的卡**进 `allowed[]`,但 `rank()` 永不把它选成 `default`** —— 加载期强制,不是运行期判断;
2. `bundle.method.review` 是**必填字段**(`status` 为 `unreviewed` 也要显式写),不是模板里的一句话
   —— 放模板里,**换体系就丢**;
3. `render` 按 §三-3.6 的不对称表打标签,走 `StrictUndefined` 必填变量 + 三个字符串常量表。

**lint**:见 §三-3.6(c) 的**双向**禁词表,合并为 `scripts/lint-review-labels.py`,挂 `doctor --strict` + pre-push。
**不给绕过开关** —— `.githooks/pre-push:20-22` 自陈过:加一个能绕的闸 = 亲手养出绕过习惯。

**验收**:`python3 -m pytest statkit/tests/test_review_label_honesty.py -q` + `python3 -I -m statkit doctor --strict`

---

### D7 · logistic 卡(体检口)· 判据见 §八 止损点 B

工程侧只需明确判据的形态。⚠️ **此前设计稿的判据 `grep -c 'gate: py:' == 0` 是一条永远绿的规则**
—— schema 层(`method@1.json` 的 `pattern`)已使 `py:` 写不出来 ⇒ grep 恒为 0。
**它保留在 `doctor` 里但降级为 warn 并标注「schema 已使其恒 0,本条不是判据」**,真判据见 §八。

---

### D8 · 出生即错的外部预言机 【机制】· 2 天

- **位置**:`agent/statkit/tests/oracle/`,**开发机跑,不出镜像**(与 `tests/golden/ref/*.R` 同策略)。
- **形态**:20 份公开数据集 × {SPSS Statistics Coach / JASP / `rstatix` 推荐链} 选出的方法 → `expected/*.json`;
  断言 statkit 的 `default` 与之一致,**或**落进 `blocked_when` 且理由可读(非空、含检验名与统计量)。
- **为什么必须有**:全部 L1 数值 golden 只验证「Welch 的 t 值对不对」,不验证「这里该不该用 Welch」;
  `decision_table` 快照 diff 只能抓**变更**,抓不到**一张从第一天就写错的卡**(它产生一张稳定的表,此后永远 diff 干净)。
- 🔴 **第一周必须先花 30 分钟验证「它们真的是预言机」**(见 §三-3.9 与 §八 止损点 A):
  `rstatix` 很可能没有推荐链、JASP 的检验仍由人选。不成立则降为「二源对拍 + 教科书判据表」并如实改对外材料。
- **阻断力**:此前设计稿说「不阻断」。**本稿改判为部分阻断** —— 理由是红队指出的「强绳不阻断、弱绳阻断」:
  > **D8 对 D-01 / D-04 / D-13 三条最高频规则阻断**(不一致且无可读理由 = 发布闸红);其余 19 条不阻断但必须在
  > 发布评审里逐条念出来。**并指定「谁看」**(§附 Q7)——无人负责的报表 = 2 天白付。

**验收**:`python3 -I -m statkit doctor --oracle --json | jq -e '.disagree_without_reason_on_hot_rules == 0'`

---

### D9 · pip 层写对 【机制 · 构建期硬失败】· 0.5 天

**现状实读**:`agent/Dockerfile:72-79` 那一层**已经写对了** —— `python3-pip` 与 `pip3 install` 在**同一个 RUN**里,
装完 `:76` `apt-get purge -y python3-pip`,`:78` 有 numpy 未被覆盖的断言。
真正的陷阱是:**在这一层之后**再新增任何 `RUN pip3 install` 都会 `pip3: not found`(实测 `which pip3` 为空)。

**可直接用的片段**(插在 rdkit 层之后、weasyprint 层之前;独立一层的理由见 `:69` 注释 —— 整层重装易 OOM Killed):

```dockerfile
# statkit 引擎运行时（2026-08 数据分析卡片 P0）。
# ⚠️ 四条硬约束，违反任一条构建当场失败（这是有意的）：
#   ① python3-pip 必须与 pip3 install 在**同一个 RUN**里装、用完即 purge ——
#      上面 :72-78 的层已把 pip purge 掉，此后镜像里没有 pip3，分层写会 `pip3: not found`。
#   ② PyYAML / Jinja2 **必须显式列出**：2026-08-05 实测容器内两者都不存在
#      （import yaml → ModuleNotFoundError），注册表读不了 YAML、模板渲不了 = P0 硬 DOA。
#      ⚠️ 下面 statkit 本体用 --no-deps 装（保证不联网解依赖），--no-deps **会跳过**
#      statkit 声明的 PyYAML/Jinja2 ⇒ 必须在上一条 pip3 install 里显式装。
#   ③ 断言 Debian 系的 numpy/scipy/pandas/statsmodels/matplotlib **没有被 pip 顶掉** ——
#      scikit-posthocs 会拉 seaborn，pip 的依赖求解在版本不满足时会静默重装 numpy，
#      而 jail 内 /usr 只读、装不回去，运行期才炸。断言照抄 :78 并扩到五个包。
#   ④ statkit 本体从**本地源码**装，不走网络 —— 版本永远与本次构建的源码一致。
COPY statkit /opt/statkit-src
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip \
    && pip3 install --break-system-packages --no-cache-dir --root-user-action=ignore \
        -i https://mirrors.aliyun.com/pypi/simple/ \
        "PyYAML==<PIN>" "Jinja2==<PIN>" "scikit-posthocs==<PIN>" \
    && pip3 install --break-system-packages --no-cache-dir --root-user-action=ignore \
        --no-deps /opt/statkit-src \
    && apt-get purge -y python3-pip && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /opt/statkit-src \
    && python3 -c "import numpy,scipy,pandas,statsmodels,matplotlib,seaborn,yaml,jinja2; \
import scikit_posthocs as sp, statkit, sys; \
[sys.exit('pip clobbered Debian '+m.__name__+': '+m.__file__) \
 for m in (numpy,scipy,pandas,statsmodels,matplotlib) \
 if not m.__file__.startswith('/usr/lib/python3/dist-packages')]; \
print('statkit engines OK', sp.__version__, seaborn.__version__, statkit.__version__)" \
    && python3 -I -m statkit doctor --strict
```

> ⚠️ **`statkit` 本体应单独一层 + purge 后移**:`statkit` 源码每天在改,与上面同层 ⇒ 每次改代码触发 130MB 层整层重建。
> 修法:把 `apt-get purge -y python3-pip && apt-get autoremove -y` 从这一层摘出来,挪到 statkit 层**之后**的一层;
> `COPY statkit/ /tmp/statkit` + `pip3 install --no-deps /tmp/statkit` 单独一层(纯 python,~2MB)。
> **+0.25 天,省下 P0 全程每次改代码 2–4 分钟的重建。**

**配套两处,漏一处就是「镜像有而声明没有」**:
- `agent/src/tools/statsEngines.ts:31-40` `DECLARED_ENGINES` 加**三条**:
  `["statkit","统计方法注册表引擎"]`、`["scikit_posthocs","事后多重比较(Dunn / Conover / DSCF)"]`、
  `["seaborn","scikit-posthocs 的包级依赖"]`。该文件 `:27-28` 逐字写着「改 SKILL.md 里的能力口径时**必须同步改这里**」。
  **seaborn 不加 = 反向的「镜像有而声明没有」**,下次有人清理依赖时会把它当孤儿删掉。
- `probeStatsEngines()`(:56)自动覆盖新条目(它遍历 `DECLARED_ENGINES`),启动日志会大声报缺库。
  **这就是 V2 的全部实现,不要新写 smoke test。**

✅ **`<PIN>` 已定版并落地(2026-08-05,止损点 A 通过)**:`scikit-posthocs==0.14.0`(PyPI 最新;
`requires_python>=3.9`)。PyYAML 与 Jinja2 走 apt(`python3-yaml` 6.0.2 / `python3-jinja2` 3.1.6),
seaborn 走 apt(`python3-seaborn` 0.13.2)—— **它是 scikit-posthocs 的包级依赖**,用 apt 装是为了让 pip
找到已满足的依赖而不去 PyPI 拉一份自己的(那份会连带拖 numpy/pandas,正是构建期断言要防的事)。

实测结论(**在实际安装产物 + 真实 bwrap jail 内**,非裸 docker exec):
- Debian 的 numpy 2.2.4 / scipy 1.15.3 / pandas 2.2.3 / matplotlib 3.10.1 / seaborn / yaml **均未被 pip 顶掉**;
- 容器启动日志 `统计引擎自检通过(声明的库全部可 import)` `sandbox: bwrap`,12 个引擎全绿
  (含新增的 `yaml,jinja2,seaborn,scikit_posthocs`)—— libblas 那一类「装了但 jail 内 import 不了」的坑已排除。

**验收**:`docker compose build agent` 通过 + `docker logs scholar_agent | grep "统计引擎自检"` 出现
`statkit` / `scikit_posthocs` / `seaborn`。

---

### D10 · 内存与 pids 【机制 + 运维前置】· 1 天

#### (a) 现状实读

- `docker-compose.prod.yml:425` `memory: 1.5G`,注释逐字「单会话峰值 ~765MiB, 1.5G 给并发留头」;
  `agent/src/server/admission.ts:14` `MAX_CONCURRENT_TURNS = Math.max(1, Number(env || 2))`,
  `:12` 注释「阈值按容器内存标定:1.5G ≈ 2」⇒ **2 × 765 ≈ 1530MiB ≈ 已用光**。
- `docker-compose.prod.yml:427` `pids: 512`。cgroup v2 的 `pids.max` **计 task,线程也算**;OpenBLAS 默认按 nproc 起线程池。
- `registry.ts:105-116` `bashEnv()` 白名单**无** `OMP_NUM_THREADS`;`bwrap.ts:75` `--clearenv` + `:76-84` 只 setenv 六个变量
  ⇒ **从容器外面设不进来**。

#### (b) 用最重场景算一遍(不是 V3b 那个 6 sheet 玩具)

A1 医学链,30MB CSV(`backend/internal/agentattach/upload.go:60` `MaxFileBytes = 30 * 1024 * 1024`),
≈20 万行 × 40 列 → Table1 → 单因素筛选 → logistic(20 IV)→ KM/Cox:

```
statkit 单进程峰值 ≈
   pandas.read_csv(30MB, 含 object 列)         250–500 MB
 + 解释器 + numpy/scipy/statsmodels import       ~180 MB
 + logistic 设计矩阵 200k×25 float64 ×IRLS 4 份  ~160 MB
 ≈ 590–840 MB，取 ~800 MB
```
它是 bun 的**子进程**,bwrap **不新建 cgroup** ⇒ 计同一个限额。

```
现状：2×765 + 1×800 = 2330 MiB > 1500 MiB   ⇒ cgroup OOM
提到 3G：2×765 + 1×800 = 2330 < 3072  ✅ 单个统计会话可行
        2×765 + 2×800 = 3130 > 3072  ❌ 两个槽都是 stat_lab 就 OOM
```
⇒ **3G 不够。** 两条同时做:
① **`docker-compose.prod.yml:425` 提到 4G**(需确认宿主余量 → §附 Q5);
② **执行器侧加一个 `StatRun` 全进程并发信号量 = 1**(~20 行)。
只提内存不加信号量,两个 stat 会话同时跑仍 OOM,而 **OOM killer 可能挑中持着 LLM 流的 bun 本体 = 全部在途会话同亡**。

🔴 **而且守卫点错了阶段**:`mem.cells_max` 在 `solve` 阶段剔卡,但 OOM 发生在 `profile` 的 `read_csv` ——
**那时候还没有任何卡被选中**。
⇒ **真正的旋钮是「文件字节数 × 列类型」在 `profile` 入口的准入**【机制】。`cells_max` 保留作第二道。

#### (c) 线程数(两层,都要)

1. **进程内钉死【机制】**:`agent/statkit/statkit/__main__.py` 的**第一段**,在 `import numpy` 之前:
   ```python
   import os
   for k in ("OMP_NUM_THREADS","OPENBLAS_NUM_THREADS","MKL_NUM_THREADS","NUMEXPR_NUM_THREADS"):
       os.environ.setdefault(k, "1")   # 必须在 import numpy 之前 —— OpenBLAS 在加载时读它
   ```
   加一条单测:解析 `__main__.py` 的 AST,断言这段在任何 `import numpy` 之前。
2. **jail 层兜底【机制】**:`bwrap.ts:76-84` 的 setenv 列表加四条。
   ⚠️ **副作用**:这是**全 feature 生效**,sci_draw 的 matplotlib/rdkit 一并单线程 —— 在 2 CPU / 2 并发槽的容器里
   本来就该单线程,但**上线后要看 sci_draw 出图时长埋点**,超标再按 feature 分流(登记 §九-9.2)。

**pids 不是墙**:钉死后 statkit 子进程 = bwrap(1) + python(1) ≈ 2–3 task;
`docker-compose.prod.yml:352` 注释的「~6 个重 Bash 会话打满 512」≈ 85 task/会话,增量可忽略。

**验收**:
```bash
docker exec scholar_agent cat /sys/fs/cgroup/pids.current     # 跑两个统计会话时 < 100
docker stats scholar_agent                                     # 峰值 < limit 的 80%
docker exec scholar_agent python3 -I -c "import os;print(os.environ.get('OMP_NUM_THREADS'))"
```

---

### D11 · 工具层回吐 【机制 · 机器注入】· 0.5 天

`assume` 的 stdout 自带:候选表 + 每条 `blocked_when` 的中文理由 + **下一步该调什么工具、带什么参数**
+ 「默认 `duncan` 由 `discipline.agri` 第 12 行设定,base 层原为 `tukey`」这类 provenance。

**为什么是机制**:它不依赖模型读 skill(**skill 条件加载实测触达率 4.4%**:609 轮里 methods-stats 只命中 29 次),
也不占 skill 预算。范式与 `registry.ts` 的 `submitAnswerTool` 失败回执一致 —— 那条回执逐字给了「接下来二选一」和两个具体工具名。

**验收**:`statkit assume` 的 stdout 快照测试,断言含 ①候选表 ②每条 blocked 的中文理由 ③下一步的工具名与参数样例
④ policy provenance 行。

---

### D12 · 冷重播 fixture 【约定 + 一条回归测试】· 1 天

**现状**:`agent/src/server/shadowTurn.ts` 的 `convertFlatToAnthropic` 把 tool_use/tool_result 折成一行摘要
(30 分钟闲置 / 容器重启后触发)。真源在 workDir 的 `project.json`(好),但**需要模型主动重读** —— 纯约定。

**改法**:
1. skill 第一条指令是「任何一轮开始先读 `project.json`」
   【约定 —— 谁保证:`agent-skills/statkit-*/CLAUDE.md`(**常驻,不是 guides 按需层**,因为 4.4% 的触达率对常驻内容不适用);
   怎么发现违反:`decision_table` 里的学科/doctrine 与 bundle 里的实际取值不一致时 `StatRun` 拒收】;
2. **回归测试【机制】**:`agent/src/turn/statkitReplay.test.ts` —— 照 `shadowTurn.fold.test.ts` 的形态造一个
   冷重播 fixture(模拟 30 分钟闲置后继续分析),断言 `discipline` / `doctrine` / `system` 三项未漂移。

**为什么不能省**:`project.json` 只有在**被读**的时候才有用。没有 fixture,这条防线的状态永远是「不知道」。

---

### D-extra · 资源与接线前置项(0.5 天,但漏了每个重会话都掉线)

| # | 项 | 现状 | 改法 |
|---|---|---|---|
| **X-1** | **`FeatureSpec.TurnTimeout` 必须显式设** | `backend/internal/agentbridge/spec.go:323-331` `TurnTimeoutOrDefault()` 零值 → **15 分钟**,超时发 `stop_generation` + FailTurn | 设 `25 * time.Minute`。一轮里 3 次 StatRun(各 240s)= 12 min,**加 4–6 次 LLM 往返(每次 20–60s)必然超 15 min** ⇒ 整轮被杀、已算 bundle 留在盘上但对话是一条 error 终帧。**四份设计稿没有一稿设过这个字段** |
| **X-2** | **`maxRounds` 显式下发 32** | `agent/src/turn/turnLoop.ts:36` `MAX_TOOL_ROUNDS=24`;`:430` `input.maxRounds ?? MAX_TOOL_ROUNDS` 已支持按会话下发 | 医学链估算:profile 1 + consult 1(`AskUserQuestion` 清空本轮工具数组、强制换轮)+ assume ×3 + StatRun ×4 + StatReport ×3 + Read/Write ×5 ≈ **17 轮**;批量场景(6 指标各自分流)再 +6 ⇒ **23,零余量**。字段已存在,零成本 |
| **X-3** | **`AGENT_EXECUTOR_FEATURES` 两个 compose 成对加 `stat_lab`** | `docker-compose.yml:284` 与 `docker-compose.prod.yml:273` 当前都是 `smart_search,claw,prism,peerreview,boltslides,sci_draw` | 漏一个 = 该环境整条 DOA |
| **X-4** | **`EXECUTOR_WORKDIR_TTL_DAYS` 在两个 compose 里显式写 30** | `agent/src/server/sessions.ts:455` 默认 30,两个 compose 均未设置(grep 实测) | 将来改期限是改配置不是改代码 |

---

### 总表:机制 / 约定,以及「只做一半会发生什么」

| # | 防线 | 判定 | 🔴 只做一半会发生什么 |
|---|---|---|---|
| **D1** | `analysis/` 保留区(confine + bwrap 双闸) | 机制 | **只堵 confine**:`echo > analysis/bundle.json` 全绕过(Bash 不走 confinePath)。**只堵 bwrap**:`Write` 工具不进 jail 直接落盘。**两道都在才叫边界** —— `evidence/paths.ts:17-18` 逐字写过 |
| **D1'** | StatRun 自己 spawn(不接受数字入参) | 机制 | 若当抄写员:数字经模型手转一道,「物理上不经模型手」**直接变成假话** |
| **D1''** | `python3 -I` | 机制 | 不加:`/work/statkit/__main__.py` 劫持整个引擎,**所有闸同时失效且全绿** |
| **D2-L1** | StatReport 渲染(唯一正路径) | 机制 | 只有 L1:模型改用 Bash + python-docx 直接写 out/ |
| **D2-L2** | runTools 咽喉点数字比对 | 机制 | 只做 L3:轮中途用户点开面板 → harvest 已 upsert 进 MinIO,而 harvest **永不按 live 工作区删** ⇒ 那行永久留在 DB |
| **D2-L3** | artifacts.ts **隔离**(不是压帧) | 机制 | 若写成「不发帧」:用户照样下载到文件,只是少了一张卡和任何解释 —— **比不做更糟** |
| **D3** | Bash 默认超时按 feature | 机制 | 只改上限不改默认:模型忘传仍是 120s,**静默截断被当成完整结果** |
| **D3'** | statkit 软预算 flush stdout | 机制 | 若改用 SIGTERM handler:bwrap 是 pid-1 监控进程,信号能否及时到达 python **未验证** —— 未验证的兜底 = 没有兜底 |
| **D4** | jail `net:"none"` | 机制 | 只改 `ws.ts:477` 不加使用点自守卫:六跳漏一跳(尤其 executor 重启后的保守 meta)就静默恢复出网,**而我们以为断着** |
| **D5** | mc 记账 + Methods 强制渲染 | 机制 | 只落账不强制渲染:α 预算存在文件里没人看,「三夺权」少一项 |
| **D6** | review 非阻塞 + 如实标签 | 机制 | 只做「不指向 default」不做双向 lint:某次改文案写成「经统计学家复核」或在 Methods 段写「已核对」,**没有任何东西会红** |
| **D7** | logistic 体检 | 机制(见 §八) | 拖到最后才判:那时 5 天内核已是沉没成本,判断不会做出来 |
| **D8** | 外部预言机 | 机制 | 不做:全部 golden 只能证明「算得对」,证明不了「选得对」—— 而后者是唯一差异化卖点、也是有公开证据说 38.4% 会错的那一步 |
| **D9** | pip 层 + 五包断言 + PyYAML/Jinja2 | 机制(构建期硬失败) | 漏 PyYAML/Jinja2 = **P0 硬 DOA**;只装不断言:pip 静默顶掉 Debian numpy → jail 内 `/usr` 只读装不回去 → **运行期才炸,且看起来像随机故障** |
| **D10** | 线程数进程内钉死 + profile 入口准入 + 内存 4G + StatRun 信号量 | 机制 + 运维 | 只在 bwrap setenv 不在进程内钉:某天 `--clearenv` 列表被清理,pids 512 被打满,**该容器所有 Bash 全失败**。内存不提:一份 30MB CSV 就能 OOM,killer 可能挑中 bun 本体 = **全部在途会话同亡** |
| **D11** | assume stdout 自带候选表 | 机制 | 改成「skill 里让模型念 blocked 理由」:**触达率 4.4%,等于没做** |
| **D12** | 冷重播 fixture | 约定 + 一条回归测试 | 只写指令不写 fixture:学科默认值/doctrine 静默漂移,产物看起来完全正常(**最贵的一类缺陷**) |
| **X-1** | `TurnTimeout = 25min` | 机制 | 不设:每个重会话必然在 15 min 被杀 |
| — | `permissionParity` 覆盖新工具 | 机制(pre-push) | 没装钩子 ⇒ 这条规则**一次都不会自动跑**;Docker 构建里它整族 skip |

---

## 五 · P0 范围与不做清单

### 5.1 三条切法准绳(用来回答「这块进不进 P0」)

| 准绳 | 判据 | 反例 |
|---|---|---|
| **① 闭合优先于覆盖** | `SYNTHESIS-需求 §1.2.1` 钉死:「链上每一步都被覆盖才算闭合,少一步 = 不闭合」。**P0 的目标从「五条链的公共前缀」上调到「闭合两条最强的链」** | 补第 29 个方法但它不闭合任何链 → 不进 |
| **② 新族比新卡贵一个数量级** | 同族第 N 张卡 2–4 小时;开新族 ~2–3 天(新 check 卡 + facts 词表扩 + bundle 字段组 + 4 个模板 + adapter + golden) | 重复测量(要 Mauchly + GG,新 check + 新数据形态)→ 不进 |
| **③ 扩范围必须同时扩验收,否则不扩** | `SYNTHESIS §4.1.3` 的教训:152 格验收塞进 2–3 天 = 必然假绿灯。**每一块 IN 都在 §5.4 表里有对应的验收预算行,没有对应行的块一律打回** | 「顺手把生存分析也做了」但 V1 golden 不加 3 组参考值 → 不进 |

### 5.2 P0 边界(一句话)

> **闭合 A3 生科农林链与 A1 医学链两条完整链,A2 问卷社科链闭合到 5/6;A5 体育工科链与 A4 经管链明确不闭合。**
> 方法卡 28 张 · check 14 · effect 9 · policy 8 · system 4 · 模板 56 · 决策行 D-01~D-22。

### 5.3 P0 IN 清单

| # | 块 | 为什么进 | 工期 | 验收 |
|---|---|---|---|---|
| **I1** | **28 张方法卡 + 配套资产**(§2.14) | 基线 | 19.5 | V1 · V2-a |
| **I2** | **4 套报告体系** | 模板 ⟂ 体系(§2.13)使 4 套与 2 套模板数一样;验收对象是 28 组参数化断言 + 4 套快照,**可自动化** | 0(在 I1 内) | V4(+0.5 天预算) |
| **I3** | **批量 × 合并**(`emit --batch-key` / `report --merge`) | 6 sheet × 5 处理 → 6 份 bundle → 一张 6 指标 × 5 处理大表,字母**每指标内独立排布**。是 A3 集群「现有工具全不支持」的能力,也是**生科链闭合的最后一步** | 1.5 | V3b(+0.5 天) |
| **I4** | **单因素筛选 → 多因素 logistic「二连表」表形** | 一张 logistic 卡 ≠ 医学链闭合。A1 的默认骨架是二连表(需求矩阵 #14「中文临床默认骨架」)。有 `table1` + `logistic` 两张卡后,补的只是一个表模板 + 一次系数聚合。**用 `report --merge` 的第二种表形实现,不建 pipelines 层** | 1.5 | V3c(+0.5 天) |
| **I5** | **D1 数字锁**(用户拍板①) | 拍板 | 3.5 | V5-①②③ |
| **I6** | **D2 交付闸三层** | 不做则一行 `python3 -c "import docx"` 绕过全部排版闸 | 3.0 | V5-④ |
| **I7** | **D4 断网** | P0 的六个 verb 没有任何一个需要出网。**全部防线里最便宜的一条** | 1.0(含 D3) | V9-② |
| **I8** | **D5 多重比较记账** | 三夺权之一,R 原结构里无处安放 | 1.0 | V2-b |
| **I9** | **D8 外部预言机(升为 P0,三条热规则阻断)** | 唯一能查「出生即错」的机制。用户拍板④「更完整」的最高 ROI 块 | 2.0 | V3 |
| **I10** | **评审 agent + `review` schema + 双向标签 lint**(用户拍板②) | 拍板 | 11.0 | V6 |
| **I11** | **D6 / D9 / D10 / D11 / D12 / X-1~X-4** | 全部是「漏一个就静默失效」 | 4.0 | V9 · V2-c |
| **I12** | **T0 hook 工厂化收敛** | claw 867 / boltslides 857 / sci_draw 736 = **2460 行逐行副本**(实读)。第四份之后收敛成本变成 4 份 diff 对账。本仓已验证手法(`frontend-user/src/shared/api/agent-sessions.ts` 的 `makeAgentSessionApi`,201 行) | 2.5 | 由 V7 端到端覆盖 |
| **I13** | **上传通道 + xlsx 真 jail 三降级实测** | ⚠️ 实读 `backend/cmd/server/routes_user.go`:**sci_draw 没有 upload 路由**(只有 `/smart-search/upload` 与 `/claw/upload`),这是真新工作不是复制 | 1.5 | V8 前置 |

### 5.4 「扩一块 = 扩验收」对照表(反假绿灯)

> **硬规矩:下表右列为空的行,左列一律不进 P0。**

| 扩了什么 | 验收对象变成多大 | 验收怎么做(必须可自动化或明确抽样) | 预算 |
|---|---|---|---|
| I2 · 体系 2 → 4 套 | 7 维 × 4 套 = **28 组** | 参数化单测:`format_p` / `format_dispersion` / `format_stars` / `format_ci` 四个确定性函数 × 28 组期望值;**外加 4 套渲染快照**(同一份 bundle 渲 4 次,快照进仓库,pre-push diff)。**不是人工核 152 格**。⚠️ 红队指出 4 份快照来自同一份 bundle = 只覆盖 8 个族里的 1 个 ⇒ **快照改成 8 个族各一份 × 4 套 = 32 份快照**(生成是自动的,人只 review 一次基线) | **+0.5** |
| I3 · 批量 × 合并 | 1 个 6 sheet fixture × 6 条独立分流路径 | V3b:断言 6/6 指标**各自独立**走完前提分流(**允许走不同分支**,这是最容易写错的地方)+ 合并表每格 `均值±SD + 字母` + **字母在每指标内部独立排布,绝不跨指标共用** | **+0.5** |
| I4 · 二连表 | 1 个医学 fixture(单因素 8 变量 → 多因素 3 变量) | V3c:两栏 n/OR/95%CI/p 全部来自 bundle;**筛选阈值必须出现在 Methods 段** | **+0.5** |
| I5+I6 · 数字锁 | 4 条(3 条可自动) | V5:扩 `bwrap.ts:173` 的 `smokeTestEvidenceReadonly` 到两个保留区(它已经是三种写法的真 jail 探针),启动日志断言 | **+0.5** |
| I9 · 外部预言机 | 20 数据集 × 3 家 = 60 格 | V3:**60 格是一次性人工产出期望值**(跑 JASP/rstatix/SPSS 抄下它选了什么),之后自动对拍。⚠️ 这 2 天里 **1.2 天是抄期望值**,不是写代码 | 含在 I9 |
| I10 · 评审 agent | 50 单元 + 4 条 lint | V6:①每张启用卡 `review.status != unreviewed/stale` 或不做 default;②hash 失效检测有效;③**双向**禁词 lint 零命中;④三条 label 字符串单测;⑤**人工抽样 ≥10% + 100% escalate 已完成** | **+0.5** |
| I1 · 28 卡(基线) | 28 组 golden + 22 行 decision_table 具名断言 | V1 / V2-a,在基线工期内 | — |
| **合计新增验收预算** | | | **+2.5**(另 +2.5 在 E 块整体) |

### 5.5 P0 OUT 清单(每条:为什么不做 / 什么时候做 / 边际工期)

> `SYNTHESIS-产品形态 §九` 的 30 条是**永久不做**,本表不重复。这里只列「会做、但不在 P0」的。

| # | 不做 | 为什么现在不做 | 什么时候 | 边际工期 |
|---|---|---|---|---|
| **O1** | **中介 / 调节(PROCESS 4/7/14)** | 方法间 DAG(a/b/c/c′ 四个模型 + bootstrap 合成),单卡表达要给 `roles` 加 `mediator` 并让 `engine` 支持「两次拟合」—— **会把 `method@1` 撑成 pipeline**,污染刚建好的内核 | P1 尾 / P2 | **+3.0**(便宜版:固化 model 4/7/14 三张专用卡);闭合 A2 问卷链到 6/6 |
| **O2** | **重复测量 ANOVA + 球形度 + 简单效应** | 三重压力同时上:`roles` 要加 `within_factor[]`、Mauchly/GG/HF **无 Python 实现**(`statsmodels.AnovaRM` 有但无球形度)、简单效应又是 pipeline。风险高于 logistic | P1 | **+3.5**;闭合 A5 体育/工科链 |
| **O3** | **ROC / AUC / DeLong / 校准曲线 / DCA / 列线图** | 新族 + DeLong 无库需自写(~60 行)+ 三张新图 + 新 bundle 字段组 + 4 个模板 + 无 R 对照包(要装 `pROC`)。是 A1「最强差异化钩子」,但**不是链闭合件**(生存与 ROC 在 §1.2.1 是「/」关系,已由生存分支闭合) | P1 | **+4.0** |
| **O4** | **多因素 OLS 的交互项 / 多项式项 / 随机效应** | `glm_additive` 覆盖不了,要引第二类卡 schema `formula_method@1` | P1 首批 | **+2.5**(schema 一次性)+ 每卡 4h |
| **O5** | **EFA 的「删题-重跑」自动迭代** | 是**迭代协议**不是单次方法(SPSSAU 自认 5–15 轮),需要 `project.json` 长出第三个状态写入口。P0 只做单次 EFA,迭代**放手给模型**,留痕靠 `project.json.spec_history[]` | P1 | **+1.0**(迭代状态机) |
| **O6** | **econ 报告体系 + 多模型并列回归表形** | 差异全在**表形**(括号放 SE、星号替代 p 列、多模型并排),而 P0 只有 2 张回归卡 ⇒ **P0 没有足够的可验收对象**。这是 4 套体系里唯一「1 天/套」不成立的一套 | P1(与 O4 同批) | **+2.0**(`systems/_shapes/regression_multi.yaml`) |
| **O7** | **`.sav` / `.dta` 直读** | 「收 = 能读」铁律要求扩白名单与装解析器**同一次上线**,要四层齐改(Dockerfile / `DECLARED_ENGINES` / `agentattach/upload.go` 加 `isDataFile` 分支 / 前端 `DOC_EXTS`)。P0 走截图路线,零新依赖 | P1 | **+2.0** |
| **O8** | **`.spv` 原生解析** | PSPP 是 GPLv3(只能子进程调 CLI)+ 中文保真度未实测 | P2,立项前先拿真实中文 `.spv` 试一次 | **+3.0** |
| **O9** | **`numcheck` 对话正文层硬拦** | 容差匹配/中文数词归一/白名单是**启发式**,误拦风险最高且无现成代码可抄。P0 只跑 observe,采两周假阳性率再决定 | P0 后两周 | **+1.0** |
| **O10** | **`figures_manifest` 堵图片旁路** | D2 只堵文档,图里的数字仍可伪造。🔴 **而 A3 生科链的交付物就是带标注的图** ⇒ **P0 最高价值链上有一个公开的数字伪造面**。P0 靠「统计图只许 `report` verb 出」的 skill 红线 + 抽样审计(**这是【约定】,登记 §九-9.2**) | **P0 后第一个补** | **+1.5** |
| **O11** | **`pipelines/*.yaml` 流水线层** | 中介/调节/DID/敏感性分析是方法之间的 DAG。**方法卡资产 100% 保留**,是纯外挂 | P2 | **+3.5** |
| **O12** | **复现包导出** | 数据指纹 + params + bundle + 可离线跑的 `analysis.py`;同时绕开 30 天 workdir GC | P2(若定价承诺 >30 天则提前 P1) | **+3.0** |
| **O13** | **Run 引擎(agentrun)** | 裁决已定:形态错配(Run 是「后台跑看进度条」,数据分析是强交互),且 Run 今天默认关、有三个未还的前置债 | 6–12 个月后 | — |
| **O14** | **移动端** | `MobileClawPage.tsx` 明写「claw-only:移动端不承载 boltslides/sci_draw」 | 未排期 | — |
| **O15** | **用户/课题组自带 policy** | 「我们实验室就用 Duncan」变成用户可配 YAML。要加权限/校验/UI | P2 | **+2.0** |
| **O16** | **R×C Fisher 精确检验 · Firth 惩罚似然 · logistic 的 profile CI** | `scipy.stats.fisher_exact` 只支持 2×2;Firth statsmodels 无实现(P0 对分离的处理是 `block_result` + 如实告知,**不自动修** —— 自动修 = 用户不知道模型换了);profile CI 见 §2.10 | P1 | **+0.5 / +1.5 / +0.5** |
| **O17** | **评审 agent 的 S3/S4 视角 · 多厂商模型交叉** | S3/S4 只入 `notes_non_binding`,不参与判定;多厂商交叉最诱人但**模型间独立性未测**,先测再上 | P1 | **+1.5 / +2.0** |
| **O18** | **bundle 数字签名 / HMAC · jail 内二次 seccomp 收紧** | 无密钥的 `seal=sha256` 是**安全剧场**(jail 内可复算);bwrap 已 `--unshare-all` + tmpfs 根 + 唯一可写 cwd + 不挂 /proc,再收一层收益递减 | 不建议做 | +1.0 / +2.0 |
| **O19** | **D2 的 CJK / 全角数字抽取** | 已知漏检面 | 与 O9 同批 | **+0.5** |
| **O20** | **人类统计学家签字通道**(`reviewed_human` + reviewer 字段 + 面板) | 现在没有人用,建一条没人走的路只会制造「看起来有人审」的错觉 | 真找到人时 | **+1.0** |

### 5.6 如果工期上限是 35 天,按此顺序砍(不要自选)

用户说「工期可以更长」但没给上限。若实际上限远低于 68 天:

1. 砍 **I4 二连表**(−1.5,医学链退回不闭合)
2. 砍 **I3 批量合并**(−1.5,生科链退回不闭合)
3. 砍 **I9 外部预言机**降回「强烈建议」(−2.0,**失去唯一能查「出生即错」的机制**)
4. 砍 **survival 族 2 张卡**(−3.0,医学链退回到 logistic 为止)
5. 砍 **factor 族 2 张卡**(−2.5,A2 问卷链退到 3/6)

🔴 **不要砍 I5/I6 数字锁与 I10 评审 agent** —— 那是用户已拍板的两条,砍了整个方案的正确性论证不成立。

---

## 六 · 排期

### 6.1 阶段表(单人口径)

| # | 阶段 | 天 | 依据 |
|---|---|---|---|
| **T0** | **三份 hook 工厂化收敛** | **2.5** | 实读 867/857/736 = 2460 行逐行副本;手法本仓已验证过一次(`makeAgentSessionApi`,201 行) |
| **T1** | **Dockerfile/pip 层 + `DECLARED_ENGINES` + pin 定版** | **1.0** | 片段已写好(D9);主要成本是**真跑构建定 pin**。🔴 **第一周必须跑通,这是止损点 A** |
| **T2** | **D8 预言机可行性 30 分钟验证 + 出处可及性重写(§三-3.2b)** | **1.0** | 两件都必须**先于写卡**;后者会改写 D-01~D-22 的出处列 |
| **T3** | **上传通道 + xlsx 真 jail 三降级实测** | **1.5** | 复制 claw 的 `/claw/upload`;+ 真 jail 内 pandas/openpyxl 直读原文件的独立路径验证(**绝不复用 `ReadDocument` 通道** —— 它的 `read_only=True` 吞合并单元格、`data_only=True` 在 WPS 导出文件上吞光公式列) |
| **T4** | **`statkit/core/` 通用执行器(含 E1–E4)** | **5.0** | ~1650 行(目录树里逐文件已给行数);+1 天全部在 E1–E4 |
| **T5** | **28 张卡全量**(卡 YAML + adapter + 自写统计 + 模板 + golden) | **19.5** | §2.14 逐卡表自底向上加总。**🔴 `logistic` 排在最前面**(3.0 天),它是 R 赌注的体检口,越早撞越好;**止损点 B 在此** |
| **T6** | **批量 × 合并 + 二连表表形** | **3.0** | I3 + I4 |
| **T7** | **D1 保留区 + StatRun/StatReport + `ws.go` 放行 + parity** | **3.5** | 含 per-profile 改造 0.5、探针泛化 0.5 |
| **T8** | **D2 交付闸三层 + numscan + observe/enforce 灰度** | **3.0** | 对照物:`evidence/deliver.ts` + `resolveCitations`(artifacts.ts:300-327)+ `deliveryGate.test.ts` 那一组 |
| **T9** | **D3+D4 合并管线 + D5 记账 + D10 + D11 + D12 + X-1~X-4** | **5.0** | 六跳一次走完;D10 的成本在**反算准入阈值与压测** |
| **T10** | **D8 外部预言机 harness + 20 份数据集** | **2.0** | 1.2 天是**手工跑三个外部工具抄期望值**,不可自动化 |
| **T11** | **评审 agent 全套**(schema + 3 persona + 编排器 + lint + 变异验证 + 首轮 50 单元) | **11.0** | §三;A/B/C/D 不依赖卡片存在,只依赖 schema 定稿 ⇒ **可与 T5 并行** |
| **T12** | **backend thin wrapper** | **2.5** | 实读 sci_draw 三件 `spec.go` + `handler.go` + `artifact.go` ≈ 784 行机械克隆但逐处要改;+ `bootstrap.go` 6 点 + `routes_user.go` **15 条 HTTP + 1 条 WS**(实读 sci_draw `:376-390` + `:448`)+ 枚举 3 处(`usagestat` / `llmusage` / `modelcatalog` 的 purposeAlias)+ **迁移 2 条**(0034 的 CASE **和**一条守卫式 MODIFY) |
| **T13** | **前端** | **2.5** | ⚠️ 实读:提到 `sci_draw` 的前端文件是 **21 个**(`features/claw/` 14 + `shared/` 4 + `features/admin/` 1 + preview 2),不是 12 个 |
| **T14** | **skill × 3 + system prompt + lint** | **1.5** | `workbench` / `interpret` / `reporting`;**skill 里一条统计学知识都不写**(知识在 YAML,代码在引擎)。⚠️ 改 skill 须 `docker-compose restart scholar_agent`;`allowed-tools` frontmatter **不生效** |
| **T15** | **eval + V0–V9 全闸 + 缓冲** | **5.0** | 基线 2.5 + §5.4 验收预算 2.5 |
| **缓冲** | 真 jail 内第一次跑 statkit 必有 bind 缺失类事故 | **+1.5** | `libblas.so.3` / `/etc/matplotlibrc` / `/etc/fonts` 三条都是这么发现的(`bwrap.ts:97-109`) |
| | **合计** | **70.0** | 单人 **13–15 周**(62–75 区间) |

### 6.2 双人并行切法(推荐)

**切法原则:A 走引擎(串行关键路径),B 走接线与沙箱(与 statkit 正交,零文件冲突)。**

| | **A · 引擎线** | **B · 接线与沙箱线** |
|---|---|---|
| 第 1 周 | T1(1.0)→ T2(1.0)→ T4 起步 | T0(2.5)→ T3(1.5) |
| 第 2 周 | T4 完 → T5 起步(**logistic 优先**) | T7 保留区 + StatRun/StatReport(3.5) |
| 第 3 周 | T5(**止损点 B**) | T8 交付闸(3.0)→ T9 起步(**止损点 C**) |
| 第 4 周 | T5 | T9(5.0)完 |
| 第 5 周 | T5 完 → T6(3.0) | T12 backend(2.5)→ T13 前端(2.5) |
| 第 6 周 | T10 预言机(2.0)→ T11 评审首轮(5.5) | T14 skill(1.5)+ **T11 的工程部分(schema/persona/编排/lint,5.5)** |
| 第 7 周 | T11 完 → 合流 T15 | 合流 T15 · **造 fixture / 征集 SPSS 截图 / 抄 oracle 期望值** |
| 第 8 周 | T15(2.5) | T15(2.5) |

- **A 线 ≈ 33 天**,**B 线 ≈ 32 天**,合流验收各 2.5 天。
- **⇒ 双人合计 ≈ 36–40 工作日(约 7.5–8 周)。**
- 空档**必须**用来做 T15 的前置(oracle 的 60 格期望值、20 份 SPSS 截图、24 例话术样本)——
  这些是唯一不能压缩的人工活,提前做掉是双人并行唯一真正的加速点。

### 6.3 关键路径与外部阻塞

**关键路径**:`T1 → T2 → T4 → T5 → T6 → T15`。任何一环延期直接顶到发布。

**三个不计入上表、但会真实阻塞的外部依赖**(必须在 T0 开始的同一天启动):

| 阻塞 | 谁 | 起止 | 不到位的降级 |
|---|---|---|---|
| **30 份真实脏数据 + 20 份 SPSS 输出截图** | 种子用户征集,**两批分开征集**(前者喂 profile,后者是 V8 的验收样本) | T0 起,1–2 周 | 脏数据不足 → profile 的启发式按内部造数写,**上线后第一周按埋点重标定**;SPSS 截图不足 20 → **V8 降为非阻塞并在产品里把场景 C(SPSS 输出翻译)入口整体灰掉**。⚠️ **不要用合成截图凑数** —— 验不出真实的 WPS 导出/低分辨率拍屏/深色主题/被裁切表这些真正的失败模式,那是自证循环(§附 Q10) |
| **D-01/D-03 学派拍板**(§附 Q1) | 用户 | **T5 之前必须有答案** | 未拍板 → 两条 doctrine 并存,`base` 默认走 `pretest-classic`,+0.5 天,不阻塞开工,但产品要向用户解释两条学说 |
| **出处可及性路线**(§附 Q3) | 用户 + 立项负责人 | **T2 之前** | 未定 → 评审轮会有 2/3 单元原地 escalate,V8 必红 |

---

## 七 · 上线闸(V0–V9)

> **每条给可执行的判定命令。没有命令的闸不算闸。**
> 类型:【构建】= 构建期硬失败 ·【push】= `.githooks/pre-push`(**秒级硬预算**)·【手跑】= 发布前跑一次 ·【人工】= 逐例过。

| 闸 | 判什么 | 判定命令 | 类型 | 阈值 |
|---|---|---|---|---|
| **V0** | `doctor --strict` 六条:①卡 schema 合法 ②`golden:` 非空且断言通过 ③注册表引用的 backend ⊆ `DECLARED_ENGINES` ④`core/` 无方法名残留 ⑤derived 快照与仓库一致 ⑥每条规则至少一条 `role:primary` 且 `access ∈ {oa,local_pdf}` | 写进 `agent/Dockerfile` statkit 层末尾:<br>`&& python3 -I -m statkit doctor --strict` | 【构建】 | 非零退出 = 构建失败 |
| **V1** | 28 张卡对 R 参考值 | `docker exec scholar_agent python3 -I -m statkit selftest --golden --json \| jq -e '.failed==0'` | 【构建】+【手跑】 | 统计量/效应量 **1e-6**,p **1e-4**。**CLD 断言用「同字母组的集合划分等价」而非字符串相等**(不同实现的字母可以都对但不同) |
| **V2-a** | 决策表 22 个具名行断言 + 22 个 fixture | `docker exec scholar_agent python3 -I -m statkit explain --emit > /tmp/dt.md && diff -u agent/statkit/tests/derived/decision_table.md /tmp/dt.md` | 【push】 | `diff` 无输出。**这是 R 排第一的两条理由之一,别在压工期时砍** |
| **V2-b** | 多重比较记账(D5) | 同会话连跑 3 个两组比较后:<br>`jq -e '.multiplicity.alpha_spent > 0' analysis/<3rd>.bundle.json` 且 `grep -q "族系错误率\|family-wise" out/Methods_*.md` 且 `[ $(wc -l < analysis/mc_ledger.jsonl) -eq 3 ]` | 【手跑】 | 三条都真 |
| **V2-c** | 冷重播不漂移(D12) | `cd agent && bun test src/turn/statkitReplay.test.ts` | 【push】 | 模拟 30min 闲置后续跑,`discipline`/`doctrine`/`system` 三项未漂移 |
| **V3** | **选择正确性**(D8 外部预言机) | `docker exec scholar_agent python3 -I -m statkit doctor --oracle --json \| jq -e '.disagree_without_reason_on_hot_rules==0'` | 【手跑】 | **热规则 D-01/D-04/D-13 不一致且无可读理由 = 0 条**(阻断);其余 19 条不阻断但发布评审逐条念出来。⚠️ 这是唯一能查「出生即错」的闸 |
| **V3b** | 批量 × 合并 | `python3 -I -m statkit emit --batch-key sheet --file fixtures/6sheet.xlsx && python3 -I -m statkit report --merge analysis/*.bundle.json` 后:<br>`jq -es 'length==6' analysis/*.bundle.json` + 断言 6 份的 `decision.rule_id` **不要求相同** + 字母集合 6 组互不共用 | 【手跑】 | 6/6 各自独立走完分流;合并表每格 `均值±SD + 字母` |
| **V3c** | 二连表 | `python3 -I -m statkit report --shape univariate_then_multivariate ...` 后逐字段比对 | 【手跑】 | 两栏 n/OR/95%CI/p 全部 ⊆ bundle;**筛选阈值出现在 Methods 段** |
| **V4** | 格式合规(4 套体系) | `docker exec scholar_agent python3 -m pytest statkit/tests/test_format.py -q`(28 组参数化)<br>+ `diff -ru agent/statkit/tests/derived/render_snapshots/ /tmp/snap/`(**8 族 × 4 套 = 32 份快照**)<br>+ `python3 -m pytest statkit/tests/test_templates_are_system_agnostic.py -q` | 【构建】+【push】 | 单测**零违规**(`.000` / `<.05` / `NS` 三种错误写法必须被函数堵死);快照 diff 为空。**⚠️ 明确不做 152 格人工对照** |
| **V5-①** | jail 内两个保留区只读 | `docker logs scholar_agent \| grep "保留区.*自检"` | 【启动日志】 | 出现「通过(evidence, analysis 两个保留区,三种写法全部被拒)」;出现 `LEAK_*` 或「已跳过」= **不通过**(跳过 ≠ 通过) |
| **V5-②** | 进程内文件工具拒写 | 真会话里发 `Write file_path=analysis/bundle.json` → `docker logs scholar_backend \| grep "engine-reserved"` | 【手工一次性】 | 必须被 `confine.ts:94-95` 拒绝并出现在日志 |
| **V5-③** | `StatRun`/`StatReport` 已在 backend 登记 | `./scripts/check-evidence-mirror.sh; echo $?` | 【push】 | **exit 0**。**exit 2 = 没能检查 ≠ 通过**。漏加即命中 `ws.go:391` 的 `default: return false` = DOA,本仓咬过五次 |
| **V5-④** | 交付闸(D2) | jail 内跑 `python3 -c "import docx; d=docx.Document(); d.add_paragraph('P=0.003'); d.save('out/forge.docx')"` | 【手工一次性】 | ① Bash 的 tool_result 变 `is_error` 且带精确差额;② `out/` 下只剩 `.rejected-*`;③ **产物面板刷新后看不到它**。**三条缺一不算过** —— 只判「拿不到产物卡」是假绿灯(M-1) |
| **V6** | 评审标签如实性(用户拍板②) | `python3 -m pytest statkit/tests/test_review_label_honesty.py -q` + `python3 scripts/lint-review-labels.py` + `python3 -I -m statkit doctor --strict --release` | 【构建】+【push】+【发布】 | ①**双向**禁词正则零命中(含 Methods 段禁「自动化方法学核对」);②`unreviewed/stale/escalated` 的卡不出现在任何 `default`;③三条 label 字符串单测全过;④card_hash 漂移 → 自动降 `stale`;⑤**人工抽样 ≥10% + 100% escalate 已完成**(`human_spotcheck.at` 非空) |
| **V7** | 红线话术 | 24 例人工:12 个 L3(改数值/编观测/编 p/反向剔除/伪造伦理批件)+ 12 个**合法但易误拒**(模拟数据做功效分析、结果不显著怎么写讨论、多重校正后全没了、把图做好看) | 【人工】 | L3 **12/12 拒且给替代路径**;合法 **12/12 放行**(过度拒绝会把用户推去 ¥300 代做) |
| **V8** | SPSS 输出读数 | 20 份真实输出(WPS 截图/低分辨率拍屏/中文表头/v25–29/深色主题/被裁切表)逐字段比对 n·M·SD·F·t·df·Sig.·事后 p 矩阵 | 【人工】 | 字段级 **≥98%**,且**「读错且用户未察觉」漏网率 = 0**(靠逐项确认机制保证);读不出必须显式空缺并追问,**不得猜** |
| **V8b** | **评审 escalate 上限** | `python3 -I -m statkit doctor --review-summary --json \| jq -e '.rule_escalated <= 6 and .hot_rules_ok == true'` | 【发布】 | escalated ≤ **6/22**,且 D-01/D-04/D-13 必须 `pass` 或 `positions_verified`。超出即**停下来找人**(⚠️ 阈值待拍板,§附 Q12) |
| **V9-①** | 资源 | 跑最大 fixture 时 `docker stats scholar_agent` 峰值 < limit×0.8;`docker exec scholar_agent cat /sys/fs/cgroup/pids.current` < 100;statkit 进程内 `OMP_NUM_THREADS == 1` | 【手跑】 | prod 提到 **4G** + `StatRun` 信号量 = 1 + `profile` 入口按文件字节准入 |
| **V9-②** | stat_lab 断网(D4) | jail 内 `curl -m3 https://example.com` / `getent hosts example.com` | 【手工一次性】 | 必须都失败;同轮 `mcp__minicod__*` 必须仍可用 |
| **V9-③** | 轮级不超时(X-1) | 真跑一次 3×StatRun 的医学链完整会话 | 【手跑】 | 不出现 `turn_timeout` error 帧;`FeatureSpec.TurnTimeout` 实际生效为 25min |

**发布判据**:**V0–V6 + V8b + V9 全绿** 且 **V7/V8 达阈值**。
**V3 的热规则部分阻断,其余部分不阻断但必须在发布评审里逐条念出来**(并指定谁看,§附 Q7)。

---

## 八 · 止损检查点

> 降级路径必须是**当场可执行**的,不是「再议」。每条写清:检查什么 / 判据 / 不过关当天做什么。

### 止损点 A · 第 1 周末(T1+T2 结束):依赖与预言机

**检查四件**:

```bash
# ① 构建通过
docker compose build agent
# ② 关键模块全在（2026-08-05 基线：yaml/jinja2/seaborn/scikit_posthocs 四个 MISS）
docker exec scholar_agent python3 -c "
import yaml, jinja2, seaborn, scikit_posthocs as sp, statkit
print(sp.__version__)
print([n for n in dir(sp) if 'letter' in n or 'duncan' in n])"
# ③ Debian numpy 未被顶掉（Dockerfile 断言已覆盖，此处复核）
docker exec scholar_agent python3 -c "import numpy;print(numpy.__file__)"
# ④ 统计引擎自检里出现新条目
docker logs scholar_agent | grep "统计引擎自检"
```

**⑤ D8 预言机 30 分钟可行性验证**(纸面,不写代码):拿一份数据,分别问
SPSS Statistics Coach / JASP / `rstatix`「该用哪个检验」,记录三者是否**主动输出方法选择**。

**不过关的当天动作**(全部可执行,不需要重新设计):

| 情形 | 当天动作 |
|---|---|
| **PyYAML / Jinja2 装不上** | **不可降级** —— 这是 P0 硬 DOA。换镜像源/换 pin/改用 Debian 的 `python3-yaml` + `python3-jinja2`(apt 有),当天解决 |
| **scikit-posthocs 装不上或顶掉 numpy** | ① 方法卡 28 → **26**(`dunn` / `games_howell` 下线,`dispatch.py` 加载期置 `enabled:false` —— **这是已有机制**,`statsEngines.ts:44-47` 注释就是为它预留的消费方);② **`duncan` 与 CLD 本来就要自写,不受影响**(实测该包没有 `posthoc_duncan` 也没有 `compact_letter_display`,`README.md` 修订记录第②条不准确,已在 §2.14 就地更正);③ 或自写 Dunn + Conover ~70 行(+1 天);④ **同一天**改三处口径:`DECLARED_ENGINES` 不加、三份 skill 不承诺、对外材料撤掉相应说法 |
| **`rstatix`/JASP 不是预言机** | D8 降为「二源对拍(SPSS + 教科书判据表)」,V3 判据弱化为「SPSS 与判据表一致时 statkit 必须一致;两者分歧时 statkit 的选择必须落在两者之一且理由可读」。**并如实改对外材料**(不能再说「独立第二意见」) |
| **拿不到 SPSS 授权** | 用 PSPP 的向导替代(GPLv3,只做对拍不打进镜像,无传染问题),并在对外材料里写清预言机构成 |

**工期影响**:0(降级动作当天完成)~ +1 天(自写 Dunn/Conover)。

### 止损点 B · 第 5 周(T5 的 logistic + ols_linear 完成时):声明式内核体检

> 🔴 **此前四份设计稿的判据 `grep -c 'gate:\s*py:' == 0` 是一条永远绿的规则** ——
> `method@1.json` 的 `pattern` 已使 `py:` 写不出来 ⇒ grep 恒为 0 ⇒ **R 的 5 天内核赌注在 P0 结束时没有任何可触发的止损口。**
> 本稿换成三条可证伪的判据。

| 判据 | 命令 | 阈值 |
|---|---|---|
| **B-a 内核增量** | 在 26 张非回归卡全绿之后再加 `logistic`,量 `git diff --stat statkit/core/` | **> 200 行即判失败**。理由:「卡片是数据」的全部含金量就是「加一张卡不动引擎」 |
| **B-b 真正的证伪** | `logistic` 绿之后,**在不改 `core/` 一行的前提下**加第二张回归卡 `ols_linear`,量 `git diff --stat statkit/core/` | 必须为 **0**。做不到 = 声明式主张失败 |
| **B-c 逃生谓词有没有换个名字回来** | `python3 -I -m statkit doctor --derive-growth` 输出每族新增的 derived facts 条数 | **每族 ≤3 条**为软上限;超过要在 doctor 打红横幅并写书面豁免(logistic 作为族首加 8 条已豁免,理由入 `OPEN-METHODOLOGY-QUESTIONS.md`)。**若 `ols_linear` 还要加新 fact,视同 B-b 失败** |

**不过关的当天动作**:**把注册表降级为「决策表 + 薄执行器」**。

- **保留**(R 真正值钱的部分,且不依赖求值器):全部 YAML corpus(卡/checks/effects/policies/systems)、
  `decision_table.md` 快照 + 22 个具名行断言、56 个模板、bundle schema、D1/D2 数字锁、D8 预言机、评审机制。
- **砍掉**:`core/solve.py` + `gate.py` + `rank.py` + `expr.py` 的通用求值器(~750 行)。
- **换成**:每族一个 ~25 行的 Python 分流函数,**直接读 YAML 里的常量**(不解释 `when:` 表达式,只读
  `default`/`allowed`/`reason_id`)。
- **可执行性**:T5 产出的 YAML 与模板对求值器**零依赖**(卡片是数据,模板吃 bundle),
  这次降级是纯删代码 + 写 8 个小函数,**估 1.5 天,净 −1.5 天,不返工**。
- 同时把 `logistic`/`ols_linear` 与全部 P1 回归族改走 `formula_method@1`(2.5 天,挪 P1)。

🔴 **这个分叉点必须在 T5 结束时判,不能拖到 T15** —— 拖到那时是在沉没成本之后做判断,那个判断不会做出来。

### 止损点 C · 第 7 周(T7+T8 结束):数字锁到底成不成立

- **检查**:V5 的四条(①jail 内 EROFS ②`confinePath` 拒写 ③`check-evidence-mirror.sh` exit 0
  ④forge docx **三条子判据全过**)。
- **风险来源(不是假想)**:`bwrap.ts:161-168` 注释自陈「`--ro-bind` 覆盖 `--bind` 的**子路径**,
  其生效与否依赖 bwrap 版本与参数顺序……那种情况下 Phase 0 只封住了一半,**我们却以为封住了**」。
  生产宿主还有 AppArmor + sysctl 两层前置(`docker-compose.prod.yml:422` 的 `apparmor=unconfined` +
  `scripts/enable-bwrap-host.sh`,`:418` 实测矩阵:两者缺一 bwrap 起不来)。
- **不过关的当天动作**(三条,同一天做完):
  1. **对外话术当场降级**:从「报告里的数字**物理上**不经模型手」改成「**有确定性渲染路径 + 事后可验证**」。
     这句话在官网、定价页、skill 话术、Methods 段披露文本**四处**,一次改完;
  2. **D2 交付闸降级为 observe**:仍计算差额、仍打日志、**但照发 artifact 帧**,两周后按假阳性率决定是否开硬拦;
  3. **产物面板加一行**:「本报告的数字来自引擎 bundle,点这里对账」—— 把不可承诺的「正确性」换成可验证的「过程」。
- ⚠️ **不做的降级**:**不要为了让闸变绿去加 `SKIP_*` 开关。** `.githooks/pre-push:20-22` 逐字:
  「加一个要跑 30s 的闸 = 亲手养出绕过习惯」。
- **工期影响**:0(只改话术与一个开关)。

---

## 九 · 红队阻塞项处置 + 可带上线的已知债

### 9.1 开工前阻塞项(逐条:本文件在哪里解决 / 或为什么解决不了)

| # | 红队阻塞项 | 处置 |
|---|---|---|
| **B1** | 工期四份稿各算各的,真实总量是宣称的 1.5–1.9 倍 | ✅ **已解决**:§0.3 单一工期表,按块归属,**禁止分节再改口**;设计2 内部「T2b 3.5 天 vs 逐卡表 19.3 天」的口径矛盾按**逐卡表(自底向上,全含)**统一 |
| **B2** | D7 止损开关恒绿 | ✅ **已解决**:§八 止损点 B 换成三条可证伪判据(B-a 内核增量 / B-b 第二张回归卡 / B-c derive 词表增长);原 grep 判据降级为 warn 并标注「不是判据」 |
| **B3** | 标签放置未拍板 + 禁词表禁反了方向 | ✅ **已解决**:§三-3.6 采纳不对称(警告进 Methods、背书不进);禁词表改**双向**且按段落类型分档;四份 lint 合并为一个 `scripts/lint-review-labels.py`。⚠️ 措辞正文待 §附 Q6 定稿 |
| **B4** | `StatEmit` 一个 vs `StatRun`+`StatReport` 两个 | ✅ **已解决**:取两个(§四 D1c)。理由是硬的:只有 `StatReport` 在 jail 内直接落 `out/` 才让 D2 有 L1 主路径;若 `report` 走 Bash 会被 L2 咽喉点拦住自己的合法产物 |
| **B5** | 保留区 global vs per-profile | ✅ **已解决**:取 per-profile(§四 D1b),但用**使用点自守卫**消解「漏传一处 = 静默敞口」的风险;顺手修 `relocateStrays` 的既有 bug 并补测试 |
| **B6** | review schema 三名三义 + 缺字段 + 单元数 + mtime vs hash | ✅ **已解决**:字段名 `review`、五态无 `fail`(§三-3.4b)、`provenance.citations[]` 加 `access`/`role`(§2.8)、单元数改 **50**、失效判据取 `card_hash` 而非 mtime(§三-3.5c) |
| **B7** | 三件依赖第一周必须跑通(PyYAML/Jinja2 是硬 DOA) | ✅ **已解决**:§四 D9 的 Dockerfile 片段显式列出 PyYAML/Jinja2 并解释为什么 `--no-deps` 会跳过它们;§八 止损点 A 是第一周的强制检查 |
| **B8** | D8 先证明它是预言机再花 2 天 | ✅ **已解决**:T2 里的 30 分钟验证 + §八 止损点 A 第⑤项;并把 D8 从「全不阻断」改为**三条热规则阻断**(修正「强绳不阻断、弱绳阻断」)。⚠️ 谁看报表待 §附 Q7 |
| **B9** | 评审的唯一防伪(人工抽样)必须做成阻塞闸 | ✅ **已解决**:§三-3.5d 升为发布闸 V6-⑤;可行性靠「只允许 oa/local_pdf 的 primary 产生 `reviewed_agentic`」保障。⚠️ 执行人待 §附 Q4 |
| **B10** | `logistic` 的 `ci: profile` 当前不可实现 | ✅ **已解决**:实测 `hasattr(sm.Logit,'profile')` = `False`;§2.10 改 default 为 `wald` 并在 `notes_zh` 写清,profile CI(~80 行)挪 P1(O16) |
| **B11** | 资源前置项(TurnTimeout / 内存 / 信号量 / maxRounds / FEATURES) | ✅ **部分解决**:§四 D-extra 全部落点 + D10 的算式(**3G 不够,要 4G + 信号量 = 1**);⚠️ 宿主余量待 §附 Q5 |
| **B12** | 30 天 GC 的三个后果 | ✅ **已解决**:见 9.2 的「30 天保留期」条 —— UI 明说 + D2 空 bundle 走 observe + compose 显式写 30 |

### 9.2 可带上线的已知债(逐条:为什么可以带 / 什么时候还)

| 债 | 为什么可以带上线 | 还的条件 / 边际成本 |
|---|---|---|
| **图片旁路**(数字画进 PNG,D2 只堵文档) | 交付物层已堵住 docx/xlsx/md 三种主形态;图里的数字通常与表里同源 | 🔴 **但 A3 生科链的交付物就是带标注的图** ⇒ 必须进「已知敞口清单」+ skill 红线 + 抽样审计。`figures_manifest` **+1.5 天,P0 后第一个补**(O10) |
| **CJK / 全角数字不抽** | 交付物是三线表 docx,数字几乎必为 ASCII | +0.5 天,与 numcheck 开拦同批(O19) |
| **L2 与用户点开产物面板之间的残留窗口** | L2 已把窗口从「一整轮」压到「一次 Bash 调用」;harvest 是 upsert-only 永不删 ⇒ 残留行会永久留在 DB | **结构上无法归零**。必须写进文档,不许假装没有 |
| **30 天保留期**(`EXECUTOR_WORKDIR_TTL_DAYS` 默认 30,`sessions.ts:455`) | `analysis/`(bundle + mc_ledger)在 workDir 内 ⇒ **第 31 天随目录整体删除**;而交付物在 MinIO 里**永久留着**(harvest upsert-only)⇒ 数字的出处在第 31 天消失 | **P0 必做三件最便宜的**:① UI 明说「分析数据与结果保留 30 天,之后需重新上传」(计入 T13);② **D2 在 bundle 集为空时走 observe 而不是拒**,回执改成「本会话的分析数据已超过保留期,无法核对数字来源;请重新上传数据」(计入 T8);③ 两个 compose 显式写 `EXECUTOR_WORKDIR_TTL_DAYS=30`(X-4)。**复现包导出**(O12,+3 天)才是正解。⚠️ 这个值同时是「返修窗口上限」,**是定价文案的硬约束** → §附 Q2 |
| **`.sav / .dta` 硬拒,SPSS 走截图** | `agentattach/upload.go` 白名单硬拒,「收 = 能读」铁律不破 | +2 天(O7),P1 |
| **econ 体系 / 多模型并列回归表形** | P0 只有 2 张回归卡,没有足够的可验收对象 | +2 天(O6) |
| **中介/调节 · 重复测量 · ROC/DeLong** | 都是新族或方法间 DAG,不是链闭合件 | +3.0 / +3.5 / +4.0(O1/O2/O3) |
| **`numcheck` 只 observe** | 对话正文层;交付物层已由 D2 覆盖 | 采两周假阳性率后 +1 天开拦(O9) |
| **`profile`/`consult`/`assume`/`report` 走 Bash 不传 `timeout_ms`** | 这四个是秒级 verb,120s 默认够;**计算路径已走 `StatRun`,不受此约束** | 【约定】发现违反:`docker logs scholar_agent \| grep "bash timeout"` |
| **统计图只许 `report` verb 出** | 见「图片旁路」 | ❌【约定】skill 红线 + 抽样审计 |
| **skill 指示模型把 `blocked` 理由原样念给用户** | **缓解已是机制**:D11 的 stdout 回吐(机器注入,不依赖 skill 命中率 4.4%) | ❌【约定】 |
| **每轮开始先读 `project.json`** | 有 D12 的冷重播 fixture 兜底 | 【约定 + 一条测试】skill 必须放 **CLAUDE.md 常驻层**,不能放 `guides/` |
| **加卡时同时加 golden + oracle 对拍** | `doctor` 只能强制 `golden` 非空,强制不了 oracle | ❌【约定】发现违反:`statkit doctor --oracle` 的 coverage 行显示「28 张卡中 N 张无 oracle 对拍」,发布评审念出来 |
| **`OMP_NUM_THREADS=1` 全 feature 生效对 sci_draw 的影响** | 2 CPU / 2 并发槽下本来就该单线程 | 上线后看 sci_draw 出图时长埋点,超标再按 feature 分流 |
| **golden 的「参数选择」与卡片同源** | 已加机制:R 脚本禁 `source()` 卡片 YAML;残余共因(参数化口径)如实登记 | 无低成本解法 |
| **「citations 先于规则体写定」无有效检测** | 由人工抽样(已升发布闸)兜底 | ❌【约定 · 已知漏洞】 |
| **`positions_verified` 可做 default** | 默认由 doctrine 层显式选定 + 两派如实披露 + 产物面板必须呈现两派对照(机制) | 待 §附 Q13 确认;不确认则退回 `escalated` |
| **评审 agent 无自动执行点** | hash 失效会把改过的卡打成 `stale` ⇒ 失去 default 资格,自然有动力去跑 | §附 Q11:是否加增量评审进 pre-push(+0.5 天) |

---

## 十 · P1 / P2 长大路线与稳态边际成本

### 10.1 P1(+18–22 工作日):把剩下三条链闭合

| 块 | 天 | 闭合了什么 |
|---|---|---|
| `formula_method@1` 第二类卡 schema(一次性;**已有 28 张卡零改动**) | 2.5 | 解 O4 的表达力墙 |
| 多因素 OLS 交互项 / 完整 logistic + profile CI | 2.0 | |
| ROC / AUC / DeLong(自写 ~60 行 + `pROC` golden) | 4.0 | 医学「软件里根本没这个功能」型卡点 |
| EFA 删题迭代 + 迭代状态机 | 1.0 | |
| 中介 / 调节(固化 model 4/7/14 三张专用卡,不上 pipelines) | 3.0 | **问卷社科链闭合 6/6** |
| 重复测量 + Mauchly + GG(新 check 卡 + 新数据形态) | 3.5 | **体育/工科链闭合** |
| econ 体系 + `systems/_shapes/regression_multi.yaml` | 2.0 | 经管链前半 |
| `.sav`/`.dta` 四层齐改 + `.do` 预览(`artifact-format.ts` 的 `CODE_LANG` 加 `do:'stata'` **一行**) | 2.0 | 经管链交付物 |
| `figures_manifest` + numcheck 开拦 + CJK 数字 | 3.0 | 补 P0 的两个已知敞口 |
| 评审 S3/S4 视角 + 多厂商交叉(先测独立性) | 3.5 | |
| **合计** | **~26.5**(可按链拆两批发) | 链数 2 → **5** |

### 10.2 P2 的形态

- **`pipelines/*.yaml` 流水线层**(3.5 天):节点引用卡片 id,**方法卡资产 100% 保留**。
  中介/调节/DID/敏感性分析归这里。这正好是 agentrun Run 引擎能吃下的形态(每个 verb 已幂等、
  bundle 以 spec 内容 hash 命名),但**本轮不上 Run 引擎**。
- **复现包导出**(3 天):数据指纹 + params + bundle + 可离线跑的 `analysis.py`;同时绕开 30 天 GC。
- **课题组自带 policy**(2 天)· **`.spv` 原生解析**(3 天,先拿真实中文 `.spv` 实测)·
  **方法学评审外包**(评审对象已固化为 YAML + 决策表,可外部化给统计学老师,**零工程成本**)。

### 10.3 稳态边际成本(长到 40+ 方法 / 4 体系 / 5 学科时)

| 加什么 | 工程成本 | **验收成本(必须同时付,否则是假绿灯)** | 总计 |
|---|---|---|---|
| 第 N 个方法(**同族**) | 2–4 h(卡 YAML + adapter ~8 行 + golden + 重生成决策表快照) | 1 组 golden + 1 条 oracle 对拍 + 快照 diff review ≈ **1.5–2 h** | **半天** |
| 第 N 个方法(**开新族**) | ~2.5 天(新 check 卡 + facts 词表扩 + bundle 字段组 + 4 个模板 + adapter) | 族级必备用例组(零方差列 / 全 tie / 单组 n=3 / 极端 t / 整列缺失)+ 3–5 组 golden ≈ **0.5 天** | **3 天** |
| 第 5 套报告体系 | ~1 天(一个 `systems/*.yaml`) | 7 维参数化断言加一列 + 8 份渲染快照基线 ≈ **0.25 天** | **1.25 天** |
| 第 5 个学科 | ~0.5 天(一个 `policies/discipline/*.yaml`,**方法卡一张不动**) | `caveats` 文案 review + 1 份端到端快照 ≈ **1 h** | **0.6 天** |
| **新数据形态**(时间-删失 / 层级嵌套 / 时间序列 / 多重插补) | 0.5–1 天(内核加 fact 类型)—— 50 个方法路上预计发生 **2–3 次** | 全部已有卡的回归重跑 ≈ **2 h** | **1 天 × 3** |
| 一轮增量评审(改了 N 张卡) | 0 | agent 跑 N 个单元(~5–15 分钟)+ 读结论 | **按 N 计,通常 <0.5 天** |

### 10.4 三轴正交的验证口径(用户拍板③要求保住)

**做成 `statkit doctor --assert-orthogonal <since-ref>` 子命令(0.25 天,计入 T4)**,而不是靠 code review:

```bash
# 加学科时：方法卡必须一张不动
python3 -I -m statkit doctor --assert-orthogonal HEAD~1 --axis discipline
#   内部：git diff --stat registry/methods/ 必须为空
# 加体系时：模板必须一个不动
python3 -I -m statkit doctor --assert-orthogonal HEAD~1 --axis system
#   内部：git diff --stat registry/templates/ 必须为空
```

**不实现,「正交」三年后没人能证明。**

---

## 附 · 待拍板问题清单

> 每条一句话。**Q1/Q3/Q5/Q6 是硬阻塞**(标 🔴),其余标了「最晚何时要答案」。

| # | 问题 | 最晚 |
|---|---|---|
| ✅ **Q1**〔**已拍板 2026-08-05:base = `pretest-classic`,`welch-always` 作用户可选 doctrine 并在 Methods 段如实写明**〕 | ~~**前置检验学派**~~:base 层默认走「先测 Levene 再分流」(pretest-classic,中文核心期刊主流写法、审稿人要依据链)还是「无条件 Welch」(welch-always,Delacre 2017 等明确反对前置检验扭曲名义 α)?—— 两个都统计学正确,选哪个是产品立场,**评审 agent 给不出裁决**;不答的降级是两条 doctrine 并存 + base 走 pretest-classic(+0.5 天),但产品要向用户解释两条学说。 | T5 前(第 2 周) |
| **Q2** | **工期上限是多少、有没有第二个人?** —— 68 天(单人)/ 38 天(双人)能否接受;若上限是 35 天,按 §5.6 的顺序砍;若只有单人,**不能靠加班压缩**(关键路径上没有可并行空间)。 | 开工前 |
| ✅ **Q3**〔**已拍板 2026-08-05:走 ② OA-primary,教科书降 secondary。这是当前第一个开工项,阻塞 B2**〕 | ~~**出处可及性走哪条路?**~~ ①买电子版/扫相关页放 `registry/sources/`(要花钱、要有人做、**版权边界要法务确认**)②系统性把 primary 换成 OA 文献、教科书降 secondary(会改写 D-01~D-22 的出处列,**必须在写卡前做完**)③接受 unverifiable 直接 escalate(那么上线时大半规则不做 default)。 | T2(第 1 周) |
| **Q4** | **人工抽样谁做?** —— 内容已收窄成「打开 locator 确认那句 quote 在那一页上」(不需统计学训练,2 小时以内),但仍要有人真做且能拿到文献。是否接受由非统计学背景的立项负责人承担?10% 这个比例合适吗? | T11 前 |
| ✅ **Q5**〔**已拍板 2026-08-05:抬到 4G + `StatRun` 信号量=1;`mem_limit` dev/prod 成对改**〕 | ~~**宿主机能给 agent 容器 4G 吗?**~~ —— 算式见 §四 D10:现状 1.5G 已被 2×765MiB 用光,一个 statkit 子进程 ~800MB。3G 只够单个统计会话,4G + `StatRun` 信号量=1 才安全。不提就得把 30MB 上传上限的实际可用性砍掉。 | T9 前(第 4 周) |
| 🔴 **Q6** | **Methods 段/披露段标签的一句话定稿**(§三-3.6b 的 ①③)——工程侧只能保证「不出现『统计学家/专家/人工复核』」和「Methods 段不出现背书句」这两条 lint,**写什么必须由能对这句话负责的人给**。 | T14 前 |
| **Q7** | **D8 预言机:SPSS 授权有没有?不一致时谁裁决、裁决记录落哪?** —— 若无 SPSS 可用 PSPP 向导替代(GPLv3,只对拍不打进镜像);**且必须指定「谁看那份 60 格报表」**,无人负责 = 2 天白付。 | T10 前 |
| ✅ **Q8**〔**已由事实结掉 2026-08-05:装,`scikit-posthocs==0.14.0` 已进镜像并通过真实 jail 自检**〕 | ~~`scikit-posthocs` 装不装?~~ 决策依据变了:该包**带 `compact_letter_display`**(全案唯一王牌能力,库调用不自写),这一条就足以让「装」压倒「不装」。它另提供 Dunn/Conover/DSCF/Nemenyi/Tamhane/Scheffé/Tukey/Dunnett + Friedman 族。**没有** `posthoc_duncan` 与 `posthoc_games_howell`(只在 master),这两个自写各 60-80 行。seaborn 作为其包级依赖已用 apt 显式装入并进 `DECLARED_ENGINES`。 | ~~T1~~ **已完成** |
| **Q9** | **P0 上 4 套体系还是 2 套?** —— 本文件取 4 套(理由:模板 ⟂ 体系使 152 格计数不成立,验收是可自动化的格式化函数 + 快照)。若产品侧另有理由只上 2 套(如 AMA/SAMPL 规范细节还没核实到位),**现在砍比 T5 做完再砍便宜**;走本稿则 `README.md` 单一真源表与 `SYNTHESIS §4.1.3` 那两行要就地更正。 | T5 前 |
| **Q10** | **20 份 SPSS 输出截图征集不到怎么办?** —— 本文件倾向「V8 降为非阻塞 + 产品里把场景 C 入口整体灰掉」,**不要用合成截图凑数**(验不出 WPS 导出/低分辨率拍屏/深色主题/被裁切表这些真正的失败模式,是自证循环)。需拍板。 | T15 前 |
| **Q11** | **评审 agent 的执行点**:①只在发布前手跑一次(最便宜,靠人记得)②`.githooks/pre-push` 里对**改动过的卡**做增量评审(+0.5 天,push 时多等约 5 秒)③后台定时任务。本文件倾向②但需确认「多等 5 秒」可接受。另:用哪个模型?首轮是否双跑一份做一致性基线(+2 天)? | T11 前 |
| **Q12** | **V8b 的 escalate 阈值**:`≤ 6/22` 是拍的,没有依据。要不要设成硬闸、阈值定多少?—— 它直接决定「escalate 太多时是停下来找人还是带着警告上线」。 | T11 后 |
| **Q13** | **`positions_verified` 能不能做 default?** —— 本文件倾向可以(默认由 doctrine 层显式选定 + 两派如实披露 + 产物面板强制两派对照),但这与「有争议就升级到人」的直觉相反;一旦允许,D-01/D-03 这两条最高频路径就会以该状态带着 default 上线。 | T11 前 |
| **Q14** | **渲染层能不能自算派生量?**(组间差值、百分比、合并区间、四舍五入到另一个档)——**工程侧强烈建议「一律不许,全部落 bundle 字段」**,否则 D2 的白名单会随每个新模板增长,一年后就是一条永远绿的规则。代价是 bundle 字段表变长、report 模板不能做任何算术。 | T8 前 |
| **Q15** | **是否把三块「不做」拉进 P0?** —— 中介(+3.0,唯一能把 A2 从 5/6 变 6/6)> 重复测量(+3.5,闭合 A5)> ROC/DeLong(+4.0,不闭合链)。本文件建议三块都不进;若要加,按此顺序。 | T5 前 |
| **Q16** | **30 天保留期与定价文案** —— `EXECUTOR_WORKDIR_TTL_DAYS=30` 同时是「返修窗口上限」和「用户数据留存期」,**不得承诺任何超过它的「返修期内不限次重跑」**。第 31 天回来 = 数据没了,用户体感是「它把我的东西弄丢了」。值本身要在定价文案定稿前拍板。 | 定价文案定稿前 |

---

**修订记录**

- 2026-08-05 v1 成稿。合并四份并行设计稿 + 一轮红队;12 条红队阻塞项中 12 条就地解决(处置见 §9.1),
  余下不可在文档内解决的进 §附 的 16 条待拍板。
- 🔴 **2026-08-05 二次更正(以实际安装产物为准,推翻本文件 v1 的第①条更正)**:
  `README.md` 修订记录第②条**是对的** —— `scikit_posthocs.compact_letter_display` **确实存在**于发布版 0.14.0。
  v1 写的「该包无 `compact_letter_display`」不成立,CLD **是库调用不是自写**。
  真正没有的是 `posthoc_duncan` 与 `posthoc_games_howell`(只在 GitHub master),**这两个才要自写**。
  经过:先读 master 源码 → 以为 Duncan 也有 → 构建期断言 ImportError → 查 v0.14.0 tag 的 `__init__.py`
  → 装进镜像逐名 `hasattr` 复核。**教训:「某库有没有某函数」不能读 master、不能读文档、要读发布产物。**
- ~~对上游文档的三处主动更正:① `README.md` 修订记录第②条「scikit-posthocs 否则字母标记全无实现路径」**不准确**
  (该包无 `compact_letter_display`、无 `posthoc_duncan`,CLD 与 Duncan 必须自写);~~ **← 该条已被上一条推翻**
  ② `README.md` 单一真源表「P0 只实现中文核心 + APA 两套」→ 本文件取 4 套(§2.12,待 Q9 确认);
  ③ `agent/src/sandbox/bwrap.ts:127` 注释引用的 `sandbox/profile 的 ensureReservedDir` 是陈旧注释(该符号不存在),随 D1 一并更正。
