# 09 · 文件编辑可靠性的业界最优解（外部调研）

> 对应痛点：**「进行编辑文件也容易出现错误，修改不到」**
> 调研日期：2026-08-07。全部结论带来源 URL 或本地文件路径；抄来的数字全部注明**来源 + 日期 + 样本量**。
> 姊妹篇：[05-internal-edit-reliability.md](./05-internal-edit-reliability.md)（本仓 Edit 工具的根因取证）。
> 本篇只回答「外面怎么做的、数据是多少」，最后一节才落到 Scholar 的选型。

---

## 0. 结论速览（先给判断，再给证据）

| # | 结论 | 强度 |
|---|---|---|
| **C1** | **业界没有「一种编辑格式通吃」**。强模型（GPT-5 / Claude 4+ / o3）用 SEARCH/REPLACE（aider 的 `diff`）成功率最高；弱模型/小模型用**整篇重写**（`whole`）反而更高，因为格式合规率是瓶颈 | 强（两套独立基准互证） |
| **C2** | **行号是所有人的公敌**。aider、OpenAI apply_patch、Cursor 三方独立结论一致：diff 里带行号会显著劣化。全部改用「上下文锚定」 | 强 |
| **C3** | **容错不是可选项，是主要收益来源**。aider 实测：关掉柔性匹配 → 编辑错误 **9 倍** | 强（原始出处） |
| **C4** | **失败回执的信息量 = 模型自救能力**。aider / OpenAI / Anthropic 三家的错误串都做了「说明失配原因 + 给近似行 + 告诉模型哪些已成功别重发」。我们目前是一句 `edit failed: old_string not found` | 强 |
| **C5** | **「大模型写草稿 + 小模型精确应用」已是成熟范式**（Cursor→Morph/Relace→Continue 内置 role）。指标：4.5k–10.5k tok/s、厂商自称 96–98% 合并准确率 | 中（速度可信，准确率是厂商自测） |
| **C6** | **小文件整篇重写是被 Cursor 用真实评测背书的**：`< 400 行`时全量重写优于 aider 式 diff。**我们的交付物（md/tex/报告）基本都在这个区间** | 强（Cursor 官方 blog + 450 例评测） |
| **C7** | **`undo_edit` 不是「我们缺的能力」，是 Anthropic 主动砍掉的命令**。`text_editor_20250429` 起移除。正解是**平台侧版本化**而非模型侧撤销工具 | 强（Anthropic 官方 changelog） |
| **C8** | **「编辑失败 N 次自动降级为整篇重写」是已知的毁文件模式**（Cline 线上事故）。降级必须显式、必须有快照 | 强（Cline issue 实录） |
| **C9** | **结构化文档（docx/pptx）的业界铁律是「绝不重生成、绝不经 markdown 往返」**，一律 unpack → 改 XML → repack → validate | 强（Anthropic 官方 skills） |

---

## 1. Aider —— 唯一有公开、可复现、跨格式基准的项目

### 1.1 五种编辑格式的定义

来源：<https://aider.chat/docs/more/edit-formats.html>

| 格式 | 形态 | 设计动机 |
|---|---|---|
| **`whole`** | 模型返回**整份文件**，包在 markdown fence 里，文件名写在 fence 之前 | 最简单、格式合规率最高；代价是 token 量大、限制可编辑文件大小 |
| **`diff`** | git 冲突标记风格的 SEARCH/REPLACE 块：<br>`<<<<<<< SEARCH` … `=======` … `>>>>>>> REPLACE` | 只回传改动部分，token 效率高 |
| **`diff-fenced`** | 同上，但**文件路径写在 fence 内部**而不是外部 | **专为 Gemini** —— Gemini 系列搞不定标准的 fence/路径分离约定 |
| **`udiff`** | 简化过的 unified diff（`--- / +++ / @@ ... @@`），**刻意不带行号** | 专治 GPT-4 Turbo 的「偷懒编码」（用 `// rest of code here` 省略未改动段） |
| **`editor-diff` / `editor-whole`** | architect 模式下的精简变体：architect 模型负责想清楚，editor 模型只负责把自然语言指令落成语法正确的编辑 | 把「思考」与「落笔」拆成两个模型 —— 这是 fast-apply 范式的开源同构物 |

> ⚠️ 该页**没有**定义 `udiff-simple` / `patch` / `architect` 三种格式（实测 2026-08-07）。别在设计文档里引用它们的「官方定义」。

### 1.2 硬数据一：早期 GPT-3.5/4 基准（133 道 Exercism Python 题）

来源：<https://aider.chat/docs/benchmarks.html>（原文未标注日期，属 2023 年那批）

| 模型 | `whole` 首次通过率 | `diff` 首次通过率 |
|---|---|---|
| gpt-3.5-turbo-0301（2 月版） | **46%** | 30% |
| gpt-3.5-turbo-0613（6 月版） | **39%** | ~19% |

原文结论（直译）：**「让 GPT 用标准 markdown fence 返回整份更新后的文件，是所有 GPT-3.5 与 GPT-4 模型上最可靠、最有效的编辑格式。」** 并且 **「用 function-call API 做编辑，在所有模型上都比整文件方法更差。」**

同页记录的两种畸形失败（对我们直接有参考价值）：
- **病态 diff**：GPT-3.5 常常把**整份原文件**塞进 ORIGINAL 块、**整份新文件**塞进 UPDATED 块 —— 即「名义上用了 diff，实际退化成 whole」；
- **幻觉 function call**：模型把整个 Python 文件硬塞进 arguments 字段，不遵守 JSON Schema。

### 1.3 硬数据二：unified diff 治「偷懒」（2023-12-21）

来源：<https://aider.chat/2023/12/21/unified-diffs.html>（89 道 laziness benchmark 任务）

| 模型 | SEARCH/REPLACE | udiff | 备注 |
|---|---|---|---|
| gpt-4-1106-preview（GPT-4 Turbo） | **20%**，12/89 任务出现偷懒注释 | **61%**，4/89 出现偷懒注释 | 偷懒率降到 1/3 |
| gpt-4-0613 | 26% | 59% | 28% 文件超 8k 上下文 → 理论上限 72% |

**该文最值钱的三条工程结论**（都是本仓可以直接抄的）：

1. **不给行号。** 原文：「GPT 处理源码行号极其糟糕」。aider 让模型省略 `@@ -2,4 +3,5 @@` 里的数字，把每个 hunk**当成一次 search-and-replace 来解释**。
2. **柔性 patch 是主要收益来源。** 实测**关掉柔性匹配 → 编辑错误增加 9 倍**。柔性处理的具体失配包括：缺失上下文行、新增行忘了打 `+`、缩进错误、跨文件段落漏 hunk。
3. **引导模型做「整函数/整方法级」diff 而非「逐行外科手术」，可减少 30–50% 编辑错误。**

### 1.4 硬数据三：Code Editing Leaderboard（133 题 Python）

来源：<https://aider.chat/docs/leaderboards/edit.html>

| 模型 | 通过率 | **格式合规率** | 格式 |
|---|---|---|---|
| o1 | 84.2% | 99.2% | diff |
| claude-3-5-sonnet-20241022 | 84.2% | 99.2% | diff |
| **gemini-exp-1206 (whole)** | **80.5%** | **100.0%** | whole |
| o1-preview | 79.7% | 93.2% | diff |
| claude-3.5-sonnet-20240620 | 77.4% | 99.2% | diff |
| claude-3-5-haiku-20241022 | 75.2% | 95.5% | diff |
| ollama/qwen2.5-coder:32b | 72.9% | 100.0% | whole |
| DeepSeek Coder V2 0724 | 72.9% | 97.7% | diff |
| gpt-4o-2024-05-13 | 72.9% | 96.2% | diff |
| o1-mini (whole) | 70.7% | 90.0% | whole |
| **gemini-exp-1206 (diff)** | **69.2%** | **84.2%** | diff |
| Qwen2.5-Coder-14B-Instruct | 69.2% | 100.0% | whole |

🔴 **本表最重要的一行是 gemini-exp-1206 的两次出现**：同一个模型，`whole` 拿 80.5%（格式合规 100%），`diff` 只有 69.2%（格式合规 84.2%）。**11.3 个百分点的差距几乎全部来自格式合规率的 15.8 个点缺口。**
→ 推论：**编辑成功率 ≈ 推理能力 × 格式合规率**。当模型的格式合规率掉到 90% 以下时，换成 `whole` 几乎必然是净赚。

### 1.5 硬数据四：Polyglot Leaderboard（225 题 × C++/Go/Java/JS/Python/Rust）

来源：<https://aider.chat/docs/leaderboards/>

| 模型 | 通过率 | 格式合规率 | 格式 | 总成本 |
|---|---|---|---|---|
| gpt-5 (high) | 88.0% | 91.6% | diff | $29.08 |
| gpt-5 (medium) | 86.7% | 88.4% | diff | $17.69 |
| o3-pro (high) | 84.9% | 97.8% | diff | $146.32 |
| gemini-2.5-pro-preview-06-05 (32k think) | 83.1% | **99.6%** | **diff-fenced** | $49.88 |
| o3 (high) | 81.3% | 94.7% | diff | $21.23 |
| grok-4 (high) | 79.6% | 97.3% | diff | $59.62 |
| **o3 (high) + gpt-4.1** | 78.2% | **100.0%** | **architect** | $17.55 |
| **DeepSeek-V3.2-Exp (Reasoner)** | **74.2%** | 97.3% | diff | **$1.30** |
| claude-opus-4-20250514 (32k thinking) | 72.0% | 97.3% | diff | $65.75 |
| claude-opus-4 (no think) | 70.7% | 98.7% | diff | $68.63 |
| DeepSeek-V3.2-Exp (Chat) | 70.2% | 98.2% | diff | $0.88 |
| DeepSeek R1 + claude-3-5-sonnet | 64.0% | **100.0%** | architect | $13.29 |
| claude-sonnet-4 (32k thinking) | 61.3% | 97.3% | diff | $26.58 |

两条对 Scholar 直接有用的观察：

- **architect 模式（拆分思考模型 + 落笔模型）两次出现都拿到 100.0% 格式合规率**，且 `o3 + gpt-4.1` 的成本（$17.55）显著低于 o3-pro 单跑（$146.32）。这是 fast-apply 范式在开源基准里的对照组。
- **`diff-fenced` 只在 Gemini 上用**，且 Gemini 用它能拿到 99.6%–100% 合规率 —— 说明**格式要按 provider 分档**，不是全局常量。本仓 `agent_config` 是 provider 可配置的（DeepSeek V4 Flash 等），这条直接相关。

### 1.6 benchmark 的修复循环

来源：<https://aider.chat/docs/leaderboards/notes.html>
- 「Percent using correct edit format」= **模型遵守系统提示里指定编辑格式的任务百分比**。
- 「若 LLM 犯了编辑错误，**aider 会给它反馈并要求它给出修正后的编辑**。」

即：**基准里的成功率本身就是「带一次自救机会」的成功率**。我们目前的 Edit 失败回执信息量为零，等于把这次自救机会浪费掉。

### 1.7 aider 的容错级联实现（可直接抄的代码结构）

来源：<https://github.com/Aider-AI/aider/blob/main/aider/coders/editblock_coder.py>

`replace_most_similar_chunk()` 的降级顺序：

| 顺序 | 策略 | 实现 |
|---|---|---|
| 1 | 精确匹配 / 前导空白柔性匹配 | `perfect_or_whitespace(whole_lines, part_lines, replace_lines)` → 内含 `perfect_replace` 与 `replace_part_with_missing_leading_whitespace` |
| 2 | 跳过模型多加的开头空行 | `if len(part_lines) > 2 and not part_lines[0].strip(): …` |
| 3 | 省略号占位 | `try_dotdotdots(whole, part, replace)` —— 处理模型用 `...` 省略中段的情况 |
| 4 | 编辑距离模糊匹配 | `replace_closest_edit_distance()` —— **实际不可达**：调用点上方有一个无条件的裸 `return` |

🔴 **第 4 层「被作者用一个裸 return 关掉」这件事本身就是结论**：编辑距离级的模糊匹配**不可控**（会静默改错地方），业界事实上的做法是**做到「空白/缩进/省略号」这一档就停，再往下宁可报错让模型自救**。

### 1.8 aider 的失败回执文案（本仓 §1.4 的直接对照）

同文件，原文串：

```
# {N} SEARCH/REPLACE {blocks} failed to match!

The SEARCH section must exactly match an existing block of lines
including all white space, comments, indentation, docstrings, etc

Are you sure you need this SEARCH/REPLACE block?
The REPLACE lines are already in {path}!

Did you mean to match some of these actual lines from {path}?

# The other {K} SEARCH/REPLACE {pblocks} were applied successfully.
Don't re-send them. Just reply with fixed versions of the {blocks} above that failed to match.
```

`find_similar_lines()` 用 `SequenceMatcher`，**相似度阈值 0.6**，命中后返回目标行 **±5 行**上下文。

**四条信息，我们一条都没有：**
1. 明确告诉模型「失配可能是空白/注释/缩进级差异」→ 引导它重新 Read 而非乱猜；
2. **「你要替换成的内容已经在文件里了」** → 这是幂等重试的正确终止条件，能直接掐掉死循环；
3. **给出近似行** → 模型不必重读全文即可修正；
4. **「其余 K 处已成功，别重发」** → 防止模型把已成功的编辑重放一遍造成二次损坏。

---

## 2. Diff-XYZ —— 学术侧的量化对照（把 aider 的经验结论做成了可比基准）

来源：<https://arxiv.org/html/2510.12487v2>（JetBrains Research，页脚日期 2025-11-17）

**设计**：1000 条 CommitPackFT 真实 commit，5 种语言各 200 例。三个任务：
- **Apply**：旧代码 + diff → 新代码
- **Anti-Apply**：新代码 + diff → 旧代码（考察是否真的"理解"了 diff 的语义）
- **Generate**：旧代码 + 新代码 → 产出 diff

**四种表示**：`udiff` / `udiff-h`（放松 hunk 头）/ `udiff-l`（把 `+/-` 换成 ADD/DEL/CON 显式标记）/ `search-replace`。

### 2.1 Apply / Anti-Apply（精确匹配 EM）

| 模型 | Apply | Anti-Apply |
|---|---|---|
| Claude 4 Sonnet | **96%** | 87% |
| GPT-4.1 | 81% | **95%** |
| Gemini 2.5 Flash | 93% | 81% |
| GPT-4o | 87% | 89% |

### 2.2 开源小模型的规模墙（Qwen2.5-Coder，Apply 任务）

| 参数量 | Apply EM |
|---|---|
| 0.5B | **0%** |
| 7B | 59% |
| 32B | 85% |

### 2.3 Generate 任务（search-replace 格式）

| 模型 | EM | F1+ | F1− |
|---|---|---|---|
| GPT-4.1 | 95% | 97% | 93% |
| Claude 4 Sonnet | 94% | 95% | 90% |
| Gemini 2.5 Flash | 88% | 94% | 87% |
| Qwen 32B | 68% | 91% | 82% |

### 2.4 论文结论（与 aider 完全一致，独立复现）

- **search-replace 在强模型上一致占优**，尤其是 Generate 任务；论文归因于它**避开了「预测 hunk 头行号」这类全局约束**。
- **对小/弱开源模型，四种格式表现同样差** —— 瓶颈是模型容量而非格式选择。
- 论文的规范表述是：**「应根据用例与模型规模选择不同格式」**。

🔴 对本仓的直接含义：**我们的 agent 上游 provider 可换（`agent_config` 表，admin 可改模型）**。一旦换到较弱/较便宜的模型（DeepSeek Chat 档、Qwen 档），**沿用同一套 Edit 契约会同步塌方**。编辑格式必须是 provider-aware 的配置项，而不是 `registry.ts` 里写死的一种。

---

## 3. Fast-apply 范式：「大模型写草稿、小模型精确落笔」

### 3.1 Cursor Instant Apply（这条范式的源头）

来源：<https://cursor.com/blog/instant-apply>（**2024-05-14**）

**核心结论（原文口径）：**
- 评测集 ≈ **450 条整文件编辑，文件均 < 400 行**；
- 微调后的 **Llama-3-70B「几乎追平 claude-3-opus-diff，并超过 gpt-4-turbo 与 gpt-4o」**；
- 速度：**~1000 tok/s（≈3500 char/s）**，相对 vanilla Llama-3-70B **13×** 加速，相对他们此前的 GPT-4 speculative edits 部署 **9×** 加速；
- 手段：**speculative edits** —— 不用 draft model，而是**用原始源码本身当 draft token**（因为编辑后的文件绝大部分与原文逐字相同），配合确定性算法预测下一段。

**为什么选整篇重写而不是 diff（原文三条理由，全部可迁移）：**
1. **输出 token 越多，模型可用的前向传播次数越多** —— diff 逼模型「在更少的 token 内想清楚」；
2. **预训练/后训练里，模型见过的完整代码文件远多于 diff**；
3. **模型出了名地数不好行号。**

> 社区在 aider 仓提的对照 issue：<https://github.com/Aider-AI/aider/issues/625>（标题即「fully rewriting the full file outperforms aider-like diffs for files under 400 lines」）。**该 issue 无 Paul Gauthier 的回应**，即 aider 侧未公开反驳也未采纳 —— 别把它当成"两家共识"。

### 3.2 Morph

来源：<https://openrouter.ai/morph/morph-v3-large>（模型发布 2025-07-07）、<https://www.morphllm.com/fast-apply-model>（429 抓取失败，数字取自搜索索引摘要，标注为**厂商自称**）

| 变体 | 速度 | 准确率（厂商自称） | 上下文 | 定价 |
|---|---|---|---|---|
| Morph V3 Large | ~4,500 tok/s | 98% | 262K | $0.90 / $1.90 per 1M in/out |
| Morph V3 Fast | ~10,500 tok/s | 96% | — | — |

**输入契约（重要 —— 这是范式的接口形状）：**
```
<instruction>{instruction}</instruction>
<code>{initial_code}</code>
<update>{edit_snippet}</update>
```
其中 `{edit_snippet}` 允许**偷懒标记**（`// ... existing code ...`）—— 也就是说：**大模型被允许写"省略式"的编辑草稿，由 apply 模型负责把它和原文精确合并**。这正好把「模型必须逐字复现原文」这个最脆弱的要求从大模型身上卸掉了。

厂商对比宣称（**未经独立验证**）：Fast Apply **98% 准确率 / ~6 秒每文件**，对比传统 search-and-replace 的 **86% 准确率 / 35 秒（含纠错重试）**。

### 3.3 Relace Apply 3

来源：<https://relace.ai/blog/relace-apply-3>（**2025-10-29**）

- 速度 **10k+ tok/s**（speculative decoding），上下文 **256k**；
- 训练：20 万合成样本 → 过滤后 **~14.5 万高置信数据点**；语言分布以 TS/JS、Markdown、Python、Ruby、HTML 为主；
- 评测：**500 条人工复核样本** + 一套从客户反馈收集的**病理性 merge 集**；
- 原文口径：**未经专门微调的前沿模型 merge 成功率约 96%，但仍有约 10% 的失败率**（两个数字在原文语境里分属不同测试集，引用时不要合并成一个数）；
- **六类 merge 错误分类**（这份错误分类学值得我们直接抄去做埋点）：
  1. **功能/合并错误** —— 漏掉了原文中的代码段；
  2. **幻觉错误** —— 引入了编辑草稿里没有的改动；
  3. **截断错误** —— 合并不完整，产出无法编译的文件；
  （其余三类原文未在摘要中展开）

> 原文还有一条工程洞见：**speculative decoding 下速度与准确率是强耦合的** —— 每一个幻觉 token 都会打断猜测序列、重置验证链、浪费算力。也就是说 apply 模型「快」和「准」不是 trade-off，是同一件事。

### 3.4 Continue：把 apply 做成了一等公民的「模型角色」

来源：<https://docs.continue.dev/customize/model-roles/apply>

- 定义：**「带 `apply` 角色的模型用于生成更精确的 diff，以把改动应用到文件上」**；
- 触发条件：**当 Chat/Edit 模型的输出与既有代码对不齐时**，不直接落盘，而是把活转交给 apply 模型；
- 推荐模型：**Morph Fast Apply**、**Relace Instant Apply**；预算敏感场景用「更小更便宜的 chat 模型，例如 Claude 3.5 Haiku」；
- 提示模板契约（Handlebars）：`{{{original_code}}}` + `{{{new_code}}}`，可经 `promptTemplates.apply` 自定义。

🔴 **这条最有借鉴价值**：Continue 没有把 apply 做成一个隐式的字符串算法，而是做成了**可配置的模型角色**。对本仓意味着 —— `agent_config` 里除了主 provider/model，还应有一个可选的 `apply_model` 槽位（默认空 = 走确定性合并）。

---

## 4. OpenAI `apply_patch` / V4A diff 格式

### 4.1 格式规范（原文口径）

来源：<https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/prompt_with_apply_patch_instructions.md>、<https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide>

**信封：**
```
*** Begin Patch
[file operations]
*** End Patch
```

**三种文件操作：**
- `*** Add File: <path>` —— 新建，后续每行均以 `+` 前缀（**新建文件里的行也必须带 `+`**）
- `*** Update File: <path>` —— 就地打补丁
- `*** Delete File: <path>` —— 删除
- 可选 `*** Move to: <new_path>` —— 紧跟在 `*** Update File:` 之后，表示重命名
- 可选 `*** End of File` —— 标记最后一个 hunk

**hunk 与上下文：**
- 空格前缀 = 上下文行（必须匹配现有代码）、`-` = 删除、`+` = 新增；
- **默认前后各 3 行上下文**；相邻 hunk 之间**不要重复上下文**；
- 用 `@@ class Name` / `@@ def method():` 作为消歧锚点；**同一函数/类内片段重复时可叠加多个 `@@`**；
- 路径必须是**相对路径**（禁绝对路径）。

**规范里最关键的一句（与 aider/Cursor 三方共识）：**
> **「上下文本身足以唯一定位代码位置；本格式不使用行号。」**

调用形状：`{"command":["apply_patch","*** Begin Patch\n...\n*** End Patch\n"]}`

### 4.2 官方的错误处理契约

来源：<https://developers.openai.com/api/docs/guides/tools-apply-patch>

⚠️ **实测该页并不包含 V4A 的完整格式规范**，它只写了三种操作（`create_file` / `update_file` / `delete_file`）并把格式细节甩给 SDK 的参考实现。**它真正有价值的是错误契约那一段：**

- 打补丁失败时应设置 **`status: "failed"`**，并附一段**有用的 `output` 字符串，让模型能自救**；
- 官方给的两个错误串范例：
  - `"Error: File not found at path 'lib/baz.py'"`
  - `"Error: Invalid Context:\n@@ def fib(n):"` ← **直接把失配的锚点回吐给模型**
- 原文强调：清晰的错误消息使模型能够**基于失败反馈调整后续的 diff**。

### 4.3 匹配算法（第三方逆向文档）

来源：<https://codex.danielvaughan.com/2026/03/31/codex-cli-apply-patch-v4a-diff-format/>（发布 2026-03-31，更新 2026-08-07）—— **非官方，标注为第三方分析**

- `@@` 头把 hunk 锚定到某一行文本；**harness 先扫描文件找到那段文本，再从那里开始做上下文匹配 —— 全程不涉及行号**；
- **三级递进模糊匹配**：① 精确匹配 → ② 忽略行尾差异 → ③ 忽略所有空白；
- 失败时返回 `status: "failed"` + 错误上下文，让模型**下一轮自我修正**，而不是静默失败。

另有第三方综述（<https://fabianhertwig.com/blog/coding-assistants-file-edits/>，更新 2025-04-26）把 Codex 归类为「结构化 patch + `@@` 上下文标记，避免行号，采用渐进式模糊匹配」，与上面一致。

### 4.4 SWE-bench 数字的准确口径（**防止被误引**）

- GPT-4.1 官方公告：**SWE-bench Verified 54.6%**，对比 GPT-4o 的 **33.2%**。
- GPT-4.1 prompting guide 里唯一与工具格式直接相关的量化陈述是：**「使用 API 解析的工具描述，相较于手工把 schema 注入系统提示，SWE-bench Verified 通过率提升约 2%。」**
- 🔴 **网上流传的「apply_patch 让 SWE-bench 提升 X%」多数是把上面两个数字混起来了。除非拿到 OpenAI 的分格式消融，否则不要在我们的方案文档里写「apply_patch 带来 N% 提升」。**

---

## 5. Anthropic `str_replace_based_edit_tool` —— 以及 `undo_edit` 的真相

来源：<https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool>（官方文档，实测 2026-08-07）

### 5.1 版本沿革（官方 changelog 原文）

| 日期 | 版本 | 变更 |
|---|---|---|
| 2025-07-28 | `text_editor_20250728` | 修复若干问题，**新增可选 `max_characters` 参数**；其余与 `20250429` 完全相同 |
| 2025-04-29 | `text_editor_20250429` | Claude 4 版本。**「This version removes the `undo_edit` command but maintains all other capabilities.」** 工具名同时改为 `str_replace_based_edit_tool` |
| 2025-03-13 | `text_editor_20250124` | 独立文档化；针对 Claude Sonnet 3.7 优化，能力与前一版相同 |
| 2024-10-22 | `text_editor_20241022` | 首发（Claude Sonnet 3.5，已退役）。提供 **`view` / `create` / `str_replace` / `insert` / `undo_edit`** 五个命令 |

### 5.2 🔴 关于 `undo_edit` —— 需要修正调研任务书里的前提

任务书写的是「**undo_edit 这个能力我们没有，值得注意**」。**实际情况相反：Anthropic 自己在 2025-04-29 把它砍了。**

- 完整命令集只在**已退役**的 `text_editor_20241022` / `text_editor_20250124`（Claude 3.5/3.7 时代）上是 5 个；
- **Claude 4 及以后（`20250429` / `20250728`）只有 4 个：`view` / `create` / `str_replace` / `insert`**；
- 本机 `claude-api` skill 的迁移指引也把它列为**必须删除的调用点**：「Delete any `undo_edit` command call sites」「`undo_edit` command → *(no longer supported — delete call sites)*」（`/private/tmp/claude-501/bundled-skills/2.1.222/4d2ca084d48261a95ab6c3bdaaad2366/claude-api/shared/model-migration.md`）。

**为什么砍掉 —— 我的判断（推理，非官方声明，标 low）：** `undo_edit` 是**有状态**的工具（需要 harness 维护每文件的编辑栈），与「API 无状态 + 工具由客户端实现」的架构冲突；而且它让模型误以为自己有安全网，反而鼓励高风险编辑。**业界的替代解是平台侧版本化 —— 官方文档在「安全最佳实践」里直接写：「Backup: Always create backups before allowing edits to important files.」**

→ 对我们的含义：**不要给模型加 `undo_edit` 工具**。要做的是**平台侧每次写入前快照 + 用户端可见的版本历史**。这一步同时喂饱本次调研的另一条主线（用户看不见文件产出/版本）。

### 5.3 官方错误回执范例（逐字）

文档「Handle errors」一节给出四类错误的标准 `tool_result` 形状，全部带 `"is_error": true`：

| 场景 | 官方错误串 |
|---|---|
| 文件不存在 | `"Error: File not found"` |
| **多处命中** | `"Error: Found 3 matches for replacement text. Please provide more context to make a unique match."` |
| **零处命中** | `"Error: No match found for replacement. Please check your text and try again."` |
| 权限问题 | `"Error: Permission denied. Cannot write to file."` |

🔴 **「多处命中要报错并要求模型补上下文」是 Anthropic 的官方语义。** 本仓 `registry.ts` 的 Edit 是 `indexOf` **静默改第一处**（见 05 报告 §1.2 R3）—— 这不是「实现得简单些」，这是**与模型训练分布相反的语义**，模型会理所当然地以为全改了。

文档「安全最佳实践」还明确列了：
> **4. Unique matching: Make sure replacements match exactly one location to avoid unintended edits.**

### 5.4 其他官方细节

- `max_characters` **仅 `text_editor_20250728` 及以后支持**，用于 view 大文件时的截断控制；
- 工具本身的**额外输入 token 开销：`text_editor_20250429`（Claude 4.x）= 700 tokens**；
- 工具是**客户端执行**的（Anthropic 只定义 schema，执行由 harness 负责）；schema 不可修改，不要传 `input_schema`。

### 5.5 「读前置 / 陈旧检查」是 Anthropic 明确写下的设计理由

来源：`claude-api` skill 的 `shared/agent-design.md`（本机路径同上）：

> **「Staleness checks. A dedicated `edit` tool can reject writes if the file changed since Claude last read it. Bash can't enforce that invariant.」**

即：**「Edit 是独立工具而非 bash 命令」的核心正当性之一，就是它能做陈旧性拒绝。** 本仓 Edit 没有这个校验（05 报告 §1.2），等于放弃了把它做成独立工具的一半收益 —— 而 R1（`relocateStrays` 复制分叉）/ R2（`resolveCitations` 就地改写）**正是陈旧性检查唯一能拦住的那类 bug**。

---

## 6. Cline / Roo / Windsurf：失败恢复的正反教材

### 6.1 Cline —— 反面教材（严格匹配 + 隐式降级 = 毁文件）

来源（GitHub issues，均为线上用户实录）：
- <https://github.com/cline/cline/issues/2909>（Addressing "Diff Edit Mismatch" Errors）
- <https://github.com/cline/cline/issues/3183>（`replace_in_file` fails due to strict matching, causing `write_to_file` fallback to **corrupt file content**）
- <https://github.com/cline/cline/issues/4384>（Fix File Editing Tool Reliability，综合性修复，关闭了多个相关 issue）
- 另有 #973 / #1195 / #1511 / #2175 / #3513 同类

**机制链条（与本仓完全同构）：**
1. `replace_in_file` 要求**逐字符精确匹配**，哪怕只差空白或行尾符也失配 → 「Diff Edit Mismatch」；
2. **连续失败 3 次后自动降级为 `write_to_file`（整篇重写）**；
3. 降级后的整篇重写**会删掉绝大部分原文内容并替换成占位符**，即**用一次"修复"把文件毁掉**。

🔴 **这是本次调研最重要的一条负面证据**，因为它和 05 报告实测到的行为一模一样：「模型改用 Write 整篇重写 → 覆盖掉自己也没读到的部分」。区别只在于 Cline 是**平台代码里写死的自动降级**，我们是**模型自发的降级**。两者后果相同，且我们更难观测。

**可抄的结论：**
- 降级到整篇重写**必须是显式的**（模型主动选择，且系统提示里写清代价）；
- 降级前**必须有快照**；
- 降级时**必须强制先 Read 全文**（否则模型在写它没读过的内容）。

### 6.2 Roo Code —— 正面教材（有阈值、有锚点、有位置提示的模糊匹配）

来源：<https://roocodeinc.github.io/Roo-Code/advanced-usage/available-tools/apply-diff/>、<https://deepwiki.com/qpd-v/Roo-Code/6.2-search-and-replace-strategy>

- **`apply_diff` 用「行号提示 + 模糊匹配」而非纯精确匹配**：模型给 `:start_line:` 作为**位置提示**（注意：是 hint，不是硬约束），平台在其周围一个可配置的 `bufferLines` 窗口内做 **middle-out 搜索**；
- 相似度用**归一化字符串上的 Levenshtein 距离**，**置信阈值可配，典型 0.8–1.0**（1.0 = 精确匹配）；
- **multi-search-replace 策略**支持一次请求内多处替换；其匹配级联为：**精确匹配 → 锚点匹配（首末行做锚，中间段用 SequenceMatcher 打分，多候选时相似度阈值 0.3）→ 字符串相似度 → Levenshtein**；
- 已知坑：<https://github.com/RooCodeInc/Roo-Code/issues/2214>（middle-out 搜索问题）、<https://github.com/RooCodeInc/Roo-Code/issues/4013>（REPLACE 段里的 `:start_line:` 标记被误处理）。

**与 aider 的关键差异**：Roo **保留了行号，但把它降级为"提示"**，只用来缩小搜索窗口，不用来定位。这是一个折中方案 —— 既拿到了「快速定位 + 消歧」的好处，又不承担「模型数错行号就整个失败」的风险。

### 6.3 Windsurf / Continue

- **Windsurf Cascade**：编辑以**内联 diff（绿/红高亮）**呈现在编辑器里，用户可以**接受 / 拒绝 / 修改后再落盘**（来源：<https://www.deployhq.com/guides/windsurf>）。即：**把"应用"这一步做成人在环**，而不是自动落盘 —— 这条对我们的用户端交付面板有直接借鉴意义。
- 第三方使用报告还指出一个与我们 R4（上下文失忆）同构的问题：长会话进行到第三小时后，Cascade 基于「被压缩过的理解」工作，遗漏关键约束，且**反复提醒早期决策也无法可靠阻止漂移**（来源：<https://www.appstuck.com/blog/windsurf-troubleshooting-10-errors-fixes-2026>，第三方博客，标 low）。
- **Continue**：见 §3.4。

### 6.4 第三方横向综述

来源：<https://fabianhertwig.com/blog/coding-assistants-file-edits/>（更新 2025-04-26，实测覆盖 **Codex / Aider / OpenHands / RooCode / Cursor 五家**；**未涉及 Claude Code / Cline / Windsurf / Continue**）

| 系统 | 编辑机制 |
|---|---|
| Codex | 结构化 patch + `@@` 上下文标记，避免行号，渐进式模糊匹配 |
| Aider | 多格式（SearchReplace / unified diff / OpenAI patch / whole），分层匹配策略 |
| **OpenHands** | 传统 patch 检测为主，**可选接入一个独立的「draft editor」LLM 来重写指定行区间** |
| RooCode | search/replace + middle-out 模糊匹配（Levenshtein 打分），强调保持缩进 |
| Cursor | 专用 Apply 模型：主 LLM 打草稿，定制训练的 Apply 模型智能合并 |

该文列举的**共性失败模式**（与我们的 R1–R4 高度重合）：
- 上下文失配（文件已偏离 LLM 视图中的样子）—— **对应我们的 R1/R2**；
- 无法定位正确插入点；
- 缩进处理错误；
- **多处相似代码段导致混淆** —— **对应我们的 R3**；
- 某些方案里的行号脆弱性。

---

## 7. 结构化文档（docx / pptx）：重生成 vs 增量 patch

**业界答案是明确的：编辑既有文档时，绝不重生成、绝不经 markdown 往返，一律 unpack → 改 XML → repack → validate。**

### 7.1 Anthropic 官方 docx skill

来源：<https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md>

**创建 vs 编辑的分岔（原文口径）：**
- **新建**：用 `docx`（npm）写脚本生成；
- **编辑既有**：解压 `.docx` → 直接改 `word/document.xml` → 重新打包。原文明确：**「docx-js cannot open existing files.」**

**unpack/edit/repack 六步：**
```
1. unzip -q doc.docx -d unpacked/
2. find unpacked -type l -delete            # 去掉符号链接
3. python scripts/merge_runs.py unpacked/    # 合并碎片化的 <w:r> run
4. 就地编辑 word/document.xml —— do NOT reformat or pretty-print
5. (cd unpacked && rm -f ../out.docx && zip -Xr ../out.docx .)
6. python scripts/office/validate.py out.docx --original doc.docx
```

**两条硬性约束（原文）：**
- **「Never regenerate when editing — modify XML directly.」**
- **「Never round-trip through markdown — use direct XML manipulation.」**

**redlining（留痕修订）工作流**：编辑包进 `<w:ins>` / `<w:del>` 标签，带 `w:id` / `w:author` / `w:date` 属性；用 `--author "<name>" --original <file>` 校验每处编辑都被追踪。第三方/法律/学术/商务/政府文档**推荐或强制**走 redlining 而非简单 OOXML 编辑（来源：<https://knightli.com/en/2026/04/04/analyze-docx-agent-skill/>）。

**一个非常具体的坑（我们的 pptx 导出可能踩）：** 文本会被拆散到多个 `<w:r>` run 里，导致「按文本搜索」失败 —— 所以官方脚本里有一个专门的 `merge_runs.py` 先把 run 合并成可搜索的形态。**这就是「结构化文档里 str_replace 为什么天然不可靠」的物理原因。**

### 7.2 Anthropic 官方 pptx skill

来源：<https://raw.githubusercontent.com/anthropics/skills/main/skills/pptx/SKILL.md>

- **新建**：pptxgenjs 脚本；
- **编辑既有**：unpack → 改 `ppt/slides/slideN.xml` → repack；
- **顺序铁律**：**「Do all structural work — add, delete, reorder — before editing any slide's content.」**（结构变更必须先于内容编辑）；
- **文本替换铁律**：不要用 `text_frame.text = "..."` —— **那会把整段塌缩成一个无样式的 run**；应该逐个赋值 `run.text`；
- **验证是必须步骤**：`python scripts/office/validate.py output.pptx [--original src.pptx]`（从模板生成时传 `--original`，用于抑制模板自带的既有错误）；
- **「Never regenerate after manual XML edits」** —— 一旦手工改过 XML，源生成脚本就不再反映真实内容，重跑脚本会覆盖掉手工编辑。

### 7.3 提炼成三条可执行规则

| 规则 | 理由 |
|---|---|
| **二进制/结构化产物的「编辑」必须是 XML 级增量，不能是重生成** | 重生成会丢掉：注释、修订记录、模板样式、用户手改 |
| **文本级 `str_replace` 在 OOXML 上不可靠**，必须先做 run 合并 | 一句话可能被拆进 5 个 `<w:r>` |
| **每次写回必须过 schema 校验**，且校验要以原文件为 baseline | 否则产出一个能生成但 Office 打不开的文件 |

---

## 8. 可量化对比总表（一页纸抄数据用）

### 8.1 编辑格式 × 模型 成功率

| 来源 | 日期 | 样本 | 模型 | 格式 | 通过率 | 格式合规率 |
|---|---|---|---|---|---|---|
| aider benchmarks | ~2023 | 133 Exercism Py | gpt-3.5-turbo-0301 | whole | **46%** | — |
| 同上 | | | gpt-3.5-turbo-0301 | diff | 30% | — |
| 同上 | | | gpt-3.5-turbo-0613 | whole | **39%** | — |
| 同上 | | | gpt-3.5-turbo-0613 | diff | ~19% | — |
| aider unified-diffs | 2023-12-21 | 89 laziness | gpt-4-1106-preview | SEARCH/REPLACE | 20% | 偷懒 12/89 |
| 同上 | | | gpt-4-1106-preview | **udiff** | **61%** | 偷懒 4/89 |
| 同上 | | | gpt-4-0613 | SEARCH/REPLACE | 26% | — |
| 同上 | | | gpt-4-0613 | **udiff** | **59%** | — |
| aider edit LB | — | 133 Exercism Py | o1 | diff | 84.2% | 99.2% |
| 同上 | | | claude-3-5-sonnet-20241022 | diff | 84.2% | 99.2% |
| 同上 | | | **gemini-exp-1206** | **whole** | **80.5%** | **100.0%** |
| 同上 | | | **gemini-exp-1206** | **diff** | **69.2%** | **84.2%** |
| 同上 | | | claude-3-5-haiku-20241022 | diff | 75.2% | 95.5% |
| 同上 | | | Qwen2.5-Coder-32B | whole | 72.9% | 100.0% |
| aider polyglot LB | — | 225 × 6 语言 | gpt-5 (high) | diff | 88.0% | 91.6% |
| 同上 | | | gemini-2.5-pro (32k think) | diff-fenced | 83.1% | 99.6% |
| 同上 | | | **o3 (high) + gpt-4.1** | **architect** | 78.2% | **100.0%** |
| 同上 | | | claude-opus-4 (32k thinking) | diff | 72.0% | 97.3% |
| 同上 | | | DeepSeek-V3.2-Exp (Reasoner) | diff | 74.2% | 97.3% |
| Diff-XYZ | 2025-11-17 | 1000 commits × 5 语言 | Claude 4 Sonnet | apply (EM) | **96%** | — |
| 同上 | | | GPT-4.1 | apply (EM) | 81% | — |
| 同上 | | | GPT-4.1 | anti-apply (EM) | **95%** | — |
| 同上 | | | Qwen2.5-Coder-0.5B | apply (EM) | **0%** | — |
| 同上 | | | Qwen2.5-Coder-7B | apply (EM) | 59% | — |
| 同上 | | | Qwen2.5-Coder-32B | apply (EM) | 85% | — |
| 同上 | | | GPT-4.1 | generate / search-replace (EM) | **95%** | — |
| 同上 | | | Claude 4 Sonnet | generate / search-replace (EM) | 94% | — |

### 8.2 Fast-apply 模型（速度 / 准确率）

| 产品 | 日期 | 速度 | 准确率 | 上下文 | 备注 |
|---|---|---|---|---|---|
| Cursor fast-apply (Llama-3-70B ft) | 2024-05-14 | ~1000 tok/s（≈3500 char/s） | 「几乎追平 claude-3-opus-diff，超过 gpt-4-turbo/gpt-4o」 | — | 450 例、<400 行文件；13× vs vanilla；9× vs 前代 GPT-4 部署 |
| Morph V3 Fast | 2025-07 | ~10,500 tok/s | 96%（厂商自称） | — | — |
| Morph V3 Large | 2025-07-07 | ~4,500 tok/s | 98%（厂商自称） | 262K | $0.90/$1.90 per 1M |
| Relace Apply 3 | 2025-10-29 | 10k+ tok/s | 「SOTA merge 准确率」 | 256k | 500 例人工复核 + 病理集；训练 145k 样本 |
| （对照）未微调前沿模型 | Relace 口径 | — | ~96% edit success，但仍约 10% 失败 | — | 两个数分属不同测试集 |

### 8.3 容错手段的边际收益（唯一有直接实验数字的一条）

| 手段 | 效果 | 来源 |
|---|---|---|
| **关闭柔性 patch** | 编辑错误 **×9** | aider, 2023-12-21 |
| 从 diff 头里去掉行号，改为 search-replace 语义 | 该文整体从 20% → 61%（含其他改动） | 同上 |
| 引导模型产出「整函数级」diff 而非逐行 | 编辑错误减少 **30–50%** | 同上 |

---

## 9. 落到 Scholar：分档建议

> 前置事实（引自 05 报告，`agent/src/tools/registry.ts:217-244`）：本仓 Edit = 22 行，`indexOf` 首处替换，无 `replace_all`、无唯一性校验、无读前置、无 mtime/指纹校验、无 MultiEdit，失败回执唯一文案 `edit failed: old_string not found`，且 ENOENT 分支会把**宿主绝对路径**灌进模型上下文。

### 档 0 —— 零架构改动，纯语义对齐（对齐模型训练分布，ROI 最高）

1. **唯一性校验**：命中 >1 处 → 报错，文案抄 Anthropic 官方：
   `Error: Found N matches for replacement text. Please provide more context to make a unique match.`
   同时新增 `replace_all: boolean` 参数（Claude Code 语义）。**这一条单独就能消灭 R3。**
2. **失败回执重写**（抄 aider 四要素）：
   - 明确「必须精确匹配含全部空白/注释/缩进」；
   - **「你要替换成的内容已经在文件里了」** 分支 → 幂等重试的终止条件，直接掐死循环；
   - `find_similar_lines`（`SequenceMatcher`，阈值 0.6，返回 ±5 行）；
   - 多 Edit 场景告诉模型「其余 K 处已成功，别重发」。
3. **路径脱敏**：所有回执里的路径换成对用户/模型都安全的「显示名」，不吐 `/home/bun/sessions/<id>/...`。这同时修掉 04 报告的路径泄漏主线。

### 档 1 —— 容错级联（抄 aider + Roo，但**只做到可控那一档**）

顺序（短路即停，精确匹配零开销）：
```
① 精确子串
② 行尾/尾随空白归一化
③ 前导缩进整体偏移归一化（replace_part_with_missing_leading_whitespace）
④ 跳过模型多加的开头/结尾空行
⑤ 省略号占位（... existing content ...）
⑥ 首末行锚定 + 中段相似度（阈值 ≥0.8，且必须唯一命中；否则报错）
--- 到此为止 ---
✗ 不做无阈值的编辑距离全局模糊匹配（aider 自己用一个裸 return 关掉了这一层）
```

### 档 2 —— 契约层（干掉 R1/R2 这类"平台在模型背后改文件"的分叉）

4. **读前置 + 内容指纹**：Read 返回 `{content, sha}`；Edit 接受可选 `expect_sha`；不匹配则拒绝并**回吐新内容摘要**。
   依据：Anthropic `agent-design.md` 明说 —— **「A dedicated edit tool can reject writes if the file changed since Claude last read it.」** 这是 Edit 作为独立工具的核心正当性。
5. **平台侧就地改写必须 in-band 通知**：`resolveCitations` 改完交付文件后，必须把新指纹/新片段以工具结果的形式回吐给模型；否则模型下一轮拿自己写的原文去 Edit **必然**失配（05 报告 R2 已复现）。
6. **`relocateStrays` 的复制语义要改成移动或引用**，否则「改原件、卡片读副本」的分叉永远存在。这是 Read/Edit 层修不掉的。

### 档 3 —— 整篇重写通道（我们的场景反而更适合，但必须有护栏）

7. **给小文件开一条显式的「整篇重写」路径**：
   - 依据：**Cursor 用 450 例评测背书 `<400 行`时全量重写优于 diff**；aider 数据显示**格式合规率一掉，whole 就净赚**；Diff-XYZ 显示**弱模型上格式选择无意义**。
   - 我们的交付物（md / tex / 报告 / 综述）绝大多数在 400 行以内 → **这条通道的适用面比编码 agent 大得多**。
   - 🔴 **护栏（Cline #3183 的教训）**：① 必须**强制先 Read 全文**；② 必须**写前快照**；③ **禁止在 Edit 连续失败后隐式降级** —— 降级必须是模型显式选择，且系统提示要写清代价。

### 档 4 —— 版本化（替代 `undo_edit`，且一鱼两吃）

8. **不要给模型加 `undo_edit` 工具** —— Anthropic 自己在 `text_editor_20250429` 砍了它，迁移指引里写的是「delete call sites」。
9. **改为平台侧每次写入前快照 + 用户端可见版本历史**。依据：Anthropic 官方安全最佳实践第 2 条 **「Always create backups before allowing edits to important files.」**
   **这一条同时解决本次调研的另一条主线**：用户看不见文件产出 —— 有了版本链，用户端天然可以展示「v1 → v2 → v3 + diff」，这正是 Windsurf Cascade 内联 diff（可 accept/reject）的产品形态。

### 档 5 —— provider-aware 的编辑格式（中期）

10. **把编辑格式做成 `agent_config` 的一部分，而不是 `registry.ts` 里的常量。**
    依据：Diff-XYZ 与 aider 双重证明「格式该按模型规模/家族选」；aider 甚至为 Gemini 单开 `diff-fenced`。本仓 provider/model 是 admin 可改的单行配置 —— **换一次模型就可能把编辑成功率打穿，而现在没有任何机制感知这件事**。
    最小实现：`agent_config` 加 `edit_format` 枚举（`str_replace` / `whole` / `auto`），`auto` 按文件大小 + provider 档位分流。
11. **（可选，成本敏感）apply 模型槽位**：抄 Continue 的 `apply` role —— `agent_config` 加 `apply_model`，默认空 = 走档 1 的确定性合并。接 Morph/Relace 涉及多租户下的第三方数据出境，需另评合规；短期不做。

### 别抄什么（负面清单）

| 别做 | 理由 |
|---|---|
| **行号驱动的编辑** | aider / OpenAI / Cursor 三方独立结论：模型数不好行号 |
| **无阈值的编辑距离全局模糊匹配** | aider 自己用一个裸 `return` 把这层关掉了 —— 静默改错地方比报错更糟 |
| **失败 N 次自动整篇重写** | Cline #3183 实测毁文件（删掉大部分原文换成占位符） |
| **给模型加 `undo_edit`** | Anthropic 已下线；有状态工具与无状态 API 架构冲突；且会诱导模型冒进 |
| **对 docx/pptx 做重生成或 markdown 往返** | Anthropic 官方 skill 两处硬性禁止；会丢样式/批注/修订记录 |
| **在方案里写「apply_patch 带来 N% SWE-bench 提升」** | 该数字不存在；官方唯一相关量化是「API 解析工具描述 vs 手工注入 schema，+2%」 |

---

## 10. 置信度与未验证项

| 项 | 置信 | 说明 |
|---|---|---|
| aider 全部数字 | 高 | 一手页面，可复现基准 |
| Diff-XYZ 全部数字 | 高 | arXiv 论文正文 |
| Cursor 全部数字 | 高 | 官方 blog，注明评测规模 |
| Anthropic 工具语义/changelog/错误串 | 高 | 官方文档逐字 |
| Morph / Relace 准确率 | **中** | **厂商自测，无独立复现**；速度数字（tok/s）相对可信 |
| Morph 的「98%/6s vs 86%/35s」对比 | **低** | 官网 429 未抓到，取自搜索索引摘要，属营销对比 |
| Codex apply_patch 的三级模糊匹配 | **中** | 第三方逆向文档（danielvaughan），非 OpenAI 官方 |
| Cline 的「3 次失败后降级」 | **中** | 来自 issue 讨论与用户实录，非官方文档；#4384 声称已综合修复，未验证当前版本行为 |
| Windsurf 长会话漂移 | **低** | 第三方博客，无量化 |
| `undo_edit` 被砍的原因 | **低** | 官方只写了「removes」，未给理由；本文给的解释是推理 |
| arXiv 2603.05344（终端编码 agent 论文）里的「九级 replacer 链」 | **低** | PDF 抓取失败（7.6MB 压缩流不可读），仅有搜索索引摘要；**不要在方案文档里引用其具体阈值** |

---

## 附：本报告引用的全部一手来源

- Aider edit formats — <https://aider.chat/docs/more/edit-formats.html>
- Aider GPT code editing benchmarks — <https://aider.chat/docs/benchmarks.html>
- Aider unified diffs（laziness benchmark）— <https://aider.chat/2023/12/21/unified-diffs.html>
- Aider code editing leaderboard — <https://aider.chat/docs/leaderboards/edit.html>
- Aider polyglot leaderboard — <https://aider.chat/docs/leaderboards/>
- Aider benchmark notes — <https://aider.chat/docs/leaderboards/notes.html>
- Aider `editblock_coder.py` — <https://github.com/Aider-AI/aider/blob/main/aider/coders/editblock_coder.py>
- Diff-XYZ（arXiv 2510.12487v2）— <https://arxiv.org/html/2510.12487v2>
- Cursor Instant Apply — <https://cursor.com/blog/instant-apply>
- Aider issue #625（Cursor fast-apply 讨论）— <https://github.com/Aider-AI/aider/issues/625>
- Morph V3 Large（OpenRouter）— <https://openrouter.ai/morph/morph-v3-large>
- Relace Apply 3 — <https://relace.ai/blog/relace-apply-3>
- Continue Apply role — <https://docs.continue.dev/customize/model-roles/apply>
- OpenAI codex apply_patch instructions — <https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/prompt_with_apply_patch_instructions.md>
- OpenAI GPT-4.1 prompting guide — <https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide>
- OpenAI apply_patch tool guide — <https://developers.openai.com/api/docs/guides/tools-apply-patch>
- V4A 第三方分析 — <https://codex.danielvaughan.com/2026/03/31/codex-cli-apply-patch-v4a-diff-format/>
- Anthropic text editor tool — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool>
- Anthropic docx skill — <https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md>
- Anthropic pptx skill — <https://raw.githubusercontent.com/anthropics/skills/main/skills/pptx/SKILL.md>
- Roo Code apply_diff — <https://roocodeinc.github.io/Roo-Code/advanced-usage/available-tools/apply-diff/>
- Roo Code search/replace strategy — <https://deepwiki.com/qpd-v/Roo-Code/6.2-search-and-replace-strategy>
- Cline issues #2909 / #3183 / #4384 — <https://github.com/cline/cline/issues/3183>
- 横向综述（Codex/Aider/OpenHands/RooCode/Cursor）— <https://fabianhertwig.com/blog/coding-assistants-file-edits/>
- 本机 claude-api skill（`shared/agent-design.md`、`shared/model-migration.md`）— `/private/tmp/claude-501/bundled-skills/2.1.222/4d2ca084d48261a95ab6c3bdaaad2366/claude-api/`
