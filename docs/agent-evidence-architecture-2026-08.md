# 终稿:agent「配了工具和 skill 却不用、要编」的架构级诊断与合成方案

> 本稿综合 5 份诊断 + 3 份提案,并对其中承重的代码事实做了独立复核(复核结果见文末附录 A)。
> ⚠️ 口径声明:所有**生产比率**(11% / 42.8% / 98% vs 43% / 零工具率分档)来自线上 journal 审计报告;
> 我本机的 dev 库只有 137 轮(2026-06-27~07-26),统计上不可用,故我的独立复核**只做代码级取证**,不重算比率。

---

## 一、一句话根因

**证据的生命周期比对话短 —— 系统删掉了证据,却完整保留了模型宣称这些证据存在的那段话,然后要求它继续写;与此同时,「不取证直接写」在 API 层是合法动作、在提示词层被我们明码写成合法选项。**

最有解释力的单条证据(我已亲自复核):

`/Users/youngp/mypro/fuck_副本/scholar/agent/src/server/shadowTurn.ts:50`

```ts
const kept = blocks.filter((b) => b && b.type === "text"); // 仅 text;丢 tool_use/tool_result/thinking
if (kept.length === 0) continue;                            // 整条 tool_result 消息消失
```

会话闲置 30 分钟(`sessions.ts:347 IDLE_TTL_MS`)或容器重启 → 内存 meta 被清 → backend 从 journal 重灌 → 这一行把 **100% 的工具证据丢弃且零标记**,只留 assistant 的散文。于是会话被切成若干「证据纪元」。生产判别力**全部集中在这一个维度**:

| 状态 | DOI 接地率 |
|---|---|
| 本纪元内有过工具调用 | **98%**(claw/prism/smart_search 三者一致) |
| 失忆纪元(零工具) | **43%** |

与 feature 无关、与模型无关、与提示词无关。审计员能从 journal grep 出「被引作者从未出现在任何 tool_result 里」——**审计员看得见,模型看不见**。这条不对称就是烟枪。

它同时精确解释了「伪造检索」:模型不是在撒谎,它是在**复述自己上一段(被保留的)检索叙事**,而那次检索的证据(在 journal 里躺着)已被从它眼前拿走。它甚至用的是 skill 的措辞(「针对几个尚未充分挖掘的关键子方向进行了新一轮的精确检索」≈ skill §1「概念块」+ §5「每轮只动一个维度」)——**skill 塑造了输出的文风,没有塑造工具调用**。

### 伪根因清单(必须写进决策,防止后续重新捡起)

| 伪根因 | 证伪证据 |
|---|---|
| ❌ **提示词不够强** | 用户 467 直接打字「你应该使用查询论文的工具来找」,**该轮 tool_use 仍为 0**。用户指令比我们任何一段 system 文本更靠近生成点、更具体、更权威,它都无效 —— 这是**散文通道的饱和证明**。在同一通道上加第四段文字先验地不会改变结果 |
| ❌ **skill 没装上 / 被截断稀释** | 实测 smart_search 常驻后缀 3,991 字符、**零截断零丢弃**,完整 system prompt 仅 10,339 字符,TOTAL_CAP 余量 90%。挂载(`docker-compose.yml:399`)、loader、MCP 白名单全线正常 |
| ❌ **工具太多(76 个)选择退化** | 76 是**未过滤的上游数**。正向白名单后实发 22–34 个,落在公开实践的 20–50 安全带内。继续裁没有增益可拿 |
| ❌ **模型不行,该换贵的** | 实测**反向**:claw 上 deepseek-v4-**pro** 零工具率 55.3% > flash 38.2%。同为 flash 的 smart_search 11.7% vs claw 38.2%,差 3.3 倍 —— 差异来自 feature 编排,不是模型 |
| ❌ **上下文被压缩掉了** | 240h 内 `context compacted` = **0 次**;1M 主力模型触发线 702K,从未触及。`context-budget.ts` / `compact.ts` 在线上主力配置下是**死代码** |
| ❌ **MCP 工具描述写得不好** | 对照 Anthropic 官方口径,minicod 描述在「怎么正确调用」这条轴上**高于平均**(有 Bad/Good 例、有工具间划界)。真正缺的是「什么时候必须用我」(18 个工具里义务语 **0/18**),但那条改描述也解决不了 —— 见通道饱和 |

---

## 二、根因的三层分解(三份诊断的公约数)

### 层一 · 数据层:证据没有身份,也没有寿命

- 检索结果**唯一**活在 `meta.messages`(全栈最易失的介质);journal 有全量,模型拿不到。
- `smartsearch/spec.go` denylist 禁 `Write/Glob/Grep/Skill` → 模型**连自救式外置都物理做不到**。
- `frontend-user/src/shared/lib/minicod-papers.ts` 的 `parsePapersFromToolResult` 已在生产把 tool_result 解析成结构化题录 —— **只给了前端,没给模型**。这是最讽刺的一条。

### 层二 · 控制层:取证从来不是产出的必要条件

我已复核的三条硬事实:

1. **`tool_choice` 在 `agent/src/` 全目录命中 0 处**(我跑了 grep,`wc -l` = 0)。`turnLoop.ts:324` 的 `client.messages.stream({ model, max_tokens, system, messages, tools })` 不带该字段;`agent/src/openai/adapter.ts:280` 的 body 里也**只有 `tools`,没有 tool_choice 通路**。⇒ 每一轮「直接回答」都是合法且零成本的采样动作。
2. **提示词把不取证明码标价成合法路径**:
   - `backend/internal/smartsearch/spec.go:159-162`:「每一轮回答前必须先调用检索工具……**未调用任何检索工具时,回答必须以「以下内容基于模型知识,未经本平台检索验证」开头**」——前半句被后半句当场撤销。**为治零工具轮而新加的规则,自己把病灶合法化了。**
   - `backend/internal/prompts/claw.go:82`:「要么现在就用工具查证,要么显式标注「(未经检索验证)」— **二选一, 没有第三种**」。而审计里的伪造检索正是**第三种解**:既不检索也不标注,直接写「检索来源:Discovery」。规则枚举了两条路,**没有任何机制阻止第三条**。
3. **零阶段编排**:`turnLoop.ts:271` 的 `for (let round = 0; ; round++)` 是全部编排;`buildTools` 全轮只调一次;`activeTools` 一生只被赋值过 `[]` 两次(wind-down / ask 收尾)——**只会被清空,永远不会按任务阶段重算**。仓内唯一 plan-first 先例在 `peerreview/service.go`(Go 侧固定序),而交互三件套一件也没有。

### 层三 · 语义层:三类主张都由自由文本承载,而「验证」的物理条件不具备

我复核出的**新增硬证据**(未在任何一份诊断外被独立确认过):

```
容器内实测:numpy OK / pandas OK / matplotlib OK / scipy OK
            statsmodels MISSING / sklearn MISSING / lifelines MISSING
            R: no R
Dockerfile:  只装了 python3-matplotlib python3-numpy python3-pandas python3-rdkit
             （scipy 是 rdkit/matplotlib 带进来的**未声明传递依赖**,任何一次 rebuild 都可能消失)
而 skill 白纸黑字写着:
  agent-skills/claw-add/guides/methods-stats/SKILL.md:34 "claw 能用 python(statsmodels)真算"
  agent-skills/claw-add/guides/data-figures/SKILL.md:28  "scipy / statsmodels 做检验与建模"
```

**⇒ 当用户要一个能跑的混合效应模型 / Cox 回归时,模型只有两条路:撞 ImportError,或者把数字写出来。沙箱断网、装不了包,第二条是唯一"能交差"的路。** 这不是模型不老实,是我们把它逼到了唯一出口 —— 并且我们的 skill **正在生产环境骗它**。claw「用户上传 PDF 前就产出 31 条效应量荟萃数据集」的机械成因就在这里。

同层还有一条产品级病灶:**判据是两个系统各自的私产**。peerreview 侧有 31 份 `rv-*` + 13 份 `lens-*`,由 `scripts/lint-reviewer-skills.py` 构建期硬闸守护、经 `service_reviewers.go` **确定性注入**;claw 侧的全部方法学资产是**一份 2739 字节、按需加载、609 轮里只命中 29 次(4.4%)的 markdown**。裁判有被 lint 守护的判例集,教练有一张几乎不看的便条 —— **「claw 照做后被自家 peerreview 拒稿」是结构必然,不是水平差距。**

---

## 三、合成架构:三份提案是同一个机制的三次应用

### 3.1 统一抽象(这是本稿的核心裁决)

三份提案表面上是三个方案,实质是**同一个三段式**被应用到三类主张上:

```
① 引擎产值(模型不参与) → ② 模型只能写句柄(不能写值) → ③ 交付边界展开(展不开 = 没有产物)
```

| 主张类型 | 今天怎么产出 | 改后模型写 | 值的所有者 | 展不开时 |
|---|---|---|---|---|
| **引用** | 自由文本写 DOI/题录 | `[[E12]]` | `evidence/ledger.jsonl`(引擎从 tool_result 抽) | 交付物不生成 / 对话里当场红字 |
| **数值** | 自由文本写 `p=0.03` | `{{r:run_7.p}}` | `results/run_7.json`(引擎真跑,带 data_sha256) | 交付物不生成 |
| **方法** | 自由文本写「采用稳健分层加权」 | `"method":"mixed_lm"` | `research-kit/methods/*.json` **闭集** | `StudyUpdate` 入口 schema 拒收 → 拿不到「计划已确立」状态 |
| **判据** | 两套私产 | `criterion_id` | `research-kit/criteria/*.json`,**lint 双消费者硬闸** | 只被一侧消费即构建失败 |

**编排层的职责就是决定:什么时候必须先有值。**

⇒ 因此本方案**只有一个 cwd 目录规范、一个咽喉点、一个展开器、一个注入 seam**。三份提案各自都写了「建议合并这个文件」——我把它拍成硬约束:**谁先落地谁建,后来者只能消费,不许各写一份**(否则会长出四份形状不同的台账,`agent-plans` 的 sqlite + claims.json 已经在往那个方向走)。

### 3.2 总体结构图

```
                        控制面(backend,单一真源)
 ┌──────────────────────────────────────────────────────────────────────┐
 │ FeatureSpec  + AllowedMcpTools(已有,不变)                            │
 │              + ResearchPipeline{阶段→工具子集 / 轮预算 / tool_choice}  │
 │ research-kit/  methods/*.json   criteria/*.json                       │
 │   ↑ lint 硬闸:criteria 必须同时被 peerreview 与 claw/prism 消费       │
 │ 启动期不变量断言:∀phase McpByPhase[p] ⊆ AllowedMcpTools(只收窄不放宽) │
 └──────────┬─────────────────────────────────────┬─────────────────────┘
            │ CreateSession 下发                   │ 只读挂载
            ▼                                     ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │ executor(agent 容器)                                                 │
 │                                                                       │
 │  ① 咽喉点  runTools.runOne(:101 capToolResult **之前**)               │
 │       ledger.ingest() → 抽题录 → 分配 E<n> → 落盘 → 回写 evidence_id   │
 │       queries.jsonl  → 记 query / hits / **newIds(去重后新增)**       │
 │       (注:账本比上下文富。sanitize 20→16、cap 再砍,账本拿砍前的)     │
 │                                                                       │
 │  ② 引擎工具(builtin,值的唯一生产者,模型不可伪造其产物)              │
 │       EvidenceGet / DesignCheck / RunAnalysis / RubricCheck            │
 │                                                                       │
 │  ③ 编排状态机  turnLoop  phase ∈ chat | plan | evidence | synthesis    │
 │       · 按 phase 现算 activeTools + tool_choice                        │
 │       · 阶段闸由**引擎算数**(账本行数 / 轴命中 / blocking 问题)       │
 │         模型调 ResearchPhase 请求推进,**不能自我批准**                 │
 │       · 阶段预算到期 = **强制前进**,绝不回退、绝不原地转圈             │
 │       · per-turn 注入走已验证 seam(:193 append 到本轮 user 尾部,      │
 │         不进 system、不破上游隐式前缀缓存)                             │
 │                                                                       │
 │  ④ 展开器  render.expand() —— **唯一实现**,三个交付边界共用            │
 │       [[E12]]   {{r:run_7.…}}                                          │
 │       ExportDocument / Write·Edit 落 out/ / artifacts.ts 发帧前         │
 └──────────┬───────────────────────────────────────────────────────────┘
            │ 读写
 ┌──────────▼───────────────────────────────────────────────────────────┐
 │ 会话 cwd —— **唯一跨内存驱逐、跨容器重启存活的介质**(TTL 30 天)       │
 │   实测:894 个会话目录存活;某会话 13 个 PDF 跨 14 天 / 6 次驱逐完好    │
 │   evidence/{ledger.jsonl, queries.jsonl, INDEX.md, E<n>.md}            │
 │   study.json   results/run_*.json   scripts/run_*.R   out/             │
 │   _state.json(研究态,冷启自愈 —— 这让 P0 可以纯执行器上线)           │
 └──────────┬───────────────────────────────────────────────────────────┘
            │ research_state / evidence_appended 帧(走既有 sink.frame 管线)
 ┌──────────▼───────────────────────────────────────────────────────────┐
 │ backend journal(真源镜像,可查询可告警) + 前端**带外**渲染             │
 │   「本轮检索了几次 / 覆盖了几个方向」由引擎写,印在模型输出旁边         │
 │   ⇒ 取消模型对自身过程的叙述垄断                                       │
 └──────────────────────────────────────────────────────────────────────┘
```

### 3.3 核心契约(可直接实现)

**a) 账本记录**(`evidence/ledger.jsonl`,追加式,永不重写)

```jsonc
{ "id":"E17",
  "key":"doi:10.1093/jxb/erab076",   // 去重身份键:DOI > source:upstream_id > sha1(norm(title)+year)
  "origin":"retrieval|user_upload|library_ref|user_text",
  "first_seen":{"turn":5,"q":"q3","tool":"mcp__minicod__search_papers"},
  "source":"Graph",                  // 对外品牌名,绝不落上游真名(遮蔽层已产出)
  "doi":"…","title":"…","authors":[…],"year":2021,"venue":"…",
  "has_fulltext":false, "fulltext_path":null,
  "read_marks":[{"turn":9,"tool":"ReadDocument","chars":12000}] }
```

两个字段值得单独说:
- **`origin`** 直接回答用户高频那句「你帮我引用的文献都是我的文献库里面的吗,还是你自己检索的」,并**堵死用户回声洗白** —— 用户粘贴回来的 DOI 入账时 `origin="user_text"`,可用但不算检索接地。今天的 guard 把这两类混为一谈(实测 `10.1093/plphys/kiab120` 正是 `in_toolresult=0 / in_usertext=1`)。
- **`read_marks`** 把「检索到」与「读过原文」机械分开。agent 那句被逼问出来的忏悔「我全部没看过原文」,从一句忏悔变成**可查询状态**,渲染层可标 `[E17 · 仅题录]` / `[E17 · 已读全文]`。

**b) 检索日志**(`evidence/queries.jsonl`)—— 这正是 `compact.ts:44-46` 今天把 `tool_use.input` 整个丢弃后再也回答不了的东西:

```jsonc
{"q":"q3","turn":5,"tool":"search_papers","args":{…},
 "total_upstream":256509,"delivered":16,
 "new_ids":["E12","E13"],"dup_ids":["E4"]}
```

`new_ids` 让「换个说法再搜一遍」现原形;`total_upstream` 防止覆盖度自检误以为「这个方向只有 16 篇」而实际有 25 万篇。

**c) 阶段状态机**

| 阶段 | 模型能做什么 | 退出条件 | 退不出去 |
|---|---|---|---|
| `chat` | 自由 | `end_turn` | — |
| `plan` | `ResearchPlan` / `DesignCheck` / `AskUserQuestion` | 计划落库 | 2 轮 → 引擎生成单轴 fallback,强转 |
| `evidence` | 检索 MCP + `Read` + `EvidenceGet` | 调 `ResearchPhase(to:"synthesis")` **且过闸** | 预算用尽 → **强转**,未覆盖轴标 `insufficient:{by:"budget"}` |
| `synthesis` | 写作工具 + `EvidenceGet`;**检索工具不在 tools[] 里** | `end_turn` | 交现有 wind-down |

闸的判据(引擎算数,**无 LLM、无阈值、无内容判断**):

```
gate = ledger.count > 0  AND  plan.axes.every(a => a.hits > 0 || a.insufficient != null)
```

不过闸 → `is_error` + **精确差额 + 可执行的下一步**(与仓内既有的工具失败双轨制同范式)。「显式声明不足」这条路必须留着,但它与今天「标注即可」的关键区别是:今天的声明是**模型自己写的一句话,写了没人管**;新设计里 `insufficient` 是**账本上的结构化记录**,会被渲染进 synthesis 注入块、经 `research_state` 帧带外送前端、落 journal 可审计。

### 3.4 五个问题各自怎么被解决

| 问题 | 机制 | 属于哪个量纲 |
|---|---|---|
| **不用工具** | `evidence` 相全程 `tool_choice:{type:"any"}` —— `end_turn` **不是可采样的分支**。这不是散文劝阻,是 API 层不变量 | **结构不可能** |
| **伪造检索** | 检索次数 / query 清单 / 覆盖度由引擎在咽喉点计出,经 `research_state` 帧**带外**送前端渲染。模型写什么都不影响这个显示 —— 它旁边就印着引擎写的「本轮检索 0 次」。**取消叙述垄断,不是禁止叙述** | **结构不可能**(欺骗性) |
| **引用编造** | id 分配权独占于 writer(模型无工具可铸造 `E<n>`);引用形态由渲染器产出;交付物 → 未定义引用 = **构建失败**;对话 → 流式当场红字。且 `E17` 不像 DOI 那样是可被参数记忆合成的模式 | 交付物**结构不可能**;对话**立即可见自曝**(诚实标注) |
| **数据编造** | 数值只能写 `{{r:run_7.…}}`,渲染期展开;要放一个假 p 值,模型必须先制造一个带 `data_sha256` 的 `results/run_*.json`,而它由引擎写、`provenance.rev` 对不上即 tainted。**同时把统计能力真装上**(statsmodels/sklearn/lifelines),缺库的方法从候选表消失而不是让模型撞 ImportError | **结构不可能** |
| **方法学浅** | `method` 闭集 + `applies_when/forbids_when` 决策表(如 repeated → 禁 `welch_t`,`reason_code:"pseudoreplication"`);criteria pack 双消费者 lint 硬闸让 claw 与 peerreview **结构上不可能拿两套标准** | **结构不可能**(判据私有) |

**关键在成本表 —— 这才是真正的解法:**

| 动作 | 今天 | 改后 |
|---|---|---|
| 引一条真文献 | 调 1–12 次工具 + 等待 + 自己拼题录 ≈ 40 token 输出 | 从 digest 挑一个 `[[E7]]` ≈ **4 token** |
| 编一条假文献 | 输出 ~40 token,**零后果零信号** | 必须编 id;交付物 → 构建失败整轮重来;对话 → 用户屏幕当场红字 |
| 零工具直接答 | 完全合法,规则明写「标注即可」 | `evidence` 相结构上不可达 |

**罚更重是 guard 的思路;让正确路径更便宜是架构的思路。** 今天「引真的」比「编假的」贵一到两个数量级 —— 那就是幻觉的全部经济学。

---

## 四、老板三条硬约束逐条兑现

### ① 不做小修补

本方案有 **6 处减法**,减法比加法多,这是「不是修补」的检验:

1. **删** `smartsearch/spec.go:161-162` 的「未调用检索工具时标注即可」分支。
2. **删** `prompts/claw.go:82` 的「二选一, 没有第三种」后半句。
3. **删** `prompts/smart_search.go` 的「整体检索预算 ~12 次」段(它与 skill §2 的滚雪球 12–18 次**数值对撞**,模型必选定量的、来自更高权威的那条,导致 skill 的全部扩张动作系统性不发生;且模型把「一次提问」读成会话累计,给零工具轮提供了**完全合规的自我解释**)。改由 evidence 相的轮预算机械执行,散文里不再出现数字。
4. **移除** `verifyClaims` 在 `turnLoop.ts:609-637` 的**纠偏注入分支**(降级为纯观测,见 ②)。
5. **删** `docker-compose.yml:397` 的 `/peerreview-add` 死挂载(零调用者的回归陷阱:谁补一行 `AddDirs` 就静默丢掉全部 6 个横切质量维度)。
6. **修** 两行正在生产误导模型的假声明(skill 说有 statsmodels,容器里没有)。

加法全部落在**三个可被机械验证的不变量**上(句柄不可铸造 / 值由引擎持有 / 判据不可私有),不是"再叠一层规则"。

### ② 不做兜底 —— guard 降级为可观测,并给出降级的理由与仪式

**降级动作**:保留 `auditClaims` 的 findings 落库与告警,**移除注入纠偏轮的分支**;并把 `buildEvidenceCorpus` 的输入从 `messages` 换成**账本**。

**为什么必须降级(不是我的偏好,是数据)**:
- guard 读的是**同一份被 `convertFlatToAnthropic` 掏空的数组**。冷重播后语料里一个 DOI 都没有 → 每一条**真实**引用被判 `unverifiedDois` → 注入【系统纠偏】要求「补齐事实或显式更正」→ 模型此时无法查证(smart_search 连 Write/Glob/Grep 都没有),最省力的服从方式是**删掉真引用**。**在最需要它的路径上是净负值。**
- 判据集合与故障形态**不相交**:claw 那个 31 条效应量数据集,`study_id` 形如 `Zwettler_2023` 匹配不上 DOI 正则、数据写进了文件所以 `deliveryMismatch=false`、没说「已通读」所以 `fullReadMismatch=false` → **findings 全空,静默满分放行**。这不是阈值问题。
- 有用户回声洗白通道:编造 DOI 被用户粘贴回对话即进入 user 侧语料、获得合法性。
- 上线以来 609 轮 claw 只触发 8 次(1.3%),DOI 类仅 2 次;且误报会吃掉 `MAX_CORRECTIVE_ROUNDS=2` 的预算,**把真故障挤出去**。

**guard 的新岗位是仪表盘**,而且是本方案自带的**幻觉计量器**:`{{r:` 展开失败次数、resolve 闸 `is_error` 次数、「正文含 DOI 而零 `[[E]]`」的轮占比 —— 这三个数字**今天完全不可观测**,改后每一次都是「模型试图编造」的直接计数。

### ③ 编排要加强

三处**确定性状态转移**(不是注入劝导文本),全部复用仓内已验证机制:

1. **`tool_choice` 分阶段**:`evidence` 相**全程** `{type:"any"}`(不是只强制首跳 —— 病灶不是「第一跳没检索」,是「end_turn 太便宜」;只强制首跳的话模型打卡一次照样在第二跳出编造综述)。
2. **`windingDown` 反向化**:`turnLoop.ts:301` 今天是「清空 activeTools」——**在最该引账本收尾的时刻反而只剩训练记忆**。改成「强转 synthesis」,同一触发点、同一「只翻一次」语义、`EvidenceGet`/`Read` 保留。**这是现存缺陷,顺手修掉,约 10 行。**
3. **轮预算从平摊的 24 拆成阶段子预算**,到期 = **强制前进**而非 `sendError`。这顺手修掉一个 UX 缺陷:今天 `round_cap` 直接报错,用户白等一整轮(诊断里 2 位用户 7 轮白等)。

**Router**(引擎侧、0 token、0 延迟)解「还有哪些论文呢」:有序规则,首个命中生效;命中「延续」时引擎在注入块里给出**「还有哪些」的确切所指**(已执行 query 清单 + 已见 id 集合 + 尚未覆盖的轴)。今天这句话到达模型时,上下文里没有「哪些」的所指,它只能从自己的散文继续编。

**误判代价刻意做成不对称的**:该 chat → 判 evidence = 多一次检索(贵,无害);该 evidence → 判 synthesis = **唯一危险方向**,故设三重前置(有 plan **且** 账本非空 **且** 无检索意图词)。模型可用一次 `ResearchPhase` 纠偏,**纠偏次数本身就是 router 误判率的生产探针**。

---

## 五、落地路线

### P0 —— 两周,可独立上线,不依赖 `tool_choice`

分四块,块间无依赖,可并行:

**P0-a · 运行时诚实化(半天,零风险,先发)**
- `agent/Dockerfile`:显式声明 `python3-scipy`(现在是未声明的传递依赖,任何一次 rebuild 都可能消失)+ 新增 `statsmodels` / `scikit-learn` / `lifelines`。体积 +150–250MB,单独一层(仓内有 Docker 整层重装 OOM 记录)。
- 启动期 import 断言,把结果写进方法候选表的 `engine_supported` 现算态 —— **缺库的方法从候选表消失,而不是让模型撞 ImportError 后自己编数**。
- 修 `agent-skills/claw-add/guides/methods-stats/SKILL.md:34` 与 `data-figures/SKILL.md:28` 的假声明。
- 顺手删 `docker-compose.yml:397` 的 `/peerreview-add` 死挂载。

**P0-b · 证据账本最小闭环(约 1.5 周,纯执行器侧)**
- 新增 `agent/src/evidence/{ledger.ts, parse.ts, render.ts}`。`parse.ts` 是 `frontend-user/src/shared/lib/minicod-papers.ts` 的**移植**(该解析器已在 `PaperListScroller.tsx:60` + `ClawPaperList.tsx:8` 两处生产消费,覆盖 `items/papers/results/data/recommended_papers/snippets` + 裸数组 + `content[0].text` 内嵌 JSON,**是仓内唯一经实战的 minicod 解析器,不要重写**)。⚠️ 移植即产生跨包镜像 → **同 PR 必须加 mirror guard 测试**,并知道 Docker 构建 context 只有单包、跨包规则会整族 skip,**只有 `pre-push` 钩子真校验**(需先跑一次 `./scripts/install-git-hooks.sh`)。
- 改 `agent/src/turn/runTools.ts`(`runOne` 内,`:101 capToolResult` **之前**)—— 唯一咽喉点,账本拿砍前的完整记录。⚠️ `:37` 是 `Promise.all` 并行批,**id 分配与 INDEX 覆盖写必须串行化**(单会话内存锁,或把 INDEX 渲染推迟到本轮批结束)。
- 改 `agent/src/turn/turnLoop.ts:193` —— digest 注入走已验证 seam(append 到本轮 user 尾部,**不进 system、不破前缀缓存**)。
- 新 builtin `EvidenceGet`(smart_search 的**唯一**读回路 —— 它没有 Glob/Grep)。
- 改 `agent/src/server/shadowTurn.ts:50` —— 折成**「一行摘要 + E-id 列表」**(`【已检索 search_papers "…"】命中 20,已入账本 E1–E16`),**不是**把全量 tool_result 折回去(那是每轮重发 100K token,不可持续)。注:其自述理由是 Anthropic 的 tool_use↔tool_result 配对约束 —— **折成 text 块根本不需要配对**,这是一处纯粹的信息丢弃,约束并不要求它。
- 改 `agent/src/turn/compact.ts:44-46` —— 保留 `tool_use.input`(query)。
- 改 `agent/src/turn/verifyClaims.ts` —— corpus 换账本 + **移除纠偏注入分支**。
- backend:`eventlog.go` / `eventlog_store.go` 加 `EvEvidence`(只写不读,先拿指标);`hub.go` 的 `seed_history` payload 加 `research` 字段(workdir 被 GC 时的重建路径)。

**P0-c · 带外过程可视化(约 2 天,前端 1 个组件)**
- `research_state` / `evidence_appended` 帧走既有 `sink.frame` 管线;前端渲染「本轮检索 N 次 / 账本 M 条 / 来源:检索 x 条·用户提供 y 条」chip。
- **这是 P0 里性价比最高的一条**:它不阻止伪造检索,但**当场剥夺其欺骗性**,并且不依赖任何新机制。

**P0-d · `tool_choice` provider 探针(半天,不上线)—— 带决策闸**
- 对 `agent_models` 表每一行跑最小请求(1 工具 + `required`),记录是否正常返回单个 tool_call。已知坑:部分 OpenAI 兼容网关在 `required` 下强制并行多工具、或返回空 `content` 导致 `assembleToolUse` 走异常路径。
- **决策闸**:若线上主力(deepseek-v4-flash/pro)通过 → smart_search 的 round-0 `tool_choice` **纳入 P0**(改动 ~15 行:`openai/adapter.ts:280` 透传 + `turnLoop.ts:324` 传参);不通过 → 顺延 P1,且**在 admin 模型目录页显式标注「不支持阶段编排」**。
- 🔴 **绝不做「软形态强制」**(吞掉 end_turn 再重发)—— 那就是最坏的那种 guard。宁可缺失也不假装启用:**「一条永远绿的规则」和「一条不存在的规则」等价**,本仓库被这个模式坑过。

**P0 改动面**:executor 8 个文件(3 新 5 改)+ backend 4 文件 + Dockerfile + 前端 1 组件。**不改引用格式、不改 prompt**(P0-a 的 skill 修正除外)→ 兼容性风险最低,可单侧发布。

**P0 验收指标(全部可从现有 journal SQL 算,零新埋点;上线前先采基线)**

| # | 指标 | 基线(生产审计) | P0 目标 |
|---|---|---|---|
| V1 | **失忆纪元轮占比**(本轮 messages 里**既无 tool_result 块、也无折叠证据行**,而会话历史存在 tool_result)⚠️判据已按实现改写,见下 | claw 60 轮 | **→ 0**(可直接消灭) |
| V2 | **冷重播轮 vs 热轮的 DOI 接地率差值** ← **北极星** | **55 个百分点**(98% vs 43%) | **< 5 个百分点** |
| V3 | claw 零工具轮里「引用了文献」那部分(122/278)的 DOI 接地率 | 43% | **≥ 90%** |
| V4 | 追问轮平均工具数是否仍随 seq 坍缩 | 8.57 → 4.27 → 1.71 | 不再单调坍缩 |
| V5 | `import statsmodels` 失败次数 | 需采基线 | **0** |
| V6 | 「正文含统计数值形态(`p\s*[=<]` / `95% ?CI` / `β=` / `OR=` / `HR=` / Cohen)且本会话零 RunAnalysis」轮占比 | **新指标**,采基线 | 4 周内 < 10% |
| V7 | **代价:** 单轮 raw token 中位数 / p50 首 token 延迟 | 需采基线 | 不劣于基线 +10% |
| V8 | 新可观测:`ledger_total` 分布、`origin` 分布(检索 vs 用户提供) | **今天完全不可见** | — |

**V7 必须与 V1–V6 同板展示。质量指标单看会掩盖成本回归。**

> 🔴 **V1 判据改写(2026-08-01,采基线前冻结)** —— 原文写的是「本轮 messages 里 `tool_result=0`」,
> 那条判据**与最终实现不自洽**:P0-c 的修复并没有把 `tool_result` 块放回上下文,而是把每个
> tool_use 折成**一行摘要 + E 编号列表**(`agent/src/server/shadowTurn.ts`;刻意不折回全量 ——
> 那是每轮重发 ~100K token)。所以部署后 `tool_result` 块数**依然恒为 0**,
> 按原判据算 V1 会永远停在基线值 = **假红灯**,会被读成「修复无效」,而实际上证据已经在上下文里。
>
> 正确判据:**本轮 messages 里既没有 `tool_result` 块,也没有折叠证据行(E 编号)**。
> 即"这一轮手上到底有没有证据",而不是"证据以哪种块类型存在"。
> 指标衡量的必须是**目的**(上下文里有没有证据),不是当初设想的那个**手段**(块类型)。
>
> ⚠️ 同类陷阱值得警惕:任何把"实现细节"写进判据的指标,都会在实现换手法时变成假红灯或假绿灯。

**P0 风险**
- token:digest 每条 40–80 token × 上限 60 条(字符帽 6000)≈ **+1.6K token/轮**,相对现有 ~10.3K system + ~40K tools[] 是 +3~5%;但它替代的是每轮全量重发 tool_result(实测 smart_search 每轮 14–29K est token 中 **84–88% 是 tool_result**),**净效应大概率为负(省 token),但必须上线后实测,不预先宣称**。
- 磁盘:🔴 `assertSessionQuota`(`workspace.ts:70/77`)每次写入跑 `dirUsage` **全目录递归**,且 `SESSION_FILE_MAX_COUNT=2000`。⇒ **`E<n>.md` 只对被引用过的记录懒物化**,未被引用的只活在 `ledger.jsonl` 行里(单文件追加,零文件数增长)。**这条是实现硬约束,不是可选优化。**
- 存量会话:无账本 → digest 为空 → 行为回落到今天(不更差)。

### P1 —— 4–6 周:引用只能从账本构造 + 判据同源 + 阶段机

1. `[[E<n>]]` 引用格式 + 交付物 resolve 闸(`ExportDocument` / `BuildDeck` / prism 固化 / `emitArtifacts`)+ 前端渲染成论文 chip、未入账 → 可见破引用标记。
2. **删两处「标注即可」逃生门**,换形态契约(「账本为空时不得产出书目形态」)—— **必须与 1 同期**,否则模型无替代路径。
3. 阶段机:`plan`/`evidence`/`synthesis` + Router + 覆盖度闸 + `tool_choice`(若 P0-d 未过则此处兑现)+ `windingDown` 反向化 + 阶段子预算。
4. `study.json` + `DesignCheck`(方法表 v1 = 现有 `methods-stats` guide 的**机械翻译**,不新增方法学知识)+ `RunAnalysis`(python 参数化执行 + 前提检查 + `results/run_*.json` + **R 脚本模板渲染发射**,不在容器里真跑 R)+ `{{r:}}` 展开器。
5. criteria pack:从 `lens-*/SKILL.md` **机器抽取**,配快照测试保证渲染回去 **byte-identical**(⇒ **peerreview 行为零改动**,风险最低),再反转真源;`scripts/lint-research-criteria.py` 双消费者硬闸。
6. prism 接入(⚠️ `AllowBash=false`,`RunAnalysis` 走 builtin 内部 spawn 绕过 Bash 禁令 —— **这是新增代码执行面,必须单独过安全评审,不能顺手合入**)。

**P1 验收**

| # | 指标 | 说明 |
|---|---|---|
| W1 | 交付物里未入账引用 | **= 0**(按构造) |
| W2 | **resolve 闸 `is_error` 次数** | 应 >0 且随周下降 —— **这个数字就是「模型试图编造」的直接计数器**,今天完全不可观测 |
| W3 | 格式遵循率:正文含 DOI 而零 `[[E]]` 的轮占比 | **发布门禁**。初期一定不是 0,不要假设 |
| W4 | claw **research-shaped 轮**的零工具率 | ⚠️ **口径陷阱:必须先用 router 标签切分母**。42.8% 全轮口径里有大量正当的闲聊/写作/统计轮,不切分母**这个数字不可读**,拿它做 KPI 会逼出错误改造 |
| W5 | **交叉一致性**:claw/prism 预检 `fatal=0` 的稿件送 peerreview 判拒稿的比例 | 今天**无法测**(判据不同源,连口径都没有);目标 <15%,每例归因到「判据缺失」或「判据未同源」并回流补 criteria |
| W6 | 「显式声明证据不足」的轮占比 | **上升是好事** —— 说明模型在用诚实出口而非编造出口 |
| W7 | 用户人工验伪话术频次(「一定不能有幻觉啊」「你帮我引用的是我文献库的还是你检索的」「是真实数据还是虚拟数据」) | 从 journal user_message 正则统计,现基线 ≥7 用户高频。**最贴近商业价值的指标** |

**P1 风险**
- 🔴 **必须前后端同步发布**,否则老版 SPA 把 `[[E7]]` 原样显示给用户。本仓库有真实前科(发布断层 `c7592f25a` 未进 main)。
- 🔴 **引用格式对存量会话是断层**(老会话历史全是自由文本引用,模型会看到自相矛盾的示例)→ **按会话有无账本分档注入引用契约**。
- resolve 闸可能堵死交付 → 硬失败必须配「怎么自救」的 tool_result 指引(缺失 id 清单 + 有效范围 + 建议调 `EvidenceGet`),否则会一路撞 `MAX_TOOL_ROUNDS=24`。
- 阶段死锁:设计上不存在(每阶段预算到期一律强制前进,全局 24 轮 + 5M token 硬闸保留)。**P0/P1 上线必须有一条断言:所有 turn 终态 phase ∈ {chat, synthesis}** —— 出现别的终态就是 bug,不是降级。
- token:synthesis 相砍掉 18 个 MCP 工具后 `tools[]` 从 39,768 字符降到 ~4–6K,**写作轮省 ~9–10K token**;但阶段转换会打断上游隐式前缀缓存(1–2 次/轮)。**短会话偏亏、长会话偏赚**,必须看 V7。

### P2 —— 纵深与统一

- peerreview **只上报**同一套 `research_state` 做指标同构,**不动它的编排**(它已经是对的,是仓内唯一 plan-first 先例)。
- skill §2 滚雪球做成复合工具 `expand_from_seed(paper_ids)`(内部替模型跑 references+citations+related 并去重,**计 1 次预算**)—— 6 次 → 1 次,彻底解掉预算对撞。
- MCP 命名门面 `evidence_*`(让前缀后第一个 token 回答「我是不是在取证据」),并**顺手修一个已确认的品牌泄漏**:`agent/src/mcp/mcpTools.ts` 的 `/Semantic\s*Scholar/g` 匹配不到连字符形式,`recommend_paper` 的 description 与 schema 实际泄漏 `"Semantic-Scholar"`,而该工具在 smart_search / claw / peerreview 三个白名单里。修法一行:`[/Semantic[\s-]*Scholar/g, "Graph"]`。
- R 真执行(或改为回收用户 `sessionInfo()` 做环境对齐);系统综述 / PRISMA 对象化;smart_search 消费 `study.json.question.pico` 生成检索式。
- **`agent-plans` 的三个新 feature(stat_lab / sys_review / nsfc_grant)直接继承账本 + 阶段机 + criteria pack,不再各写一份台账。** 同时修正其中一条与本诊断直接冲突的假设:`02-sys-review:105/151` / `03:105` 的「分批铁律」写成「每轮 ≤3 条主张,skill 显式分轮推进」——那是把编排责任又交回给模型的 prompt 文本。**分批必须由工具返回契约驱动**(`remaining > 0` 时在 tool_result 里带机器可读的续做指令与剩余量)。

---

## 六、明确否决清单(防止后续有人回头捡起)

| # | 否决项 | 理由 |
|---|---|---|
| 1 | **调大 `EXECUTOR_SESSION_IDLE_TTL_MS`** | 治标。`MAX_SESSIONS=200` 硬帽 + 容器重启即全清,且会**掩盖**问题。走证据外置 |
| 2 | **`convertFlatToAnthropic` 直接把全量 tool_result 折回上下文** | 每轮重发 ~100K token,成本与注意力稀释不可持续。只折「一行摘要 + E-id」,收口进账本,不制造第二套证据口径 |
| 3 | **再加一道 guard / 加强 `verifyClaims`** | 量纲错误:与模型读同一份被掏空的数组;冷重播时逼模型删真引用;占 `MAX_CORRECTIVE_ROUNDS=2` 把真故障挤出去;609 轮触发 8 次。**降级为观测是本方案的前提,不是补充** |
| 4 | **继续裁工具 / 上 `tool_search_tool` + `defer_loading`** | 22–34 已在安全带内,裁无增益;延迟加载让工具**更不可见**,直接加重 L1 病灶。只有 claw 越过 50 才重新评估 |
| 5 | **用 LLM 做覆盖度自评 / 证据充分性自评** | 等于把刚拆掉的自由裁量装回去,且多一次 LLM 延迟与成本。必须引擎算数 |
| 6 | **回溯重建历史账本** | journal 里有全量 tool_result,理论可回填,但回填的题录没有轴归属,一次性大工程收益低。存量会话从上线起前向建账本 |
| 7 | **换更贵的模型** | 实测反向:claw 上 pro 55.3% > flash 38.2%。同为 flash 的 smart_search 11.7% vs claw 38.2% —— 差异来自 feature 编排 |
| 8 | **重写 minicod 76 条工具描述 / 再写一版系统提示词** | 通道已被用户指令证伪饱和;描述质量本来在平均线以上。义务语要加就加在**机器注入的统一前缀**(`maskUpstreamBrands` 已有的改写钩子)上,按构造扛住上游版本升级,而不是手改上游资产 |
| 9 | **容器里装 R 真跑(P0/P1)** | +300–600MB,构建期网络风险(仓内有 apt 镜像 fake-ip 踩坑记录)。P0/P1 用**模板渲染 + CI 数值等价对账**,产物记 `r_equivalence: template_verified@<ci-id>` |
| 10 | **让模型自己 Write 落盘证据** | smart_search denylist 物理禁 Write;且仓内已写死铁律「jail 内模型持有 Write/Edit,任何『只有工具能写 X』的约定都不是机制」。必须引擎写 + `provenance.rev` 校验 |
| 11 | **claw 无条件 `tool_choice:{any}`** | 42.8% 分母里大量是正当的闲聊/写作/统计轮,无条件强制会伤体验。必须默认 `chat`,只有 research-shaped 才进管线 |
| 12 | **推翻重做 peerreview 的编排** | 它已经是对的(Go 侧固定序,仓内唯一 plan-first 先例)。只让它**上报**同一套状态 |
| 13 | **各写各的台账**(sysrev 的 sqlite `ledger.db` + nsfc 的 `claims.json` + 现网四 feature 各一份) | 会长出四份形状不同的台账。**下沉为 executor + agentbridge 的公共设施,在咽喉点 + journal 层做一次** |
| 14 | **P1 前后端不同步发布** | 老版 SPA 会把 `[[E7]]` 原样显示给用户。有前科 |
| 15 | **「软形态强制」替代不支持 `tool_choice` 的 provider**(吞 end_turn 再重发) | 那是最坏的一种 guard。宁可在 admin 标注「不支持阶段编排」也不假装启用 |
| 16 | **把「~12 次检索预算」留在散文里(哪怕改数字)** | 它与 skill §2 的 12–18 次**结构性对撞**,且模型会读成会话累计,给零工具轮提供合规自我解释。必须移出文本,由引擎机械执行 |

---

## 七、需要老板拍板的四件事

1. **P0-d 的决策闸**:`tool_choice` provider 探针通过 → round-0 强制**纳入 P0**(2 周内可见零工具轮结构性归零);不通过 → 顺延 P1 且部分模型永久不支持阶段编排。**这是本方案唯一的技术不确定性,建议第一周就做掉。**
2. **P1 的 `[[E<n>]]` 引用格式是一次用户可见的输出契约变更**,需要前后端同步发布 + 存量会话分档。是否接受这个发布协调成本?
3. **prism 的 `RunAnalysis` 会给 `AllowBash=false` 的 feature 引入新的代码执行面** —— 是否安排单独一次安全评审(而不是随 P1 合入)?
4. **criteria pack 的真源反转**(peerreview 的 44 份 skill 从「私产」变成「公共判据的一个消费者」)会改动一个正在生产、有 lint 硬闸守护的资产。P1 用「机器抽取 + 快照测试保 byte-identical」把行为改动降到零,但仍需 owner 确认。

---

## 附录 A · 我独立复核的代码事实(全部为本次实测,非引用诊断)

| 事实 | 位置 | 复核结果 |
|---|---|---|
| tool_result 在重灌时被 100% 丢弃 | `agent/src/server/shadowTurn.ts:50` | ✅ 确认。注释自述理由为 Anthropic 配对约束,但**折成 text 块不需要配对** |
| `tool_choice` 零使用 | `agent/src/` 全目录 grep | ✅ `wc -l` = **0** |
| OpenAI 适配层无 tool_choice 通路 | `agent/src/openai/adapter.ts:280` | ✅ body 里只有 `tools` |
| turnLoop 上游调用不传 tool_choice | `agent/src/turn/turnLoop.ts:324` | ✅ 确认 |
| per-turn 注入 seam 存在且不进 system | `agent/src/turn/turnLoop.ts:193-201` | ✅ `langDirective + budgetDisclosure` append 到最后一条 user 消息 |
| 工具执行唯一合流点 + 并行批 | `agent/src/turn/runTools.ts:37 / :51 / :101` | ✅ `Promise.all` 并行 + `runOne` + `capToolResult` |
| 「标注即可」逃生门 | `backend/internal/smartsearch/spec.go:159-162` | ✅ 原文确认 |
| 「二选一, 没有第三种」 | `backend/internal/prompts/claw.go:82` | ✅ 原文确认 |
| 统计库缺失 vs skill 假声明 | 容器实测 + `agent/Dockerfile:45,52` + 两份 SKILL.md | ✅ statsmodels/sklearn/lifelines **MISSING**、**no R**;scipy 仅为未声明传递依赖;skill 明写「能用 python(statsmodels)真算」 |
| 会话驱逐不删 workDir + 30 天 TTL | `agent/src/server/sessions.ts:345/347/348/388` | ✅ `IDLE_TTL_MS=30min`、`MAX_SESSIONS=200`、`WORKDIR_TTL_DAYS=30`、注释明写「驱逐【绝不删 workDir】」 |
| 磁盘配额是每次写入全目录递归 | `agent/src/server/workspace.ts:24/70/77` | ✅ `SESSION_FILE_MAX_COUNT=2000` + `dirUsage` 递归 → **懒物化是硬约束** |
| 证据外置有可复用先例 | `backend/internal/agent/client.go:479` + `agentattach/reference.go:209-253` | ✅ `PutWorkspaceFile` + `references/{INDEX.md, paper-<id>.md}` 全线就绪 |

---

## 八、一句话收束(给老板)

**使用方式没问题:MCP 白名单生效、skill 100% 在场零截断、装配链路全线正常。它编,是因为我们把它放在了一个「证据活不过 30 分钟、取证从来不是必需、连统计库都没装但 skill 告诉它装了」的环境里,而在那个环境里,编造是唯一一条随时可走、零成本、零信号的路。**

**这份方案不加第四段散文。它做三件结构性的事:让证据有身份并活到写作那一刻(账本)、让「什么时候必须先有值」由引擎的状态机决定而不是模型的自由裁量(阶段编排 + `tool_choice`)、让引用/数值/方法三类主张的值都由引擎持有而模型只能写句柄(句柄化 + 交付边界展开)。并且做了六处减法 —— 包括删掉我们自己写进提示词里的那条逃生门,和一条正在生产环境骗模型的假声明。**