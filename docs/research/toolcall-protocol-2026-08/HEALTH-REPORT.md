# 工具调用协议 · 体检总结与本轮改动

> 2026-08-08。承接 [ROOTCAUSE.md](ROOTCAUSE.md) 与四份体检报告
> （[10 幻影结构性方案](10-phantom-structural.md) / [11 协议健康](11-toolcall-health.md) /
> [12 tools & skills 装载](12-tools-skills-loading.md) / [13 会话恢复](13-session-resume.md)）。
> 本文只写**结论 + 本轮真正改了什么 + 仍未解决的**，取证细节回那四份看。
>
> 🔴 **全部改动均未部署。** 线上 `scholar_agent` 仍是 2026-08-04 的镜像，跑的还是 08-02 那版折叠。

---

## 〇 一句话

幻影工具链的根因被**结构性**消除了：冷重播不再把历史工具调用折成 assistant 正文，
而是还原成真的 `tool_use` / `tool_result` 块。上一轮的检测器（`toolRecord.ts` + turnLoop 纠偏）
**保留为第二道防线**，而且它的误报面从此变成 0 —— 历史里不再有平台生成的记录行，
正文里出现记录行只可能是模型自己写的。

同时落了体检出的 4 个 high（prism Bash 半边接线、StatRun/StatReport 默认授予、
三个 feature 漏配 MCP 白名单、skill frontmatter 泄漏进 system）和 2 个 blocker/high 的恢复路径问题
（seed 读侧静默失败、幽灵工具名旁路自愈提示）。

**没有解决的事情放在 §四，逐条写清，不含糊。**

---

## 一 体检结论（四份报告的浓缩）

| 面 | 结论 |
|---|---|
| **协议本身** | 健康。12,977 次 `tool_use` ↔ 12,976 次 `tool_result` 一一配对，孤儿 1（0.008%）、0 重复 id、0 跨轮串台、0 乱序；并行批最大 16 路；两条 client 道都通 |
| **模型幻想工具名** | 13 次 / 12,977（0.10%），全部被正确拒绝并收到 `is_error` 回执 |
| **冷重播（真问题）** | 会话闲置 >30min 被逐出后重灌 → 历史里 **100%** 的工具块降级成 assistant 文本。18/18 幻影轮全部落在冷重播纪元，原始纪元 0 起 |
| **能力面装载** | 机制合理、**配置漂了**：三个 feature 每轮把 minicod 全部 76 个检索工具发给模型（0 次使用），prism 的 Bash 是半边接线（48/48 次 100% 失败） |
| **skills** | 常驻 + 按需菜单的设计是对的；但常驻路径**不剥 frontmatter**，把不生效的 `allowed-tools`、调不到的技能名写进了 system |

已被**证伪**的猜想（别再查）：不是模型问题（千问/GLM 零破损）、不是 openai adapter（出问题的是不经翻译层的 DeepSeek 原生道）、
不是 tool_calls 解析（12,976 条 payload 零畸形）、不是 `activeTools=[]`（生产常态，含 AskUserQuestion 的 87 轮全部 complete）。

---

## 二 改了什么

### 2.1 幻影工具链 —— 结构性根治（本轮主体）

**新文件 `agent/src/server/replayHistory.ts`（生产路径，`ws.ts:15` 直接 import）。**
旧的 `shadowTurn.convertFlatToAnthropic` 实现被删除 —— 那是「每 7 轮就跑一次的生产路径」
挂在一个 dormant 的 `/api/turn` 文件里，会持续误导评审。

三条不可协商的设计规则写死在文件头：

1. **assistant 通道里永远不出现「工具调用发生过」的散文。** 一次历史工具调用只能以 `tool_use` 块出现，
   结果只能以 `tool_result` 块出现。
2. **一切降级产物只能落在模型写不了的通道里**（`tool_result.content` / user 消息）。
3. **结构与内容分离** —— 结构永远还原（廉价、协议要求）；内容按预算决定装多少（昂贵、可调）。

起作用的机制不是「模型看不见就模仿不了」（warm 会话每一轮都在看 `tool_use` 块），
而是**通道归属**：折行写在 assistant 通道 = 「我自己产出过的东西」，模仿它 = 写散文；
结构块的调用在 tool_use 通道、结果在 user 通道（模型永远写不了的通道），模仿它 = **发起真调用**。
同样的字节，换个信封，把有害的 few-shot 变成有益的 few-shot。

四遍实现，每遍职责单一：

| 遍 | 位置 | 做什么 |
|---|---|---|
| 1 | `replayHistory.ts:99` | 线性还原成草稿 + 归通道 + **存量污染清洗**（`stripRecordEcho`）+ `tool_result` 白名单构造（剥掉 `user_message` —— 线上 485/12,976 条有它，不剥必 400） |
| 2 | `:161` | 配对修复。**全函数**：孤儿调用补 `is_error` 占位（D1）、孤儿结果整块丢弃（D2）、无 name 的调用丢弃（D3）、结果**按 tool_use 顺序**重排（DeepSeek 网关按序渲染 `<tool_result>`）、首条非 user 则丢前导 |
| 3 | `:235` | id 重铸 `tu_1..tu_n`，两侧同时改写。消掉空 id / 重复 id / 跨厂商 id 形态三类隐患 |
| 4 | `:337` | 预算。默认策略 = 结构全还原 + 内容仍是摘要（今天的字节，换个信封）。超预算时**从最老往新**四级降级 |
| 自检 | `:416` `findPairingViolation` | 便宜且总跑。不通过 → D5 剥掉出问题那一对的工具块，**绝不**退化成散文 |

**与方案（10 号报告 §4.5）的一处偏离，必须写明：**
方案说「tool_use 块本身永不因预算被删」。实现下来这条**在最坏会话上做不到**——
`tool_use`/`tool_result` 的**信封本身**约 210 字符/次不可再压，线上最坏会话在 30 轮 seed 窗口里
有 252 次调用 ⇒ 结构地板 ≈ 53K 字符 > 整个工具面预算（24,000）。所以加了 level 4：
**整对删除**（`tool_use` + 它的 `tool_result` 一起，从最老往新）。
删「一对」而不是「降级成文字」—— 整对删除后结构仍然合法，而任何形式的文字化都会把模板还给模型。
不加这一级，「预算」这个词在最坏会话上就是假的（旧折叠同样无界：252 次 × ~300 字符 = 75.6K）。

**配套改动：**

- `agent/src/turn/toolRecord.ts` 重写：
  - 删掉 `renderToolRecord`（根治后没有生产写入方 = 纯地雷）；
  - `toolRecordLine`（`:42`）改成**不含任何模板样例**的一句通道纪律 —— 再写「形如『…』的行是平台档案」
    等于凭空把模板教进 system，而 system 是模型读得最重的通道；
  - 新增 `stripRecordEcho`（`:83`）：删**整个 `【已调用 X …】` 闭合区间**，不是删一行。
    turn 2417 里模型把一整段 Python heredoc（`<< 'PYEOF'` + 40 行源码）写在了这对括号内部，
    只删首行会把源码留下，而「一段能跑的命令正文」本身就是下一轮的模仿样本。
    闭合括号的搜索被两条边界夹住（遇到下一个 `【已调用` 或超 4000 字符就退回删到行尾），
    覆盖了 2417 首条畸形的 `【已调用 Read">scheme_v2.md" …`（无 `】`）。
- `agent/src/turn/window.ts` 头注释更正 —— 它原先明写「seed 回来的历史只留 text、丢工具块 ⇒ 每条 user 都是起点」，
  那描述的是已被删除的实现。冷/热两条路径现在形状一致。
- `agent/src/turn/runTools.ts:156` `turnOf` 改用 `isTurnStart` —— 裸数 `role === "user"` 会把
  每批工具结果各记一轮。热路径一直在多数，冷路径此前因为历史被折成纯文本而**碰巧对**。

**顺带修好的三个诚实性护栏**（`verifyClaims.ts`，无需额外代码）：
交付宣称 `sessionHasOutWrite()`、通读宣称 `everRead`、引用核验语料 `buildEvidenceCorpus()`
—— 三者都要求结构化工具块，冷重播后此前恒为空/false。

### 2.2 体检出的 high 项

| 项 | 位置 | 改动 |
|---|---|---|
| **prism Bash 半边接线**（11-high / 12-high） | `backend/internal/prism/spec.go:223` | 补 `AllowBash: true`。线上 48/48 次 prism Bash 调用 100% 失败、持续 6 天、只打 INFO 日志 |
| ↳ **让它不可能再犯** | `backend/internal/agentbridge/bridge.go:729` `reconcileBashCapability` | `Bridge.For()` 是每个 feature 挂上 bridge 的唯一漏斗。两侧不一致时以 `AllowBash`（文档已写明的单一真源）为准反向重建 agent 侧 denylist + `slog.Error` 留痕。配 `spec_bash_parity_test.go`（含 prism 真实故障形状的变异用例） |
| **StatRun / StatReport 默认授予**（11-high） | smartsearch / prism / scidraw / boltslides / claw / peerreview 六处 denylist | builtin 走 **deny-list** ⇒ 2026-08 新增的两个工具在发版当天被所有老 feature 继承，而 `permissionAllowed` 对二者无条件 `return true`。线上调用 0 次，所以这是**关暴露面**不是回滚能力 |
| **三个 feature 漏配 MCP 白名单**（12-high） | scidraw / boltslides / statlab `spec.go` | 每轮把 minicod 全部 76 个工具塞进 `tools[]`（142KB / ~40K tokens），而它们的 MCP 调用是 **0 次**。收敛到引用接地最小集 `search_papers` / `get_paper` / `get_paper_by_doi` |
| **skill frontmatter 泄漏**（12-high） | `agent/src/skills/loader.ts:187` | 常驻路径此前不剥 frontmatter（按需 guides 路径一直剥），把**不生效的** `allowed-tools`（含 registry 里根本没有的 MultiEdit）与调不到的 `name:` 写进 system。sci_draw 的 3 次 `figures` 调用即此链条的实证 |
| **seed 读侧静默失败**（13-high） | `backend/internal/agentbridge/hub.go:846` | 读失败此前是静默 `return`：不发帧、不置 `seedFailed`、无日志。fail-closed 闸只覆盖写失败 ⇒ 一次 5s DB 超时就能让会话在「无历史 / 无 skills / 无系统提示 / Bash 被打开」的状态裸跑。改为置 `seedFailed` + `slog.Error` |
| **硬截断 hasMore 被吞**（13-high，部分） | `hub.go:856` | `ReadRecentTurns` 的 `hasMore` 此前被 `_` 吞掉。现在至少 `slog.Info` 留痕，并把裸字面量 30 提成常量 `seedHistoryTurns`（`:828`）。⚠️ **用户可见提示没做**，见 §四 |
| **幽灵工具名旁路自愈提示**（11-medium） | `backend/internal/agentbridge/ws.go:425` 及两处 `if` | 摘掉 `MultiEdit` / `NotebookEdit` / `LS` / `Ls` / `WebFetch` / `WebSearch` / `BashOutput` / `KillShell` —— 这八个**在 agent registry 里根本不存在**，判成 `known=true` 会让模型拿不到「工具不存在」的中文自愈回执，而是在执行器里炸成 `unknown tool`。让它们落 `default` |
| ↳ **反向接线守卫** | `agent/src/tools/permissionParity.test.ts` | 原守卫只做 builtin→backend 单向。补上 backend→registry 的反向检查（只取 `case` / `toolName ==` 这两种**判定**形态的名字，注释里的散文不算），带判据自证。它当场就抓出了上面那八个 |

---

## 三 验证

### 3.1 测试

```
bun test  →  377 pass / 0 fail / 1929 expect（39 files）
tsc --noEmit -p tsconfig.json  →  EXIT=0
go build ./...  →  BUILD_OK
go test ./internal/agentbridge/... ./internal/prism/... ./internal/claw/...  →  全 ok
docker compose build backend  →  Built
```

⚠️ 跑 agent 测试**必须**带 seccomp/apparmor 参数，否则 statReportBundleGate 那族 7 条会因沙箱不可用而红
（与本次改动无关）：

```bash
docker run --rm -v "$PWD":/repo -w /repo/agent \
  --security-opt seccomp=./docker/seccomp/agent-bwrap.json --security-opt apparmor=unconfined \
  --entrypoint sh $(docker inspect scholar_agent --format '{{.Config.Image}}') -c 'bun test'
```

### 3.2 回归用例用的是线上原样字节

`agent/src/server/__fixtures__/prodPhantomTurns.ts` —— turn 2408 / 2409 / 2417 的
`content_delta` 逐字节原文（`GROUP_CONCAT ... ORDER BY ev_seq` 从 154.201.87.103 只读导出）。
不要「整理」它们：`Read">scheme_v2.md"` 这种畸形、「调用了 11 次检索工具」这种凭空数字，正是判据要覆盖的东西。

并行批的 fixture 也是线上原样：会话 `f3144700` turn 2361 的 `ev_seq 88/90/92` 三次同批 `search_papers`，
结果**逆序**回来（`96=call_02 → 97=call_01 → 98=call_00`）—— 这是「按 journal 到达序配对会错配」的生产实证。

23 条不变量覆盖：通道不变式 / 协议合法性（含 **200 例对抗 fuzz**）/ 存量污染清洗 / 两条道可翻译 / 预算。

### 3.3 变异测试（红输出）

**M3 —— 把工具描述写回 assistant 通道（= 2026-08-02 那版折叠的行为）**：在 `pass1` 的 `tool_use`
分支前加一句 `put(draft, "assistant", "text", { type:"text", text: \`【已调用 ${b.name}】\` })`。

```
error: expect(received).toBe(expected)
(fail) ① 通道不变式(根因判据 —— 这条一红就是幻影工具链复活)
       > 历史工具调用只出现在 tool_use / tool_result 通道,assistant 通道零工具描述

error: expect(received).not.toContain(expected)
Expected to not contain: "【已调用"
Received: "[{\"role\":\"user\",...},{\"role\":\"assistant\",\"content\":[
  {\"type\":\"text\",\"text\":\"【已调用 mcp__minicod__search_papers】\"},
  {\"type\":\"tool_use\",\"id\":\"tu_1\",\"name\":\"mcp__minicod__search_papers\",...}, ...
(fail) ① 通道不变式 > 旧模板的两个字符串在输出里彻底绝迹(它们就是模型照抄的模板)

error: fuzz #0
Expected: 0
Received: 1
(fail) ② 协议合法性 > fuzz 200 例对抗输入:输出永远通过 findPairingViolation,且 assistant 通道零工具描述

error: expect(received).toBeLessThan(expected)
Expected: < 32000
Received: 45835
(fail) ⑤ 预算 > 线上最坏量级(252 次调用):整对删除兜底,总量真的有界,且输出仍合法

 19 pass
 4 fail
```

恢复后 `23 pass / 0 fail`。

另两条：
- **M1（去掉 D1 占位）** → 3 red：孤儿调用不再补结果 ⇒ `findPairingViolation` 抓到 ⇒ D5 把整对剥掉；
- **M2（去掉 `user_message` 白名单，改成 `...b` 透传）** → 4 red：未知字段被自检抓到，D5 剥掉全部工具块
  （即「不剥就等于没有工具历史」，比 400 温和但同样是可见的失败）。

---

## 四 仍未解决的

### 4.1 结构性根治**解决不了**的（10 号报告 §八，逐条复核后仍成立）

1. **链 A 完全不受影响。** DeepSeek `/anthropic` 网关的 DSML 漏解析是上游缺陷，`leakGuard.ts` 仍是唯一防线，
   `round_discarded` 仍会发生。
2. **存量已污染会话洗不干净。** `stripRecordEcho` 只认 `【已调用 X …】` 这一个形状。
   turn 2417 里那些**不在括号里**的伪造陈述（「查阅了 34 篇文献 / 调用了 11 次检索工具」
   「让我用 Python 来做这个删除操作」）会继续作为正文重播 —— 测试里有一条专门钉死这个边界。
3. **模型自发的散文式伪造治不了。** 折叠上线**之前**线上就有 DeepSeek 回落文本模式的现象。
   本轮去掉的是「我们教它」那一份，去不掉「它自己会」那一份。**任何声称"彻底解决幻影"的说法都是过头的。**
4. **不还原历史工具结果的原文。** 默认策略下 `tool_result.content` 仍是摘要，
   「上一纪元那次检索到底返回了什么」依然要走 `EvidenceGet` / `Read`。
5. **超过 30 轮的历史仍然丢失**，而且最坏会话现在还会被 level 4 整对删掉一部分调用。
6. **thinking / artifact / error / research_state 仍不回喂** ⇒ 「上一轮报错了」「上一轮产出了 out/report.docx」
   这两件事模型在冷重播后依然不知道。
7. **跨层契约靠约定，没有编译期保障。** executor 读的是 backend `FoldToMessages` 产出的键名
   （`toolUseId` / `toolName` / `input` / `tool_use_id` / `content` / `is_error`）。
   backend 哪天改键名，executor 会**静默降级**成「没有工具的历史」而不是报错。
   建议加一条两侧同源的形状契约测试（Go 侧产 golden JSON，TS 侧读同一份断言）——**本轮没做**。

### 4.2 体检查出但本轮**没动**的

| 报告 | 项 | 为什么没动 |
|---|---|---|
| 11-medium | **prism ExportDocument 22 次漂移** —— 它在 denylist 里却产生了 permission_request，违反「denylist 里的工具永远不应产生 permission_request」这条不变式 | 漂移路径未钉死，需要可写的现场探针（本轮只读）。两条候选：`sessions.ts:304 getOrCreateEphemeral` 造的空 meta 未被 seed；`hub.go` seed 只在建 hub 时跑一次 |
| 11-medium | **OpenAI 道对模型手写 `arguments` 零类型校验** —— qwen3.7-max 一轮 20 秒内 6 次把 `limit` 发成字符串 `"8"` 被上游 zod 拒、六次都没自愈 | 需要在 `runTools` 前接一层按 schema 的轻矫正，是独立一项 |
| 11-low | `ToolUseAssembler.close()` JSON.parse 失败时静默把 input 吞成 `{}`，仍照发 `tool_use_complete` 帧 | 同上，帧层比消息层更宽容这件事要单独设计 |
| 11-low | 18 个 `content_start(tool_use)` 从未收到对应的 `tool_use` 帧 | 全部落在被 error 打断的轮，属既有失败路径的表现 |
| 12-medium | **压缩触发信号漏算被缓存的固定前缀**（`estCtx` 不含 `cache_read_tokens`） | sci_draw 的 43K 前缀已超 25% 余量，但线上尚无溢出样本；改动会动压缩阈值，风险面比收益大，应独立立项 |
| 12-medium | **已加载的 skill 正文会被压缩削掉而菜单不变** | 同上 |
| 12-medium | **Skill 工具在四个无 guides 目录的 feature 里仍可见**，其 description 指向一个不存在的「技能菜单」小节 | 本轮已把 frontmatter 泄漏堵掉（`figures` 那 3 次失败的直接成因），但「无 guides 就该隐藏 Skill」是产品决定 |
| 13-high | **冷重播硬截断没有用户可见提示** | 本轮只加了 `slog.Info` 留痕。对齐热路径的 `system_notification{kind:"context_compacted"}` + 滚动摘要需要前端配合，是独立一项 —— **别把「加了日志」当成「做完了」** |
| 13-medium | `history_seeded` 帧**全仓零消费者**，后端没有「本会话发生过冷折叠」的信号 ⇒ 无法归因、无法做趋势 | 需要 backend 落一条事件类型 + 看板，独立一项 |
| 13-medium | **用户上传的图片不进 journal**，冷重播后模型看不见此前上传的图（只剩 `@"绝对路径"` 文本标记） | 结构性问题（journal 只存文本），要设计 |
| 13-low | 重连不刷新已物化的市场 skill 启用集；`set_runtime_config` 的「切模型即压缩」在重连场景恒为 no-op | 低频、影响小 |

### 4.3 一处**我做的产品判断**，容易反悔

把 `StatRun` / `StatReport` 也在 **claw** 的 denylist 里禁掉了（`claw/spec.go`）。
理由：builtin 走 deny-list ⇒ 新增 builtin 默认被通用助手继承；统计能力是 stat_lab 这个 feature 的本体；
线上调用次数 0，所以是关暴露面不是回滚能力。
**如果产品意图就是让 claw 也能做数据分析**，删掉那两个字符串即可 —— 但请正经立项，
不要靠 deny-list 的默认授予悄悄拿到（`statkit` 那一层还有独立审计里未修的问题）。

### 4.4 部署后要盯的三个数

| 指标 | 现状 | 期望 |
|---|---|---|
| 幻影探针（正文含记录行 且 本轮 `tool_use=0`） | 08-05 1 轮 / 08-06 2 轮 / 08-07 6 轮（1.5%→8.3%） | **归零**；非零即说明模型在无模板情况下自发伪造（→ §4.1 第 3 条） |
| 冷重播轮（gap≥30min）的 `tool_use>0` 占比 | 冷纪元零工具率 42.7% vs 原始纪元 19.5% | 向 warm 水平收敛 |
| `error` 帧里 `code` 含 400 / invalid_request | 当前 0 | **必须保持 0**；出现即结构还原有洞，立刻看 `seed_restore: pairing violation` 计数 |

上线首日盯：

```bash
docker logs scholar_agent   | grep -E 'seed_restore'
docker logs scholar_backend | grep -E 'seed history read failed|Bash capability half-wired|seed history truncated'
```

---

## 五 改动文件清单

**agent**

| 文件 | 改动 |
|---|---|
| `src/server/replayHistory.ts` | **新增**。结构还原本体（四遍 + 自检 + 降级 D1–D5） |
| `src/server/replayHistory.test.ts` | **新增**。23 条不变量，含 200 例 fuzz |
| `src/server/__fixtures__/prodPhantomTurns.ts` | **新增**。turn 2408/2409/2417 线上原样字节 |
| `src/server/shadowTurn.fold.test.ts` | **删除**（被 `replayHistory.test.ts` 取代） |
| `src/server/shadowTurn.ts` | 删掉折叠实现（−100 行），改用 `replayHistory` |
| `src/server/ws.ts:15` | import 改指 `replayHistory.ts`（生产路径不再经 dormant 文件） |
| `src/turn/toolRecord.ts` | 重写：删 `renderToolRecord`、`toolRecordLine` 去模板、新增 `stripRecordEcho` |
| `src/turn/window.ts` | 头注释更正（描述的是已删除的实现） |
| `src/turn/runTools.ts:156` | `turnOf` 改用 `isTurnStart` |
| `src/turn/guards.test.ts` | 适配 + `stripRecordEcho` 的 4 条用例（含 2417 原文） |
| `src/skills/loader.ts:187` | 常驻 skill 剥 frontmatter |
| `src/tools/permissionParity.test.ts` | 补 backend→registry 的反向接线守卫 |

**backend**

| 文件 | 改动 |
|---|---|
| `internal/agentbridge/bridge.go:729` | `reconcileBashCapability` —— 在唯一漏斗里强制对齐 Bash 两侧 |
| `internal/agentbridge/spec_bash_parity_test.go` | **新增**。含 prism 真实故障形状的变异用例 |
| `internal/agentbridge/hub.go:828/846/856` | `seedHistoryTurns` 常量；seed 读失败 fail-closed；`hasMore` 留痕 |
| `internal/agentbridge/ws.go:425` 及两处 `if` | 摘掉 8 个 registry 里不存在的工具名 |
| `internal/prism/spec.go:51/223` | `AllowBash: true`；denylist 加 StatRun/StatReport |
| `internal/claw/spec.go` | denylist 加 StatRun/StatReport（此前 claw 完全没有 denylist） |
| `internal/smartsearch/spec.go` | denylist 加 StatRun/StatReport |
| `internal/scidraw/spec.go` | denylist 加 StatRun/StatReport；补 `AllowedMcpTools` |
| `internal/boltslides/spec.go` | denylist 加 StatRun/StatReport;补 `AllowedMcpTools` |
| `internal/statlab/spec.go` | 补 `AllowedMcpTools` |
| `internal/peerreview/service.go:2030` | `scoringSessionDeny` 加 StatRun/StatReport |

**未触碰**：`backend/internal/library/**`、`frontend-user/src/features/library/**`（用户未提交的 PDF 改动）。
