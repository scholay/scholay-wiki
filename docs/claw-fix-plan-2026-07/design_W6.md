# W6 检索质量与披露 · 文件级落地方案

## 0. 拍板:清洗落在哪一层

**结论:双缝各落一刀,不二选一。**

- **agent MCP 层必须有自己的清洗**(P0):backend 完全不在链路 B 上(manager.go:154-156 注释明说 MCP 用量后端看不到),只改 backend 对审计中"单条 abstract 6.7 万字符直接打崩一轮"(发生在 agent 会话)**零效果**。落点选 `agent/src/mcp/minicodClient.ts:136` return 前 —— 76 个 minicod 工具的唯一咽喉、自有代码,不碰 node_modules(三方包 dist 改了升级即丢)。
- **backend client 层也必须清洗**(P0):链路 A 的 spam 会先进 Redis 缓存(manager.go:281)被放大、并全量落 hot_papers 表(handler.go:174-177),还喂给 SEO/文献集。落点选 `backend/internal/minicod/models.go ConvertPaper(:413)/ConvertPapers(:537)` —— search/batch/citations/references/recommendations 全部转换在此收口,且**先于缓存写入**。
- 不落在 MCP server(`@minicod/mcp-server` dist):升级丢补丁,且它 `JSON.stringify(data,null,2)` 全量回填是既定事实,拦在我们自己的下一跳即可。

两处共享同一套阈值语义(常量各自声明,注释互相指认),per-item 上限不同:agent 侧为省上下文取 2000 字符,backend 侧为不伤 SEO/详情页取 5000。

---

## P0(合计 ~11h,建议一次上线)

### P0-1 agent 侧 MCP 结果 sanitizer(~4h)

**新文件** `agent/src/mcp/sanitizeMinicod.ts`;**接线点** `agent/src/mcp/minicodClient.ts:136`。

```ts
// sanitizeMinicod.ts —— 唯一咽喉:所有 mcp__minicod__* 成功结果先过此清洗再回喂模型/前端
const SEARCH_ABSTRACT_CAP = 2000;   // items[] 里的每篇
const SINGLE_ABSTRACT_CAP = 8000;   // get_paper/get_paper_by_doi 单篇详情
const FIELD_CAPS = { bibtex: 2000, tldr: 1000, title: 400 };
const TOTAL_CAP = 50_000;           // 与 built-in Bash 60k(registry.ts:321)同数量级
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E]/g;
const CJK_RE = /[\u4e00-\u9fff]/;

export function sanitizeMinicodResult(toolName: string, args: Record<string, unknown>, content: unknown): unknown {
  // content = [{type:"text", text:"<pretty json>"}];找首个 text 块 JSON.parse,失败则原样返回(不碰非 JSON)
  const data = tryParseFirstTextBlock(content); if (!data) return content;
  const meta = { spam_dropped: 0, truncated: 0, dropped_for_size: 0 } as any;

  for (const paper of iterPaperObjects(data)) {   // 认 items[] / recommended_papers[] / data[] / 顶层单篇
    stripCtrlAndTags(paper);                       // title/abstract/tldr 去控制符+HTML/JATS 标签
    if (isSpamTitle(paper.title)) { markDrop(paper); meta.spam_dropped++; continue; }
    clampFields(paper, isSearchShape(data) ? SEARCH_ABSTRACT_CAP : SINGLE_ABSTRACT_CAP, FIELD_CAPS, meta);
    // 截断的 abstract 尾部拼 "…[truncated,需全文摘要请用 get_paper 单篇获取]"
  }
  removeMarked(data);
  // 相关性标注(机械):args.query 为英文且 >=2 个有效词时,标题+摘要零重叠的条目 id 记入
  const lowRel = zeroOverlapIds(String(args.query ?? ""), data);
  if (lowRel.length) meta.low_relevance_ids = lowRel;
  // 中文覆盖披露(机械,直怼 P1-14 虚构 CNKI):query 含 CJK 即注入
  if (CJK_RE.test(String(args.query ?? ""))) {
    meta.coverage_note = "平台检索源为 Semantic Scholar / OpenAlex / PubMed(国际英文库),不含知网 CNKI / 万方 / 维普等中文数据库,中文文献覆盖有限。回复中必须向用户转述此限制并建议其自行在知网/万方补充检索;严禁声称已检索任何中文数据库。";
  }
  data._sanitizer = meta;                          // 只加顶层键,不动 items 元素形状
  let text = JSON.stringify(data);                 // 紧凑序列化(原 pretty 2 空格,顺带省 ~30% token)
  while (text.length > TOTAL_CAP && dropLastItem(data)) { meta.dropped_for_size++; text = JSON.stringify(data); }
  return [{ type: "text", text }];
}
```

`isSpamTitle`:title 长度>400、或控制/bidi/零宽字符计数>5、或(长度>40 且非字母数字非 CJK 字符占比>0.5)→ 判 spam 整条剔除;阈值刻意保守,宁漏勿错杀。

**接线**(minicodClient.ts:136 一行改):

```ts
const res = await Promise.race([call, timeout]);
consecutiveFailures = 0; circuitOpenUntil = 0;
if (res.isError === true) return { content: res.content ?? [], isError: true };
return { content: sanitizeMinicodResult(name, args, res.content ?? []), isError: false };
```

**为什么解决问题**:runOne(runTools.ts:62-66)拿到的已是清洗后内容,同时进模型上下文(turnLoop.ts:353-354)和 WS tool_result 帧(runTools.ts:80)→ 6.7 万字符 abstract 无法再进上下文打崩一轮(审计"spam 论文打崩一轮"),WS 帧与 turn_events 持久化同步瘦身;coverage_note 是**与工具结果同帧的机械事实**,模型在最想编造的那一刻读到的就是权威否认,比纯 prompt 可靠(直怼 2d853f50 虚构"CNKI 检索统计")。四 feature(smart_search/claw/prism/peerreview)统一受益,无需各自改。

**验证**:
1. 新增 `agent/src/mcp/sanitizeMinicod.test.ts`(bun test):70k 字符 abstract fixture → 输出 ≤ caps 且带 truncated 标;乱码 title fixture → spam_dropped=1;中文 query → coverage_note 在场;总量 60k fixture → dropped_for_size>0。
2. 兼容性回归:grep `parsePapersFromToolResult`(shared,claw 论文卡片解析),确认其 JSON.parse 对紧凑序列化+顶层新键容忍;跑其现有测试。
3. `docker compose build agent && docker-compose up -d agent`,真实发一次智能搜索,确认卡片正常渲染、tool_result 帧体积下降。

**风险与回滚**:JSON 形状识别不全 → 兜底"parse 失败/不认识的形状原样返回",最坏退化为现状;前端卡片解析若依赖 pretty 格式(不太可能,JSON.parse 无关格式)→ 回滚只需删掉接线一行。

### P0-2 中文覆盖披露机械注入(含在 P0-1 内,~1h)

即上面 coverage_note 逻辑,单列出来是因为它对应独立审计项(P1-14 虚构 CNKI)。注意:仅按 `args.query` 含 CJK 触发,prism/peerreview 极少中文检索,误注入无害(note 本身是事实)。

### P0-3 backend ConvertPaper 字段清洗 + spam 剔除(~3h)

**文件** `backend/internal/minicod/models.go`(已 import regexp/strings)。

```go
const (
    abstractCapRunes = 5000  // 正常 abstract <3k;5000 只拦 spam,不伤 SEO/详情页
    titleCapRunes    = 400
)
var (
    ctrlRe = regexp.MustCompile("[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E]")
    tagRe  = regexp.MustCompile(`</?[a-zA-Z][a-zA-Z0-9:_-]*(\s[^<>]*)?/?>`) // JATS/HTML;"a < b" 有空格不会命中
)
func sanitizeText(s string, cap int) string {
    s = ctrlRe.ReplaceAllString(s, "")
    s = tagRe.ReplaceAllString(s, " ")
    if r := []rune(s); len(r) > cap { return string(r[:cap]) + "…" }
    return strings.TrimSpace(s)
}
func isSpamPaper(p *Paper) bool { // 与 agent 侧同语义
    t := []rune(p.Title)
    if len(t) == 0 || len(t) > titleCapRunes { return true }
    // 控制符已被洗掉;再查非字母数字非CJK占比
    ...
}
```

- `ConvertPaper`(:413,赋值处):`Title: sanitizeText(raw.Title, titleCapRunes)`、`Abstract: sanitizeText(raw.Abstract, abstractCapRunes)`,Tldr/Bibtex 同理(Tldr 1000 / Bibtex 2000)。
- `ConvertPapers`(:537):循环内 convert 后 `if isSpamPaper(&p) { continue }`(空标题/超长标题/乱码占比超标剔除)。`ConvertPapersToCitations`(:555)同样过一遍。

**为什么解决问题**:此缝先于 manager.go:281 的 Redis 写入 → spam 不再被缓存放大;handler.go:174-177 落 hot_papers 的 abstract 也是清洗后的;搜索页/文献集/SEO enrich 全覆盖(seoenrich 同走此 client)。

**验证**:新增 `backend/internal/minicod/sanitize_test.go`:67k abstract fixture → ≤5000 runes;JATS 标签 fixture → 被剥;乱码 title → ConvertPapers 输出少一条。`cd backend && go test ./internal/minicod/ && docker compose build backend`。上线后 `curl /api/v1/scholar/papers/search` 抽查 abstract 长度。

**风险与回滚**:tagRe 误伤含尖括号的数学表达(已用"标签名开头+可选属性"约束,`P < 0.05` 不命中);cap 截断合法超长摘要 → 尾部"…"可辨识,cap 可调常量。回滚=去掉 sanitizeText 调用两行。旧 Redis 缓存里的脏数据随 TTL 自然滚出,不必 FLUSHALL。

### P0-4 prompt/skill:真实命名 + CNKI 披露 + 相关性核对 + 清掉陈旧截断契约(~3h)

**a) `backend/internal/prompts/smart_search.go`**

- **整段替换 :26-40(数据源品牌名映射+输出纪律)** 为:

```
# 数据源 — 对用户使用真实名称
平台聚合三个真实学术数据源,调用工具时 source 参数从工具 schema 的 enum 取值:
- semantic → **Semantic Scholar**(引文网络最完整;计算机/工程/通用学科)
- openalex → **OpenAlex**(元数据最全、约 2.5 亿条;跨学科兜底)
- pubmed  → **PubMed**(生物医学专属)
向用户说明检索来源时,直接使用 Semantic Scholar / OpenAlex / PubMed 这三个真实名称;
不得杜撰别名、代号或"内部库"等含混说法。

**覆盖边界(必须诚实,违反 = 当前回复作废)**:
- 平台**没有接入知网 CNKI / 万方 / 维普等任何中文数据库**。凡用户查询涉及中文文献、国内期刊
  或本土题材(国内政策/地区数据/中文学位论文等),必须在回复中主动声明:
  「本平台检索源为 Semantic Scholar / OpenAlex / PubMed,不含知网、万方等中文数据库,
  中文文献覆盖有限,建议自行前往知网/万方补充检索」。
- **绝对禁止**声称"已在知网/万方/维普检索"、给出任何"CNKI 检索统计",或暗示覆盖了中文库。
- 某个源返回空集或报错时,如实说"该源未返回结果/暂不可用",不得假装已覆盖。
- 工具结果里的 _sanitizer.coverage_note / sources_queried 是平台事实,必须据实转述,不得忽略。
```

- :49、:51、:77、:79 四处 `Graph/Discovery/Medicine` 字样改为 `Semantic Scholar/OpenAlex/PubMed`。
- **:44 与 :95-96(G 条)的"Output too large saved to file"契约整体删除**(防的是不存在的机制,调研已证实执行器无落盘),替换为:

```
   输出过大时执行器会自动截断(单篇摘要约 2000 字,整体约 50KB)并在 _sanitizer 里标注。
   截断不影响元数据可靠性;需要完整摘要时用 get_paper 单篇获取。不存在"保存到文件",
   不要尝试读取任何文件找完整输出。
```

- **检索行为契约新增第 8 条(相关性)**:

```
8. **引用前核对相关性**:上游按关键词匹配排序,可能把完全无关的论文排在最前(排序噪声)。
   凡要写进回复的论文,先自查标题/摘要与用户主题是否确实相关;明显无关的条目直接剔除、
   不计入"找到 N 篇"、更不得排在推荐首位。工具结果 _sanitizer.low_relevance_ids 列出的条目
   须重点复核。剔除后结果不足就如实说不足,不要硬凑。
```

**b) `backend/internal/prompts/claw.go`**

- **整段替换 :46-54** 为 smart_search 同款"真实名称+覆盖边界"文本(可精简,但 CNKI 禁令与主动披露两句必须全文保留)。
- :61 的"Output too large 落盘"条款同样替换为截断真相版。
- 检索行为契约(:56-61)追加与 smart_search 第 8 条相同的相关性条款。

**c) skill 清扫**(agent-skills/ 是唯一生效源):
- `agent-skills/claw-add/guides/citation-audit/SKILL.md:66`:`(Graph / Discovery / Medicine)` → `(Semantic Scholar / OpenAlex / PubMed)`。
- `agent-skills/smart-search-skills/minicod-search-strategy/SKILL.md:49`:同上;并在该 SKILL 的"放宽策略"后补一行:「中文题材命中差是覆盖问题(无 CNKI/万方),不是检索技巧问题——转英文术语检索并向用户披露覆盖限制,不要无限重试。」

**为什么 prompt 层在此够用/为何必须配代码层**:命名与披露是**表述纪律**,只能 prompt 管;但"禁止虚构 CNKI"单靠 prompt 在 flash 上已被证明不可靠(P1-8:flash 对否定式规则免疫),所以 P0-2 的 coverage_note 机械注入是主防线,prompt 是配套话术模板(正面模板对 flash 更有效,与 ASCII 字符画教训一致)。撤掉品牌名映射还顺带删掉了一整层"模型认知(真名)↔输出纪律(假名)"的张力——审计里语言漂移/协议泄漏轮次一旦纪律失效,吐出来的就是 enum 字面值,真名化后这一泄漏面直接消失。

**验证**:`docker compose build backend && docker-compose up -d backend && docker-compose restart scholar_agent`(prompt 是 Go const,存量会话需 agent 重启后 seed_history 重灌);对话实测:①问"你查了哪些数据库"→ 期望真名;②搜"贵州省乡村振兴 文献"→ 期望回复含 CNKI 缺失披露;③`grep -rn "Graph\|Discovery\|Medicine" backend/internal/prompts agent-skills/` 归零(Medicine 注意排除 "Nature Medicine" 类误报)。

**风险与回滚**:真名暴露上游供应商——这正是本项需求(审计判定假名+虚构检索是诚信债);回滚=git revert 两个 Go 文件+两个 SKILL.md。

---

## P1(合计 ~8.5h)

### P1-5 链路 A sources_queried/实际源透明化(~2.5h)

- `backend/internal/minicod/models.go:216-222` `SearchResponse` 加字段:
```go
SourcesQueried []string `json:"sourcesQueried,omitempty"` // 上游本次实际查询的库
ActualSource   string   `json:"actualSource,omitempty"`   // 命中的 minicod 源 stc/olx/pmd
```
- `backend/internal/minicod/client.go:310-314` 构造处补 `SourcesQueried: raw.SourcesQueried, ActualSource: opts.Source`(此前 raw.SourcesQueried 解析后直接丢弃)。
- `backend/internal/minicod/handler.go:316-327` 循环里记 `tried/failed []string`;`SearchPapersResponse`(:240-247)加 `SourcesTried/SourcesFailed []string json:"...,omitempty"`,`SearchStrategy` 保持 "original" 不动(纯增量,前端零改动兼容)。

**验证**:curl 搜索,响应含 actualSource;停掉某源 key 强制 failover,sourcesFailed 非空。缓存自洽:cache key 含 source(manager.go:278),新字段随 value 走;旧缓存条目缺字段=omitempty 缺省,TTL 自愈。**回滚**:字段皆 omitempty,revert 即无痕。

### P1-6 链路 A 空集 auto 模式自动换源(~1.5h)

`backend/internal/minicod/handler.go:318-327`:当前 `err==nil` 即 break,total=0 的空集被当成功(调研 §2"空集不降级")。改:

```go
var firstEmpty *SearchResponse
for i, src := range order {
    o := opts; o.Source = src
    result, err = h.manager.SearchPapers(ctx, o)
    if err == nil {
        if result != nil && result.Total == 0 && len(order) > 1 && i < len(order)-1 {
            if firstEmpty == nil { firstEmpty = result }
            slog.Debug("minicod search: empty result, trying next source", "source", src)
            continue // 仅 auto 模式(order>1)空集续查下一源
        }
        break
    }
    ...
}
if err == nil && result != nil && result.Total == 0 && firstEmpty != nil { result = firstEmpty }
```

**为什么**:直接消掉"semantic 空集静默降级"里最机械的一半——空集不再终结检索。成本:真无结果的 query 从 1 次上游变 3 次,但空集响应便宜且各自进缓存,量级可接受。**验证**:搜乱串 "zzqxxv1234",debug 日志出现两次 trying next source,响应 sourcesTried 长度 3。**回滚**:删 continue 分支还原。

### P1-7 链路 A 零重叠降权(~2.5h)

`backend/internal/minicod/handler.go`,`annotateFavorites` 之后加纯重排(不进缓存、不删条目、不改 schema):

```go
func sinkZeroOverlap(query string, papers []Paper) {
    terms := significantTerms(query) // 小写、\W+ 分词、去停用词、len>=3
    if len(terms) < 2 || containsCJK(query) { return } // 中文query对英文标题必零重叠,直接豁免防误杀
    sort.SliceStable(papers, func(i, j int) bool {
        return overlaps(papers[i], terms) && !overlaps(papers[j], terms) // 零重叠沉底,稳定排序保上游序
    })
}
```

**为什么**:文莱论文登顶属上游排序噪声,零重叠沉底是最保守的确定性缓解——不判"相关",只判"连一个查询词都不含的不配排前面";链路 B 的对应措施是 P0-1 的 low_relevance_ids 标注 + P0-4 的相关性条款(agent 侧 query 常为模型改写后的英文词,机械重排交给标注+模型裁决,避免在 76 个工具形状上做复杂重排)。**验证**:go test 构造 fixture(1 条零重叠+3 条命中)断言沉底;线上搜已知复现 query 观察文莱论文位次。**风险**:极端 query(全停用词)已被 len<2 豁免;**回滚**:删一处调用。

### P1-8 前端真实命名对齐(~2h)

- `frontend-user/src/shared/lib/data-source-brand.ts`:`SourceBrand` 联合类型与映射改为 `'Semantic Scholar' | 'OpenAlex' | 'PubMed' | 'Journal'`(normalizeSourceBrand 的 case 分支保留旧假名字符串作输入兼容,输出改真名);文件头注释同步改写。
- `grep -rn "'Graph'\|\"Graph\"\|Discovery\|Medicine" frontend-user/src` 清扫直接字面量消费点(MinicodToolMeta.tsx / search-filters.ts / source.ts 等)。
- 验证:`cd frontend-user && npx tsc -b && npx vite build`(铁律),UI 抽查论文卡 meta 行与工具气泡显示真名。
- 回滚:单文件 revert。

---

## 对 smart_search 共用链路的影响评估(拍板依据)

1. **P0-1 sanitizer 对四个 feature 统一生效**(smart_search/claw/prism/peerreview 都经 runTools→callMcpTool)——这是期望行为:审计的 spam 崩轮、CNKI 虚构分布在多 feature;peerreview 的引用核查同样吃到 caps 与 low_relevance_ids。coverage_note 仅按 query 含 CJK 触发,对 prism/peerreview 的英文检索零扰动。
2. **P0-3 影响 REST 搜索页、文献集 resolve、SEO enrich、hot_papers**——清洗是纯收敛(去乱码/截 spam),5000 cap 对正常论文零影响;seoenrich 走同一 client 拿到的是干净数据,反而修掉 SEO 页潜在乱码。
3. **Redis**:清洗只改 value 内容不改 key,新旧混存无冲突,自然 TTL 滚出;不建议 FLUSHALL。
4. **prompt 改动**:smart_search.go 与 claw.go 分属两 feature 的 Picker,互不影响;两处必须同步改(审计的 CNKI 虚构发生在 claw,文莱登顶在 smart_search)。
5. **部署顺序**:P0-3/P0-4 backend 一起 `docker compose build backend`;P0-1 `docker compose build agent`;最后 `docker-compose restart scholar_agent` 一次性让 prompt+skill+sanitizer 对存量会话生效。

## 关键文件清单

- agent/src/mcp/sanitizeMinicod.ts(新)、agent/src/mcp/minicodClient.ts(:136 接线)
- backend/internal/minicod/models.go(:216 SearchResponse、:413 ConvertPaper、:537 ConvertPapers)
- backend/internal/minicod/client.go(:310-314)、backend/internal/minicod/handler.go(:240-247、:316-327、annotateFavorites 后)
- backend/internal/prompts/smart_search.go(:26-40 整段、:44、:49、:51、:77、:79、:95-96、契约新增第 8 条)
- backend/internal/prompts/claw.go(:46-54 整段、:56-61、:61)
- agent-skills/claw-add/guides/citation-audit/SKILL.md:66、agent-skills/smart-search-skills/minicod-search-strategy/SKILL.md:49
- frontend-user/src/shared/lib/data-source-brand.ts 及字面量消费点