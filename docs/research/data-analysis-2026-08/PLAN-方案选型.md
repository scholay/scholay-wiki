# 数据分析能力 · skill × 算法层 架构选型(2026-08)

> 决策文档。四份方案(R / S / K / L)+ 三位评委 + 一轮红队的收敛结果。
> 面向决策者:第〇章给结论,第九章给你要拍的板。中间是支撑材料。
> 所有代码事实均已在本仓实读复核(行号见正文),复核日期 2026-08-05。

---

## 〇 · 决策摘要:三分钟看懂选什么

### 推荐:**方案 R(方法卡注册表 statkit-registry)**,但必须加装红队的 7 条机械防线

**一句话理由**:用户的核心约束是「要写很多 skills,并且需要很多算法作为支撑」——这句话真正的成本
不在写 20 个方法(四家都能写),而在**第 40 个方法、第 4 套报告体系、第 5 个学科默认值**。四份方案
里只有 R 把这三条生长轴真正正交化了:方法沿方法卡、学科沿 policy 包、格式沿 systems 包,**模板按
「族 × 语言」组织,与体系数无关**。这直接决定了调研认定仅剩的三格空白(中文三线表口径 / 目标体系
切换 / Methods 段)能不能在 P0 就吃下来。三位评委独立给出同一个排序 **R > K > L > S**,红队做完
最重的一轮攻击后仍然选 R。

### 但有三件事必须同时接受

1. **四份方案共同宣称的「报告里的数字物理上不经模型手」是假的。**
   `backend/internal/agentbridge/ws.go:389` 对 `Write` 到 workDir 内任意路径一律放行,
   `agent/src/sandbox/bwrap.ts:118` 的 cwd 是可写 bind。模型可以一句 `echo > analysis/bundle.json`
   把 bundle 整份重写。**现状下这是「约定」不是「机制」。**
   要把它变成机制,必须做红队的 D1/D2(保留区 + jail 外交付闸,+4 天)。
   若不做,产品对外只能说「有确定性渲染路径 + 事后可验证」,不能说「数字不经模型手」。

2. **R 缺三夺权之一。** 裁决③点名的「多重比较记账」在 R 的结构里**没有位置**——它的状态真源
   `project.json` 只有 `consult` 一个写入口,bundle 是 per-spec 的,跨调用的族 α 预算无处安放。
   这不是「P1 再补」,补它要给 R 加第二个状态写入口。已列为必装项 D5。

3. **`reviewed_by` 的 fail-closed 会在 P0 就把发布卡死。** 一位兼职统计学评审人的吞吐约
   10–15 张卡/周,P0 要签 20 张方法卡 + 4 checks + 5 effects。必须改成**非阻塞标记**(D6):
   未签的卡进候选集但 `default` 永不指向它,且「未经方法学复核」作为 bundle 必填字段强制渲进
   Methods 段。保住闸门语义,把不可调度的人从关键路径挪开,同时不给 `SKIP_*` 开关任何存在理由。

### 工期与代价

| 项 | 数字 | 依据 |
|---|---|---|
| R 原案 P0 | 22–28 工作日 | 含 T0(三份 hook 工厂化 2–3 天)+ T1 上传接线 + 内核 4 天 + 20 卡 2.5 天 + 交付层 |
| 必装防线增量 | **+6.5–8.5 天** | D1 保留区+StatEmit 2.5 / D2 交付闸 1.5 / D5 多重比较记账 1 / D7 logistic 卡 1.5 / D3+D4+D6 合计 1 |
| **P0 合计** | **30–36 工作日**(单人 6–7 周;两人并行约 4 周) | |
| 第 21 个方法(同族) | 2–4 小时,改 4 个文件,引擎/模板/前后端零改动 | |
| 第 5 套报告体系 | ~1 天(AMA/SAMPL);econ 因表形差异 +1 天 | |
| 第 5 个学科 | ~半天(一个 policy YAML) | |

### 什么条件下这个推荐是错的(逐条,拍板前对照)

- 方法总数最终 **< 25** 且只上 2 套体系 → R 的 4 天声明式内核纯亏,改选「决策表 + 薄执行器」的
  基线形态(把 R 的 YAML 与 decision_table 留下,砍掉 1500 行求值器)。
- 团队里**没有能签字的统计学评审人**,且不打算找 → R/K/S/L 全部退化为假绿,此时应缩范围到
  「Table 1 + 数据体检 + 交付层」这一档,不做推断性比较。
- P0 工期被压到 **25 天以内** → R 只能砍防线,砍完就没有它宣称的正确性论证,不如直接做基线。
- 产品重心是 **SPSS 输出翻译 / 代做服务** 而非方法扩张 → 注册表的杠杆全在扩张上,此时它是负担。

---

## 一 · 这次到底在选什么

### 不是选框架,是选**方法学知识住在哪一层**

四份方案的算法内核几乎相同:scipy / statsmodels / scikit-posthocs + golden 对 R 语言参考值。
计算谁都不会算错(golden 咬得住)。真正拉开差距的是三个问题:

**问题一 · 「什么时候该用 Welch 而不是 Student」这句知识住在哪里?**

| 形态 | 谁 | 评审对象 | 加第 40 个方法时 |
|---|---|---|---|
| 写在 Python 的 `if/elif` 里 | L(每个方法函数体内联)、S(每族 `plan.py` 各写各的) | 350 行代码 / 15–20 棵手写分支树 | 没有任何一处可整体审视 |
| 抽成可评审的数据(YAML) | **R**(方法卡 + checks + policies)、K(插件内 decisions.yaml) | 70 行 YAML + 一张机器生成的决策表 | 卡片数增长,评审对象仍是一张表 |

这一条是本次选型的主轴。用户说「要写很多 skills + 很多算法支撑」,意味着这份知识资产会长到 50+
条目、跨 5 个学科、跨 4 套报告体系。**三年后有没有人能回答「这 50 个方法的默认值是谁定的、依据
是什么、改一个会影响哪些历史结论」,取决于这一层的形态。**

**问题二 · 编排(先体检还是先问设计、跑几轮、怎么解释)归模型还是归确定性代码?**

- R / K / S:verb 序列(4–7 个 verb),模型只在候选白名单内挑方法。
- L:完全归模型,模型在 Bash 里写几行 Python 调纯函数库。

裁决已定:三夺权给确定性代码(①前提检验 ②数字来源 ③体检/格式化/排版/多重比较记账),
三放手给模型(④白名单内选方法 ⑤清洗重塑 ⑥定性解读)。四家都声称遵守,但**L 的守门是内联在
每个方法函数里的**,等于把①从「一处确定性代码」变成「50 处各写各的」。

**问题三 · 算法资产的物理形态:pip 包 / skill 目录 / 插件目录?**

这条已被本仓事实判死,没有选择空间:
- `agent/src/tools/registry.ts:361` 构造 Bash sandbox profile 时是 `profileFor({workDir, net, allowBash})`,
  **`roBinds` 没传、恒为 `[]`**;`bwrap.ts` 只对 `profile.roBinds` 里的路径做 ro-bind。
  ⇒ `agent-skills/*` 的 `:ro` 挂载**在 jail 内根本不存在**,skill 目录里的 `.py` 物理上跑不了。
- `bashEnv()` 是白名单 env(`registry.ts:107`),`PYTHONPATH` 不在其中;bwrap 又是 `--clearenv`。
  ⇒ 挂载路线要同时改两个全 feature 共享的高风险文件。
- pip 装到 `/usr/local/lib/python3*/dist-packages`,已被 `bwrap.ts:93` 的 `--ro-bind /usr /usr` 覆盖
  (lifelines 是活证据,`agent/Dockerfile:70` 白纸黑字)。

⇒ **四家最终都选了 pip,这一项拉不开差距**。但红队指出:正是这个选择让「数字托管」在结构上
不可能成立(见第四章)。

### 一句话分歧图

```
                   方法学知识 = 数据(可评审)         方法学知识 = 代码(散在分支里)
                 ┌──────────────────────────┐   ┌──────────────────────────────┐
 编排 = verb 序列 │  R  中心注册表 · 三轴正交  │   │  S  每族一个自足目录          │
                 │  K  窄内核 + 族插件        │   │     (守门 Python 按族复制)   │
                 └──────────────────────────┘   └──────────────────────────────┘
 编排 = 模型      │        (无人占位)          │   │  L  纯函数库 + 厚 skill        │
                 └──────────────────────────┘   └──────────────────────────────┘
```

---

## 二 · 四个候选方案

> 每个方案给:形态图 → 一段真实例子 → 加第 21/40 个方法的成本 → 天花板 → 死法。
> 读完这一章即可比较,不必回原方案。

---

### 2.1 方案 R · 方法卡注册表(statkit-registry)

**立场**:统计方法学知识是**数据**,不是代码。引擎不认识任何方法名。

#### 形态

```
statkit/registry/                    ← 方法学知识唯一真源(可被统计学家逐行评审)
  methods/*.yaml    一个统计方法一张 ~70 行的卡
  checks/*.yaml     前提检验卡(shapiro / levene / expected_min)
  effects/*.yaml    效应量与 CI 方法卡
  policies/         base ← discipline(农学/医学/心理/经济) ← doctrine(前置检验两派) ← 用户
  systems/*.yaml    报告体系(p 值格式 / 离散度符号 / 星号档 / 必报项)
  templates/*.j2    Methods/Results 句式,按「族 × 语言」——★ 与体系数无关
         │ 只读
         ▼
statkit/core/ (~1500 行,零方法知识)
  solve() design 匹配 → 候选卡  ·  gate() 跑 checks → allowed/blocked+中文依据句
  rank() policy 链归并          ·  run() 按 card.engine.adapter 派发
  emit() 按 card.reports.required 校验后落 bundle
  render() systems + templates 插值出 docx/md
         │                              │
   allowed[]+reasons                 bundle.json(数字唯一真源)
         ▼                              ▼
  模型只能在 allowed 里挑          三线表 / Methods / Results(从 bundle 插值)
```

#### 真实例子:两组独立样本比较

方法卡 `methods/welch_t.yaml`(节选,全卡 73 行):

```yaml
schema: statkit/method@1
id: welch_t
design: {units: independent, groups_n: {eq: 2}, dv: {scale: [continuous], min_per_group: 3}}
requires:
  - check: shapiro_wilk
    on_violated: demote
    tolerance: [{when: "design.min_group_n >= 30", verdict: satisfied, reason_id: R.clt}]
  - check: levene
    stance: not_required          # ★ 显式声明「本方法不要求方差齐」,但仍报告
engine: {backend: scipy, adapter: statkit.adapters.two_group:welch_t, deterministic: true}
reports:
  required: [statistic, df, p_exact, n.by_group, effect.name, effect.value,
             effect.ci_low, effect.ci_high, effect.ci_method, assumptions[]]
  effect: {default: hedges_g, ci: {method: nct, level: 0.95}}
fallbacks: [{to: mann_whitney, when: "design.min_group_n < 10 or dv.heavy_tail == true"}]
templates: {methods: methods/two_group, results: results/t_like}
golden: [g_two_group_unequal_var]     # 空则 doctor 拒绝启用
provenance: {citations: [welch1947, delacre2017]}
reviewed_by: null
```

`assume` 一次工具轮输出:

```jsonc
{"checks":[{"name":"levene","stat":6.31,"p":0.0141,"verdict":"violated"}],
 "allowed":[{"id":"welch_t","rank":1},{"id":"mann_whitney","rank":2}],
 "blocked":[{"id":"student_t","zh":"方差不齐(Levene F=6.31,P=0.014),Student t 的等方差前提不满足"}],
 "default":"welch_t","rule_row":"D-03"}
```

渲染出的 Results 句(cn-core 体系):

> 由于方差齐性检验不满足(Levene *F* = 6.31,*P* = 0.014),采用 Welch t 检验:
> *t*(812.44) = 2.913,*P* = 0.004,Hedges *g* = 0.20(95% CI:0.07 ~ 0.34)。

同一份 bundle 换 `--system apa7` **秒级重渲染、不重算**:`p = .004`(去前导零)、CI 写作
`95% CI [0.07, 0.34]`。变的只有 `systems/apa7.yaml` 的 5 个键。

#### 边际成本

| 场景 | 成本 | 改哪些文件 |
|---|---|---|
| 第 21 个方法(同族,如 Scheffé) | **2–4 小时** | 卡 YAML + adapter 8 行 + golden + 重生成决策表快照 |
| 第 40 个方法(开新族,如重复测量+球形度) | **~3 天**(族首个) | 新 check 卡 + facts 词表扩 + 方法卡 + bundle 字段组 + 4 个模板 + adapter + golden |
| 第 5 套报告体系 | **~1 天**(econ 因表形 +1 天) | 一个 `systems/*.yaml` |
| 第 5 个学科 | **~半天** | 一个 `policies/discipline/*.yaml`,方法卡一张不动 |

**成本按「族」而非「方法」计价** —— 这是 R 唯一的经济学主张,也是它可被证伪的地方。
收支平衡点在**第 31 ± 5 个方法**;若 P1 真补 3 套体系,提前到**第 24 个方法**。

#### 天花板

1. **表达力(最先撞,P1 中段 35–45 张卡)**:回归/混合效应/Cox 要 patsy formula 与随机效应结构,
   `design:` + `engine.kwargs:` 塞不下。R 自设警戒线:需要 `gate: py:` 逃生谓词的卡 >30% 即宣告
   声明式主张失败。逃生口是第二类卡 schema `formula_method@1`(2–3 天,已有卡零改动)。
2. **流水线(60–80 张卡)**:中介/调节/DID 是方法之间的 DAG,一张卡描述不了。外挂 `pipelines/*.yaml`。
3. **评审吞吐(P0 就撞)**:fail-closed 把兼职评审人放进发布关键路径。

#### 死法

DSL 判死时**双向沉没**:1500 行求值器直接作废,1400 行 YAML 需人工重表达——corpus 只在这个求值器
下有意义,求值器只为这个 corpus 存在。这是四份里锁得最深的一份。

---

### 2.2 方案 K · 窄内核 + 方法族插件包

**立场**:内核最小,且对「加方法」承诺永不改动。每族一个插件目录,自带谓词化决策条目。

#### 形态

```
statkit-core(~1600 行) profile / consult / plan / run / emit / report / selftest
   ├ predicates.py  谓词求值器(内核守门的全部智力,不认识任何方法名)
   └ registry.py    目录扫描 + 契约校验 + golden 闸
            ▲
   families/  two_group/ multi_group/ categorical/ assoc_reg/ descriptive/
       每族:plugin.py(声明) · methods/*.py(计算) · decisions.yaml(谓词决策+出处)
             bundle.yaml · templates/<system>/*.j2 · goldens/(强制)
   policies/ agronomy-cn · medicine-cn · psych-apa      systems/ cn-core · apa
```

#### 真实例子

决策条目 `families/two_group/decisions.yaml`:

```yaml
- id: D-02
  doctrine: conditional-levene
  when: {all: [{fact: dv.scale, eq: continuous},
               {fact: dv.normality.min_group_p, ge: 0.05},
               {fact: dv.levene_p, lt: 0.05}]}
  allowed: [welch_t]
  default: welch_t
  because: "正态但方差不齐,改用 Welch 校正"
  cite: "Welch 1947;Ruxton 2006"

- id: D-01W                        # ★ 同一条件下的另一条学说,内核不裁决谁对
  doctrine: unconditional-welch
  when: {all: [{fact: dv.scale, eq: continuous}]}
  allowed: [welch_t]
  because: "无条件默认 Welch:前置方差齐性检验本身会扭曲名义 α"
  cite: "Delacre/Lakens/Leys 2017;Zimmerman 2004;Rasch/Kubinger/Moder 2011"
```

学科覆盖 `policies/agronomy-cn.yaml`:

```yaml
overrides: {multi_group.posthoc.default: duncan, multi_group.cld.enabled: true}
caveats:
  multi_group.posthoc.default: >
    本报告按农学期刊惯例采用 Duncan;统计学上 Tukey HSD 对总体 I 类错误率控制更严(Zar 2010)。
```

**K 最锋利的一条不变式**:policy **只能改 `default`、不能改 `allowed[]`**。学科惯例可以决定默认
选哪个,不能把统计上站得住的选项从候选表抹掉。这条应当被无条件搬进推荐方案。

#### 边际成本

同族第 21 个方法 **0.5–0.75 天**(5 个文件,全在族目录内);新族 **2–3 天**;
新学科 **0.5 天**;**新体系要「逐族补模板格」** ← 这是它的结构问题。

#### 天花板

内核的隐藏耦合面 = profile fact 词表 + bundle 原语。方法数本身不构成压力,但每引入一种**新数据
形态**(时间-删失、层级嵌套、时间序列、多重插补)就要给内核加 fact 类型,50 个方法路上预计发生
2–3 次,每次 0.5–1 天。第 8–10 族(60–80 方法)撞墙。

#### 死法

**模板矩阵是乘法**:`templates/<system>/<method>.results.j2`,P0 就 76 格,K 自己预测 P1 到 ~500 格
并列为死法之一。而「报告体系切换」恰恰是产品仅剩的三格空白之一——K 把自己的差异化卖点架在
自己承认会崩的结构上。次级伤口:`custom_predicate: py:` 后门一旦出现,守门权漏回插件,
「内核零方法知识」的记账优势即刻失效。

---

### 2.3 方案 L · 可验证函数库 + 厚 skill,编排还给模型

**立场**:算法资产 = 一个 pip 包里的几十个纯函数,每个自带强制前提检验;编排归模型。

#### 形态

```
模型在 Bash 里几行 Python:
    import pandas as pd, scholay_stats as st
    d = st.Design(question_type="compare", paired=False, n_groups=2, outcome_scale="continuous",
                  discipline="agronomy", target_style="cn_three_line", unit_of_analysis="plot")
    r = st.two_groups.compare_two_independent(df, outcome="yield", group="treatment", design=d)
         │
         ▼  唯一写数字的通道
    workDir/analysis/bundle.jsonl   (append-only,每条含 fn/params_hash/data_hash)
         │
         ▼  唯一读数字的通道
    st.render(bundle, template, style) → out/报告.docx
         │
         ▼  ★ jail 外(artifacts.ts)
    python3 -m scholay_stats.verify --recompute → 重跑每次调用、位级比对 → stats_audit
```

#### 真实例子(L 的两个真发明)

**发明一 · `DesignIncomplete`——把「必须先问清研究设计」做成函数签名的一部分**:

```python
@require(fields=("question_type","paired","n_groups","outcome_scale","discipline","target_style"),
         accepts={"question_type":"compare", "paired":False, "n_groups":2})
def compare_two_independent(df, *, outcome, group, design: Design, alpha=0.05) -> Result:
    ...
# 缺字段时抛 DesignIncomplete,其 __str__ 就是该问用户的题目清单:
#   "分析无法开始:研究设计还有以下问题未确定,请先向用户确认(建议用 AskUserQuestion 一次问完):
#      - [paired] 两组数据是同一批对象的前后/配对测量,还是两批独立对象? 选项:配对/重复测量 / 独立两组"
```

调研说失败大头是「把研究设计问出来」这一步全场没人做。**L 是唯一把它做成机械闸而非提示词叮嘱
的**:设计没澄清,统计函数根本跑不动。R/K/S 的问诊都靠 skill 协议或 verb 顺序,模型可以绕。

**发明二 · jail 外重算校验**——L 是唯一承认了一件所有人都在装作没有的事:jail 里 workDir 可写,
模型能自己往 bundle 里写数字。它用 `fn + params_hash + data_hash` 在 jail 外重跑比对,
加上 `render` 的 `ProseNumberLeak`(模板里任何不在占位符内的数字字面量 → 抛错、报告生成不出来)
做真拦截。**这是四份里唯一真正闭合「数字不经模型手」的机制。**

#### 边际成本

第 21 个方法 **3–5 小时**;同 IR 形状的第 40 个 **2–4 小时(边际随规模下降)**;
新 IR 形状 **1.5–2 天**;新体系走 `report/styles/*.py`,是 **O(styles) 不是 O(方法×体系)** —— 这一点和 R 一样正确。

#### 天花板

60–80 方法 × 4 体系 × 5–6 学科时,瓶颈不在写方法,而在:① policy 矩阵组合爆炸;
② 厚 skill(~2400 行)的读取率——模型不去 `Read refs/discipline-agronomy.md` 就走通用默认,
**4.4% 触达率问题在 feature 内部原样复发**(L 自承);③ 编排方差的支持成本,客服无法复现。

#### 死法

**守门逻辑没有主人。** 阈值直接埋在函数体(`small_n = min(n1,n2) < 15`、`stance` 分支各写各的),
到第 40 个方法就是 15–20 棵手写私树,没有集中评审对象、没有决策级穷举断言、没有 diff 探针。
§6.4 列的评审对象里**决策规则本身不在里面**。把 15 改成 20、或在第 37 个函数里抄错一个分支,
会静默改变成千上万份报告的默认方法。对一个卖「方法学守门」的产品,守门逻辑是全场唯一无人能
整体审视的部分。叠加 46 人日(近基线两倍),且这两倍买到的确定性最少——选方法仍完全在模型手里。

**但 L 的战略论证成立**:「verb 引擎能长在函数库之上,反之不成立」(纯函数外包一层 verb 壳是加法;
缠着状态机与帧协议的统计逻辑拆成纯函数是重写)。这是期权,不是本轮产品。

---

### 2.4 方案 S · Skill 即软件包

**立场**:作者面单一目录——每个方法族是 `agent-skills/stats-add/guides/fam-*/` 下一个自足目录
(SKILL.md + engine/*.py + templates/ + golden/),加方法 = 加一个目录。

#### 形态(作者自己修正后的「双轨投送」)

```
agent-skills/stats-add/guides/fam-two-group/     ← 作者面:一个目录
   SKILL.md          → :ro 挂载,进模型上下文
   engine/*.py       ─┐
   templates/*.j2    ─┼→ 构建期 build-stats-wheel.mjs 装配成 scholay_stats wheel → 烧进镜像
   golden/*.json     ─┘
模型只发 4 条 verb:scholay-stat audit / plan / run / report
```

S 自己实测发现「skill 目录里的 .py 被模型直接调用」在本仓物理不可能(`registry.ts:361` 不传
roBinds),于是把投送拆成双轨。**这份工程诚实度是四家最高的**,但也正是它自证过程中掏空了自己的立场。

#### 三个值得搬走的部件

1. **`_core-only` AST 检查**:遍历 `methods/*/**.py` 的 AST,拒绝直接 `round()` / f-string `:.Nf` /
   `"%.3f" %`,格式化只能在 `_core`。四家里**唯一封死「格式化逻辑复制粘贴退化」**的机制。
2. **golden 强制 `source` 非空**,理由是「没有来源的 golden 等于把当前实现的输出钉成正确,
   是自证循环」——四份里最正确的一句 golden 纪律。
3. **工具层回吐**:`scholay-stat plan` 的 stdout 不只是文件路径,而是把候选表 + 每条 reason +
   下一步该调什么**回吐给模型**。机器注入而非模型自取,绕过 skill 命中率问题。
   ★ 这一条应无条件搬进推荐方案。

#### 边际成本

同族第 21 个方法 0.5–1 天;新族 1.5–2 天。**真正的台阶在第 6–8 个族**——`MENU_CAP_CHARS` 触帽。

#### 死法(两条,第一条作者未意识到)

**① 构建上下文塌方(致命)**:wheel 的源码真源在 `agent-skills/stats-add/guides/fam-*/`,而
`docker-compose.yml:359-361` 的 agent 构建 context 是 **`./agent`** ——那棵目录树**物理上不在构建
上下文里**,`docker-compose up -d --build agent` 根本 COPY 不到。于是「作者面单一目录」实际要靠
一个没挂在任何钩子上的手跑主机脚本(本仓无 CI)把 wheel 摆进 `agent/`。
更糟的是运行期:SKILL.md 走 `:ro` 挂载是**活的**(本仓成文习惯「改 skill 须 restart scholar_agent」,
不重建镜像),py 与模板是烧进镜像的**死快照**。两半按不同时钟发布,而三道闸校验的是 wheel 内自带
的 frontmatter 副本——**自己跟自己对拍,恒绿**。这正是 `agent/Dockerfile:49-54` 那条事故链
(md 声明了镜像没有的能力 → 逼模型编数字)的原样复发,发生在最大声宣称要避开它的那份方案里。

**② 扩展轴架在一个只 warn 不 fail 的帽上**:`loader.ts:60` 的 `MENU_CAP_CHARS`,触帽只
`log.warn`,被丢的族对模型**静默消失**。S 识别了这个风险(闸 3 预警),但解法要另花 3–4 天;
R/K 把族放进 wheel,菜单零占位,根本不碰这个帽。

**③ `emit` 的 `seal = sha256(payload)` 无密钥、jail 内可复算**,`verify_seal` 是安全剧场。

---

## 三 · 评分表

### 3.1 六个维度

| # | 维度 | 问的是 |
|---|---|---|
| D1 | **方法学知识的可评审性** | 三年后有没有一处能让统计学家整体审视 50 个方法的默认值 |
| D2 | **三轴边际成本**(方法/学科/体系) | 加第 40 个方法、第 5 个学科、第 4 套体系分别多贵 |
| D3 | **公共逻辑归属** | 前提检验/效应量 CI/格式化/多重比较记账会不会被复制成 N 份 |
| D4 | **契约的机械强制度** | 「必须」有多少是机制、多少是约定 |
| D5 | **正确性可验证** | 能否自动断言到 R/教科书参考值 + 能否抓到「选错」而不只是「算错」 |
| D6 | **仓内摩擦与工期** | 接触点、上线速度、与本仓已有机制的契合 |

### 3.2 分数(0–10/维,满分 60)

> 每格给三位评委的取值。评委 1、2 给了总分(R51/K47/L41/S33 与 R51/K43/L39/S38),
> 评委 3 只给了排序与部分维度的口头分(如 D5 给 R/K 各 9 分);**评委 3 的其余分格是我按其
> 评语文本推定的**,已用 `~` 标注。均分保留一位小数。

| 维度 | R | K | L | S |
|---|---|---|---|---|
| D1 可评审性 | 10 / 10 / ~9 = **9.7** | 8 / 8 / ~8 = **8.0** | 4 / 4 / ~4 = **4.0** | 5 / 5 / ~5 = **5.0** |
| D2 三轴边际成本 | 9 / 9 / ~10 = **9.3** | 7 / 6 / ~6 = **6.3** | 7 / 7 / ~6 = **6.7** | 6 / 6 / ~5 = **5.7** |
| D3 公共逻辑归属 | 8 / 8 / ~8 = **8.0** | 9 / 8 / ~8 = **8.3** | 4 / 4 / ~4 = **4.0** | 6 / 7 / ~6 = **6.3** |
| D4 机械强制度 | 9 / 8 / ~8 = **8.3** | 8 / 8 / ~8 = **8.0** | 8 / 9 / ~8 = **8.3** | 6 / 6 / ~5 = **5.7** |
| D5 正确性可验证 | 9 / 9 / 9 = **9.0** | 8 / 8 / 9 = **8.3** | 7 / 7 / ~7 = **7.0** | 6 / 8 / ~7 = **7.0** |
| D6 仓内摩擦与工期 | 6 / 7 / ~7 = **6.7** | 7 / 5 / ~6 = **6.0** | 4 / 4 / ~3 = **3.7** | 4 / 6 / ~4 = **4.7** |
| **合计** | **51 / 51 / ~51** | **47 / 43 / ~43** | **41 / 39 / ~35** | **33 / 38 / ~33** |
| **均分** | **51.0** | **44.3** | **38.3** | **34.7** |

### 3.3 三评委一致的地方

- **排序完全一致:R > K > L > S**,三份评语独立写就,无并列。
- R 的两条决定性优势三人共同点名:**① 模板与体系正交**(族 × 语言 38 个文件,与体系数无关,
  使 P0 能上 4 套体系而验收工作量不增);**② `tests/derived/decision_table.md` 穷举快照 + 具名行
  断言 + diff 探针**(四家里唯一能抓「改一个 tolerance 却翻转了 6 种情形默认方法」的机制)。
- K 的工程素养三人共同承认最高(`OMP_NUM_THREADS` 必须在 import numpy 前进程内钉、
  `cost=HEAVY` 无 resume 则注册表拒绝加载、plan 阶段就剔除会超限的方法)。
- L 的 `DesignIncomplete` 与 jail 外重算,三人共同认定是**该被搬走的真发明**。
- S 的构建上下文塌方,评委 1 与评委 3 独立发现(评委 2 从「双时钟发布」角度指出同一伤口)。

### 3.4 三评委的分歧点(共 3 处)

| 分歧 | 评委 1 | 评委 2 | 评委 3 | 我的裁决 |
|---|---|---|---|---|
| **L vs S 谁排第三** | L(41)>S(33),差 8 分:S 的构建塌方 + 守门按族复制 | L(39)>S(38),差 1 分,「不装作泾渭分明」 | L>S,理由是 S 的架构选型破产 | 取评委 1:S 的塌方是**核心主张不成立**,不是扣分项 |
| **K 与 R 的差距** | 4 分(模板正交 + 决策表穷举) | 8 分(doctrine 是跨族横切,K 每族重抄一遍) | 「差距很小」,输在模板乘法与 +4–5 天工期 | 取评委 2 的因子分解论证:doctrine 重抄是 K 的结构问题,不只是模板 |
| **R 最致命的缺陷是哪条** | 声明式表达力墙(回归是入场券,不是 P2 奢侈品) | `reviewed_by` fail-closed(唯一不靠工程能力就能被外部堵死的机制) | 未单列 | **两条都真,但性质不同**:表达力墙有便宜逃生口(2–3 天),评审闸没有 → 必装 D6 |

---

## 四 · 红队结论:哪些「必须/应当」其实没有机制

红队实读了四份方案共同依赖的全部代码点。以下每条已在本仓复核(2026-08-05)。

### 4.1 三条「四家共同当作事实、实读为假」的前提

| # | 四家怎么写 | 实读 | 后果 |
|---|---|---|---|
| **F1** | S 写 `Net:none`,L 的形态图写 `bwrap jail (net=none)` | `agent/src/server/ws.ts:477` 逐字是 **`net: "open",`**,在 turn input 构造处,与 feature 无关,**无 per-feature 分流** | 一个输入 100% 是**用户未发表原始数据**的 feature,jail 里有一条完整出网通道(bwrap 在 `net==="open"` 时 `--share-net`,agent 接在 egress-net 上直连公网 NAT)。只有 K 点破并报了 0.5 天 |
| **F2** | R/K/S 都写 `RUN pip3 install ...` 作为新的一层 | `agent/Dockerfile:74-76` 装完 **`apt-get purge -y python3-pip`**,此后镜像里**没有 pip3** | R/K/S 的 Dockerfile 片段**构建当场失败**(`pip3: not found`)。**只有 L 写对了**(先 install 再 purge)。另:`scikit-posthocs` 的 pin 四家给了两个版本(0.14.0 / 0.11.4)→ **没有一家真装过** |
| **F3** | R「6–9 轮」、K「8–10 轮」、L「问设计(1)→体检(1)→清洗」 | `turnLoop.ts:487-490`:`if (askFired && !askWoundDown) { askWoundDown = true; activeTools = []; ... }` —— **AskUserQuestion 后本轮工具数组被清空**,只能出文本 | 四家的轮数算式全部无效。真相更宽松(轮数按 turn 重置、`MAX_TOOL_ROUNDS` 可由 env 调),但代价换了位置:**每次问诊是一次用户往返**,且 `AskUserQuestion` schema 是 `maxItems: 4` → L 的 6 题至少 2 张卡 → **计算开始前 2 次用户往返**。没有一家算过这个 UX 代价 |

### 4.2 最重的一击:数字锁在四份方案里**全部是约定**

**事实链**(全部实读):
- `backend/internal/agentbridge/ws.go:389`:`case "Read", ..., "Write", "Edit", ...: return pathWithin(p, sessionWorkDir), true` —— **`Write` 到 workDir 内任意路径一律放行**。
- `ws.go:324`:`if toolName == "Bash" ... return true, true`,注释自陈「shell 无法做路径限制」。
- `bwrap.ts:118`:`"--bind", profile.cwd, "/work"` —— cwd 是**可写**的。

⇒ 模型有两条无需任何技巧的伪造路径:`Write file_path=analysis/bundle.json`,或
`echo '{"p_exact":0.001}' > analysis/bundle.json`。

| 方案 | 自称 | 实际 |
|---|---|---|
| R | 「emit 校验 + report 插值 ⇒ 数字物理上不经模型手」 | **约定**。report 读的是一个模型可整份重写的文件 |
| K | 「`provenance=computed` 是机械事实」 | **约定**。产生者与伪造者同 jail、同 uid、同 mount namespace,零特权差 |
| S | `seal = sha256(payload)` + `verify_seal` | **安全剧场**。无密钥、jail 内可复算 |
| L | recompute + `ProseNumberLeak` | **机制**(唯一)。但 L 自我降级为「只观测不注入」 |

**而本仓已有现成正解,四份文档零引用。** 2026-08 为「证据账本 E 编号不可伪造」做的四件套:

1. `agent/src/sandbox/confine.ts:66-95`:`inReserved()` 用 **canonical 路径**判定,
   `confinePath(..., forWrite=true)` 对 `evidence/` 抛错。注释里连 `ln -s evidence x` 都堵了。
2. `agent/src/sandbox/bwrap.ts:120-123`:在**可写 bind 之后**再叠一层 `--ro-bind <cwd>/evidence`,
   并**刻意用非 `-try` 版**(注释:`-try` 源不存在时静默跳过 = 又一条永远绿的规则)。
3. 账本由 executor 进程在 tool 返回的咽喉点写入,**jail 外**。
4. 闸的判据是引擎对账本的**计数**(`deliveryGate.test.ts:1-8`:零 LLM、零内容判断)。

**pip-CLI 形态与这套互斥**:statkit 跑在 jail 内,一旦把 `analysis/` 设成保留区,它自己也写不进去。
四家全部选 pip,理由都是「避开 `permissionAllowed` 的接线风险」。

**而那个风险两个月前已被机械化掉了**:`agent/src/tools/permissionParity.test.ts:5-9` 实读为
**咬了五次**(ReadDocument / ExportDocument / BuildDeck / EvidenceGet / SubmitAnswer+DeclareInsufficient),
且该文件就是为此建的守卫,挂在 `.githooks/pre-push`。
⇒ **四家共同规避的风险已有防线,他们付的架构代价(托管不可能)远大于被规避的风险。**

### 4.3 交付物层还有一条更便宜的旁路

`agent/src/turn/artifacts.ts` 的产物检测是「turn 开头 snapshot `./out/`、结尾 diff」,注释明写
**「工具无关 —— 覆盖 Write/Edit/ExportDocument/Bash/Python 全部(检测的是文件,不是工具名)」**。
镜像里有 `python3-docx`(Dockerfile:20)和 pandoc 3.10.1。
⇒ 四家的排版闸(R 的 render 六项自检、K 的「模板裸数字即注册失败」、S 的 `StrictUndefined`、
L 的 `ProseNumberLeak`)**全部可被一行 `python3 -c "import docx; ..."` 旁路**,产物卡照发。

### 4.4 「机制 vs 约定」逐条清单

| 方案 | 自称的规矩 | 判定 | 谁来保证 |
|---|---|---|---|
| R/K | 「skill 规定传 `timeout_ms: 300000`」+ 240s 软预算 + 退出码 3 partial | ❌ **约定** | `registry.ts:369` 是 `Math.min(Number(input.timeout_ms) \|\| 120_000, 300_000)` —— **不传就是 120s**。模型忘传 ⇒ 软预算永不触发、checkpoint 永不落盘,`proc.kill()` 直接砍。失败方式是**静默截断被当成完整结果** |
| 四家 | 「每 verb 一次 Bash 调用」 | ❌ **约定** | 模型完全可以 `a && b && c` 串一行,全链共用一个 120s |
| R | `reviewed_by` fail-closed | ⚠️ **机制但会被绕过** | 本仓已有 `SKIP_DESIGN_GUARD=1` 文化;`.githooks/pre-push` 头部逐字写着「加一个要跑 30s 的闸 = 亲手养出绕过习惯」,而 R 的 `doctor --strict` 正是那种闸 |
| R | skill 指示模型把 `blocked[].zh` 原样念给用户 | ❌ **约定** | 无 |
| R | `test_no_method_names_in_core.py`(引擎里出现方法 id 即失败) | ✅ **机制** | 构建期 + pre-push。四家里质量最高的自我保护之一 |
| R | 缺库的卡从候选集物理消失 | ✅ **机制** | `dispatch.py` 加载期置 `enabled:false`;正是 `statsEngines.ts:41-44` 注释预留的消费方 |
| S | `_core-only` AST 检查 | ✅ **机制** | 构建期;唯一封死格式化复制粘贴退化的 |
| L | `DesignIncomplete` | ✅ **机制** | 在函数签名层,绕不过 |
| L | jail 外 recompute | ✅ **机制** | 但 L 自己降级成只观测 |
| S | 三道闸(frontmatter 生成 DECLARED_ENGINES / 声明↔实现双向断言 / 菜单预算) | ❌ **恒绿** | 校验的是 wheel 内自带的副本,自己跟自己对拍;且构建期只能证明构建那一刻一致,证明不了运行时挂载的 md 与镜像里的 wheel 同代 |

### 4.5 「出生即错」四家全部查不到

| 机制 | 能抓 | 抓不到 |
|---|---|---|
| R 的 decision_table 快照 diff | 一次编辑翻转 N 种情形的默认方法(**四家唯一**) | **一张从第一天就写错的卡**——它产生一张稳定的表,此后永远 diff 干净 |
| K 的 L2 决策 golden / S 的分流 case / L 的 spot golden | 恰好覆盖到的那格 | 期望值与卡片同一个作者、同一个误解 |
| 全部 L1 数值 golden(vs R 包) | **算错** | **选错**——R 包只验证「Welch 的 t 值对不对」,不验证「这里该不该用 Welch」 |

⇒ 四家合起来对「选方法这一步」**没有任何独立第二意见**。而这恰好是产品唯一的差异化格、
唯一有公开证据说 38.4% 会错的那一步、且简报明说 LLM 正确率证据互相打架的那一步。
唯一的解是**外部预言机对拍**(同一份数据喂 SPSS 向导 / JASP / R 的 `rstatix` 推荐链,
比对「它选了什么」而不只是「数值对不对」)。四家一个都没提 → 已列为 D8。

### 4.6 资源墙:两堵没人提的

| 墙 | 实读 | 四家怎么算的 |
|---|---|---|
| **内存 1.5G(已被吃满)** | `docker-compose.prod.yml:425` 注释逐字:「单会话峰值 ~765MiB, 1.5G 给并发留头」;`admission.ts:11` 注释:「阈值按容器内存标定:1.5G ≈ 2」 ⇒ **2 × 765 ≈ 1530 MiB ≈ 1.5G,现有负载已用光** | 四家把整个 1.5G 当成统计可用(R/K 定 cells ≤ 2e6,L 定 4e6)。一份 50MB CSV 带 object 列,`read_csv` 峰值常在 250–500MB ⇒ `2 × (765+350) = 2230 > 1500` ⇒ **cgroup OOM**,而 OOM killer 可能挑中持着 LLM 流的 bun 本体 = **容器重启 = 全部在途会话同亡**。K 是唯一提到连坐的 |
| **pids 512(线程也计数)** | `docker-compose.prod.yml:427`;compose:365-370 另有一段:「prod 有 `pids: 512` 上限 ⇒ 约 6 个重 Bash 会话就打满,之后该容器所有 Bash 全失败,**只能靠重启复位**」 | cgroup v2 的 `pids.max` 计 task,**线程也算**;OpenBLAS 默认按 nproc 起线程池。**K 是唯一钉了 `OMP_NUM_THREADS=1` 的**(且找对了地方:`bashEnv()` 白名单外部设不进来,只能在 `__main__.py` 里 import numpy 之前钉),但 K 给的理由是 CPU 争抢,**真正的理由是 pids 天花板** |
| 会话磁盘配额(没人提) | `workspace.ts:23-24`:`SESSION_DISK_MAX_BYTES=1024MB`、`SESSION_FILE_MAX_COUNT=2000`,且 `assertSessionQuota` 每次写入跑**全目录递归** | R 的「按卡 checkpoint 进 `results/`」在批量场景(6 sheet × 5 处理 × N 卡)会造出几百个小文件,同时逼近文件数帽并让每次写入线性变贵。`evidence/ledger.ts` 已为同一理由做过设计让步,R 重复了那个被明令否决的形态 |
| 冷重播折叠(没人提) | `shadowTurn.ts:42-56`:30 分钟闲置或容器重启后,tool_use/tool_result 被折成一行摘要 | R/K 的真源在 workDir JSON(好),但需模型**主动重读**,纯约定。**L 最差**:`Design(...)` 只活在 Bash 命令串里,全案无持久状态,冷重播后 `discipline="agronomy"` 可静默变回 `"general"`,学科默认值/Duncan/caveat 全部消失,而 `bundle.jsonl` 只会**记录**不一致、不会**阻止** |

### 4.7 一条被高估的墙

`MENU_CAP_CHARS` 是 `Number(process.env.EXECUTOR_SKILL_MENU_CAP || 2500)`(`loader.ts:60`),**env 可调**;
`TOTAL_CAP=40000` / `PER_SKILL_CAP=8000` 才是硬编码。S 把它当硬台阶并为此预留 3–4 天二级菜单预算,
**这笔钱一半是白付的**(另一半——「触帽只 warn 不 fail、被丢的族静默消失」——S 的判断正确)。

---

## 五 · 推荐方案与理由

### 选 R。三条理由,按重要性排序。

**理由一 · 只有 R 让产品仅剩的三格空白在 P0 就能吃下。**
调研已定死:卖点不是「能算」(SPSSAU 免费版限前 100 行已覆盖多数学科真实样本量),
「表直出 Word」已被免费的 JASP/jamovi 占,**仍空着的是中文三线表口径 / 目标体系切换 / Methods 段**。
R 的模板按「族 × 语言」组织(38 个文件),体系降级为纯格式化指令表(`systems/*.yaml`),
**模板数与体系数无关** ⇒ P0 上 4 套体系不增加验收工作量。
K 在同一处是 O(方法 × 体系):P0 就 76 格,P1 约 500 格,K 自己列为死法之一。
S 同样是乘法。L 的 `O(styles)` 渲染器解决了体系,但把学科塞进了模型要主动 `Read` 的厚 skill。
**这不是风格差异,是差异化卖点的成本结构差异。**

**理由二 · 只有 R 让「统计学家真的会评审」这件事有可能发生。**
`statkit rules explain` 穷举声明过的离散事实空间(384 格折叠去重后 ~45 行),产出
`tests/derived/decision_table.md`;D-01~D-15 在 R 里不是实现,而是这张表里 15 个具名断言。
评审对象是 **70 行 YAML + 一张机器生成的表**,不是 350 行 `if/elif`。
更关键的是 **diff 探针**:「改了一个 tolerance 却没意识到它翻转了 6 种情形的默认方法」——
这类语义漂移在 K 需要 L2 golden 恰好覆盖,在 S/L 完全隐形,在 R 是 code review 里的一段红绿 diff。

**理由三 · 三条生长轴正交,且学科这条最不对称。**
加一个学科 = 加一个 `policies/discipline/*.yaml` = **半天**,方法卡一张不动。
相比「按学科写分支」,这是 R 最不对称的一处优势。而 `disclose` 字段(跟随农学 Duncan 惯例、
**同时把族系错误率的统计代价强制渲进 Methods 段**)是四份文档里最锋利的产品点——
它把「全行业只有活人在做的方法学守门」做成了**交付物里的一个字段**。

### 明确的取舍:选 R 我们放弃什么

| 放弃 | 代价 | 为什么接受 |
|---|---|---|
| K 的族级并行开发与工程细腻度 | 多人并行时插件目录更好切分 | 团队规模不支持真并行;而 K 的模板乘法压在卖点上,是可避免的设计失误 |
| L 的最浅锁定与「先做函数库」期权 | 六个月后若要收权,R 的 DSL 沉没成本更高 | L 46 人日 ≈ 两倍工期,且用最长工期在最不确定的一环(选方法)留了最少防线 |
| S 的作者面单一目录 | 一个 PR 一个目录的心智模型确实最舒服 | 构建上下文塌方使其核心主张在 `docker-compose up --build` 面前不成立 |
| R 自身:回归/混合效应/Cox 塞不进 `method@1` | P1 中段要引第二类卡 schema | 逃生口 2–3 天,已有卡零改动;但**必须在 P0 就体检**(见 D7) |

### 从落选方案搬走四件东西(硬性要求,不是「可以考虑」)

| 搬什么 | 从谁 | 落在哪 |
|---|---|---|
| **policy 只能改 `default`、不能改 `allowed[]`** | K | 写进 `registry/schema/policy@1.json` 做硬约束。学科惯例可以决定默认,不能把统计上站得住的选项抹掉 |
| **`DesignIncomplete`** | L | 把 `consult` 的必答字段做成 `run`/`emit` 的**准入条件**(缺字段 → 非零退出 + 异常正文即该问的题),而不是 skill 协议 |
| **jail 外 recompute + 交付闸** | L | 见 D1/D2 |
| **工具层 stdout 回吐** | S | `assume` 的 stdout 必须自带候选表 + 每条 reason + 下一步该调什么。机器注入,不依赖模型读 skill,不占 skill 预算 |

---

## 六 · 推荐方案的必装机械防线

> 每条给:实现位置 + 判定(机制/约定)+ **验收判据**。没有验收判据的防线等于没有防线。

### 6.1 P0 阻塞项(D1–D7,不加就别选 R)

#### D1 · 把 `analysis/` 升为引擎保留区,bundle 的写入者搬出 jail 【机制】+2.5 天

- `agent/src/sandbox/confine.ts` 的 `inReserved()` 从 `{EVIDENCE_DIR}` 扩到 `{EVIDENCE_DIR, "analysis"}`。
- `agent/src/sandbox/bwrap.ts` 在 `--bind profile.cwd /work` **之后**加第二条
  `--ro-bind <cwd>/analysis /work/analysis`(**非 `-try`**,照 EVIDENCE_DIR 的写法与理由:
  `-try` 源缺失时静默跳过 = 又一条永远绿的规则);`ensureReservedDir` 同步建目录。
- 新增 executor 内建工具 **`StatEmit`**(jail 外、进程内):`statkit run` 只把 `MethodResult`
  打到 stdout,由 `StatEmit` 校验 `card.reports.required` 后写 bundle。
- `backend/internal/agentbridge/ws.go` 的 `permissionAllowed` 加显式 case
  (input 无路径、写入被工具 confine 在 `analysis/` 内,放行面与 `EvidenceGet` 同级)。
- **验收**:① jail 内 `echo x > analysis/bundle.json` 必须 EROFS;
  ② `Write file_path=analysis/bundle.json` 必须被 `confinePath` 拒绝并出现在 `docker logs`;
  ③ `scripts/check-evidence-mirror.sh` 对 `StatEmit` 亮绿(证明 ws.go 已登记)。

#### D2 · 交付闸接在 `artifacts.ts`(jail 外)【机制】+1.5 天

`out/` 里本轮新增的 `.docx/.xlsx/.md`,抽出其中的数字集合;若 ⊄ bundle 的数字集合 →
**不发 artifact 帧**,回一条带精确差额的可执行回执。判据形态照 `SubmitAnswer`:
**零 LLM、零内容判断,只做集合比较**(`deliveryGate.test.ts` 明写这是闸的合法条件)。

- **验收**:`python3 -c "import docx; d=docx.Document(); d.add_paragraph('P=0.003'); d.save('out/x.docx')"`
  必须拿不到产物卡。这一条把「render 是唯一路径」从约定变成机制,同时堵死 §4.3 的旁路。

#### D3 · 300s 兜底不能靠模型传参 【机制】+0.25 天

`registry.ts:369` 的 `|| 120_000` 对 `AllowBash` 的 stat_lab 改为按 feature 的 `300_000` 默认
(或 statkit 自己在 SIGTERM 上落 checkpoint)。
- **验收**:不传 `timeout_ms` 跑一个 250s 的 verb,必须拿到退出码 3 的 partial + 已算部分落盘,
  而不是空结果。

#### D4 · `ws.ts:477` 的 `net` 改按 feature 分流,stat_lab = `"none"` 【机制】+0.5 天

- **验收**:jail 内 `curl -m3 https://example.com` 必须失败。
- **附带价值**:「用户未发表原始数据全程不出网」是合规叙事里最便宜的一句真话。

#### D5 · 给多重比较记账一个位置(R 现在没有)【机制】+1 天

裁决③点名的三夺权之一在 R 的结构里无处安放。做法:`project.json` 加 `mc_ledger`
(或由 D1 的 `StatEmit` 一并维护);posthoc / 多组卡的 `reports.required` 增加
`mc.family_key` 与 `mc.alpha_spent`;`render` 在 Methods 段**强制**输出家族定义与已用 α 预算。
- **验收**:同一会话连跑 3 个两组比较,第 3 个的 bundle 里 `mc.alpha_spent` 必须非零,
  Methods 段必须出现家族声明。缺这条,R 的三夺权只有两项。

#### D6 · `reviewed_by` 从 fail-closed 改成非阻塞标记 【机制】+0.25 天

未签的卡**进候选集,但 `default` 永不指向它**;`reviewed_by=null` 作为 **bundle 必填字段**
(不是模板里的一句话——放模板里换体系就丢),`render` 在 Methods 段与产物面板强制打
「本方法默认值未经方法学复核」。
- **理由**:保住闸门语义、把不可调度的人从发布关键路径挪开、且**不给绕过开关任何存在理由**
  (否则本仓的 `SKIP_*` 文化会在三周内把整条闸掏空)。

#### D7 · P0 的 20 张卡里必须包含一张 logistic 回归卡(不是 P1)【体检】+1.5 天

R 押 4 天建声明式内核,而它明确表达不了的恰恰是钱在的那一半(回归是医学与经济学的入场券)。
P0 全用两组/多组/列联表验证抽象 = 用简单一半证明抽象、把困难一半推到沉没成本之后。
- **验收判据(这是 R 的 4 天赌注唯一的体检口)**:这张卡能否在**不引入任何 `gate: py:` 逃生谓词**
  的前提下用 `method@1` 表达。
- **不能怎么办**:当场把注册表降级为「决策表 + 薄执行器」,省下 1500 行求值器,
  保留 YAML 与 `decision_table`(这两样才是 R 真正值钱的部分,且不依赖求值器)。

### 6.2 P0 内强烈建议(D8–D12)

| # | 内容 | 位置 | 判定 |
|---|---|---|---|
| **D8** | **出生即错的外部预言机**:`oracle/` 一族,20 份公开数据集 + SPSS 向导/JASP/`rstatix` 推荐链选出的方法,断言 statkit 的 `default` 与之一致或落进 `blocked[]` 且理由可读。**不阻断**,但必须在 `doctor` 输出与 `decision_table` 旁列出 | `tests/oracle/` | 机制(唯一能查「出生即错」的) |
| **D9** | **pip 层写对**:先 `apt-get install -y --no-install-recommends python3-pip`,装完 purge;保留并扩展 `numpy.__file__` 断言到 `scipy`/`pandas`;`DECLARED_ENGINES` 加 `statkit` / `scikit_posthocs` / `seaborn` **三条**(seaborn 是 scikit-posthocs 的包级依赖,不加就是反向的「镜像有而声明没有」)。**第一周就跑通**,pin 选错当场换 | `agent/Dockerfile` + `statsEngines.ts` | 机制(构建期断言) |
| **D10** | **内存与 pids**:`OMP_NUM_THREADS`/`OPENBLAS_NUM_THREADS=1` 在 import numpy **之前**在进程内钉(`bashEnv()` 白名单外部设不进来);每张卡声明 `mem` 量级,`solve` 阶段就把会超限的卡剔出候选并写明原因;**cells 上限按 `1.5G − 2×765MiB` 反算,不要拍 2e6** | `statkit/__main__.py` + 卡片 schema | 机制 |
| **D11** | **工具层回吐**(抄 S):`assume` 的 stdout 自带候选表 + 每条 reason + 下一步该调什么 | `statkit/cli.py` | 机制(机器注入) |
| **D12** | **冷重播 fixture**:skill 第一条指令是「任何一轮开始先读 `project.json`」,并用 `shadowTurn` 冷重播 fixture 端到端验收(模拟 30 分钟闲置后继续分析,断言学科/doctrine/system 三项未漂移) | `agent/src/turn/*.test.ts` | 约定 + 一条回归测试 |

### 6.3 R 自带的、必须保留的机制(别在压工期时砍掉)

| 机制 | 位置 | 为什么不能砍 |
|---|---|---|
| `test_no_method_names_in_core.py` | 构建期 + pre-push | 「卡片绑定行为」这个论证的**唯一硬证据**。没有它,注册表退化成「代码旁边的一份文档」 |
| `golden:` 非空强制 + `doctor` 拒绝启用 | 加载期 | 「一条永远绿的规则等于没有规则」 |
| 缺库的卡自动从候选集消失 | `dispatch.py` 加载期 | 正是 `statsEngines.ts:41-44` 注释预留的消费方;不做就是让模型撞 ImportError 后编数 |
| `decision_table.md` 快照 + 具名行断言 | `explain` + pre-push diff | R 排第一的两条理由之一 |
| 生成式能力块 + 游离名称 lint | `render-skill` / `lint-skills` | 直冲 `Dockerfile:49-54` 的事故链 |
| CLD 断言用「同字母组的集合划分等价」而非字符串相等 | golden | 同一份 p 矩阵不同实现的字母可以都对但不同;字符串断言会制造假红 |

---

## 七 · 落地路线

### 7.1 P0 范围(可开工粒度)

**目录结构**(pip wheel,源码放 `agent/statkit/` —— 必须在 agent 的 build context `./agent` 内):

```
agent/statkit/
├── pyproject.toml
├── statkit/
│   ├── core/            facts.py 180 · loader.py 140 · solve.py 260 · gate.py 220
│   │                    rank.py 150 · dispatch.py 120 · bundle.py 230 · render.py 200 · explain.py 110
│   ├── adapters/        two_group.py · three_plus.py · categorical.py · descriptive.py · regression.py
│   ├── stats/           welch_anova.py 30 · cld.py 40 · effsize.py 130(非中心 t CI)
│   ├── registry/
│   │   ├── schema/      method@1.json · check@1.json · policy@1.json · system@1.json
│   │   ├── methods/     ← 21 张卡(见下)
│   │   ├── checks/      shapiro_wilk · levene · expected_min · normality_of_diff
│   │   ├── effects/     hedges_g · cohens_d · eta_sq · cramers_v · rank_biserial
│   │   ├── policies/    base + doctrine/{pretest-classic,welch-always} + discipline/{医,农,心,经,通用}
│   │   ├── systems/     cn-core · apa7 · ama · sampl        ← 4 套(体系正交,不增验收量)
│   │   └── templates/   methods/*.{zh,en}.j2 · results/*.{zh,en}.j2 · tables/*.{zh,en}.j2(~38 个)
│   └── cli.py           7 verb:profile / consult / assume / run / emit / report / doctor
└── tests/
    ├── golden/ref/*.R + expected/*.json      ← 开发机跑 R,产物进仓库;容器不装 R
    ├── oracle/                                ← D8:外部预言机对拍
    ├── derived/decision_table.md              ← explain 生成的快照(评审对象 + diff 探针)
    └── test_no_method_names_in_core.py
```

**第一批方法清单(21 张卡)**:

| 族 | 卡 |
|---|---|
| 族 0 数据体检 | 不产卡(是 `profile` 的能力):类型推断 / 缺失模式 / 离群 / 单位 / 重复行 / 组不平衡,**阻断级 issue 未清空时 run 拒跑** |
| 族 1 描述 | `table1` |
| 族 2 组间比较(13) | `student_t` `welch_t` `mann_whitney` `paired_t` `wilcoxon` `anova` `welch_anova` `kruskal` `tukey` `duncan` `games_howell` `dunn` `dunnett` |
| 族 3 列联(4) | `chi2` `chi2_yates` `fisher` `cochran_armitage` |
| 族 P0.5(2) | `cronbach_alpha` `correlation` |
| **族 4 回归(1)· D7 新增** | **`logistic`** ← 4 天内核赌注的唯一体检口 |

配套:checks 4 张 · effects 5 张 · policies(1 base + 2 doctrine + 5 discipline)· systems 4 套 · templates ~38 个。

**工期**:

| 阶段 | 天 | 说明 |
|---|---|---|
| T0 三份 hook 工厂化收敛 | 2–3 | claw 867 / boltslides 857 / sci_draw 736 三份逐行克隆;第四份卡片前必须收敛 |
| T1 上传通道接线 | 1 | `.csv/.xlsx` 已在白名单;`.sav/.dta` 硬拒 → SPSS 走截图路线 |
| T2a `core/` 通用执行器 | 4 | ~1500 行 |
| T2b 21 张卡 + checks/effects/policies/systems | 2.5 | ~1900 行 YAML |
| T2c adapters + 自写统计 | 2 | Welch-ANOVA / CLD 双水平 / 非中心 t CI |
| T2d 模板 38 个 + docx 三线表排版 | 2.5 | 与体系正交,4 套体系不增量 |
| T3 golden 链路 | 2 | 开发机 R:car / emmeans / agricolae / multcompView |
| T4 backend thin wrapper | 2.5 | spec/handler/artifact + prompts + bootstrap + routes + 迁移 2 条 |
| T5 前端能力卡片 | 2 | 12 个前端接触点 |
| T6 skill × 3 + system prompt + lint/render-skill | 1.5 | skill 里**一条统计学知识都不写** |
| T7 eval + 上线闸 + 缓冲 | 3–4 | V0 doctor / V1–V6 |
| **小计(R 原案)** | **22–28** | |
| **+ D1 保留区 + StatEmit + ws.go 放行** | **+2.5** | |
| **+ D2 交付闸** | **+1.5** | |
| **+ D5 多重比较记账** | **+1** | |
| **+ D7 logistic 卡** | **+1.5** | |
| **+ D3/D4/D6** | **+1** | |
| **P0 合计** | **30–36 工作日** | 单人 6–7 周;两人并行(内核+卡片 / 交付+接线)约 4 周 |

**验收(全绿才上线)**:

| 闸 | 判据 | 类型 |
|---|---|---|
| **V0** `statkit doctor --strict` | ① 全部启用卡 schema 合法 ② `golden` 非空且断言通过 ③ 注册表引用的 backend ⊆ `DECLARED_ENGINES` ④ `core/` 无方法名残留 ⑤ derived 快照与仓库一致 | 构建期硬失败 |
| **V1** 数值 | 21 张卡对 R 参考值:统计量 1e-12 / p 1e-10(deterministic 卡) | 自动 |
| **V2** 决策 | `decision_table` 的 15 个具名行断言 + 15 个 fixture | 自动 |
| **V3** 选择正确性 | D8 外部预言机:20 份公开数据集,`default` 与 SPSS/JASP/rstatix 一致或有可读的 blocked 理由 | 自动,不阻断但必须列出 |
| **V4** 格式 | 格式化函数单测全覆盖 + 38 个模板抽样;**不是 152 格人工对照** | 自动 + 抽样 |
| **V5** 数字锁 | D1 三条 + D2 一条(见 §6.1) | 手工一次性 |
| **V6** 话术 | 24 例:守门解释 / 学科 caveat 转述 / 红线(改数据、编 p、反向剔除)拒绝 | 人工 |
| **V7** SPSS 读数 | 20 份真实 SPSS 截图反算,漏网率 = 0 | 人工 |

### 7.2 P1(+3–4 周)

- **卡片 21 → 38**:生存(lifelines 已在镜像,3 张卡)、多因素 logistic / OLS(**引入第二类卡
  schema `formula_method@1`**,2–3 天一次性)、重复测量 + 球形度(新 check 卡 Mauchly + GG 校正)、
  相关与信度补全。
- **体系补齐**:econ 需 `systems/_shapes/regression_multi.yaml` 描述表形(括号放 SE、
  星号替代 p 列、多模型并列)——这是「1 天/套」唯一不成立的一套,+1 天。
- **学科 5 个集群齐**:每个一个 policy YAML,半天。
- **`.sav/.dta` 通道**:上传白名单扩容 + `pyreadstat` 评估;或维持截图反算路线。
- **numcheck 从 observe 升到拦截**;`figures_manifest` 堵图片旁路。

### 7.3 P2 的形态

- **流水线层**:中介/调节/DID/敏感性分析是方法之间的 DAG,一张卡描述不了 → 外挂
  `pipelines/*.yaml`(节点引用卡片 id),**方法卡资产 100% 保留**。
  这正好是 agentrun Run 引擎能吃下的形态(每个 verb 已幂等、以 spec 内容 hash 命名 bundle),
  但**本轮不上 Run 引擎**(裁决已定)。
- **复现包导出**:数据指纹 + params + bundle + 可离线跑的 `analysis.py` ——
  把「合规交付物」这个卖点做到底,同时绕开 30 天 workdir GC。
- **院系/课题组自带 policy**:把「我们实验室就用 Duncan」变成用户可配的一份 YAML。
- **方法学评审外包**:评审对象已固化为 YAML + 决策表,可外部化给统计学老师。

---

## 八 · 四方案共同的盲区

> 这六条不属于任何一份方案的扣分项,而是**四家一起漏掉的**。选任何方案都要处理。

1. **托管困境 + 仓库已有的正解未被引用。**
   四家全部选 pip 以避开 `bwrap.ts`/`permissionAllowed` 的改动,而这个选择本身使数字锁不可能
   成立;`EVIDENCE_DIR` 保留区(confine.ts + bwrap.ts 双层 + executor 咽喉点 + 零 LLM 计数闸)
   是现成的、已投产的、四件套齐全的答案,四份文档零引用。且他们规避的接线风险已被
   `permissionParity.test.ts` + `check-evidence-mirror.sh` + `.githooks/pre-push` 机械化。
   **这是一个已经过时两个月的恐惧,代价是产品的核心承诺。**

2. **「出生即错」无人可查。** 全部机制只检测**变更**,不检测**原始错误**;全部 golden 只验证
   数值,不验证选择。没有任何外部预言机对拍。→ D8。

3. **`net: "open"` + 未发表数据。** 三家以为已关网。一个零出网需求的 feature 挂着 NAT 公网通道,
   输入是用户未发表的研究数据、临床数据。四家都没做威胁建模,也都没提数据删除路径 / PHI 闸 ——
   而「合规交付物」正是产品卖点。`EXECUTOR_WORKDIR_TTL_DAYS=30`(`sessions.ts:455`,两个 compose
   均未设)意味着原始数据在共享容器里躺 30 天。→ D4 + 第九章 Q5/Q8。

4. **产物声明与生产者无关**(`artifacts.ts` 的文件系统 diff),所有排版闸可被一行
   `python3 -c "import docx"` 旁路;镜像里 `python3-docx` 与 pandoc 3.10.1 都在。→ D2。

5. **1.5G 被当成空的**(实际已被 `2 × 765MiB` 吃满),`pids: 512` 与线程计数无人提。→ D10。

6. **`scikit-posthocs` 的 pin 无人验证**(四家给了两个版本 → 没有一家真装过),
   而它是 CLD 字母标记(农学差异化)的唯一实现,会连带 seaborn、可能触发 `Dockerfile:77` 的
   numpy 覆盖断言,且 `python3-pip` 已被 purge。→ D9,**第一周必须跑通**。

**另外两条方法学侧的共同盲区**:

7. **问诊的用户往返代价没人算过。** `AskUserQuestion` 会强制结束本轮(`turnLoop.ts:487`),
   且 schema 是 `maxItems: 4`。「≤2 轮 ≤6 题」在产品上意味着**计算开始前 1–2 次用户往返**。
   这直接决定首次体验:用户上传数据后要点两次选项才看到第一个数字。

8. **golden 只组织了「每方法 2–3 个正常用例」。** 四家都没有把「零方差列 / 全 tie /
   单组 n=3 / 极端 t / 整列缺失」作为**族级必备用例组**。
   (具体证据:R 与 L 都手写了非中心 t 求根,R 用 `brentq(..., -50, 50)` **硬编码区间**,
   L 用自适应扩张;R 的写法在大 |t| 时会抛 `f(a) and f(b) must have different signs`。)

---

## 九 · 留给决策者的选型问题

> 九个二选一。每个给选项、影响、我的建议。技术细节已在前八章消化,这里只留该拍板的。

**Q1 · 数字锁是安全属性,还是尽力而为?**
选 A(安全属性)= 做 D1/D2,+4 天,对外可以说「报告里的数字不经模型手」;
选 B(尽力而为)= 不做,对外只能说「有确定性渲染路径 + 事后可验证」。
**建议 A** —— 这是产品唯一不可替代的信任叙事,而 B 会让四份方案共同的那句宣传语变成假话。

**Q2 · 有没有能签字的统计学评审人?**
有 → 按 D6 做非阻塞标记(未签的卡不做 default,报告强制打标);
没有,且不打算找 → 本项目应缩到「Table 1 + 数据体检 + 交付层」,不做推断性比较。
**建议:先确认这个人存在再开工**,四份方案全部把他写进关键路径。

**Q3 · P0 之后是否持续投入到 40+ 方法 / 4 套体系 / 5 个学科?**
是 → 选 R(平衡点在第 24–31 个方法);否(停在 ~20 个方法、2 套体系)→ R 的 4 天内核纯亏,
应改做「决策表 + 薄执行器」的基线形态。
**建议:这是本次选型真正的前提,必须先答。**

**Q4 · 30–36 工作日能否接受?**
能 → 按 §7.1 走;只能给 25 天以内 → 砍掉的必然是防线,砍完 R 就没有它宣称的正确性论证,
此时不如直接做基线硬编码。
**建议:宁可缩方法数(21 → 15)也不要砍防线**,方法可以后补,防线补不回来。

**Q5 · stat_lab 是否断网?**
断(D4,+0.5 天)→ 「用户未发表数据全程不出网」可写进合规叙事;
不断 → 现状是一条完整的公网 NAT 通道,输入是临床/未发表数据。
**建议:断。** 这是全部防线里最便宜的一条。

**Q6 · P0 是否必须包含一张回归卡(logistic)?**
是(D7,+1.5 天)→ 4 天声明式内核的赌注在 P0 就有体检口,不能表达就当场降级止损;
否 → 用简单一半证明抽象,把困难一半推到沉没成本之后。
**建议:是。** 这是本方案唯一的早期止损开关。

**Q7 · 首次分析前允许几次用户往返?**
允许 1–2 次(问诊 4–6 题,`AskUserQuestion` 一轮一卡、每卡 ≤4 题)→ 拿到 38.4% 那一格的差异化;
要求 0 次(全从数据推断)→ 退回竞品形态,守门失效。
**建议:允许 1 次(4 题一卡),第 2 张卡只在必要时追加。**

**Q8 · 数据留存 30 天(返修窗口上限)接受吗?**
接受 → UI 必须明说「30 天后需重新上传」;不接受 → P2 的复现包导出提前到 P1(+3 天)。
**建议:P0 先明说,P1 补复现包。**

**Q9 · 要不要买 L 的期权(先做纯函数库,六个月后再决定编排收权)?**
买 → 46 人日、且选方法这一步全程在模型手里;不买 → 接受 R 的 DSL 锁定,
若 P1 判死则 1500 行求值器沉没(YAML 与决策表可保留)。
**建议:不买。** L 的战略论证成立但价格不对;R 的沉没风险已由 D7 在 P0 就体检。

---

## 附:本文档引用的仓库事实(2026-08-05 实读)

| 事实 | 位置 |
|---|---|
| Bash sandbox profile 不传 roBinds ⇒ skill 挂载目录在 jail 内不存在 | `agent/src/tools/registry.ts:361` |
| Bash 默认超时 120s(不是 300s) | `agent/src/tools/registry.ts:369` |
| `net: "open"` 硬编码,无 per-feature 分流 | `agent/src/server/ws.ts:477` |
| pip3 装完即 purge,镜像内无 pip | `agent/Dockerfile:74-76` |
| pip 装到 `/usr/local/.../dist-packages`,在 `--ro-bind /usr /usr` 覆盖内 | `agent/Dockerfile:70`;`agent/src/sandbox/bwrap.ts:93` |
| cwd 是唯一可写 bind;evidence 保留区在其后叠只读覆盖(刻意非 `-try`) | `agent/src/sandbox/bwrap.ts:118-123` |
| `confinePath(forWrite)` 用 canonical 路径拒写保留区 | `agent/src/sandbox/confine.ts:66-95` |
| `Write` 到 workDir 内任意路径一律放行;Bash 无条件放行 | `backend/internal/agentbridge/ws.go:324,389` |
| permissionAllowed 的接线漏洞已咬**五次**,并已由 parity 测试机械化 | `agent/src/tools/permissionParity.test.ts:5-9` |
| AskUserQuestion 触发后本轮工具数组被清空 | `agent/src/turn/turnLoop.ts:487-490` |
| `MENU_CAP_CHARS` 由 env 可调(2500 默认);触帽只 warn | `agent/src/skills/loader.ts:55-60` |
| agent 构建 context 是 `./agent`(判死 S 的目录布局) | `docker-compose.yml:359-361` |
| prod 资源:memory 1.5G / cpus 2.0 / pids 512;单会话峰值 ~765MiB | `docker-compose.prod.yml:425-427` |
| pids 512 ⇒ 约 6 个重 Bash 会话打满,只能重启复位 | `docker-compose.yml:365-370` |
| `DECLARED_ENGINES` 与「缺库的方法应当从候选表消失」的设计意图 | `agent/src/tools/statsEngines.ts:31-44` |
| 声明与镜像不符的完整事故链 | `agent/Dockerfile:49-54` |
