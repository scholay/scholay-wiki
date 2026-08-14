# OpenAI 系的「文件交付」形态 —— 一手材料调研

> 调研日期：2026-08-07
> 范围：ChatGPT Code Interpreter / Advanced Data Analysis / Containers、ChatGPT Canvas（canmore）、
> Assistants API & Responses API 的 Files/annotations、官方 Citation Formatting 指南、
> AgentKit / ChatKit / ChatGPT Agent、以及可信来源的逆向系统提示词。
> 方法：WebSearch + WebFetch 读一手页面（官方 docs / help center / OpenAI 开发者论坛 / GitHub 原始文件）。
> 凡是我**没读到原文**的推断，一律在正文里标注「推断」并给出置信度。

---

## 〇、结论先行（写给已经懂 Scholar 这套的人）

Scholar 现在的痛点是三条，而 OpenAI 对这三条各有一个**已经工业化验证过**的答案，且三个答案是**同一套机制的三个侧面**：

| Scholar 痛点 | OpenAI 的机制 | 一句话 |
|---|---|---|
| 「文件输出用户端看不到」 | in-band 占位 + out-of-band 权威清单，**双通道**，渲染层做替换 | 模型必须在正文里留一个**锚**，卡片挂在锚上 |
| 「编辑文件容易改不到」 | canmore `update_textdoc` 用 **Python 正则 + `re.finditer(DOTALL\|UNICODE)`**，代码类一律 `.*` 全量重写 | 放弃精确串匹配，改成「宽松匹配 + 明确的失败面」 |
| 「agent 说文件在 out 目录，暴露内部组织」 | **不禁止说路径，而是规定路径必须以一个可拦截的 scheme 出现**（`sandbox:/mnt/data/x.pptx`），渲染层把整段 markdown 链接换成卡片 | 把「叙述」变成「协议」 |

**最反直觉、也最值得 Scholar 抄的一条**：OpenAI 从来没有试图让模型「不提路径」。相反，泄漏出来的 GPT-5.x 系统提示词是用 `IMPORTANT` + 具体示例**强制模型必须提**：

> **"IMPORTANT: if a file is created for the user, always provide them a link when you respond to the user, e.g. `[Download the PowerPoint](sandbox:/mnt/data/presentation.pptx)`"**
> —— 来源：`asgeirtj/system_prompts_leaks` 仓库 `OpenAI/gpt-5.5-thinking.md`、`OpenAI/gpt-5.4-thinking.md`（两个版本都在，措辞一致）

Scholar 现在走的是**相反方向**：`backend/internal/prompts/claw.go:122` 是一条否定式禁令 ——
「禁止提及任何文件系统路径 / 目录名(不写 "./out/"、不写 "已保存到 xxx.svg"、不写绝对路径…)」。
本仓库有前科：记忆索引里 `[ASCII框图复发]` 那条的结论就是「否定式规则没用，须正面模板」。
这里是同一个坑的第二次踩。OpenAI 的做法是把这条禁令**反过来写成正面强制模板**，代价是渲染层必须兜住。

而 OpenAI 自己在 2026 年已经把这套机制**再进化了一代**：官方
[Citation Formatting 指南](https://developers.openai.com/api/docs/guides/citation-formatting)
放弃了人类可读的路径/`【13†source】`，改用 **Unicode 私用区字符**做定界符
（`CITATION_START = ` / `CITATION_DELIMITER = ` / `CITATION_STOP = `），
并明确写着「你的系统负责把 source ID 解析成给用户看的 locator/链接」。
这就是 Scholar 该抄的**终点形态**：一个**永不与用户内容碰撞、且泄漏出来也不含语义**的不透明引用令牌。

---

## 一、ChatGPT Code Interpreter / Advanced Data Analysis / Containers

### 1.1 沙箱路径事实

- **`/mnt/data`** 是"可持久化用户文件"的盘。系统提示词原文（多个版本一致）：
  > "The drive at '/mnt/data' can be used to save and persist user files."
  来源：`edoardoavenia/chatgpt-system-prompts` 仓库 `python.md`；`asgeirtj/system_prompts_leaks` 的 `OpenAI/gpt-5.5-thinking.md`。
- **`/home/sandbox`** 是默认工作目录（与 `/mnt/data` 不同）；`/home/sandbox/.openai_internal/` 是内部配置目录。
  来源：[0din.ai《Prompt Injecting Your Way To Shell》](https://0din.ai/blog/prompt-injecting-your-way-to-shell-openai-s-containerized-chatgpt-environment) —— 该文实测列出了 Debian Bookworm 容器的目录结构。
- 2026-01 的 **Containers** 大升级（Simon Willison 实测记录）：
  - 默认工作路径确认是 `/mnt/data/`
  - 新增 `container.download` 工具，签名 `{"url": "...", "filepath": "/mnt/data/file"}`，
    且做了**防注入外泄**约束：URL 必须来自用户输入或搜索结果
  - 出站网络默认封禁，但 pip/npm 走内部代理网关 `applied-caas-gateway1.internal.api.openai.org`
  - 来源：[simonwillison.net/2026/Jan/26/chatgpt-containers/](https://simonwillison.net/2026/Jan/26/chatgpt-containers/)
- **容器 TTL：20 分钟无活动即过期**，过期后转为只读快照，"all data associated with the container will be discarded from our systems and not recoverable"。
  来源：[developers.openai.com/api/docs/guides/tools-code-interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter)

### 1.2 关键：**两个 python 工具**，可见性是显式分流的

这是 Scholar 最容易忽略的一条。GPT-5.x 系统提示词里有**两个**执行工具：

| 工具 | 通道 | 语义 |
|---|---|---|
| `python` | analysis channel（用户看不见） | "Use this tool to execute Python code in your chain of thought. You should **NOT** use this tool to show code or visualizations to the user." |
| `python_user_visible` | commentary channel（用户可见） | "python_user_visible must **ONLY** be called in the commentary channel, or else the user will not be able to see the code **OR** outputs!" |

来源：`asgeirtj/system_prompts_leaks` `OpenAI/gpt-5.5-thinking.md` 与 `OpenAI/gpt-5.4-thinking.md`（两处措辞一致）。

**「用户能不能看到」不是 UI 猜出来的，是模型在调用时就选定的一个显式维度。**
这跟 Scholar 现在「turn 结束后 diff `./out/`，凡是新增的一律上抛成卡片」的**事后推断**是完全不同的设计取向：
OpenAI 让模型**当场声明意图**，Scholar 让运行时**事后猜测意图**。两者各有代价（见 §7.2）。

配套的展示原语也在提示词里被硬性规定：
- `ace_tools.display_dataframe_to_user(name: str, dataframe: pandas.DataFrame) -> None`
  —— "to visually present pandas DataFrames when it benefits the user"
- 画图三铁律，且用 `I REPEAT:` 重复了一遍（原文两段，措辞略有差异）：
  > "when making charts for the user: 1) never use seaborn, 2) give each chart its own distinct plot (no subplots), and 3) never set any specific colors – unless explicitly asked to by the user."
  > "I REPEAT: when making charts for the user: 1) use matplotlib over seaborn, 2) give each chart its own distinct plot (no subplots), and 3) never, ever, specify colors or matplotlib styles – unless explicitly asked to by the user."

  来源：`edoardoavenia/chatgpt-system-prompts` `python.md`。
  （旁证：[Tibor Blaho 的 X 帖](https://x.com/btibor91/status/1796077902959640893) 记录了 ADA V2 更新时加入 `I REPEAT` 的时间点；X 返回 402 无法直接读正文，仅凭搜索摘要，**置信度中**。）

**为什么值得注意**：OpenAI 认为「不要让模型自选配色」比「让模型自由发挥」更重要 —— 因为交付物的视觉一致性属于产品，不属于模型。这跟 Scholar 的设计系统护栏是同一个哲学，但 Scholar 目前没有把它写进 agent 侧提示词（`agent-skills/sci-draw-skills/charts/SKILL.md` 有相关规则，但那是 skill 级不是全局级）。

### 1.3 `sandbox:` —— 它不是 URL，是**占位符协议**

这是整篇调研最核心的发现，需要拆成三层说清楚：

**第一层（模型侧）**：系统提示词强制模型在正文里发一条 markdown 链接，href 用 `sandbox:` scheme：

```
[Download the PowerPoint](sandbox:/mnt/data/presentation.pptx)
```

**第二层（协议侧）**：官方 Assistants API 文档明确把它归类为「模型生成的、需要被替换掉的乱码子串」。原文：

> 两种 annotation 类型：
> - `file_citation`: "File citations are created by the `file_search` tool and define references to a specific file that was uploaded and used by the Assistant to generate the response."
> - `file_path`: "File path annotations are created by the `code_interpreter` tool and contain references to the files generated by the tool."
>
> 并且："When annotations are present in a Message object, you'll see model-generated substrings in the text that you should replace with the annotations, which may look like `【13†source】` or `sandbox:/mnt/data/file.csv`"

来源：[developers.openai.com/api/docs/assistants/deep-dive](https://developers.openai.com/api/docs/assistants/deep-dive)

官方示例代码就是做替换：

```python
for index, annotation in enumerate(annotations):
    message_content.value = message_content.value.replace(annotation.text, f" [{index}]")
```

对 `file_path` 型 annotation，用 `client.files.content(file_path.file_id)` 把字节拉下来。

**第三层（渲染侧）**：ChatGPT web 端把 `sandbox:` 换成真实下载。逆向出来的链路是：
`/backend-api/files/download/{fileId}` 返回一个含 `download_url` 字段的 JSON，
再用带鉴权头的临时 URL 取二进制。
来源：[ocombe 的 ChatGPT Conversation Exporter gist](https://gist.github.com/ocombe/1d7604bd29a91ceb716304ef8b5aa4b5) —— 该脚本实测跑通了这条链路，并记录了资产指针的正则 `^(?:file-service|sediment)://(.+)$`，以及消息 part 的 `content_type` 取值：`code` / `execution_output` / `computer_output` / `image_asset_pointer`。

**所以「OpenAI 为什么让用户看到路径」这个问题的前提是错的。**
OpenAI 的设计意图里，用户**根本不该**看到 `sandbox:/mnt/data/...`：
- 模型发的是**协议占位符**，不是给人读的文本；
- UI 层负责把整个 markdown 链接（含 href）换成一张下载卡片；
- 用户看到的应该是「Download the PowerPoint」这个 label。

**用户之所以经常看到裸路径，是这条链路的失败态泄漏**（见 §1.5）。这是个重要的修正 —— 不要把 OpenAI 的 bug 当成 OpenAI 的设计来抄。

**但 OpenAI 确实做了一个刻意选择**：用**人类可读的沙箱路径**当占位符 ID，而不是用不透明 ID。
我推断（**置信度中**，无官方说明）理由有三：
1. 模型本来就知道自己写到了哪个路径 —— 用路径当 ID **零额外状态**，不需要工具回传一个 ID 再让模型引用（那是一次额外的往返，且模型经常抄错 ID）；
2. 占位符退化时仍然「半可读」：用户至少知道有个 `presentation.pptx` 存在，而不是看到 `citeturn0file0` 这种彻底的乱码；
3. `sandbox:` 是个非注册 scheme，浏览器不会误当成可导航 URL（点了不跳转、不当搜索词 —— 虽然实测有些客户端会当搜索词，见 §1.5）。

代价就是：**一旦替换失败，泄漏出来的是内部目录结构**。这正是 Scholar 现在担心的事。OpenAI 承受了这个代价，说明他们判断「有个能点的锚」比「绝不泄漏路径」优先级高。

### 1.4 官方 API 侧：`container_file_citation`

Responses API 的 code interpreter 用的是新一代 annotation。官方文档给出的 JSON 形状：

```json
{
  "annotations": [
    {
      "file_id": "cfile_...",
      "container_id": "cntr_...",
      "filename": "output.png",
      "type": "container_file_citation",
      "index": null,
      "start_index": 0,
      "end_index": 0
    }
  ]
}
```

来源：[developers.openai.com/api/docs/guides/tools-code-interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter)

下载端点：`GET /v1/containers/{container_id}/files/{file_id}/content`
（Go SDK: `client.Containers.Files.Content.Get(ctx, containerID, fileID)`）
另有列举端点 `GET /v1/containers/{id}/files` 与上传端点 `POST /v1/containers/{id}/files`。

注意 `start_index` / `end_index` 这两个字段：**annotation 带正文里的字符偏移**，
意味着渲染层可以精确地把「正文第 N~M 个字符」这一段替换掉 —— 这比按字符串 `replace()` 更稳
（`replace()` 在同一个文件被提到两次时会连带替换第二处）。
官方 Assistants 示例代码用的是 `replace()`，**这是官方示例的一个已知弱点**，Scholar 抄的时候应该直接用偏移。

### 1.5 失败模式全景（这一节比成功路径更有价值）

我把开发者论坛/GitHub 上能读到的失败案例分成四类，每一类 Scholar 都会撞上：

**(a) annotation 只有第一个文件有**
> "First file: 正确带 `file_id` 且可下载。Subsequent files: 生成成功但没有 annotation。响应正文只剩 sandbox 风格链接（如 `sandbox:/mnt/data/file.csv`），没有可编程引用，按 `file_id` 取会 404。"
> 用户原话："annotations will be empty" when generating multiple files simultaneously。
> 来源：[community.openai.com — Missing File Annotation for Subsequent Files in Code Interpreter](https://community.openai.com/t/missing-file-annotation-for-subsequent-files-in-code-interpreter/1351340)

社区的修法非常有指导意义 —— **绕开 annotation，直接列容器文件**：
> 1. 每次请求后查 `/v1/containers/{container_id}/files`，拿到全部生成文件，完全绕过缺失的 annotation
> 2. 建立「sandbox 路径 → 本地下载位置」的映射表，把响应里的 sandbox 路径替换成真实路径

**这条恰恰证明 Scholar 现有的 `snapshotOut` 文件系统 diff（`agent/src/turn/artifacts.ts:98`）比 OpenAI 的 annotation 更可靠。** Scholar 缺的不是权威清单，是把清单**绑回正文**的锚。

**(b) web 端过滤掉了链接，移动端正常**
> 2024-08 起 web 版停止给出可用下载链接，"the web version is filtering links to ChatGPTs sandbox environment"；同时 iOS/Android 正常。
> 来源：[community.openai.com — Download links for files created on chatgpt getting removed](https://community.openai.com/t/download-links-for-files-created-on-chatgpt-getting-removed/896721)

**(c) 桌面客户端点了没反应**
> Ubuntu ChatGPT 桌面 App 显示 `sandbox:/mnt/data/...` 链接，点击无任何反应；同样的文件在 web 界面可下载。
> 来源：[github.com/lencx/ChatGPT issue #1546](https://github.com/lencx/ChatGPT/issues/1546)（第三方客户端，但暴露的是同一个协议缺口）

**(d) 会话/容器过期后链接失效**
> "once I click on them it gives me an 'Code interpreter session expired' error"
> 来源：同 (b) 帖。

**结论**：`sandbox:` 这套协议在 OpenAI 自家产品矩阵里有**四个不同客户端实现，其中至少三个曾经坏过**。
根因是同一个：**协议约定只存在于「模型提示词 + 前端约定」之间，没有类型系统兜底**。
模型可以在任何时候发一条没有对应 annotation 的 `sandbox:` 链接，前端无从判断这是真文件还是幻觉。

这个失败模式在第三方复刻里被放大到极致 ——
[open-webui discussion #14658](https://github.com/open-webui/open-webui/discussions/14658)：
用户抱怨 `sandbox:/mnt/data/file.pptx` 点了没反应，维护者的回复是：
> "`sandbox:/mnt/data/file.pptx` does not exist and your llm is hallucinating."

**这就是 Scholar 必须避免的终局**：一个「点了 404」的卡片比「没有卡片」更糟
—— 这句话 Scholar 自己已经写在 `agent/src/turn/artifacts.ts:214` 的注释里了。

### 1.6 持久化：Library

ChatGPT 已经把「沙箱临时文件」和「用户文件库」分成两层：
[help.openai.com — File storage and Library in ChatGPT](https://help.openai.com/en/articles/20001052-file-storage-and-library-in-chatgpt)
（该页对 WebFetch 返回 403，只能凭搜索摘要，**置信度中**）：
搜索摘要显示 ChatGPT 会自动把上传的和对话中生成的文件存进一个专门位置供后续访问，用户可在 Library 里多选下载。

对 Scholar 的意义：Scholar 的产物生命周期 = 会话生命周期（`frontend-user/src/features/claw/api/artifacts.ts:5-6` 注释明写「会话删/重置即清」）。
OpenAI 已经把这一层拆出来了。Scholar 已经有 MinIO + `agent_artifacts` 表，
往「跨会话文献/产物库」演进的**存储侧**成本近乎为零，缺的只是入口。

### 1.7 Scholar 能抄什么（Code Interpreter 部分）

| # | 抄什么 | 落点 | 代价 |
|---|---|---|---|
| C1 | **把 `claw.go:122` 的否定禁令改成正面强制模板** | `backend/internal/prompts/claw.go` | 提示词改动，需 restart `scholar_agent`（记忆里 `[ASCII框图复发]` 那条的教训） |
| C2 | **定义 Scholar 自己的占位符 scheme** —— 建议 `artifact:` 而非 `sandbox:`（避免与浏览器/第三方约定撞车），href 用 **不含目录的裸文件名** `artifact:综述.md` | agent 提示词 + `MarkdownRenderer.tsx:142` 的 `a` 组件 | 需要一条「文件名 → artifact 帧」的解析表 |
| C3 | **渲染层拦截 `a[href^="artifact:"]`，整段替换为下载卡片**；解析不到就**降级成纯文本 label（丢掉 href）**，绝不渲染成死链接 | `frontend-user/src/shared/components/chat/MarkdownRenderer.tsx:142` 已有 `a` 覆写，是现成的注入点 | 小 |
| C4 | **权威清单继续以文件系统 diff 为准**（Scholar 现状已优于 OpenAI），正文锚只是"定位"不是"授权" | `agent/src/turn/artifacts.ts:379` 的 artifact 帧不动 | 零 |
| C5 | **给 annotation 带字符偏移**（学 `start_index`/`end_index`），别用 `String.replace()` | 新增 | 小 |
| C6 | **显式的可见性维度**：学 `python`/`python_user_visible` 的分流，让模型在写文件时就声明「这是交付物」还是「这是草稿」 | 见 §7.2 讨论，**我不建议直接抄**（Scholar 的事后 diff 有更好的抗谎特性） | — |
| C7 | 图表配色/风格由平台定，不由模型定（`never set any specific colors`） | 现在只在 sci-draw skill 里，可以提到全局 | 小 |

---

## 二、ChatGPT Canvas / canmore —— 文档作为一等公民

### 2.1 namespace 原文

从 [baoyu.io 的 Full Prompt of ChatGPT 4o with canvas](https://baoyu.io/blog/prompt/full-prompt-chatgpt-4o-with-canvas) 拿到的完整 TypeScript 声明：

```typescript
namespace canmore {

type create_textdoc = (_ : {
  name: string,
  type: ("document" | "webview" | "code/bash" | "code/zsh" |
          "code/javascript" | "code/typescript" | "code/html" |
          "code/css" | "code/python" | "code/json" | "code/sql" |
          "code/go" | "code/yaml" | "code/java" | "code/rust" |
          "code/cpp" | "code/swift" | "code/php" | "code/xml" |
          "code/ruby" | "code/haskell" | "code/kotlin" | "code/csharp" |
          "code/c" | "code/objectivec" | "code/r" | "code/lua" |
          "code/dart" | "code/scala" | "code/perl" | "code/commonlisp" |
          "code/clojure" | "code/ocaml" | "code/other"),
  content: string,
}) => any;

type update_textdoc = (_ : {
  updates: [
    { pattern: string, multiple: boolean, replacement: string },
  ]
}) => any;

type comment_textdoc = (_ : {
  comments: [
    { pattern: string, comment: string },
  ]
}) => any;

}
```

GPT-5.x 时代新增了 `code/react` 且成为默认（见 §2.5）。

### 2.2 三个函数各自的边界（这是设计精华）

| 函数 | 语义 | 关键约束原文 |
|---|---|---|
| `create_textdoc` | 新建一份 canvas 文档 | "ONLY use if you are 100% SURE the user wants to iterate on a long document or code file, or if they explicitly ask for canvas." |
| `update_textdoc` | 修改当前文档 | "ALWAYS REWRITE CODE TEXTDOCS (type=\"code/*\") USING A SINGLE UPDATE WITH \".*\" FOR THE PATTERN." |
| `comment_textdoc` | **只加批注、不改内容** | "should never be used unless a textdoc has already been created" |

来源：`edoardoavenia/chatgpt-system-prompts` 仓库 `canmore.md`（WebFetch 读到的是该文件内容的转述，引号内为原文片段）。

**`comment_textdoc` 是 Scholar 完全没有的一个原语**，而它解决的正是「agent 想改但不该自己改」的场景：
审稿意见、写作建议、代码 review —— 输出是「贴在原文某个位置上的可操作建议」，**用户点了才应用**。
Scholar 的 peerreview / prism 现在都是「要么全量出 patch、要么在对话里说」，中间那档是空的。

### 2.3 为什么是正则而不是 `old_string` 精确匹配

这是本次调研中**最直接对应 Scholar 痛点二（"编辑文件容易改不到"）** 的一条。

**事实层面**（原文）：
- pattern 字段的定义是："A valid Python regular expression that selects the text to be replaced. Used with `re.finditer` with `flags=regex.DOTALL | regex.UNICODE`."
- replacement 用 `re.Match.expand` 展开（即支持 `\1` 反向引用）
- `multiple: boolean` 显式控制"替换第一处还是全部"
  来源：`asgeirtj/system_prompts_leaks` `OpenAI/gpt-5.4-thinking.md`、`edoardoavenia/chatgpt-system-prompts` `canmore.md`

**为什么这么选**，我找到的最好的一手观察是 Shreya Shankar（UC Berkeley，数据/LLM 系统方向）的公开对比：
> "TIL chatgpt edits canvases by generating regexes, while Claude generates the entire string to replace. Whenever the text to edit is long, Claude fails to correctly edit the artifact after several turns (for me)... the regex approach seems nice"
> —— [x.com/sh_reya/status/1875227816993943823](https://x.com/sh_reya/status/1875227816993943823)
> （X 直接抓取返回 402，正文来自搜索结果摘要，**置信度中**）

拆开来讲，正则相对精确串匹配的三个结构性优势：

1. **不要求模型逐字复现原文**。`old_string` 精确匹配的失败根因是：模型必须**从上下文里逐字节抄一段原文**，而长文档中这段原文可能已经被上一轮压缩掉、或者模型记成了语义等价但字符不同的版本（全角/半角空格、markdown 列表符号、行尾空白）。正则允许模型写 `^## 方法\n[\s\S]*?(?=^## )` 这种**结构锚**，锚定的是文档骨架而不是具体字符。

2. **锚点长度与替换内容解耦**。精确匹配要求 `old_string` 唯一，于是模型被迫抄一大段"上下文"来消歧，抄得越长错得越多。正则可以用 `^### 3\.2` 这种极短且唯一的锚 + `multiple: false`。

3. **失败是可诊断的**。正则不匹配 → 工具明确报"pattern not found"；精确匹配不命中 → 同样报错，但模型的修复策略只能是"再抄一遍"，而正则的修复策略是"放宽模式"，后者收敛得快。

**代价（必须诚实记录）**：
- 模型写错正则的概率不低（贪婪匹配把整段吃掉是最常见的），且 Dave Hulbert 实测记录到 "Pattern-not-found errors return minimal diagnostic information"（来源：[medium.com/@dave1010 — ChatGPT's Canvas Beta Feature technical details](https://medium.com/@dave1010/chatgpts-canvas-beta-feature-internal-details-a7c1e2477149)）。
- 论坛里有大量 Canvas 编辑失败的抱怨（[Canvas Failed to Edit and Previous Versions](https://community.openai.com/t/canvas-failed-to-edit-and-previous-versions/1005181)）。
- **OpenAI 自己也不完全信任它** —— 所以才有那条全大写的铁律：**代码类文档一律用 `.*` 全量重写**。
  换句话说：**对结构化程度高、局部编辑风险大的内容，OpenAI 直接放弃了增量编辑。**

### 2.4 Canvas 的已知限制（Dave Hulbert 实测）

- 每个 canvas 有唯一 `textdoc_id`，在工具返回值里给出
- **"Only the most recent document can be edited"** —— 单会话内不能操作多文档
- **模型看不到用户在 canvas 里的手工编辑**
- markdown 代码块在 canvas 里渲染失败（当时的 bug）
- HTML webview 只做语法高亮，不真渲染（当时状态；GPT-5.x 时代已支持 React/HTML 预览）

来源：[medium.com/@dave1010](https://medium.com/@dave1010/chatgpts-canvas-beta-feature-internal-details-a7c1e2477149)

第二条和第三条对 Scholar 的 prism 有直接参考价值：
prism 是 DB 真源 + agent 出 patch（记忆索引 `[Prism系列]`），
所以「模型看不到用户编辑」这个坑 prism 结构上已经避开了（DB 是真源，模型每轮读 DB）。
**但 claw 的 `./out/` 没有这个保护** —— 用户没法编辑 out 里的文件，所以暂时不构成问题；
一旦要做「用户可编辑交付物」，必须先解决"模型看得见用户改动"。

### 2.5 GPT-5.x 时代的 canmore 增补

从 `asgeirtj/system_prompts_leaks` `OpenAI/gpt-5.5-thinking.md` 读到的新规则：
- 只在这些场景开 canvas：React 组件、网页、长文档、或用户明确要求
- 可预览代码默认用 `code/react`，配 Tailwind + shadcn/ui
- **"Canvas does not support citations or content references, so omit them for canvas content."**
- "DO NOT do multiple canvas tool calls to the same document in one conversation turn unless recovering from an error."
- **"Do not repeat canvas content in the main chat—users see it separately"**

最后一条特别值得 Scholar 注意：Scholar 现在 `claw.go:116` 的规则是
「长篇 / 结构化成品 → 写进 ./out/; **同时把关键内容 / 结论也在回复正文里**」——
这是**故意的重复**。OpenAI 的规则是**明确禁止重复**。
两种都成立，取决于产品定位：
- OpenAI：canvas 就在旁边，重复 = 刷屏
- Scholar：产物卡片在别处、可能要滚动才看到 → 正文摘要是必要的冗余

**但如果 Scholar 采纳 §7 的「正文内联卡片」方案，这条规则就要重新权衡了**：
卡片就在正文里，再全文复述一遍就变成 OpenAI 说的那种刷屏。

### 2.6 Scholar 能抄什么（Canvas 部分）

| # | 抄什么 | 落点 | 优先级 |
|---|---|---|---|
| N1 | **Edit 工具从 `old_string` 精确匹配改为「正则 + multiple 标志」**（或至少**增加**正则模式作为退化路径） | agent 侧 Edit 工具 | 高 —— 直击痛点二 |
| N2 | **给「结构化/高风险」文件类型加全量重写铁律**（学 `code/*` 那条），例如 `.csv`/`.json`/`.tex` 一律整文件重写 | agent 提示词 + Edit 工具的类型分派 | 高 |
| N3 | **`comment_textdoc` 原语**：agent 产出「贴在原文位置上的建议」而非直接改写，用户点击才应用 | 新，peerreview/prism 收益最大 | 中 |
| N4 | **文档类型枚举**（`document` / `code/*` / `webview`）作为一等字段，驱动渲染器选择 | Scholar 现在靠 `mime` + 扩展名猜（`frontend-user/src/features/claw/api/artifacts.ts:33` 注释明写「前端据此 + 扩展名挑预览渲染器」）→ 可升级为显式 type | 中 |
| N5 | 「不要在正文重复 canvas 内容」—— **条件性采纳**，取决于卡片是否内联 | `backend/internal/prompts/claw.go:116` | 待定 |

---

## 三、Assistants API / Responses API 的 Files

### 3.1 三种 annotation

| 类型 | 产生者 | 含义 |
|---|---|---|
| `file_citation` | `file_search` 工具 | 引用了哪个**上传的**文件（RAG 溯源） |
| `file_path` | `code_interpreter`（Assistants API 时代） | 指向工具**生成的**文件 |
| `container_file_citation` | code interpreter（Responses API 时代） | 同上，但带 `container_id` |

来源：[Assistants deep-dive](https://developers.openai.com/api/docs/assistants/deep-dive)、[Code Interpreter guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter)

**注意这个分类的设计**：「我引用了什么」和「我生成了什么」是**两个不同的 annotation 类型**，
而不是一个泛化的 "file reference"。这对 Scholar 有直接映射：
- Scholar 的 `evidence/`（证据账本，见记忆索引 `[agent证据账本架构0801]`）≈ `file_citation`
- Scholar 的 `out/`（交付物）≈ `container_file_citation`

**这两者现在在 Scholar 里是混在一个「文件」概念里的**，而 `artifacts.ts:231` 的注释记录了一个真实事故：
`evidence/INDEX.md` 被当成 stray 反复复制成 `out/INDEX-3.md`、`INDEX-4.md`。
**根因就是缺少这个类型区分。** 一个显式的「引用 vs 交付」二分能从结构上杜绝这类事故。

### 3.2 SDK 侧的下载

- Assistants：`client.files.content(file_path.file_id)` → 字节
- Responses/Containers：`client.containers.files.content.retrieve(file_id, container_id=...)`
  HTTP: `GET https://api.openai.com/v1/containers/{container_id}/files/{file_id}/content`

社区反复强调的一条：
> "Don't try to shortcut it with `response.output_text` -- that gives you a plain string with citation markers, not the actual file references."

**即：正文里的 marker 永远只是指针，权威数据在 annotation 数组里。** 这跟 §1.3 是同一条原则。

### 3.3 Scholar 能抄什么（API 部分）

| # | 抄什么 | 落点 |
|---|---|---|
| A1 | **把「引用」和「交付」拆成两个 annotation 类型**，别混在一个文件概念里 | `agent/src/turn/artifacts.ts` 的 `deliverable` 判定 + evidence 保留区 |
| A2 | annotation 带 `start_index`/`end_index` 字符偏移 | artifact 帧扩字段 |
| A3 | 「正文 marker 只是指针，权威在带外清单」写成契约，并在测试里钉死 | 新增不变量测试 |

---

## 四、官方 Citation Formatting 指南 —— OpenAI 的**最新答案**

这是本次调研发现的**最有价值的一份官方文档**，也是最容易被忽略的：
[developers.openai.com/api/docs/guides/citation-formatting](https://developers.openai.com/api/docs/guides/citation-formatting)

OpenAI 已经把「模型在正文里发引用标记」这件事**正式规格化**了：

**标记模板**：
```
{CITATION_START}<citation_family>{CITATION_DELIMITER}<source_id>{CITATION_DELIMITER}<locator>{CITATION_STOP}
```

**示例**：
```
{CITATION_START}cite{CITATION_DELIMITER}turn0file1{CITATION_DELIMITER}L8-L13{CITATION_STOP}
```

**推荐的定界符取值 —— 这是关键**：
- `CITATION_START` = ``
- `CITATION_DELIMITER` = ``
- `CITATION_STOP` = ``

这三个都是 **Unicode 私用区（Private Use Area）字符**。选它们的理由是结构性的：
1. **不可能与用户内容碰撞** —— 没人会在论文里打出 U+E200
2. **不可能被 markdown 解析器误解** —— 不是 `[`、`(`、`【` 这类有语法含义的字符
3. **视觉上不可见/乱码** —— 一旦泄漏到 UI，用户看到的是一个方框，会去报 bug；
   而泄漏一个 `sandbox:/mnt/data/out/report.md` 用户会**误以为那是产品的一部分**

第 3 条正是 Scholar 用户抱怨的原点：**泄漏的路径「看起来像真的」，所以造成误解。**
`` 泄漏只会造成"渲染 bug"的印象，不会造成"这个系统有个 out 目录"的错误心智模型。

**官方给出的硬性规则**（原文要点）：
- "Place citations at the end of the paragraph, or inline if the paragraph is long"
- "Citations **must be placed after punctuation**"
- "Citations **must not be placed inside markdown bold, italics, or code fences**"
- "**Never place raw source IDs in response text without wrapping them in markers**"
- 提供了 JS 和 Python 两版 `extract_citations()` 解析辅助函数，返回 raw marker / family / source IDs / locator / **字符偏移**
- "Strip citations using offsets returned by `extract_citations()` to remove raw citation markers from text."
- **"your system resolves the source ID to render the actual locator/link to users"**

最后一句是全篇的立场声明：**模型只负责发 ID，宿主负责解析成 UI。**

**演进路径清清楚楚**：
```
【13†source】          （人类可读，与中文书名号碰撞）
   ↓
sandbox:/mnt/data/x   （半可读，泄漏内部路径）
   ↓
citeturn0file0  （完全不透明，泄漏零语义）
```

**Scholar 应该直接跳到第三代。** 这是本报告最实操的一条建议。

顺带记录一个失败案例作为反证：
[community.openai.com — "Make sure to include fileciteturn0file0 in your response..."](https://community.openai.com/t/make-sure-to-include-filecite-turn0file0-in-your-response-to-cite-this-file-or-to-surface-it-as-a-link/1389186)
—— 当 PUA 定界符在传输/存储链路上被剥掉后，用户看到的就是裸的 `fileciteturn0file0`。
另有 [Unexpected citation markers appearing in text output when using File Search](https://community.openai.com/t/unexpected-citation-markers-appearing-in-text-output-when-using-file-search/1362380)
和 [File Citations bug in file_search citations using gpt-5.5](https://community.openai.com/t/file-citations-bug-in-file-search-citations-using-gpt-5-5/1383150/5)。

**教训**：PUA 字符会被很多中间层（JSON 序列化通常没问题，但日志清洗、`strings.ToValidUTF8`、
数据库 charset、正则 `\w` 类）静默吃掉。Scholar 如果采用，**必须在 agent→backend→MySQL→WS→前端的
每一跳都写一条穿透测试**（Scholar 有 `utf8mb4` 的前科，见记忆索引 `[迁移utf8mb4]`）。

---

## 五、AgentKit / ChatKit / ChatGPT Agent（2025-2026）

### 5.1 ChatGPT Agent

- 2025-07 发布，给 ChatGPT 一台"虚拟计算机"（文本浏览器 + 视觉浏览器 + 终端）
- 能产出**可编辑的** PowerPoint / Excel
- 输出"come back to you as downloads and results in the chat"
- 来源：[VentureBeat 报道](https://venturebeat.com/ai/openai-unveils-chatgpt-agent-that-gives-chatgpt-its-own-computer-to-autonomously-use-your-email-and-web-apps-download-and-create-files-for-you)
  （openai.com 官方页返回 403，VentureBeat 抓取返回 429，正文来自搜索摘要，**置信度中低**）
- 更晚的 "ChatGPT Work"（据二手来源为 2026-07 上线、GPT-5.6 驱动）主打「交一份成品文件」
  —— 来源为第三方博客（felloai.com 等），**置信度低，仅作趋势参考，不作为设计依据**

**趋势判断（置信度高）**：整个行业的落点是 **"交付一份成品文件"而不是"在对话里贴一段文本"**。
Scholar 的 `./out/` + MinIO + 卡片这套骨架方向是对的，问题只在"用户找不到 / 说不清楚"。

### 5.2 ChatKit（AgentKit 的前端 SDK）

我读了 [developers.openai.com/api/docs/guides/chatkit-widgets](https://developers.openai.com/api/docs/guides/chatkit-widgets)：

- Widget 体系：容器 `Card` / `ListView`，组件 `Button` / `Image` / `Markdown` / `Text` / `Title` / `Select` / `DatePicker` / `Form` / `Box` / `Row` / `Col` / `Badge` / `Icon` / `Divider` / `Spacer`
- 交互：`onClickAction` + 服务端 `onAction` 回调
- **没有专门的 file / download / attachment widget**
- 关于文件：**"ChatKit expects uploads (files and images) to be hosted by your backend before they are referenced in a message."**

**两个可靠结论**：
1. OpenAI 官方前端 SDK **不提供**开箱即用的文件下载卡片 —— 文件交付被判定为"宿主自己的事"
2. 但它提供了**通用的结构化卡片原语**（Card + Button + onAction），
   即：**文件卡片被当成一种普通的 widget，而不是一个特殊类型**

对 Scholar 的启发是**架构层面**的：与其继续加"artifact 卡片"这一个专门类型，
不如做一层**通用的「带外结构化卡片」协议**（agent 发一个 widget 描述，前端渲染），
artifact 只是其中一种 widget。Scholar 已经有 `MinicodPaperCards` / `MinicodAuthorCards` /
`MinicodJournalCards` / `MinicodSnippetCards`（`frontend-user/src/shared/components/chat/`）
四个各自硬编码的卡片族 —— 这已经是一个"每加一种卡片就写一份组件"的技术债信号。

---

## 六、逆向系统提示词原文汇总（便于直接对照）

> 来源标注：`[L]` = `asgeirtj/system_prompts_leaks`（GPT-5.4/5.5 thinking）；
> `[E]` = `edoardoavenia/chatgpt-system-prompts`；`[B]` = baoyu.io 归档的 4o-canvas 版。
> 这些都是第三方归档的泄漏内容，**不是 OpenAI 官方发布**，可信度按"多源交叉一致"评估。
> 下列各条我都在**至少两个独立来源**里见到一致措辞，或在单一来源里直接读到原文。

**关于文件交付**：
- `[L]` **"IMPORTANT: if a file is created for the user, always provide them a link when you respond to the user, e.g. '[Download the PowerPoint](sandbox:/mnt/data/presentation.pptx)'"**
- `[L]` `[E]` "The drive at '/mnt/data' can be used to save and persist user files."
- `[L]` "python_user_visible must *ONLY* be called in the commentary channel, or else the user will not be able to see the code *OR* outputs!"
- `[L]` "Use this tool to execute Python code in your chain of thought. You should *NOT* use this tool to show code or visualizations to the user."（指 `python`）
- `[E]` "Use ace_tools.display_dataframe_to_user(name: str, dataframe: pandas.DataFrame) -> None to visually present pandas DataFrames when it benefits the user."
- `[E]` "when making charts for the user: 1) never use seaborn, 2) give each chart its own distinct plot (no subplots), and 3) never set any specific colors – unless explicitly asked to by the user."
- `[E]` "I REPEAT: when making charts for the user: 1) use matplotlib over seaborn, 2) give each chart its own distinct plot (no subplots), and 3) never, ever, specify colors or matplotlib styles – unless explicitly asked to by the user."

**关于 canvas**：
- `[E]` "ONLY use if you are 100% SURE the user wants to iterate on a long document or code file, or if they explicitly ask for canvas."
- `[E]` "ALWAYS REWRITE CODE TEXTDOCS (type=\"code/*\") USING A SINGLE UPDATE WITH \".*\" FOR THE PATTERN."
- `[L]` "A valid Python regular expression that selects the text to be replaced. Used with re.finditer with flags=regex.DOTALL | regex.UNICODE."
- `[L]` "DO NOT do multiple canvas tool calls to the same document in one conversation turn unless recovering from an error."
- `[L]` "Canvas does not support citations or content references, so omit them for canvas content."
- `[L]` "Do not repeat canvas content in the main chat—users see it separately"
- `[B]` 完整 `namespace canmore` TypeScript 声明（见 §2.1）

**关于引用标记**（这条是官方文档，不是泄漏）：
- 官方 "Never place raw source IDs in response text without wrapping them in markers"
- 官方 "Citations must be placed after punctuation"
- 官方 "Citations must not be placed inside markdown bold, italics, or code fences"

---

## 七、给 Scholar 的架构建议

### 7.1 现状盘点（我实际读到的）

| 层 | 现状 | 文件:行 |
|---|---|---|
| 提示词 | 用**否定式禁令**要求模型不提路径 | `backend/internal/prompts/claw.go:122` |
| 提示词 | 要求正文里**重复**产物关键内容 | `backend/internal/prompts/claw.go:116` |
| agent | turn 开头 snapshot `./out/`，结尾 diff，发 `artifact` 帧 | `agent/src/turn/turnLoop.ts:175-176`、`agent/src/turn/artifacts.ts:379` |
| agent | 越界交付物（`./out/` 之外）会被 `relocateStrays` 复制回 `out/` | `agent/src/turn/artifacts.ts:210-281` |
| agent | 已知事故：`evidence/INDEX.md` 被反复复制成 `out/INDEX-N.md` | `agent/src/turn/artifacts.ts:231` |
| agent | 已知铁律注释：「上抛别处的路径会给用户一张点了 404 的卡，比原来「没有卡」更糟」 | `agent/src/turn/artifacts.ts:214` |
| backend | `internal/claw/artifact.go` / `artifact_harvest.go`，MinIO 落盘，`agent_artifacts` 表 | — |
| 前端 | `useAgentArtifacts` 在 `message_complete` 后 invalidate 列表 | `frontend-user/src/features/claw/api/artifacts.ts:8` |
| 前端 | 产物生命周期 = 会话生命周期 | `frontend-user/src/features/claw/api/artifacts.ts:5-6` |
| 前端 | markdown 渲染器已有 `a` 组件覆写（现成注入点） | `frontend-user/src/shared/components/chat/MarkdownRenderer.tsx:142` |

**诊断**：Scholar 的**带外通道（权威清单）比 OpenAI 更结实**（文件系统 diff vs annotation，
见 §1.5(a) 的对照）。缺的是 **in-band 锚**：模型说了一句话，那句话和那张卡片之间**没有任何链接**。
于是模型只能靠自然语言去指（"文件已保存到 ./out/report.md"），
而提示词又禁止它这样指 —— **模型被同时要求"说清楚"和"不许说"，这是个无解约束。**
它的实际行为就是：要么违反禁令说出 `./out/`，要么含糊其辞导致用户找不到。**两种坏结果 Scholar 都撞上了。**

### 7.2 建议的新架构（三层）

**第一层：不透明产物令牌（in-band 锚）**

模型在正文里发一个**不透明引用**，而不是路径。两个方案：

- **方案 A（保守）**：markdown 链接 + 自定义 scheme
  ```
  [综述初稿](artifact:综述.md)
  ```
  优点：markdown 语法天然，`MarkdownRenderer.tsx:142` 的 `a` 覆写直接接住；
  泄漏时用户看到的是一个普通链接文本（label 仍可读），而不是路径。
  缺点：href 里还是文件名（半泄漏），且 markdown 链接可能被复制粘贴带出去。

- **方案 B（学 OpenAI 最新代）**：PUA 定界符的不透明令牌
  ```
  综述初稿已经完成artifacta3。
  ```
  优点：零语义泄漏、零碰撞、可带偏移。
  缺点：需要在 agent→backend→MySQL(utf8mb4)→WS→前端**每一跳做穿透测试**；
  且模型对"发一串不可见字符"的遵从度低于"发一个 markdown 链接"（**这是我的推断，置信度中**）。

  **我的建议：A 打底、B 做 v2。** 先用 `artifact:` scheme 拿到"锚"这个能力，
  跑通渲染替换与降级路径；等这条链路稳定了，再把 href 从文件名换成不透明 ID
  （`artifact:a3`），最后才考虑要不要上 PUA。**每一步都是可回退的。**

**第二层：渲染层是唯一的真相解释者**

- `MarkdownRenderer.tsx` 的 `a` 覆写拦截 `href^="artifact:"`
- 用本 turn 的 artifact 帧建一张 `文件名/ID → ClawArtifact` 的解析表
- 命中 → 就地渲染下载卡片（复用现有卡片组件），**内联在正文里**，不是在别处
- **未命中 → 降级为纯文本 label，丢掉 href**（绝不渲染成死链接 —— 这条已经是
  `artifacts.ts:214` 写下的铁律，只是现在只在 agent 侧执行，前端侧没有对应闸门）

**第三层：提示词从"禁止"改为"强制模板"**

`backend/internal/prompts/claw.go:122` 那条否定禁令替换为正面模板：

```
【铁律 · 产物引用】凡是交付给用户的成品,必须在正文里用如下格式引用一次:
  [人类可读的标题](artifact:<文件名>)
例: [文献综述初稿](artifact:综述.md)
禁止用任何其他方式提及文件位置(不写 "./out/"、不写绝对路径、不写"在左侧面板")。
```

**为什么这样能成**：模型天然想说"文件在哪"，禁令是在跟模型的倾向对抗；
强制模板是在**给这个倾向一个合法出口**。这跟记忆索引里
`[ASCII框图复发] — 否定式规则没用须正面模板` 是同一条经验。

### 7.3 关于痛点二（编辑改不到）

Scholar 的 Edit 工具用的是 `old_string` 精确匹配（Claude Code 家族的默认）。
OpenAI 的三条对策，按投入产出排序：

1. **【最高 ROI，改动最小】** 学 canmore 的代码铁律：
   **对结构化文件（`.csv` / `.json` / `.tex` / `.bib` / `.svg`）禁用增量编辑，一律全量重写。**
   这些文件恰恰是 Scholar 交付物的主力，也恰恰是局部编辑最容易改坏的。
   实现上就是 Edit 工具按扩展名分派，命中就返回一条"请用 Write 全量重写"的错误。
   **零新机制、纯策略。**

2. **【中 ROI】** `old_string` 失败时**自动降级到正则**：
   把 `old_string` 当作正则模式重试一次（先做 `\s+` 宽松化：把连续空白替换为 `\s+`）。
   这能吃掉绝大多数"空白/换行不一致"导致的失败 —— 这是精确匹配失败的头号原因。

3. **【要评估】** 增加一个显式的正则 Edit 变体（`pattern` + `multiple` + `replacement`）。
   收益是长文档的结构锚编辑，代价是模型写错正则的新失败面 + 贪婪匹配吃掉整篇的风险。
   **建议先跑 1 和 2，量化剩余失败率再决定。**

### 7.4 我不建议抄的

- **`python` / `python_user_visible` 的显式可见性分流**（§1.2）：
  它把"这个产物给不给用户看"交给模型当场声明。Scholar 现在的事后文件系统 diff
  **抗谎特性更好** —— 模型没法通过"声明"制造一个不存在的产物。
  记忆索引里 `[agent证据账本架构0801]` 的心法「让正确的路更便宜而非罚更重」在这里的推论是：
  保持"产物由文件系统事实决定"，只在**引用锚**这一层引入模型声明。
  锚指向不存在的产物 → 降级成纯文本，损失可控；反过来"模型声明产物存在"→ 幻影交付，损失不可控。
  （Scholar 线上审计已经抓到过"幻影交付"，见记忆索引 `[claw线上半月审计]`。）

- **`sandbox:` 这个具体 scheme 名**：它在业界已经和"点了没反应的死链接"绑定了
  （§1.5 的四个案例 + open-webui 那条"your llm is hallucinating"）。
  用 `artifact:` 或别的自有 scheme。

- **官方 Assistants 示例的 `String.replace()` 做法**：同名文件出现两次会误替换。用偏移。

### 7.5 一个额外发现：evidence vs out 的类型缺失

§3.1 提到的 `file_citation` vs `container_file_citation` 二分，对应到 Scholar 就是
`evidence/`（引用）vs `out/`（交付）。
`agent/src/turn/artifacts.ts:231` 的注释记录的那个事故（evidence/INDEX.md 被反复复制进 out/）
**根因就是这两个概念在类型系统里没有区分**，只能靠路径前缀 + 排除列表打补丁。

建议：在 artifact 帧里加一个 `role: "deliverable" | "evidence" | "draft"` 字段，
让 relocateStrays / 卡片渲染 / 引用锚解析全部按 role 分派，而不是按路径猜。
这是一条**结构性修复**，能一次性关掉一整族补丁式规则。

---

## 八、置信度与反证

| 条目 | 置信度 | 说明 |
|---|---|---|
| `/mnt/data` 是持久化盘、`sandbox:` link 模板 | **高** | 两个独立泄漏仓库措辞一致 + 官方 Assistants 文档把 `sandbox:/mnt/data/file.csv` 列为"应被替换的子串" |
| `sandbox:` 是占位符不是 URL | **高** | 官方 deep-dive 原文 + 四类失败案例都指向"替换失败" |
| canmore 的三函数与正则语义 | **高** | baoyu.io 完整 TS 声明 + 两个泄漏仓库 + Dave Hulbert 实测 |
| "为什么用正则不用精确匹配" | **中** | OpenAI 无官方说明；主要依据 Shreya Shankar 的公开对比（X 页面 402，只读到搜索摘要）+ 我自己的机制分析 |
| 容器 20 分钟 TTL、containers files 端点 | **高** | 官方 API 文档直读 |
| Citation Formatting 的 PUA 字符 | **高** | 官方文档直读 |
| ChatKit 无 file widget | **高** | 官方 widgets 文档直读，组件清单完整 |
| ChatGPT Library 的持久化行为 | **中** | help.openai.com 返回 403，只读到搜索摘要 |
| ChatGPT Agent / ChatGPT Work 的细节 | **中低** | openai.com 403、VentureBeat 429，只读到搜索摘要；二手博客不作为设计依据 |
| `I REPEAT` 的引入时间点 | **中** | X 返回 402，只有搜索摘要 |

**主动证伪的两条**：

1. **"OpenAI 选择让用户看到路径"** —— **不成立**。
   官方文档明确要求客户端替换掉这些子串（§1.3）。用户看到路径是**失败态**，不是设计意图。
   Scholar 不应该把"暴露路径"当成一个可以接受的产品选择来抄。

2. **"ChatKit 有现成的文件下载组件可以参考"** —— **不成立**。
   官方 widgets 文档的组件清单里没有 file/download/attachment，
   且明确写 "ChatKit expects uploads (files and images) to be hosted by your backend"。
   文件交付在 OpenAI 的 SDK 分层里被判定为宿主责任。

---

## 九、来源清单（全部实际访问过）

**官方文档**
- https://developers.openai.com/api/docs/guides/tools-code-interpreter
- https://developers.openai.com/api/docs/assistants/deep-dive
- https://developers.openai.com/api/docs/guides/citation-formatting
- https://developers.openai.com/api/docs/guides/chatkit-widgets
- https://help.openai.com/en/articles/20001052-file-storage-and-library-in-chatgpt （403，仅搜索摘要）

**逆向系统提示词归档**
- https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/OpenAI/gpt-5.5-thinking.md
- https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/OpenAI/gpt-5.4-thinking.md
- https://github.com/edoardoavenia/chatgpt-system-prompts/blob/main/python.md
- https://raw.githubusercontent.com/edoardoavenia/chatgpt-system-prompts/main/canmore.md
- https://baoyu.io/blog/prompt/full-prompt-chatgpt-4o-with-canvas

**实测/逆向文章**
- https://0din.ai/blog/prompt-injecting-your-way-to-shell-openai-s-containerized-chatgpt-environment
- https://simonwillison.net/2026/Jan/26/chatgpt-containers/
- https://medium.com/@dave1010/chatgpts-canvas-beta-feature-internal-details-a7c1e2477149
- https://gist.github.com/ocombe/1d7604bd29a91ceb716304ef8b5aa4b5

**失败案例 / 开发者论坛**
- https://community.openai.com/t/missing-file-annotation-for-subsequent-files-in-code-interpreter/1351340
- https://community.openai.com/t/download-links-for-files-created-on-chatgpt-getting-removed/896721
- https://community.openai.com/t/error-report-download-link-not-working-for-generated-files-in-chatgpt-code-interpreter/1220959
- https://community.openai.com/t/make-sure-to-include-filecite-turn0file0-in-your-response-to-cite-this-file-or-to-surface-it-as-a-link/1389186
- https://community.openai.com/t/unexpected-citation-markers-appearing-in-text-output-when-using-file-search/1362380
- https://community.openai.com/t/canvas-failed-to-edit-and-previous-versions/1005181
- https://github.com/open-webui/open-webui/discussions/14658
- https://github.com/lencx/ChatGPT/issues/1546
- https://x.com/sh_reya/status/1875227816993943823 （402，仅搜索摘要）
- https://venturebeat.com/ai/openai-unveils-chatgpt-agent-that-gives-chatgpt-its-own-computer-to-autonomously-use-your-email-and-web-apps-download-and-create-files-for-you （429，仅搜索摘要）
