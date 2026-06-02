# 智能审稿重构设计:审稿人-as-skills + agent 选 3 个

> 状态:**设计已定,可实现**(2026-06-01)。本文已折入红队修正。
>
> ## ✅ 已定决策(2026-06-01)—— 大幅简化了下面的设计
>
> 用户拍板:**① v1 固定 3 个审稿人;② 审稿人人格纯文件/工程师管(无 admin 编辑,彻底离开 DB);③ 前端沿用现在的「审稿人 A/B/C」匿名 UI。**
>
> 这三条把 §8/§9/§10 的"动态 slug + 前端 roster 重写"**大部分作废**,简化为:
> - **role 仍是 `alpha`/`beta`/`gamma`/`chief`(= 固定 3 槽位),不改、不加宽**(§8 的 varchar(8)→64 作废)。选中的 3 个审稿人按选择顺序映射到 alpha/beta/gamma 槽。
> - **审稿人真实身份(slug/name/domain)只内部用**(选哪个 persona、审计);前端**继续显示 A/B/C 匿名**,**§9 的 8 文件前端重写基本作废**(broker slot 仍 `reviewer:alpha/beta/gamma`、chief join 仍按 alpha/beta/gamma、`items.length<4` 仍成立、StatusGrid/tabs 不动)。可选:加 `reviewer_slug`/`reviewer_name` 列仅作审计,不上 DTO。
> - **chief join key 不变**(仍 alpha/beta/gamma),§7 的"改成 slug"作废。
> - **persona 来源 = SKILL.md 文件**(纯文件管)。**后端怎么拿到**:backend 容器**只读 bind-mount** agent 的 skills 目录(`./agent/data/claude/skills` → 如 `/app/reviewer-skills`,env `PEERREVIEW_SKILLS_DIR`),按 slug 读 `<slug>/SKILL.md` 抽 `<<<SCORING_PERSONA>>>` 段注入评分轮 —— 单一真相源仍是那个 SKILL.md 文件,符合"审稿人=skill 放 agent"。
>
> **据此 v1 最小实现序列**:(a) 修 `UpsertReport` OnConflict(独立先做);(b) skill 库:`reviewer-roster` + 5-6 个 `rv-*`(含 sentinel「评分人格」段)+ CI lint;(c) docker-compose 给 backend 只读挂 skills 目录;(d) 后端:选择轮(折入方法论会话,返回 3×`{slug,why_chosen}`)+ 最后-fenced-json 解析 + 按 slug 读 SKILL.md 抽 persona + 内置 const 3 兜底 + 映射 alpha/beta/gamma 槽注入评分轮 + 删 4 个 PersonaRandomPicker;(e) 可选 additive 迁移加审计列;(f) flag 永久开后 strand feature_prompts peerreview 行。**前端基本不动。**
>
> ---
>
> *(以下为完整设计;凡涉及"动态 slug / 前端 roster 重写 / role 加宽 / chief 改 slug join"的部分按上面决策作废,仅保留作"将来想放开可变 N / 暴露身份"的参考。)*

## 1. 背景与目标

**用户设想**:每个审稿人 = 一个 skill(可由若干 skills 组成);审稿人可以有几十个;最外层一个「花名册/编排 skill」记录每个审稿人的侧重点/领域;**agent 读这篇论文,自己挑出最匹配的 3 个审稿人**,再审稿。

**要废掉的现状**:当前 reviewer 选择是后端 Go 的 `PersonaRandomPicker`(按 `applicable_subjects` 学科匹配 + 加权随机)从 `feature_prompts` 表的 20 行 persona 里挑——用户判定这套「原本就是有问题的」。目标是把「挑审稿人」从后端代码挪进 agent,`feature_prompts` 的 peerreview persona 行随之 strand。

## 2. 核心约束与关键纠正(红队校正)

- **评分轮必须 Skill/Agent/Task 关闭**(`scoringSessionDeny`,service.go:1439)。这点不变。
- **纠正一个被夸大的说法**:评分轮**并非**"完全无工具narration"。`buildCommonContext`(service.go:1691-1718)本来就给审稿人投放了 `mcp__minicod__*` 检索工具广告,MCP 工具**不在** `scoringSessionDeny` 里——所以评分轮今天就有工具 narration,JSON 之所以能活,靠的是 `extractFirstJSONObject` + `chatWithRetry`(2 次重试)+ `repairUnescapedInnerQuotes`。本重构**既不增也不减**这层风险。
- **真正的新风险**:如果把 reviewer SKILL.md 正文(里面写着"引用核查就 invoke citation-audit")**原样注入**到 Skill-禁用 的评分轮,模型被指示去调一个被禁的 skill → 产生"权限拒绝/我无法使用该 skill"的 narration → 落进 SSE 缓冲、抬高冲碎 JSON 概率。**这正是要防的回归。**
- **据此的硬规则**:注入评分轮的 persona 文本**必须是"评分安全"版本**——零 skill/Task/Agent/invoke 字样。见 §4、§6。

## 3. 架构总览

```
① 选择轮(Skill 开,复用现有方法论会话,临时会话用完即删)
   agent 读论文 + 读 reviewer-roster 编排 skill → Glob 花名册 → 选【恰好 3 个】审稿人
   → 自由文本方法论(照旧注入)
   → 末尾一个 fenced ```json 块,只含 {slug, why_chosen}(不含 persona 正文!)

② 后端解析选择 JSON(用专门的"最后一个 fenced json"解析器,不是 extractFirstJSONObject)
   → dedupe + 校验恰好 3 个存在的 slug,否则整组退化到内置 3 persona 兜底
   → 后端**按 slug 读 SKILL.md 磁盘正文**,抽出其中"## 评分人格"段(评分安全段)

③ 评分轮(Skill 关,×3,机制不变)
   每轮注入后端读出的"评分安全 persona 段" + commonContext + 严格 JSON 尾
   → agent 出结构化 JSON(parseReviewerJSON / chatWithRetry 不变)

④ 主审轮(Skill 关,机制不变)
   注入 3 份 reviewer JSON 摘要 + 内置 chief 人格;chief 的 reviewer_responses[].reviewer 用 slug 作 join key
```

**关键设计选择(红队定调)**:选择轮**只返回 {slug, why_chosen}**,persona 正文由**后端按 slug 读 SKILL.md** 注入——不让 agent 在 JSON 里回显几千字 persona(避免转述/截断失真 + 大括号/引号冲突 + 选择 payload 臃肿)。

## 4. Skill 库设计

**一个审稿人 = 一个 SKILL.md**,与现有三个并列在 `agent/data/claude/skills/`(bind-mount,加审稿人=宿主机放个文件夹,无需重建镜像;**生产若不 bind-mount 需在 agent/Dockerfile COPY**——见开放决策)。

```
agent/data/claude/skills/
  reviewer-roster/SKILL.md     # 编排 skill:读论文 + Glob 花名册 + 选 3 个
  rv-methodologist/SKILL.md    # 审稿人画像 1(方法学/统计/实验严谨)
  rv-novelty-scout/SKILL.md    # 审稿人画像 2(创新性/相关工作覆盖)
  rv-clinical/SKILL.md         # 审稿人画像 3(生物医学/临床)
  ...(v1 建议 5-6 个,不要一上来"几十个",见开放决策)...
  paper-review/ journal-fit/ citation-audit/   # 现有通用 skill,保留,选择轮可用
```

**每个 rv-*/SKILL.md 必须分两段**(红队 blocker 修正):
- **frontmatter + 选择期画像**:`domain` / `fit_subjects` 等元信息 + 该审稿人擅长什么 —— 供选择轮 Skill-开 阶段排序用,**可以**提到 "可调 citation-audit 核查引用"。
- **`## 评分人格`(评分安全段)**:用 `<<<SCORING_PERSONA>>> ... <<<END>>>` sentinel 包裹的纯人格/评分维度/红线文本,**零** skill/invoke/Task/Agent 字样。**只有这一段会被注入评分轮。**
- **CI lint**:校验 sentinel 段内不含 `skill`/`invoke`/`Task`/`Agent`/`subagent` 这些词,防止"被禁工具 narration"泄漏。

`reviewer-roster/SKILL.md` body 指挥 agent:Read 稿件 → Glob `~/.claude/skills/rv-*/SKILL.md` 读 frontmatter(`domain`/`fit_subjects`)排序(**只读 frontmatter,不读全文**以控延迟)→ 选 3 → 输出自由文本方法论 + 末尾 fenced json `{reviewers:[{slug, why_chosen}]}`。

## 5. 选择轮(折入现有方法论会话)

复用 `runMethodologyPhase`(service.go:439-479):已是 Skill-开 临时会话、已 push 稿件、已流到 `SlotMethodology`(前端已能实时显示)。扩展 `buildMethodologyPrompt`:让它额外 invoke `reviewer-roster`、选 3、末尾出选择 JSON。

**选择 JSON 契约**(方法论 reply 的**最后一个** fenced ```json 块):
```json
{ "reviewers": [
  {"slug":"rv-methodologist","why_chosen":"实验型 ML 论文缺 ablation,需方法学严审"},
  {"slug":"rv-novelty-scout","why_chosen":"..."},
  {"slug":"rv-clinical","why_chosen":"..."}
]}
```
**解析(红队 blocker 修正)**:**新增专门解析器**取 reply 中**最后一个** ` ```json ``` ` 块(或 sentinel `<<<SELECTION_JSON>>>`)。**绝不复用** `extractFirstJSONObject`(它取第一个 `{`,会被自由文本里的花括号坑掉,导致选择常态误判 → 兜底常驻 → 整个功能形同虚设却看着像在跑)。`extractFirstJSONObject` 保持给评分轮用,不动。

**选择失败兜底(红队 major 修正)**:任一失败(JSON 缺失/不足 3/重复 slug/slug 不存在)→ 整组退化到**内置 3 个 const persona**(见 §6 兜底源)。dedupe slug;校验"恰好 3 个不同的、agent FS 上存在的 slug",否则整组替换。**绝不让坏 slug 进 UpsertReport。**

## 6. 评分轮(crux)

机制**不变**(`ServerSideChatStreaming` + `scoringSessionDeny` + `parseReviewerJSON` + `chatWithRetry`)。唯一变化:persona 文本来源从 `feature_prompts` DB 行(`choice.SystemPrompt`)换成**后端按 slug 读 SKILL.md 抽出的 `<<<SCORING_PERSONA>>>` 段**。

- `buildReviewerPromptFromChoice`(service.go:1730-1747)改:注入 `ReviewerChoice.Persona`(= 后端读出的评分安全段)+ `【审稿身份】<name>·<domain>` 头(替掉 A/B/C label)+ commonContext + 现有严格 JSON 尾。
- **真正的不变式**(诚实表述):评分轮 Skill/Agent/Task 仍关;MCP narration 本就被 extract+retry 容忍;**注入的 persona 段经 sentinel + lint 保证零 skill-invoke 语言**,所以不会新增"被禁工具 narration"。
- **兜底源(必须随本期一起 ship)**:在 `internal/peerreview` 放 3 个 const 内置 persona(或 3 个不可选的默认 SKILL.md),独立于被删的 pickers——这样"flag 关"和"选择失败"都有真实人格源,不会空。

## 7. 主审轮

机制不变(Skill 关、严格 JSON)。`buildChiefPromptFromChoice`(service.go:1751-1784)把硬编码的 `["alpha","beta","gamma"]`(service.go:1763)改成遍历 3 个动态 `ReviewerChoice`,按 name/slug 标注。**契约变更**:chief 的 `reviewer_responses[].reviewer` 必须填**稳定 slug**(不是"审稿人 A"),前端按 slug join(`ChiefVerdictPanel.tsx:515-523`),并保留 `审稿人 A/B/C`→letter 的 legacy 回退给老报告。chief 人格用**内置 const**(chief 是结构性角色,不参与花名册挑选)。

## 8. 数据模型

**复用 `peer_review_reports`,不建新表、不 DROP**。唯一键 `uk_submission_role(submission_id, role)`(0001_baseline.sql:755)是支点:每个 reviewer 产出**不同** role。
- `role`:reviewer 用 **slug**(`rv-methodologist`),chief 仍 `chief`。`role` 现 `varchar(8)`(放不下 slug)→ **加宽到 `varchar(64)`**,用 0005 同款 information_schema 长度守卫 MODIFY(幂等、不每次 rebuild)。
- 加 3 个 additive 列(`add_column_if_not_exists`):`reviewer_slug varchar(64)` / `reviewer_name varchar(120)` / `reviewer_domain varchar(160)` —— 给前端身份信息。`reviewer_skill_id`(legacy)新报告置 NULL、老报告保留。
- `peer_review_submissions` 加 `chosen_reviewers_json`(nullable):选完即写,前端据此渲染花名册 + 阶段数(N+2)+ 预订阅 slot。
- **修一个先决 bug(红队 blocker)**:`UpsertReport`(repository.go:258-261)现在是 `db.Save` 且 id=0 → 永远 INSERT → 重跑撞 `uk_submission_role` 失败(注释说 OnConflict 但代码没有)。改成 `clause.OnConflict{Columns:[submission_id,role], UpdateAll:true}`。**这是今天就存在的潜在 prod bug,第一步独立修+验证。**

迁移文件:一个 additive `NNNN_dynamic_reviewers_fields.sql`(MODIFY role + 3 列 + chosen_reviewers_json),全部幂等,**严格排在 backend 写 slug 之前**(否则 Data-too-long)。

## 9. 前端改动(roster 驱动,8 文件,v1 锁 N=3)

固定 A/B/C 三格在 ~10 个文件、~72 处硬编码。改成 roster 驱动:
- `types.ts`:`ReviewReport.role` 变 string(slug);加 `reviewerSlug/reviewerName/reviewerDomain`;加 `SubmissionRoster` 取自 `submission.chosenReviewers`。
- `RecordDetailPage.tsx`:`REVIEW_TABS` 由 `['editorial', ...roster.map(slug), 'chief']` 动态生成;reportMap 按 slug;chief 面板传 reviewer **列表**而非 `{alpha,beta,gamma}`。**严格时序(红队 major)**:`chosen_reviewers_json` 提交后才 `SetComputeState(reviewing)`;前端 reviewing 但 chosenReviewers 空 → 显示 MethodologyPhaseCard(别 mount 旧 alpha/beta/gamma)。
- `StatusGrid.tsx`:最大改动,3 格 → roster.map;ReviewProgress 阶段数 N+2;头像用 name 首字。
- `ReviewerDetailPanel.tsx`:删 `ROLE_LETTER`;slot 用 `reviewer:${slug}`;标题用 name/domain。
- `ChiefVerdictPanel.tsx`:`reviewers` props 变列表;join key 从"审稿人 A/B/C"改 slug(+legacy 回退)。
- `DetailRail.tsx` / `EditorialCheckPanel.tsx`:文案"三位"→"N 位",roster 驱动。
- `api/reports.ts`:停轮条件从 `items.length<4` 改 `chosenReviewers.length+1` 或 `computeState==idle/completed`。
- `partial-parse.ts`:基本不动(按字段名解析),仅 `ReviewerResponse.reviewer` 现为 slug。

## 10. Broker slots

`ReviewerSlot(role)='reviewer:'+role`(stream.go:55)天然兼容:role=slug → `reviewer:rv-methodologist`,chief 仍 `reviewer:chief`。broker 复合键、`streamSlotActive` 的 `HasPrefix('reviewer:')` 都 slug-agnostic。**收紧(红队 major)**:`streamSlotActive` 只对"在该 submission chosen roster 里的 slug(或 chief)"返 true,避免错 slug 造 5 分钟僵尸 pending 流。

## 11. 迁移顺序(可增量、可回滚)

1. **写 skills**(宿主机,无需重建):`reviewer-roster` + 起步 5-6 个 `rv-*`。重启 agent 容器(skill 加载有 memoization,需新进程才见新 skill)。
2. **DB 迁移**(additive,独立 ship,backend 没用也无害):MODIFY role→64 + 3 列 + chosen_reviewers_json。
3. **先修 `UpsertReport` OnConflict**(独立、先验证——今天就是潜在 bug)。
4. **后端选择轮**:扩 prompt + `runMethodologyPhase` 返回 `[]ReviewerChoice` + 最后-fenced-json 解析 + 内置兜底。**藏在 feature flag 后**(flag 关=老 4-picker 行为,可 A/B + 回滚)。
5. **后端评分轮**:遍历动态 reviewer、注入后端读出的评分安全 persona、role=slug、chief 按 slug。`docker compose build backend` 验证。
6. **前端 roster 化**(8 文件),同 flag 后;老报告(role alpha/beta/gamma + reviewerSkillId)保留 A/B/C 回退。`tsc -b` + `vite build` 验证。
7. **prod 开 flag**,盯 `docker logs` 里选择-JSON 兜底频率。
8. **strand**:flag 永久开后,删 bootstrap 的 4 个 `NewPersonaRandomPicker` + peerreview persona 行不再被读 → `feature_prompts` 的 peerreview 行成为 stranded 数据(留着不 DROP);`peer_review_skills` v3 起已 stranded;`reviewer_skill_id` 列留给老报告渲染。

## 12. 红队已折入的关键修正(摘要)

| # | 级别 | 修正 |
|---|---|---|
| 1 | major | 不再宣称"评分轮无工具=JSON 不会碎";真相是 MCP narration 本就被 extract+retry 容忍,本期不动这层 |
| 2 | blocker | reviewer 正文含"invoke X skill",原样注入评分轮会触发被禁工具 narration → 只注入 sentinel 包裹的「评分人格」段 + CI lint |
| 3 | blocker | 选择 JSON 用专门的"最后 fenced 块"解析器,**不复用** `extractFirstJSONObject` |
| 4 | major | persona 由**后端按 slug 读 SKILL.md** 注入,不让 agent 回显(失真/臃肿/括号冲突) |
| 5 | major | 选择失败兜底必须有**内置 const persona** 源(独立于被删 pickers);dedupe + 校验 3 个有效 slug |
| 6 | major | 严格时序:chosen_reviewers_json 提交 → 才 reviewing;前端空 roster 时显示方法论卡 |
| 7 | blocker | 先独立修 `UpsertReport` OnConflict(潜在 prod 重跑 bug) |
| 8 | minor | role varchar(8)→64 用 0005 同款守卫;dedupe slug 防唯一键碰撞;claw 用 disallowedTools 屏蔽 rv-*;v1 锁 N=3、roster 小 |

## 13. 待你拍板的开放决策

1. **审稿人数量**:v1 锁**恰好 3 个**(贴合现 UI + 成本,推荐)还是允许 agent 选可变 N(2-5,更"agent 决定"但前端 + 成本上限要再改)?
2. **审稿人作者/管理**:几十个 `rv-*/SKILL.md` 谁写、要不要 admin 管理 UI?(现在 SKILL.md 没有 admin CRUD;feature_prompts 有过。)若 admin 必须能改人格 → 要么建 skill 文件管理面(重)、要么"人格留 DB、skill 只做选择菜单"(保留现有 admin 面,避开 memoization 坑)。
3. **生产 skill 落地**:今天 reviewer skill 只靠 bind-mount(Dockerfile 不 COPY)。生产要不要把 skills 烤进 agent 镜像?
4. **匿名性**:现 UX 是"匿名审稿人 A/B/C"。动态审稿人有名字/领域——**对用户暴露**名字/领域(更丰富)还是**仍匿名**("审稿人 1/2/3",名字只内部用于 join/审计)?这决定前端是否渲染 name/domain。
5. **v1 起步 roster**:建议 5-6 个 `rv-*`(不要一上来几十个)+ 锁 N=3,让前端改动是"重命名+map"而非"可变 N 重设计";"几十个"和可变 N 留 flag 后续。

## 14. 风险(已带缓解)

- persona 保真:用后端读 SKILL.md(§6)消除 agent 转述失真。
- 选择脆弱:最后-fenced-块解析器 + 兜底(§5)。
- skill memoization:热加 skill 需重启 agent;文档化进 runbook。
- claw 串味:reviewer skill 全局可见 → claw 会话用 disallowedTools 屏蔽 rv-*/reviewer-roster。
- 唯一键碰撞:dedupe slug。
- 老报告:前端保留 alpha/beta/gamma→A/B/C + reviewerSkillId 回退路径。
- 成本/延迟:选择轮只读 frontmatter 排序、只读 3 个被选全文;v1 roster 小。
