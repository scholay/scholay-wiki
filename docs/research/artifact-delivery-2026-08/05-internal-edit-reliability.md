# 05 · 「编辑文件容易出错、修改不到」根因取证

> 调研范围：agent 执行器侧的 Read / Write / Edit 语义、tool_result 截断、上下文压缩、
> 产物快照/搬运链路，以及 backend 收割与前端卡片的下游后果。
> 取证日期：2026-08-07。全部结论带 `file:line`；标注「**已复现**」的条目附实测输出。
> 复现脚本跑在 `bun 1.3.14`，直接 import 仓库源码（`agent/src/turn/artifacts.ts`、
> `agent/src/tools/registry.ts`），非模拟。

---

## 0. 结论速览

用户口中的「修改不到」不是一个 bug，是**四条互相独立、同时在线的路径分叉**叠加：

| # | 分叉 | 机制一句话 | 状态 |
|---|---|---|---|
| **R1** | `relocateStrays` 副本分叉 | 写在会话根的交付物被 **copyFile** 进 `out/`；下一轮 Edit 改的是原件，`out/` 里的副本不变，且会**再复制出 `-2` `-3` 新卡片** | **已复现** |
| **R2** | `resolveCitations` 就地改写 | 发帧前平台把交付文件里的 `[[E7]]` 就地重写成完整题录/破引用标记；模型下一轮拿自己写的原文去 Edit，**必然** `old_string not found` | **已复现** |
| **R3** | Edit 首处替换 + 零唯一性校验 | `indexOf` 只换第一处、返回 `edited x.md` 成功。模型以为全改了，实际只改了 1/N | **已复现** |
| **R4** | 上下文失忆后无回读纪律 | 重连 / 容器重启 / 内存驱逐后，`convertFlatToAnthropic` 把每条 tool_result 折成一行摘要，模型手里**零文件原文**，却没有任何机制要求它先 Read 再 Edit | 代码确证 |

R1 是「用户点开卡片发现还是旧版本」的**直接机制**；R2/R3 是「Edit 报错 / 改一半」的直接机制；
R4 是把前三条从偶发放大成常态的乘数。

另有一条结构性缺失贯穿全部：**模型对「文件当前内容」只有 Read 一个通道，而 Read 无行号、无 hash、
无 mtime，Edit 无读前置校验、无 mtime 校验、失败回执只有一句 `edit failed: old_string not found`。**
模型在失配时拿不到任何可用于自救的信息。

---

## 1. Edit 工具的匹配语义（Q1）

### 1.1 完整实现只有 22 行

`agent/src/tools/registry.ts:217-244`：

```ts
const editTool: BuiltinTool = {
  name: "Edit",
  description: "Replace the first occurrence of old_string with new_string in a file (exact match).",
  input_schema: { ... required: ["file_path", "old_string", "new_string"] },
  parallelSafe: false,
  async run(input, ctx) {
    try {
      const p = await confinePath(ctx.workDir, String(input.file_path), true);
      const cur = await readFile(p, "utf8");
      const oldS = String(input.old_string);
      const idx = cur.indexOf(oldS);
      if (idx < 0) return fail("edit failed: old_string not found");
      const next = cur.slice(0, idx) + String(input.new_string) + cur.slice(idx + oldS.length);
      await writeFile(p, next, "utf8");
      return ok("edited " + String(input.file_path));
    } catch (e) {
      return fail("edit failed: " + String((e as Error)?.message ?? e));
    }
  },
};
```

### 1.2 语义对照表

| 能力 | 本仓 Edit | Claude Code 的 Edit（模型训练分布） | 后果 |
|---|---|---|---|
| 匹配 | `indexOf` 精确子串 | 精确子串 | 一致 |
| 多处命中 | **静默改第一处** | **报错要求唯一 / 显式 `replace_all`** | R3：模型以为全改 |
| `replace_all` | **无此参数** | 有 | 模型只能连发 N 次 Edit（且每次都改第一处 → 死循环） |
| 读前置强制 | **无** | 有（未 Read 过的文件拒绝 Edit） | 模型可凭幻觉直接 Edit |
| mtime / 内容指纹校验 | **无** | 有（Read 后文件被改过则拒绝） | R1/R2 完全不可检出 |
| `MultiEdit` | **不存在**（`registry.ts:1632` 的 `all[]` 里没有） | 有 | 多点修改只能逐条 Edit |
| 失败时给行号 / 近似匹配 | **无** | 无（但有唯一性错误分型） | 模型无法定位 |
| 空白/缩进归一化 | **无** | 无 | 一致 |
| 新建文件（old_string 为空） | **不支持**（`indexOf("")===0`，会在文件头插入；文件不存在则 ENOENT） | 支持 | 模型对不存在文件 Edit 直接 ENOENT |

### 1.3 失败回执四种原文（实测，`repro2.ts` 输出）

```
[D1] 空白差异失配 = {"text":"edit failed: old_string not found"}                        isError:true
[D2] 文件不存在   = {"text":"edit failed: ENOENT: no such file or directory, open
                    '/private/var/folders/.../reproD-hbEBhB/out/nope.md'"}              isError:true
[D3] 保留区       = {"text":"edit failed: refusing to write into engine-reserved
                    directory (one of: evidence/, analysis/)"}                          isError:true
[D4] 越界         = {"text":"edit failed: path escapes workDir"}                        isError:true
```

**够不够自救？不够。** 逐条看：

- **D1 是主力失败态，信息量为零。** 没有说文件多大、当前前 N 字符长什么样、有没有近似片段、
  是不是空白差异。模型唯一的自救策略是「再 Read 一次全文再试」——但它没有被告知要这么做
  （见 §4：系统提示里**完全没有** Edit 相关纪律），而且在长会话里再 Read 一次会重新吃掉几十 K token。
  实测行为（记忆库 claw 线上审计）是模型改用 Write 整篇重写 → 覆盖掉自己也没读到的部分。
- **D2 把宿主绝对路径原样喂进模型上下文。** 生产里是 `/home/bun/sessions/<sessionId>/out/nope.md`
  ——同时泄露会话 id 与内部布局。而 `backend/internal/prompts/claw.go:121-126` 有一条铁律
  「绝不暴露内部路径 / 不写 './out/'」。**工具层在往上下文里灌路径，提示层在禁止复述路径**——
  这正是用户抱怨的「agent 说文件输出到 out 目录下」的燃料来源之一（另一处见 §1.4）。
- **D3/D4 文案里出现 `evidence/`、`analysis/`、`workDir`** 等纯内部概念，同理。
- 四种失败都不带 `userMessage`，`runTools.ts:161` 兜底成 **「写入内容未成功。」**——
  用户侧看到的就是这六个字，没有任何「哪个文件、为什么」。

### 1.4 成功回执同样在灌路径

- `registry.ts:210` `ok("wrote " + input.file_path)`
- `registry.ts:239` `ok("edited " + input.file_path)`
- `registry.ts:779` `ok("exported out/xxx.docx (N bytes) — delivered to the user's download area.")`
- `registry.ts:897` `ok("Deck built and delivered: out/deck.html ...")`
- `turnLoop.ts:128` 附件约定：backend 把上传文件折成 `@"/绝对路径"` 塞进 user 消息开头。

`out/` 这个词在模型上下文里出现的频次是**结构性的**，不是偶发。提示词那条「绝不暴露路径」的
禁令必须对抗自己工具层每一轮的反复灌注——这在本仓库有先例结论（记忆：`claw-ascii-diagram-relapse`
「否定式规则没用，须正面模板」）。

---

## 2. 路径分叉全清单（Q2）

### 2.1 R1 — `relocateStrays` 副本与原件分叉（**已复现**，用户症状的直接根因）

**机制。** `agent/src/turn/artifacts.ts:225-289`。turnLoop 在 `finally` 里 diff `out/` + 会话根的
可交付扩展名文件（`artifacts.ts:340-381`、`turnLoop.ts:956`）。落在 `out/` 之外的「越界交付物」
在上抛前被 **`copyFile`** 进 `out/`：

```ts
// artifacts.ts:281
await copyFile(join(workDir, d.path), join(outAbs, name));
```

`copyFile` 之后，盘上有**两份互不相关的文件**：模型认知里的 `报告.md`（会话根）与用户拿到的
`out/报告.md`。下一轮模型 Edit `报告.md` 成功——但 `out/` 里那份不动。

更糟的是重名规避逻辑（`artifacts.ts:253-273`）：`taken` 用**当前快照的全部 `out/` 键**播种，
所以第二轮的 `报告.md` 被判定「已占用」→ 改名成 `报告-2.md` → 又 `copyFile` 一份。

**实测（`repro-edit-divergence.ts`，真实调用 `snapshotOut` / `emitArtifacts`）：**

```
轮1 帧: ["out/报告.md"]          out/: [报告.md]
轮2 Edit 匹配到 old_string? true
     WARN artifact relocate renamed to avoid overwrite  from=报告.md to=out/报告-2.md
轮2 帧: ["out/报告-2.md"]        out/: [报告-2.md, 报告.md]
     out/报告.md   = "第一版正文\n结论:A\n"          ← 用户上一轮拿到的卡片，内容停在 v1
     out/报告-2.md = "第一版正文\n结论:B(已修正)\n"   ← 新卡片
轮3 帧: ["out/报告-3.md"]        out/: [报告-2.md, 报告-3.md, 报告.md]
```

**用户看到的**：第一轮一张卡「报告.md」；第二轮下面又冒出一张「报告-2.md」；第三轮「报告-3.md」。
点开第一张——**还是旧的**。这就是「进行编辑文件也容易出现错误，修改不到」的字面复现。

**为什么模型完全不知情。** `emitArtifacts` 只调 `sink.frame`（`artifacts.ts:379`），
帧走 WS → backend journal → 前端；**没有任何一条路径回到 `messages[]`**。
`turnLoop.ts:956` 在 `finally` 里调用，此时本轮 LLM 循环已经结束。
所以模型永远不知道自己的文件被改名成了 `报告-2.md`——下一轮它继续 Edit `报告.md`，
继续制造 `报告-4.md`。

**下游放大器**：`backend/internal/claw/artifact_harvest.go:29-34` 明写收割是
**upsert-only、绝不删除**，dedup anchor = `sessionID + relPath`
（`artifact_harvest.go:69`）。`out/报告.md` 与 `out/报告-2.md` 是两行不同的 DB 记录、
两个不同的 MinIO 对象。变更检测按 `size:mtime`（`artifact_harvest.go:63`），
`out/报告.md` 从此永不再被读取更新。**用户的产物列表里，一份被改了 5 次的报告 = 5 张卡 + 5 个
MinIO 对象，其中 4 张是历史版本，且没有任何版本标记。**

**现有测试为什么没抓到。** `agent/src/turn/artifacts.test.ts:164` 那条
「落点纠偏幂等：搬运产生的 out/ 副本不会在下一轮重复上抛」——它只测了「**源文件未再变**」
的情况（`artifacts.test.ts:170` 注释原话）。**编辑后的下一轮从来没有被测过**，
而那恰好是唯一有意思的情况。

**触发面有多大。** 会话根落点是模型最自然的写法（`Write("MBI分析结果.docx")`）；
`deliveryGate.ts` 模块注释与 `artifacts.ts:355` 都点名这是**最常见落点**。
`prompts/claw.go:113` 虽然教了写 `./out/`，但同一段又写「绝不可以在正文里提及 ./out/」，
模型对「这个目录名到底该不该出现」是有认知冲突的；`prompts/sci_draw.go:63` 还要专门再写一遍
「路径铁律（务必照做）」——说明实际漂移率不低。

### 2.2 R2 — `resolveCitations` 就地改写交付文件（**已复现**）

**机制。** `artifacts.ts:310-337`，发帧前对每个可引用扩展名的交付物就地重写：

```ts
const r = await resolveFileForDelivery(workDir, join(workDir, d.path), { onMissing: "mark" });
if (!r || !r.changed) continue;
await writeFile(join(workDir, d.path), r.text, "utf8");   // ← 就地覆盖模型写的那份
```

`expandCitations`（`evidence/render.ts:282-305`）把 `[[E7]]` 替换成：
- 命中账本 → `renderCitationInline(rec)`（完整题录内联串）；
- 未命中 → `[未入账引用 E7 —— 本会话证据账本中没有这条记录]`。

**两条分支都会让文件内容与模型记忆中的原文不一致。**

**实测：**

```
[B] 模型写的  = "## 结论\n本文引用 [[E1]] 支持该结论。\n"
[B] 盘上实际  = "## 结论\n本文引用 [未入账引用 E1 —— 本会话证据账本中没有这条记录] 支持该结论。\n"
[B] 是否被改写 = true
[B] 下一轮 Edit 结果 = {"text":"edit failed: old_string not found", "isError":true}
```

模型下一轮想微调那句话，用自己刚写下的原文当 `old_string`——**必然失败**，
而回执只有 `old_string not found`。它无从知道平台在它背后改了文件。
日志里有一行 `evidence_citation_resolve`（`artifacts.ts:324`），但那是运维视角，
不在模型上下文里。

这条对 claw 的**带引用的长文交付**（综述、精读稿）是 100% 触发的——只要正文里有 `[[E]]` 句柄
且模型想改第二遍。

### 2.3 R3 — Edit 只换第一处且报成功（**已复现**）

```
[C] 输入文件 = "TODO\nx\nTODO\ny\nTODO\n"
[C] Edit(old="TODO", new="DONE") 结果 = {"text":"edited a.md", "isError":false}
[C] 文件结果 = "DONE\nx\nTODO\ny\nTODO\n"
```

模型收到 `edited a.md` + `isError:false`，语义上等于「完成」。它有极强的理由认为三处都改了
——因为它熟悉的 Claude Code Edit 在多处命中时会**报错**（要求唯一或 `replace_all`），
所以「成功」在它的训练分布里蕴含「唯一命中」。本仓这个实现把「成功」的含义悄悄换掉了。

典型受害场景：批量替换术语、统一单位、把所有 `p<0.05` 改成 `P<0.05`、改所有章节标题级别。

### 2.4 R4 — deliveryGate enforce 隔离，模型与用户都不知情

`turn/deliveryGate.ts:150-164`：enforce 档下把含无源数字的交付物 `rename` 进
`analysis/quarantine/`——那是引擎保留区，模型**没有任何路径**能把它挪回来
（`sandbox/reserved.ts:39` + `confine.ts:98`）。

`deliveryGate.ts:169-173` 自己写着：`noticeForModel` **从写出来那天起就没有任何消费者**。
我复核了：`artifacts.ts:363` 只取 `gate?.quarantined`，`noticeForModel` 全仓唯一引用是它自己的
单测（`grep -rn noticeForModel agent/src/` 只有 4 个命中，全在 deliveryGate.ts 与其测试）。
所以在 enforce 档下：

- 模型下一轮 Edit `out/报告.docx` → `ENOENT`（文件已被 rename 走），且不知道为什么；
- 用户只能靠 `out/⚠️交付闸拦截说明.md`（`deliveryGate.ts:182`）自己发现。

**当前默认是 observe（`deliveryGate.ts:80`，`STATKIT_NUMCHECK_ENFORCE` 未在两份 compose 里设置）
所以此路暂未触发**，但只要按模块注释的上线路径开 enforce，它就变成第四条分叉。标 medium。

### 2.5 R5 — 「源 → 产物」单向复制（ExportDocument / BuildDeck）

- `ExportDocument`（`registry.ts:721-724`）：源 `.md` → pandoc → `out/x.docx`。
  改 `.md` 后不重新导出，`out/x.docx` 就是旧的。**工具描述里没有一句提醒「改完要重导」**。
- `BuildDeck`（`registry.ts:895`）：`src/App.tsx` → 编译 → `out/deck.html`。
  这条的工具描述**写清楚了**「Call this AFTER you have authored the deck」+ 失败可重调，
  是本仓唯一一个把「构建步骤」讲明白的地方——**可作为新架构的正面样板**。
- 附带：`ExportDocument` 展开句柄后写的是隐藏侧车 `.<name>.cited.md`（`registry.ts:749`），
  刻意不改模型的源文件——**方向是对的**，而 `artifacts.ts:320` 的 `resolveCitations` 恰恰相反，
  直接改了模型要继续编辑的那份。两处对同一问题给出相反答案，是 R2 能存在的直接原因。

### 2.6 R6 — 会话根原件与 out/ 副本谁是「真源」无人定义

直写 `out/` 的路径是干净的（实测 `[A]`：轮1 帧 `out/报告.md`，轮2 Edit `out/报告.md` → 帧仍是
`out/报告.md`，`out/` 里只有一个文件，卡片正确更新）。
**问题只出在「模型写别处 → 平台搬运」这条路径上。**

现状是双真源、无标记、无同步：
- 模型的真源认知 = 它 Write 时用的路径；
- 用户的真源 = `out/<basename>`（`backend/internal/claw/artifact.go:44,124-138` 硬白名单）；
- 两者之间是一次**没有回执的 copyFile**。

---

## 3. Read 截断 × Edit 精确匹配的冲突（Q3，量化）

### 3.1 阈值全表

| 关卡 | 常量 | 默认值 | 单位 | 位置 |
|---|---|---|---|---|
| Read 自身截断判据 | `MAX_READ_BYTES` | 256 000 | **字节** | `registry.ts:99,183` |
| Read 自身截断动作 | `text.slice(0, MAX_READ_BYTES)` | 256 000 | **字符** | `registry.ts:185` |
| tool_result 整读白名单上限 | `WHOLE_READ_CEILING.Read` | 256 000 | **字符** | `resultCap.ts:15` |
| tool_result 通用单块上限 | `PER_BLOCK_MAX` | 20 000 | 字符 | `resultCap.ts:8` |
| tool_result 通用合计上限 | `TOTAL_MAX` | 60 000 | 字符 | `resultCap.ts:9` |
| 老轮 tool_result 裁剪 | `headChars` | **200** | 字符 | `context-budget.ts:60` |
| 摘要渲染时 tool_result 保留 | 硬编码 | **240** | 字符 | `compact.ts:154` |

两份 compose 里**没有任何 `EXECUTOR_*READ*` / `EXECUTOR_TOOL_RESULT_*` 覆写**
（`grep -n "EXECUTOR_" docker-compose*.yml` 只有 `EXECUTOR_AUTH_TOKEN` / `EXECUTOR_PDF_ENGINE`），
默认值即生产值。

### 3.2 结论 1：Edit 对 256 KB 以外的内容是**结构性不可达**

Edit 自己读的是全文（`registry.ts:233 readFile(p,"utf8")`），所以理论上文件任意位置都能改；
但模型只见到前 256 000 字符，超出部分它无从构造 `old_string`。
**纯 ASCII/Latin 文件超过 256 KB 后，后半部分实际不可编辑**（除非模型主动用
`Read(offset,limit)` 分段读——截断提示里确实给了这句 hint，`registry.ts:186`，
这一点做得是对的）。

### 3.3 结论 2：CJK 的字节/字符单位错配 → **假截断警告**（已复现）

`registry.ts:183` 用 `buf.length`（字节）判定，`registry.ts:185` 用 `text.slice`（字符）截断。
中文 1 字符 = 3 字节，两者差 3 倍。实测：

```
[E] 文件字节 = 300000   返回字符 = 100125   含截断标记 = true   实际内容是否完整 = true
```

即：**一个 300 KB 的中文 Markdown（10 万字），内容被完整返回了，
但模型被明确告知「file is 300000 bytes, showing first 256000」。**

命中区间：中文文件在 **256 001 ~ 768 000 字节**（约 8.5 万 ~ 25.6 万汉字）之间时，
100% 收到假截断警告。这个区间正好覆盖典型的长综述 / 学位论文章节 / 会话累积稿。

后果链：模型认为自己没读全 → ① 不敢 Edit，改用 Write 整篇重写（覆盖掉它「以为没看到」的部分）；
② 对用户说「文件太长我只读了一部分」；③ `verifyClaims.ts` 的 `fullReadMismatch`
判据（`turn/verifyClaims.ts:7` 通读核验）会把它记成一次异常。三条都在往坏处走。

### 3.4 结论 3：CJK 大文件的 Read 会一次性灌入 ~768 KB 正文，且 token 估算低估 ~3 倍（已复现）

```
CJK 300k字符/900k字节 | 工具返回字符 256125 | cap 后字符 256039 | cap 后字节 768073 | estimateTokens 98488
ASCII 400k字符/400k字节| 工具返回字符 256125 | cap 后字符 256039 | cap 后字节 256073 | estimateTokens 98488
```

- `capToolResult` 的上限是**字符**，所以中文 Read 单条 tool_result 实际是 768 KB 正文，
  真实 token 约 **256 K ~ 384 K**（CJK 约 1~1.5 token/字）。
- `estimateTokens` 用 `CHARS_PER_TOKEN = 2.6`（`context-budget.ts:15`）算出 **98 488**。
  同一段注释自己写着「CJK≈1-1.5 tok/字」——也就是 CJK 的 chars-per-token 应当取 **0.67~1.0**，
  取 2.6 相当于假设中文比英文更省 token。**对一个中文优先的平台，这是系统性 2.6~3.9 倍低估。**
- 缓解因素：`ws.ts:274-275` 的 `estCtx = max(lastCtx, estimateTokens(...))`，
  `lastCtx` 是上一轮真实 usage，会把估算拉回来。所以低估**只在 `lastUsage` 缺失或过期时生效**
  ——即首轮、seed 后首轮、切模型后——而这恰恰是「用户刚上传大文件、模型第一次 Read」的时刻。
- 一旦溢出，走 `turnLoop.ts:617` 的反应式压缩，`MAX_REACTIVE_REDUCES=2`
  （`turnLoop.ts:376`），两次压不下去就 `sendError("模型服务响应异常")`。
  而反应式压缩做的第一件事就是 `pruneOldToolResults` → **刚读到的文件内容被裁**。

标 medium（不是 Edit 的直接根因，但是「大文件编辑必然失败」的上游）。

---

## 4. 长会话压缩后模型手里还有没有文件原文（Q4）

**三层递减，最狠的那层与压缩无关。**

### 4.1 第 ① 层 — `pruneOldToolResults`：老轮 tool_result 砍到 200 字符

`context-budget.ts:57-81`。裁掉早于最近 `keepTurns` 轮的所有 tool_result 正文，只留前 **200 字符**
+ `[…较早的工具结果已省略以节省上下文]`。
- 触发：`ws.ts:276` `estCtx > inputBudget × 75%`（`WINDOW_TRIGGER_PCT=75`）。
- `keepTurns = WINDOW_KEEP_TURNS = 25`（`ws.ts:29`）。
- 影响：25 轮以前读过的文件，模型手里只剩前 200 字符。

### 4.2 第 ② 层 — `compactMessages`：老轮整体换成一段中文摘要

`compact.ts:195-232`。被压缩段落先经 `renderForSummary`（`compact.ts:130-159`），
其中 tool_result 只取 **前 240 字符**（`compact.ts:154`），再喂给便宜档模型摘要成 150-400 字。
`extractArtifacts`（`compact.ts:162-174`）会把 `out/…`、`uploads/…`、`references/…` 这类**路径**
原样保留进摘要——**保留的是路径，不是内容**。

所以压缩之后，模型知道「有一个叫 `out/综述.md` 的文件」，但不知道里面写了什么。
它会拿这个路径去 Edit，`old_string` 只能凭幻觉编——**必然 `old_string not found`**。

顺带：`extractArtifacts` 保留的路径串会被模型当成「可以说出来的东西」，这是
「agent 说文件输出到 out 目录下」的第三个燃料源（前两个见 §1.3/§1.4）。

### 4.3 第 ③ 层（最狠）— 重连 / 重启 / 驱逐：`convertFlatToAnthropic` 把每次工具调用折成**一行**

`server/ws.ts:208` → `server/shadowTurn.ts:56-91`。
这条路径**与上下文压力无关，是无条件的**：

- 触发条件之一：内存 meta 空闲 30 分钟被驱逐（`sessions.ts:414` `IDLE_TTL_MS = 30 * 60_000`）；
- 触发条件之二：会话数超 `MAX_SESSIONS=200` 被 LRU 挤出（`sessions.ts:415`）；
- 触发条件之三：agent 容器重启 / 重部署（内存全空）。

之后 backend 从 journal 重灌 history，`convertFlatToAnthropic` 把
`tool_use` + `tool_result` 折成一行文本（`shadowTurn.ts:121-134`）：

```
【已调用 Read file_path="out/综述.md"】返回 48213 字符
```

**文件内容 100% 消失。** `describeToolCall`（`compact.ts:53-74`）保留了 `file_path`
（在 `TOOL_ARG_KEYS` 里），`summarizeToolOutcome` 只报字符数。
模块注释自己承认这是**刻意的**（`shadowTurn.ts:54`：全量折回 = 每轮重发 ~100 K token，不可持续）
——这个取舍对**检索证据**是对的（真源在 `evidence/ledger.jsonl`，有 `EvidenceGet` 可回读），
但对**文件内容没有对应的补偿通道**：

| 维度 | 检索证据 | 文件内容 |
|---|---|---|
| 折叠后的真源 | `evidence/ledger.jsonl`（会话 cwd，TTL 30 天） | 会话 cwd 的文件本身 |
| 模型的回读工具 | `EvidenceGet`（`registry.ts:1063`） | **Read（无人告诉它要用）** |
| 每轮注入的摘要 | `digest` + `research_state` 帧 | **无** |
| 折叠行里的提示 | `已入证据账本 E1–E16` | `返回 48213 字符`（无「需重读」提示） |

**这就是「重连之后 Edit 一定改不动」的机制。** 而用户对「刚才那个会话」和「刷新后的会话」
在体感上是同一个会话——他会认为是 agent 变笨了。

### 4.4 有没有任何提示要求「Edit 前先 Read」？没有

- `backend/internal/prompts/claw.go` 全文：`grep -n "Edit"` → **0 命中**。
  只在 §「如何读用户给的文件」教了 Read/ReadDocument，`Edit` 一次都没提。
- `agent/src/turn/turnLoop.ts:117-147` 的四条静态注入串
  （`langLine` / `attachLine` / `toolFailLine` / 日期锚）——**没有文件编辑纪律**。
- 唯一存在的编辑纪律是 `agent-skills/prism-skills/prism-edit-discipline/SKILL.md`
  （「保持最小 diff：用 Edit 做定点替换，别整篇重写」），**只装在 prism 会话**
  （`backend/internal/prism/spec.go`），claw 完全没有。
  且该 skill 的 `allowed-tools` 写了 **`MultiEdit`**（SKILL.md:7）——一个
  `builtinRegistry`（`registry.ts:1632`）里根本不存在的工具。

---

## 5. 跨轮 / 跨会话 cwd 稳定性（Q5）

| 事件 | cwd 文件是否还在 | 依据 |
|---|---|---|
| 同一会话下一轮 | 在（同一目录，`sessions.ts:206` `safeSessionDir(SESSIONS_ROOT, sid)`，幂等 mkdir） | `sessions.ts:205-207` |
| 内存 meta 空闲 30 min 被驱逐 | **文件在，上下文没了**（`sessions.ts:412` 明写「驱逐【绝不删 workDir】」） | `sessions.ts:408-414` |
| agent 容器重启 / `up -d --build` | **prod：在**（`docker-compose.prod.yml:400` 挂 `./data/agent-sessions`）<br>**dev：本次修复前不在**（该行是**未提交**的 2026-08-06 补丁，`git diff docker-compose.yml` 可见） | compose 两份 + `composeVolumeParity.test.ts` |
| 30 天不活跃 | **删**（`WORKDIR_TTL_MS = EXECUTOR_WORKDIR_TTL_DAYS(30) 天`，`sessions.ts:456`；活跃信号 = `<workDir>.active` mtime ∨ 目录 mtime，1h 节流写） | `sessions.ts:446-520` |
| 会话 reset / delete | **删**（含 `.skills` / `.active` / `.template`） | `sessions.ts:384-392` |
| 磁盘配额到顶 | 写入被拒 `QuotaError`（单文件 64 MB / 会话 1 GB / 2000 文件） | `server/workspace.ts:22-24,70-95` |

**两个额外发现：**

1. **`Write` 工具不走配额闸。** `registry.ts:205-214` 直接 `writeFile`，没有
   `assertSessionQuota` —— 而 `putWorkspaceFile`（`workspace.ts:222-227`）与
   `pushSessionFile`（`workspace.ts:250`）都走了。也就是说「用户上传」有配额，
   「模型自己写」没有。低危（bwrap 之外还有容器盘），但口径不一致，标 low。
2. **workdir 被 GC 后的自愈只有 boltslides 有。** `ensureBoltSlidesScaffold`
   （`sessions.ts:190`）靠 `<workDir>.template` 侧车重铺脚手架。
   claw / prism 的用户上传文件与历史交付物**没有任何自愈**——
   30 天后会话还能聊，但「上次那个报告」的源文件已经不在了。
   `artifact_harvest.go:29-33` 的 upsert-only 保住了 MinIO 里的**成品**，
   但源文件没了 = 模型再也改不动它。这是「修改不到」的第五条路径（长尾）。

---

## 6. 有没有「文件当前内容」的可靠回读通道？（Q6）

**没有。只有 Read，且 Read 缺三样东西。**

### 6.1 模型侧现有通道盘点

| 通道 | 能拿到什么 | 缺陷 |
|---|---|---|
| `Read`（`registry.ts:120`） | UTF-8 全文（≤256 K 字符）或 `offset/limit` 行段 | **无行号**（只有 offset 模式才有 `[lines a-b of N]` 头，`registry.ts:175`）；**无 mtime/hash**；无「自上次读后是否变过」 |
| `Grep`（`registry.ts:282`） | `相对路径:行号: 行内容`（≤200 命中、行截 200 字符） | 只能定位，拿不到可用于 `old_string` 的完整上下文 |
| `Glob`（`registry.ts:246`） | 文件名列表 | 无内容 |
| `ReadDocument`（`registry.ts:545`） | 二进制文档抽文本 | 抽出来的文本**不等于**盘上字节，不能拿去 Edit |
| `Bash`（仅 claw） | `cat` / `sed -n` 任意 | jail 内 cwd 是 `/work`（`bwrap.ts:113,128`），与 Read/Write/Edit 的相对路径口径不同（`confine.ts:30-38` 做了入站别名翻译，方向是对的但是**双口径**本身就是混淆源） |
| `EvidenceGet`（`registry.ts:1063`） | 证据账本题录 | 只管引用，不管文件 |

### 6.2 平台侧**已有**、但没接给模型的通道

- `agent/src/server/workspace.ts:135` `readWorkspaceFile(..., {full:true})` —— 字节级精确全文回读，
  prism 的固化就靠它。**只对 backend 开放，模型看不到。**
- `agent/src/server/workspace.ts:188` `listWorkspaceTree` —— 带 `size` / `mtimeMs` 的目录列表。
  **只对 backend 开放。**
- `agent/src/turn/artifacts.ts:98` `snapshotOut` —— 每轮开头都算了一次 `out/` + 会话根的
  `{size, mtimeMs}` 快照，`turnLoop.ts:180`。**这份数据每轮都在手里，从不注入上下文。**

也就是说：**「本轮开始时 out/ 里有哪些文件、多大、什么时候改的」这份事实，
执行器每一轮都算了，却从未告诉过模型。** 模型只能靠对话历史记忆——而 §4 证明了那份记忆
在压缩 / 重连后会归零。

---

## 7. 根因归纳（写给架构）

把上面所有证据收敛成三条结构性缺陷：

### C1 — 交付真源是「复制出来的第二份」，而不是模型编辑的那一份

`copyFile` 建立的是**快照关系**，不是**引用关系**。任何快照关系在「源还会被继续修改」的场景下
都必然分叉。`relocateStrays` 的设计前提是「越界写入是一次性事故，搬一次就完了」，
但真实用法是「模型把工作稿放会话根、反复迭代」。前提错了。

三个候选修法（按侵入度递增）：
- **(a) `copyFile` → `link`（硬链接）**：同一 inode，Edit 原件即改副本。
  但 `Write` 整篇覆盖走的是 `writeFile` → 同 inode 截断重写，硬链接仍然同步；
  只有 `rename`/`unlink` 会断链。注释里已经点名「用 copyFile，跨 bind-mount 比 link 稳」
  （`artifacts.ts:215`）——需要实测本仓 bind-mount 下 `link(2)` 是否可用（同一挂载点内应可）。
- **(b) `copyFile` → `rename`（搬运而非复制）+ 给模型带内回执**：物理上消灭双真源。
  代价是模型下一轮 Read 原路径会 ENOENT——所以**必须**配一条回喂给模型的告知
  （见 C3）。
- **(c) 根治：`out/` 之外禁止落交付物扩展名**。`confinePath(forWrite)` 已经有拒写保留区的
  机制（`confine.ts:98`），可对称加一条「`.md/.docx/...` 只能写 `out/` 或
  显式声明的草稿目录」。失败回执直接教模型改路径——**在失败点纠偏，紧贴生成点**，
  这正是本仓 `bashTool` gate（`registry.ts:354`）与 `StatReport` 路径闸
  （`registry.ts:1585`）已验证有效的模式。

### C2 — Edit 的契约比模型的先验弱，且弱在模型察觉不到的地方

模型的先验来自 Claude Code：Edit 要求唯一命中、要求先 Read、文件变过会拒。
本仓的 Edit 三条全无，但**返回值形状一模一样**。这是最坏的一种不兼容：
不是报错，是静默地把「成功」的含义改了。

最小修复（不改架构，一天量级，收益极高）：
1. 多处命中 → 返回 `isError`，文案给出命中次数 + 前后各一行上下文，并要求扩大 `old_string`
   或显式传 `replace_all: true`（新增该参数）。
2. `old_string not found` 的回执里带上：文件总字符数、是否本轮 Read 过、
   以及**最长公共前缀止步位置的前后 200 字符**（廉价的近似定位，比「没找到」有用一个数量级）。
3. Edit 成功回执改成结构化：`{path, replaced: 1, remaining_matches: 2, bytes_before, bytes_after}`。
4. 加 `MultiEdit`（skill 里已经在教了）或至少 `replace_all`。
5. **读前置软校验**：记录 `(path → 本会话最后一次 Read 的 mtime/size)`，
   Edit 时若盘上 mtime 变过，回执明说「该文件在你上次读取后被改动过（可能由平台的引用展开
   / 交付搬运造成），请先重新 Read」。这一条能同时把 R1 和 R2 从「静默失败」变成「可自救」。

### C3 — 平台会背着模型改盘上的文件，却没有一条把这件事告诉模型的通道

`resolveCitations` 改文件（`artifacts.ts:320`）、`relocateStrays` 复制并改名
（`artifacts.ts:281,286`）、`deliveryGate` 移走文件（`deliveryGate.ts:156`）——
三处都发生在 `turnLoop` 的 `finally` 里，**LLM 循环已经结束**，物理上没有回喂的机会。

`deliveryGate.ts:169-173` 已经把这个问题在自己那一格上写清楚了
（`noticeForModel` 无消费者），但**它是三分之一，不是全部**。

架构层面这需要一个「**下一轮开场的工作区状态注入**」：
在 `turnLoop` 开头（`turnLoop.ts:180` 已经在算 `snapshotOut` 了）把
「上一轮结束后交付区的真实状态 + 平台做过的改动」折成一小段带内文本，
接在系统提示或首条 user 之前。信息量应当很小（每个文件一行：名字、大小、
「已由平台展开引用句柄」/「已从工作目录搬入交付区」等标记），
但它同时解决四个问题：

1. 模型知道自己的文件被改了 → Edit 前会重读 → R1/R2/R4 的自救路径打通；
2. 模型知道交付区里到底有什么 → 不会宣称交付了不存在的文件
   （`verifyClaims.ts:229` 的 `deliveryMismatch` 现在只观测不纠正）；
3. 模型有了一份**不含路径的、可以直接对用户说的**产物清单
   → 「已生成《XX》」有据可依，不必去正文里念 `./out/`；
4. 压缩/重连之后这段每轮都会重新生成 → §4 的失忆被自动补偿。

**这一条是本次调研认为最高杠杆的单点改动。** 它不需要动 Edit 的算法，
不需要动搬运策略，就能把「模型以为改了、其实没改到」从**不可观测**变成**可自救**。

### C4 — 顺带：`out/` 这个词的暴露是工具层灌进去的，不是提示词管得住的

统计模型上下文里 `out/` 的注入点：`Write.description`（`registry.ts:198`
「To deliver a file to the user, write it under ./out/」）、
`ExportDocument.description`（`registry.ts:693`）、成功回执 `exported out/x.docx`
（`registry.ts:779`）、`BuildDeck` 回执（`registry.ts:897`）、
ENOENT 里的绝对路径（实测 D2）、`compact.extractArtifacts` 保留的路径串
（`compact.ts:171`）、`prompts/claw.go:113-138` 自己反复写的 `./out/`。

而禁令只有一条（`prompts/claw.go:121`）。**一条否定式规则对抗七个正面注入点**——
本仓库已有明确结论（记忆：`claw-ascii-diagram-relapse`「否定式规则没用，须正面模板」）。

真正的修法是**让模型不需要知道这个目录名**：
把 `file_path` 换成语义化的交付动作（如 `DeliverFile{name, content}` / `deliver: true` 参数），
路径由平台决定、不出现在任何工具 schema、description、回执里。
这同时消灭 C1（模型没有「写别处」这个选项了）。

---

## 8. 复现材料

三个脚本（放在 scratchpad，未进仓库）：

- `repro-edit-divergence.ts` —— R1 三轮分叉，直接调 `snapshotOut` / `emitArtifacts`
- `repro2.ts` —— [A] 直写 out/ 干净路径、[B] R2 引用展开失配、[C] R3 首处替换、
  [D1-D5] 四种失败回执原文、[E] CJK 假截断
- `repro3.ts` —— CJK/ASCII 大文件的 Read + capToolResult + estimateTokens 实测

运行方式：`cd agent && bun run <脚本>`（脚本用绝对路径 import 仓库源码，不改仓库）。

## 9. 未覆盖 / 存疑

- **未在真实 docker 环境跑通**：本次全部在宿主 bun 直跑，`bwrap` 缺失（日志里有
  `FATAL(sandbox)`）、`statkit` 未安装（`delivery_gate: 未取到证据`）。
  R1/R2/R3/E 四条与沙箱无关，结论成立；R4（deliveryGate enforce）**未实测**，只做代码论证，标 medium。
- **未量化线上真实发生率**：没有查 `agent_turns` / `turn_events` 里
  `edit failed: old_string not found` 的出现频次、也没查 `out/` 里 `-2`/`-3` 后缀文件的分布。
  这两个数是「该不该现在动」的最直接依据，建议补：
  - `docker logs scholar_agent | grep "artifact relocate renamed"` → R1 的直接计数器（已有 warn 日志，`artifacts.ts:278`）
  - `SELECT ... FROM turn_events WHERE payload LIKE '%old_string not found%'` → R2/R3/R4 合计
- `link(2)` 在本仓 bind-mount(`./data/agent-sessions:/home/bun/sessions`) 下的可用性未实测。
- prism 的 DB-真源 + 每轮重物化模型（记忆：`scholay-prism-plan`）没有细读，
  它可能是「文件真源不在 cwd」的一个现成参考实现，值得单独看一轮。
