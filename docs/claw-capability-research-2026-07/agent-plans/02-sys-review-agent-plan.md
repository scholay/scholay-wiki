# 系统综述 / Meta 分析工作台 —— 重工程落地方案(修订终稿,feature_key=`sys_review`)

> 首席架构师修订稿。骨架承接 `docs/claw-capability-research-2026-07/designs/02-sys-review.md` 与初稿,吸收全部 9 条评审意见。核心判据不变:**所有数字(命中数、去重数、纳排计数、效应量、I²、PRISMA 框内数字)一律由确定性引擎算出;LLM 只做理解/编排/建议/解释,永不亲手产 DOI、永不亲手算统计量;排除定论只能来自用户。**

---

## 0. 一句话架构

```
用户(claw 页「系统综述」卡)
  → backend internal/sysreview (thin agentbridge feature, ~780 行 Go)
  → agent 容器 (scholay-sys-review 会话)
      ├─ executor 侧工具 FetchCorpus ── 直连 minicod REST(per-source 策略),落盘 corpus JSONL,不过上下文
      ├─ jail 内 Bash ── 调 /opt/sysrev-engine 确定性引擎(去重/排序/台账/提取校验/PRISMA/meta)
      └─ 4 个 SKILL ── 只教「何时调引擎、参数怎么给、结果怎么解释、红线」
  → 引擎唯一真源 = cwd/.sysrev/{project.json, ledger.db(sqlite)}
  → 视图导出 = ./out/{screening_ledger.xlsx, extraction_table.xlsx, prisma_2020.svg, meta_forest.svg, ai_provenance.json, search_strategy.md}
  → 收割 ./out → MinIO → 前端预览
```

---

## 1. 确定性引擎 `sysrev-engine`(核心资产)

烧进镜像的纯 Python 包 `/opt/sysrev-engine`(仿 pandoc vendor 先例),jail 内 `PYTHONPATH` 就位、断网可跑,约 2200–2800 行 / 7 模块,LLM 一行统计代码都不写。

### 1.1 模块划分(采纳 issue#3,screen 与 LLM 建议彻底拆层)

| 模块 | 文件 | 行数 | 职责(确定性,零 LLM) |
|---|---|---|---|
| `store` | `store.py` | ~380 | project.json + ledger.db 读写,状态迁移原子事务,乐观锁;项目包 export/import(§4.5) |
| `dedupe` | `dedupe.py` | ~400 | bib-dedupe 主引擎 + rapidfuzz 分块兜底;DOI 精确→标题/作者/年份分块→连通分量;dup_group_id 留溯源(link 不删) |
| `screen` | `screen.py` | ~330 | **只产 rank_score,只排序省人力,不产任何建议/理由/置信度**。冷启动:对 PICO+纳入标准文本做 TF-IDF 相似度先验;累计 ≥20 条且两类都有的用户裁决后,增量重训 sklearn 逻辑回归。输出停筛参考(基于 rank 曲线拐点的估计召回) |
| `extract` | `extract_validate.py` | ~250 | 提取值确定性校验:**只对有全文文本的记录开放**(§4.4),snippet 子串/regex 数值核对,不确定强制 `NR` |
| `meta` | `meta.py` | ~450 | statsmodels combine_effects(固定/随机 DL+PM+HKSJ)+ effectsize + 手写 Egger(WLS)/trim-and-fill/I²·Q·τ² |
| `figures` | `figures.py` | ~380 | PRISMA 2020 SVG(**含全文阶段三框**,数字从 store 读)+ 森林/漏斗(matplotlib)+ RoB traffic-light |
| `views` | `views.py`+`cli.py` | ~280 | db → xlsx 只读视图(openpyxl 分 sheet)+ ai_provenance.json + CLI 分发 |

### 1.2 CLI 契约(jail 内 Bash 唯一入口)

```bash
python3 -m sysrev_engine <subcommand> --project ./.sysrev [--in x.json]
# init | dedupe | screen-rank | screen-batch | ledger-suggest | ledger-set |
# ft-set | extract-validate | meta | prisma | forest | funnel | rob |
# export-views | export-project | import-project | provenance
```

每个子命令只吃/吐 JSON 或写产物文件,stdout 回结构化摘要 `{ok, counts, warnings, next_hint}`。新增三条(对应 issue#3/#4/#6):
- `screen-batch --top N`:按 rank_score 导出下一批未建议记录(title+abstract)到 `batch_k.json`,供 LLM 阅读;
- `ledger-suggest --actor ai --in suggestions.json`:LLM 批量回写建议(含 ai_reason/ai_confidence),引擎校验 rec_id 必须存在于语料、actor 必须=ai、目标态只能是 ai_suggested_*;
- `ft-set --actor user --in ft_decisions.json`:全文阶段状态迁移(§4.4)。

### 1.3 题录标准形(source 只存别名映射)

```jsonc
{ "rec_id": "sha1(doi||title+year)", "doi": "...", "title": "...", "abstract": "...",
  "authors": ["..."], "year": 2021, "venue": "...",
  "source": "graph",        // graph|discovery|medicine(对外别名铁律 §9)
  "raw_source": "stc",      // 内部真源,永不出现在用户可见产物
  "fetch_query_id": "q1" }  // retracted 标注挪到 P1 独立工具(§3.4),不在 FetchCorpus 内
```

---

## 2. 开源集成(修订:全 apt,零 pip —— 采纳 issue#1)

**纠正初稿事实错误**:镜像现状是零 pip、全 apt(scipy 即 trixie apt 1.15.3-1);apt `python3-statsmodels` 0.14.4 恰依赖这份 scipy,零冲突。初稿的裸 `pip install` 反会从 PyPI 拉 numpy/scipy/pandas 进 /usr/local 遮蔽 apt numpy 2.2.4,可能打断按 Debian ABI 编译的 matplotlib/rdkit(现有 sci_draw 直接遭殃)。**全部推翻,改为:**

| 组件 | license | 安装方式 | 引擎内位置 |
|---|---|---|---|
| statsmodels 0.14.4 | BSD-3 | **apt** `python3-statsmodels` | `meta.py` 主引擎 |
| scikit-learn 1.4.2 | BSD-3 | **apt** `python3-sklearn` | `screen.py` |
| rapidfuzz 3.12.2 | MIT | **apt** `python3-rapidfuzz` | `dedupe.py` |
| bib-dedupe | MIT | **vendor wheel 进 /opt(纯 Python,`pip download`+`--no-deps` 解包),连同 apt 缺失依赖 number-parser 一并 vendor** | `dedupe.py` 主去重 |
| scipy/matplotlib/numpy/pandas/openpyxl | — | 已装(apt) | 底座 |

bib-dedupe 系纯 Python(初稿称有 Cython/C++ 扩展是错的,更正);vendor 检查项:①number-parser 及任何间接依赖 license 逐个核(预期 MIT/BSD,非宽松即换自研兜底路径);②**确认 dedupe 主路径不触发其 requests 网络调用**(jail 断网)——构建期 grep + jail 内断网跑真实去重冒烟,双验。

```dockerfile
# 层A(apt,一层三包):
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-statsmodels python3-sklearn python3-rapidfuzz && rm -rf /var/lib/apt/lists/*
# 层B(vendor,构建期联网下载 wheel 解入 /opt,运行期断网):
COPY vendor/bib-dedupe /opt/pyvendor/bib_dedupe   # wheel 解包产物随仓库提交,仿 pandoc 先例
# 层C: 引擎源码 + 构建期 import 冒烟
COPY sysrev-engine /opt/sysrev-engine
RUN PYTHONPATH=/opt/sysrev-engine:/opt/pyvendor python3 -c "import sysrev_engine, bib_dedupe, statsmodels, sklearn"
```

**借鉴清单**(只搬设计不引码):otto-SR 六段流水线与「人只裁决冲突行」;ASReview 主动学习范式(sklearn 自建复现);Elicit 台账「建议+理由+置信度+裁决列」范式;prisma-flow/PRISMA2020 官方 box 布局做手写 SVG 蓝本;robvis 配色版式;ASySD 作去重基准参照(不引 R)。**明确弃用**:PythonMeta(GPL)、metafor/R 车道(GPL+重运行时,P3 network-meta 才评估)、RobotReviewer(GPL+断网跑不了)、ASReview 整包(Flask 常驻与批处理沙箱形态冲突)。

---

## 3. 工具契约

### 3.1 FetchCorpus(executor 自定义工具,仿 BuildDeck)

executor 进程内(不进 jail)直连 minicod REST(复用 `MINICOD_API_KEY`/`MINICOD_API_BASE_URL`),结果直落 cwd JSONL,只回摘要给模型。

**per-source 抓取策略(修订:按 api-1.json 实测写实,采纳 issue#2)**:
- `graph(stc)`:`/v1/stc/papers/search/bulk`,limit≤100,**token 游标**翻页;
- `discovery(olx)`:**无 bulk**,走 `/v1/olx/works/search`,**offset 翻页**;
- `medicine(pmd)`:走 `/v1/pmd/papers/search`,**offset 翻页**(`/v1/pmd/papers/batch` 是按 ID 批量取详情,只用于单篇补录场景,不是搜索端点)。

`cursor.json` 结构兼容两种断点:`{source, mode:"token"|"offset", next_token?, next_offset?, fetched}`。

**参数 schema**:query / sources(对外别名数组,引擎内翻回)/ year_from/to / open_access / min_citations / venue / corpus_name / resume_token / `max_records: 2000`。

**规模契约(采纳 issue#9)**:2000 = **单次调用**上限;**项目累计上限 10000 条**(依据:sqlite 1 万行题录 ≈ 30–60MB 落盘、dedupe 分块在 1 万条量级 jail 内实测秒–分钟级、远低于 1.5G 内存帽;构建期跑 1 万条合成语料压测作为验收项)。超限不静默截断:FetchCorpus 返回 `truncated:true + cursor_saved:true`,skill 写死协议——命中数超限时**先建议收窄检索式,或按年份/来源分块成多个 corpus_name 抓全**,保证 PRISMA 检索方法学完整(不漏检),而非砍量。

**其余行为**:幂等 append(按 rec_id);整体超时 180s(自建 HTTP,不受 30s MCP 限);cwd 无 `.sysrev/` 即拒;`confinePath` 限定 `corpus/`;**`ws.go` permissionAllowed 必须显式加 `FetchCorpus` case(default-deny,漏加即 DOA——BuildDeck 踩过,PR 检查项)**;返回摘要 `{ok, corpus, total_fetched, per_source, new, sample:3条title, truncated, cursor_saved, cumulative}`。**Retraction Watch 标注从本工具移除**(初稿把 2000 条逐 DOI 打 Crossref 塞进 180s,跑不完,且新增未审计外网出口)→ 见 §3.4。

### 3.2 jail 内 Bash
引擎全部子命令走 jail 内 `python3 -m sysrev_engine`,断网可跑。`AllowBash=true`。

### 3.3 MCP 白名单
spec 自带 `AllowedMcpTools`,仅供小样本查准查全验证与单篇补录:`search_papers, get_paper, get_paper_by_doi, get_paper_authors, get_papers_batch, match_paper, group_works, search_snippets, get_related_works` + olx/pmd 对应 search/batch/doi 变体 + `get_journal`。**`search_papers_bulk` 不入白名单**——bulk 只准走 FetchCorpus,防模型自拉大结果集过上下文。

### 3.4 MarkRetractions(P1 独立 executor 工具,采纳 issue#7)
只对 **included 小集合(典型几十条)** 在线打 Crossref RW 标注,独立调用、独立超时,不与抓取耦合;**前置一条显式 egress 白名单评审项**(executor 现仅 minicod 一个出口,新增 Crossref 域名须过「egress 收紧/隔离优于截肢」加固评审,白名单落 executor 出口配置)。备选:构建期烧 RW 数据快照进镜像并在产物中明示快照时效。两条路都过不了评审就砍掉该功能,不降级绕行。

---

## 4. 状态机与项目持久化

### 4.1 真源分层(保留:本方案最硬骨架)
**`cwd/.sysrev/ledger.db`(sqlite)是唯一真源**,引擎独占读写;xlsx 永远是 `export-views` 从 db 重建的**只读视图**;`transitions` 追加式审计表永不删行,是 PRISMA/RAISE 审计的根。用户回传裁决 → 引擎解析回写 db → 再导出。

### 4.2 project.json 契约(阈值修订,采纳 issue#3)

```jsonc
{ "schema": 1, "feature": "sys_review", "version": 7,
  "pico": {...}, "inclusion": [...], "exclusion": [...], "year_range": [2015,2025],
  "sources": ["graph","discovery","medicine"], "search_strings": {...},
  "recall_target": 0.95,   // 有含义的量纲:停筛参考=估计召回达标;替换初稿量纲不通的 2.5
  "stage": "screening",    // scoping|fetched|deduped|screening|fulltext|extraction|meta|done
  "counts": {...}, "provenance": {...} }
```

### 4.3 ledger.db 表 schema(增全文阶段,采纳 issue#4)

```sql
CREATE TABLE records(rec_id TEXT PRIMARY KEY, doi, title, abstract, authors_json,
  year, venue, source, raw_source, dup_group_id, retracted INT DEFAULT 0);
CREATE TABLE ledger(rec_id TEXT PRIMARY KEY,
  status TEXT,  -- pending|ai_suggested_include|ai_suggested_exclude|user_included|user_excluded|conflict
                --  |ft_pending|ft_not_retrieved|ft_retrieved|ft_included|ft_excluded
  ai_suggestion TEXT, ai_reason TEXT, ai_confidence REAL, rank_score REAL,
  user_decision TEXT, user_reason TEXT, ft_exclude_reason TEXT,  -- 分类:人群不符/干预不符/结局缺失/研究类型/无法获取全文/...
  updated_at TEXT, decided_by TEXT);
CREATE TABLE transitions(id INTEGER PRIMARY KEY, rec_id, from_status, to_status, actor, reason, ts);
CREATE TABLE fulltexts(rec_id TEXT PRIMARY KEY, path, text_path, sha1, added_ts); -- cwd/fulltext/
CREATE TABLE extraction(rec_id, field, value, snippet, validated INT, is_nr INT);
```

### 4.4 状态迁移(修订:建议来源改走 LLM 批量回写;全文阶段补齐)

```
pending ──(screen-rank)──► 仅更新 rank_score(排序,不迁移状态)
pending ──(LLM 读 screen-batch 导出批 → ledger-suggest --actor ai)──► ai_suggested_include/exclude(记 ai_reason+confidence)
ai_suggested_* / pending ──(ledger-set --actor user)──► user_included / user_excluded(记 user_reason)
user_included ──(自动)──► ft_pending ──(ft-set)──► ft_retrieved | ft_not_retrieved
ft_retrieved ──(ft-set --actor user)──► ft_included | ft_excluded(必填 ft_exclude_reason 分类)
任何 ──(用户 override)──► transitions 追行,不覆盖历史
AI 建议与既有裁决冲突 ──► conflict(otto-SR 范式:人只看冲突行)
```

**拆层说清(回应 issue#3 的自洽性)**:①`screen-rank` 是确定性排序器,只省人力(先读哪批),产不出也不产建议/理由——冷启动用 PICO 文本相似度先验,零标签可跑,无死锁;②带纳排理由的 `ai_suggested_*` 只能来自 LLM 逐条读 abstract,这必然过上下文——**成本口径修正:「语料不过上下文」精确含义是"抓取/去重/统计阶段的原始万级语料不过上下文";初筛建议阶段 LLM 按 rank 顺序分批读题录是本 feature 最大 token 开销,如实计入 §7.3**,skill 写死分批协议(每批 40 条,单轮一批,24 轮内典型覆盖 600–960 条;更大语料分多轮对话或提高 rank 截断)。③**铁律保留并强化:排除态(user_excluded/ft_excluded 与 PRISMA 排除框计数)只能由 actor=user 产生,引擎在 ledger-suggest/ledger-set 层硬校验 actor 与目标态匹配,AI 永不能把记录推进任何 excluded 态**——线上审计指标恒为 0(§6.3)。

**PRISMA 2020 全文三框有数可填**:reports sought=ft_pending 累计;not retrieved=ft_not_retrieved;assessed for eligibility=ft_retrieved;excluded with reasons=ft_excluded 按 ft_exclude_reason 分类计数。全文来源(P1):30MB PDF 上传(方案 B 透传 sessionId,落 `cwd/fulltext/`,容器内 poppler/pdfparse 转文本入 fulltexts.text_path)+ executor OA 全文拉取(过 egress 评审后)。`extract-validate` **只对 ft_retrieved 及之后的记录开放**,snippet 溯源核对的对象就是 text_path 全文——提取从此有来源文档。**P0 未接全文时**:PRISMA 全文三框标注「不适用(0)——本阶段仅题录级筛选」,extraction/meta 仅接受用户自供提取表并在产物脚注明示,不默认糊过(§10 验收同步写死)。

### 4.5 会话重入与项目迁移(修订措辞,采纳 issue#6)

- **重进同一会话**(深链 `/claw/:sessionId` / 会话列表)恢复:引擎 `init` 幂等检测 cwd 已有 `.sysrev/` → 读 stage → skill 引导「已进行到 X 阶段,继续?」。**初稿「新会话检测到旧 .sysrev」不成立——新会话=新 cwd,永远检测不到**;「多天项目」的真实支撑就是同会话重入,前端在系统综述模板卡上明示「继续已有项目请从会话列表进入」。
- **跨会话迁移(P1)**:`export-project` 把 `.sysrev/`+`corpus/`+`fulltext/` 打包 `sysrev_project.tar.gz` 落 ./out 可下载;新会话上传该包 → `import-project` 校验 schema+sha1 后解入 cwd。0081 多会话给的是**并行多项目**,不是跨会话续作,两者在 UI 文案里分开说。
- **可重入**:dedupe/screen-rank/export-views/figures/meta 全幂等;改纳排标准 → version++ → 建议批可重跑,**user_* 裁决保留**;改检索式 → 新 corpus_name 增量并入,老裁决不丢;transitions 可回放(P1 `--revert-to`)。

---

## 5. skills 分层(skill 教「何时调引擎」,不教「怎么算」)

`agent-skills/sysreview-skills/`:
- **`search-strategy/`**:PICO→三源布尔式方言;先 MCP 小样本验查准查全,再 FetchCorpus;超限先收窄/分块抓全(§3.1);别名铁律。
- **`screening-ledger/`**(红线最重):dedupe→screen-rank→**分批建议协议**(`screen-batch --top 40` → 逐条读 → 写 suggestions.json → `ledger-suggest --actor ai`,每轮一批)→ 用户裁决通道(§7)→ `ledger-set`。写死实证话术:「AI 初筛以高召回为目标(灵敏度~90–97%,特异度中等——宁可多留绝不替你排除),每条排除必须你亲自裁决」。
- **`pico-extraction/`**:仅对有全文记录调 `extract-validate`;数值必须 snippet 溯源、拿不准填 NR;写死「提取数值仅供二审,~5% 可能编造,数值/结局字段更易错」。
- **`prisma-diagram/`**:调 prisma/forest/funnel/rob;数字必与 ledger.db 实数一致,skill 只解释。

**引擎 vs skill 分工铁律**:skill 里禁止出现任何算术/pandas/统计代码;凡涉及数字一律 `python3 -m sysrev_engine`。实证准确率话术表(筛选高召回低特异 / 提取 5% 造假率一律溯源 / RoB κ=0.16 不进 MVP 定论只起草 / 引用只来自 FetchCorpus 真实语料、LLM 编造率 6–60% 故永不生成 DOI)**原样保留并写进产品文案**。

---

## 6. 质量评测

### 6.1 golden fixture 三套(存放与生成流程修订,采纳 issue#8)

**fixture 一律放 repo `tests/sysrev-eval/`,仅 CI 消费,不进 agent-skills(该目录挂进生产镜像,放第三方数据集=随闭源产品分发)**:
- **去重回归**:ASySD 公开基准子集——**前置检查项:数据集 license 单独核实(其代码 GPL-3,数据许可另议);若数据不可再分发,则依其论文公开的重复模式合成等价 fixture 提交**。gate:灵敏度≥0.95 / 特异度≥0.99。
- **meta 统计回归**:5 个 fixture(SMD/OR/RR),**golden 值由一次性离线流程生成**——本地 `docker run r-base` 跑 metafor 脚本(脚本随 repo 提交留痕),把数值硬编码进 fixture JSON 提交;**CI 不依赖 R**。gate:合并效应量/CI/I²/τ² 误差 <0.01(P2 硬验收,保留)。
- **筛选复现**:1 篇已发表 SR 的纳排集 → 验「召回 95% 目标下需人工复筛比例」落在 otto-SR/Kim 区间,记录趋势不硬 gate。

### 6.2 双环境跑评
`tests/sysrev-eval/run_eval.py` 在 CI(镜像构建后 docker exec 挂载 fixture 跑)+ **jail 内**各跑一遍——**裸 docker exec 全绿≠jail 能跑**(保留),statsmodels/sklearn C 扩展与 vendored bib-dedupe 必须 jail 内验 import+真实计算+断网无网络调用。

### 6.3 线上抽样审计(保留全部四指标)
①transitions 中 actor=ai 进入任何 excluded 态的行数**恒为 0**(红线破防即告警);②extraction 的 is_nr 率/validated 率;③ai_provenance.json 缺失率;④FetchCorpus 落盘量 vs 上下文 token 比。走 usagestat + `grep agent_usage` + admin 会话监控抽 transcript。

---

## 7. 交互与交付物

### 7.1 会话流程
1. 模板卡进入 → AskUserQuestion #1(PICO/纳排/年限/源)→ `init`;2. 检索式生成 → AskUserQuestion #2 确认 → `search_strategy.md`;3. MCP 小样本验证 → FetchCorpus(多轮/多源/断点/超限分块);4. `dedupe`;5. `screen-rank` 排序 + 分批 `ledger-suggest`;6. `export-views` 出台账 xlsx(sheet:待裁决/AI建议纳/AI建议排/冲突);7. **用户裁决(通道见下)** → `ledger-set` → PRISMA 数字重出;8.(P1)全文上传 → ft-set → `extract-validate`;9. `prisma`(+P2 forest/funnel/rob);10. `provenance` → 成文移交 Prism(wl-lit-synthesis/pw-systematic-review 已就位)。

**裁决通道分级(采纳 issue#5,P0 不再闭假环)**:AskUserQuestion 是卡片选项交互,承载不了几百行逐条裁决。**P0 通道=chat 内批量指令**:用户用自然语言/区间语法裁决(「1–20 纳;21、25 排,理由 X」),LLM 翻译成 decisions.json → `ledger-set --actor user`(引擎校验每条 rec_id+理由必填),适用小语料;**P1 通道=xlsx 附件回传**(方案 B 透传 sessionId),适用真实规模 600+ 条。P0 验收因此**明写为「≤50 条演示级全流程」**(§10)。

### 7.2 ./out 产物
`search_strategy.md` / `screening_ledger.xlsx` / `extraction_table.xlsx` / `prisma_2020.svg` /(P2)`meta_forest.svg`+`funnel.svg`+`rob_traffic_light.svg` /(P1)`sysrev_project.tar.gz` / **`ai_provenance.json`(RAISE 最小充分集:工具/模型/版本/各阶段人机边界/recall_target/实测准确率引用)**。`corpus/*.jsonl`+`.sysrev/`+`fulltext/` 留 cwd 不收割。前端预览零新建(artifact-format.ts 全覆盖)。

### 7.3 token 成本(挂到真实路径,采纳 issue#3)
大头=初筛建议:600 条 × 摘要~250 token ≈ 15–20 万输入 + 建议输出~3 万;叠加检索式打磨/裁决翻译/提取二审/解释,单项目全流程 **50–120 万 token**(600 条档),与 boltslides 同档;万条级项目靠 rank 截断+多轮分摊。配额走既有链路:StandardHooks→vip 日额度(SS#2 有界透支)→`code=quota_exceeded`;免费档天然限在小语料试用。

---

## 8. 风险登记簿

**技术**:①vendor 的 bib-dedupe 依赖缺失/触发网络调用 → 构建期 import 冒烟 + jail 断网真跑去重(初稿「pip 双装 ABI」风险因改全 apt 已消除,反向不再引入);②FetchCorpus permissionAllowed 漏加 → ws.go 显式 case+PR 检查项;③0034 anchor 漏迁移撞 1062 → 照 0077 守卫式写 0081;④累计 1 万条内存/性能 → 构建期合成语料压测+sqlite 流式;⑤olx/pmd offset 深翻页上游截断 → cursor.json 双模式断点+分块检索兜底。
**合规**:⑥AI 推进 excluded → 引擎 actor 校验+审计指标①恒 0;⑦LLM 自产 DOI → rec_id 只源于 FetchCorpus 语料+溯源铁律;⑧RAISE 缺失 → 每会话固定产 ai_provenance.json;⑨数据源露真名 → §9;⑩RW 标注新增 egress → P1 独立工具+白名单评审前置,过不了就砍;⑪第三方数据集随镜像分发 → fixture 全部移出挂载路径+license 核查。
**质量**:⑫提取编造~5% → 强制溯源+NR+仅全文开放;⑬RoB κ=0.16 → 不进 MVP 定论;⑭meta 偏差 → golden <0.01 硬 gate。

---

## 9. 别名铁律(一票否决项,保留)

一切用户可见文本/文档/图(search_strategy.md、两张 xlsx、prisma_2020.svg 各框、森林图脚注、ai_provenance.json)中数据源只能叫 **Graph / Discovery / Medicine**,绝不出现 Semantic Scholar / OpenAlex / PubMed / stc / olx / pmd。`records.raw_source` 仅内部审计;**强制点落在引擎 `views`/`figures` 输出层统一映射,不指望提示词自觉**;四个 skill+system prompt 双保险。

---

## 10. 里程碑

**P0(3–4 天,五件套闭环+引擎 MVP,验收=演示级)**
文件清单:①`agent/sysrev-engine/`(store/dedupe/screen/views/figures(仅 prisma)/cli,~1800 行,meta 留 P2)+`vendor/bib-dedupe`;②registry.ts 加 FetchCorpus(per-source 三策略);③ws.go permissionAllowed case;④`internal/sysreview/{spec,handler,artifact}.go`+prompts;⑤4 个 SKILL;⑥迁移 0081/0082;⑦前端 session api+hook+ClawPage 配置+模板卡;⑧Dockerfile 层A(三 apt 包)+层B(vendor)+层C;⑨`tests/sysrev-eval/`(repo 内,CI 消费)。
**验收(明写边界,不闭假环)**:**≤50 条小语料演示级全流程**——检索式 md→三源落盘→去重→分批 AI 建议→**chat 批量指令裁决**→台账 xlsx→PRISMA svg(**全文三框标「不适用」并脚注说明**);跨 feature 404;配额拦截;多会话/深链/断线续流与 sci_draw 一致;去重 golden 回归通过;jail 断网冒烟绿;别名零泄漏;**excluded 态只由 user 产生(审计指标=0)**。

**P1(1 周,真实规模+全文阶段)**:xlsx 回传裁决+RIS/CSV 导入(方案 B 透传 sessionId);**30MB PDF 上传→fulltext 阶段(ft-set/三框有数)+extract-validate 开放**;MarkRetractions(egress 白名单评审前置);`export-project`/`import-project` 跨会话迁移包;library/暂存区联动;`--revert-to`;停筛规则入 provenance。验收:600 条级回传台账后 PRISMA 数字正确重算;全文三框实数呈现。

**P2(meta 统计)**:meta.py+森林/漏斗/RoB traffic-light。验收:meta golden 与 metafor 硬编码 golden 值误差<0.01 全绿;**meta 数字只来自有全文记录的提取表或用户自供提取表(脚注明示来源),禁编造**;RoB 只起草不定论。

---

## 关键落地文件索引(已读码核实)
- 集成范式:`backend/internal/scidraw/spec.go`(151 行逐字仿)、`backend/internal/claw/spec.go`
- 自定义工具:`agent/src/tools/registry.ts` L723-831(BuildDeck)、`ctx.workDir`+`confinePath`
- 权限墙:`backend/internal/agentbridge/ws.go` L282-353(permissionAllowed 必加 FetchCorpus)
- MCP 白名单参照:`backend/internal/smartsearch/spec.go` L137-153
- minicod REST 真源:`api-1.json` —— `/v1/stc/papers/search/bulk`(token 游标,limit≤100)、`/v1/olx/works/search`(offset)、`/v1/pmd/papers/search`(offset)、`/v1/pmd/papers/batch`(仅按 ID 补录);executor env 见 minicodClient.ts L64-65
- 镜像:`agent/Dockerfile`(pandoc vendor 先例 L70-76、拆层防 OOM)
- 前端预览:`frontend-user/src/features/claw/components/preview/artifact-format.ts`
- SVG 蓝本:`agent-skills/sci-draw-skills/charts`
