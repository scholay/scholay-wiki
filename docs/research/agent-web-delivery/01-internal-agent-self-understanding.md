# Scholar Agent Role/Context Understanding: Multi-Layer Prompt Injection Architecture

> **Category:** internal

## Summary

Scholar's agent (scholar_agent daemon) understands its role through a sophisticated 4-layer prompt injection system: (1) **base CC system prompt** (baked into Claude Code itself, rarely exposed), (2) **output style** (agent/data/claude/output-styles/paper-reviewer.md — role persona + behavior rules), (3) **agentbridge prefix** (backend/internal/agentbridge/ws.go buildInjectionPrefix — "[AGENT BRIDGE — STRICT RULES]" wrapper injected on first user message), (4) **per-feature prompts** (backend/internal/prompts/*.go — feature-specific system prompts like ClawSystemPrompt). Critically, **the agent currently has NO notion it serves a remote web user or that local files are ephemeral** — Claw and SmartSearch prompts assume local file system persistence and make no distinction between local vs. web delivery. For web-delivery self-understanding, the injection point should be agentbridge prefix (layer 3), not output style, because prefix is applied dynamically per-session and is the only layer aware of the session's hosting context.

---

## 1. Architecture Overview: 4-Layer Prompt Injection System

The Scholar agent's role/behavior is established through **4 stacked layers**, each injecting or configuring prompts:

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Base Claude Code System Prompt (implicit, opaque)      │
│          - Baked into the Claude Code CLI runtime               │
│          - Defines base agent capabilities, session mgmt, etc.  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: Output Style (agent/data/claude/output-styles/*.md)   │
│          - Persona definition, task-specific behaviors          │
│          - Applied by QueryEngine based on user setting         │
│          - Example: "paper-reviewer.md" for scholar_agent       │
│          - Kept alive for entire session                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: AgentBridge Prefix (backend buildInjectionPrefix)      │
│          - "[AGENT BRIDGE — STRICT RULES]" wrapper              │
│          - Injected on FIRST user_message only (per-session)    │
│          - May contain feature-specific rules                   │
│          - Knowledge of web context, session isolation, etc.    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: Per-Feature System Prompts (backend/prompts/*.go)      │
│          - ClawSystemPrompt, SmartSearchSystemPrompt, etc.      │
│          - Injected during session creation (agent.CreateSession)│
│          - Static, feature-specific (claw vs. smart_search, etc)│
│          - Not currently aware of web delivery                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer-by-Layer Breakdown

### Layer 1: Base Claude Code System Prompt
**File:** Not exposed in codebase (baked into agent binary)  
**How Applied:** Implicit runtime behavior of the Claude Code CLI  
**What It Defines:** Session lifecycle, tool availability, basic agent persona  
**Role Awareness:** Generic developer-assistance mode; no Scholar-specific identity

### Layer 2: Output Style — "paper-reviewer.md"
**File:** `/Users/youngp/mypro/fuck_副本/scholar/agent/data/claude/output-styles/paper-reviewer.md`  
**How Applied:** 
- Loaded by `agent/src/outputStyles/loadOutputStylesDir.ts` (line 26-92)
- Applied in `agent/src/constants/outputStyles.ts` (getAllOutputStyles)
- Stored in settings: `agent/data/claude/settings.json` sets `outputStyle: "paper-reviewer"`
- Kept for **entire session duration**

**Key Excerpts:**
```markdown
# 你的角色
你是 **ICML / NeurIPS / Nature 级别的资深学术审稿人**。你的工作是对用户提交的论文...进行**严谨、客观、可操作**的同行评审。

# 行为约束
- **绝不**输出"我无法做到 X" —— 你有完整工具集,先尝试再说没做到
- **绝不**编造文献; 不确定时用 `mcp__minicod__search_papers` 实际查
- **绝不**只夸不评; 即使是优秀论文也要找出可改进点

# 你 *不能* 做的事
- 不能修改 / 写入文件 (你不是 coding agent)
- 不能执行 shell 命令
- 不能访问代码仓库(用户给的论文不是代码项目)
```

**Self-Identity:** "你是...资深学术审稿人" (I am a senior peer reviewer)  
**Web Delivery Awareness:** **NONE** — assumes local file system, no mention of "web user" or "remote delivery"

### Layer 3: AgentBridge Prefix — Session-Level Strict Rules
**File:** `backend/internal/agentbridge/ws.go` lines 451-457 (buildInjectionPrefix function)  
**How Applied:**
- Called during WS handshake (line 330: `injectSystemPromptIntoFirstUserMessage`)
- Wraps per-feature system prompt (from Layer 4)
- Injected **once per session**, on first `user_message` only
- Once injected, `promptInjected.Store(true)` (line 194) prevents re-injection

**Code:**
```go
// buildInjectionPrefix 用 marker 包住 systemPrompt, 让模型清楚 prefix 边界。
// marker 是英文 + 醒目大括号, 减少与用户内容冲突的概率。
func buildInjectionPrefix(systemPrompt string) string {
	return "[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]\n" +
		systemPrompt +
		"\n[/AGENT BRIDGE — END OF RULES]\n\n以下是用户的请求:\n"
}
```

**What Gets Injected:**
- Dynamically selected by `FeatureSpec.Picker` from promptregistry (spec.go:88-95)
- For `smart_search`: SmartSearchSystemPrompt
- For `claw`: ClawSystemPrompt  
- For `paper-review`: (likely separate feature-picker)

**Session Context Available Here:**
- `sessionID` (line 186)
- `userID` (verified JWT, line 89)
- `sessionWorkDir` (per-session isolated cwd, line 31-39)
- Backend knows about web context, isolation, user roles

**Self-Identity / Web Awareness:** Currently **NOT inserted** — only the per-feature prompt (Layer 4) is wrapped

### Layer 4: Per-Feature System Prompts
**Files:**
- `backend/internal/prompts/claw.go` (lines 12-68)
- `backend/internal/prompts/smart_search.go` (lines 12-87)

#### Claw ("智能助手")
**Excerpt (claw.go:12-40):**
```go
const ClawSystemPrompt = `你是 Scholay 学术平台的"智能助手" — 一位科研工作者的全能 AI 搭档。

# 你能帮用户做什么
- 文献检索 / 论文推荐:基于学科 / 关键词 / 作者找最近相关工作
- 期刊推荐 / 投稿建议:根据稿件主题推荐合适期刊...
- 文献阅读理解:用户上传 PDF 后, 你可以用 Read 工具读取论文全文...

# 附件协议 (重要)
用户上传文件 (图片 / PDF / 文本类) 时, backend 已经把**原始文件**放进你的当前工作目录,
并在消息里用 @"路径" 的形式引用。你直接用 Read 工具读取这些文件的真实内容即可...
文件就在工作目录内, 读取无需额外授权; 不要凭文件名臆测内容, 需要分析就 Read。
```

**Self-Identity:** "你是 Scholay 学术平台的智能助手" (I am Scholay platform's assistant)  
**Web Delivery Awareness:** ❌ **NONE**
- Says "backend 已经把文件放进你的当前工作目录" (backend has placed files in your cwd)
- No acknowledgement that **cwd is ephemeral** or session-scoped
- No instruction to proactively deliver final content to user
- Assumes ability to read files directly (true for web user too, but not distinguished)

#### SmartSearch ("文献检索代理")
**Excerpt (smart_search.go:12-45):**
```go
const SmartSearchSystemPrompt = `你是 Scholay 学术平台的"文献检索代理"。本会话只为完成"找论文"这一件事服务...

# 绝对禁令 (违反 = 任务失败)
- 严格禁止调用以下任何本地工具...: Bash、Read、Write、Edit、NotebookEdit、Grep、Glob、WebFetch、WebSearch、Task。
- 你能且只能调用 mcp__minicod__* 开头的工具...
- 不要尝试访问本地文件系统、不要尝试执行 shell、不要尝试浏览外网 —— 学术检索工具已经覆盖了所有学术库,本地一切都用不上。

# 输出格式
- 中文回答,不写无关寒暄、不复述用户问题。
- 每篇文献一段:**标题** / 作者(前 2-3 人 et al.) / 年份 / 期刊或会议 / 1-2 句核心贡献。
```

**Self-Identity:** "你是...文献检索代理" (I am a document retrieval agent)  
**Web Delivery Awareness:** ❌ **NONE**
- Forbids local tools (Bash, Read, WebFetch)
- But **gives no instruction about delivering to web user proactively**
- Output format assumes **human will read it in real-time** (doesn't say "write final results to file" or "prepare for async retrieval")

---

## 3. How Session Context Flows

### Session Creation Path
1. **Backend** (`agentbridge/spec.go:FeatureSpec`):
   - Specifies `InjectPromptOnFirstMsg: true`
   - Holds `Picker` (selects prompt from promptregistry)
   - Passes `SessionOptions.DisallowedTools` and `.addDirs`

2. **Agent Child Process** (`agent/src/server/services/conversationService.ts:218-301`):
   ```typescript
   // Line 232: launchInfo from sessionService
   const launchInfo = await sessionService.getSessionLaunchInfo(sessionId)
   
   // Line 249: isolatedSessionWorkDir computed
   const isolated = isolatedSessionWorkDir(sessionId)
   // → /home/bun/sessions/<sessionId>
   
   // Line 295-301: CLI args built with --disallowed-tools, --add-dir
   const args = this.buildSessionCliArgs(
     sessionId,
     sdkUrl,
     shouldResume,
     effectiveOptions,
     launchRepository,
   )
   
   // Line 321: subprocess spawned with cwd set
   proc = Bun.spawn(args, {
     cwd: launchWorkDir,  // ← isolated session cwd!
     env: childEnv,
     ...
   })
   ```

3. **Agent Runtime** sees:
   - `cwd` = `/home/bun/sessions/<sessionId>` (isolated)
   - No awareness this cwd is **ephemeral** or **scoped to current web request**
   - No awareness that it serves a **web user** not a local developer

4. **WS Bridge Message Injection** (`backend/ws.go:410-449`):
   ```go
   // Line 417: injectSystemPromptIntoFirstUserMessage
   // Called when alreadyInjected.CompareAndSwap(false, true) succeeds
   
   // Line 442: Prefix is prepended
   generic["content"] = buildInjectionPrefix(systemPrompt) + probe.Content
   
   // buildInjectionPrefix (line 451-457) wraps the per-feature prompt:
   "[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]\n" +
   systemPrompt +  // ← ClawSystemPrompt or SmartSearchSystemPrompt
   "\n[/AGENT BRIDGE — END OF RULES]\n\n以下是用户的请求:\n"
   ```

### What the Agent Actually Receives
**First user message comes in as:**
```json
{
  "type": "user_message",
  "content": "[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]\n<per-feature-system-prompt>\n[/AGENT BRIDGE — END OF RULES]\n\n以下是用户的请求:\n<actual-user-request>"
}
```

**Then for subsequent messages:**
- No prefix re-injection (atomic guard prevents it)
- Agent only sees raw user content

---

## 4. Current Prompt Landscape: Zero Web-Delivery Awareness

### Claw (claw.go:12-68)
- ✅ Knows it's "Scholay 智能助手" (platform assistant)
- ✅ Knows about "附件协议" (attachment protocol) — files uploaded
- ❌ **No mention of:** "you serve a web user", "cwd is ephemeral", "prepare deliverables for async fetch"
- ❌ **Assumes:** persistent local filesystem, direct file reading

**Gap Example:**
> "你直接用 Read 工具读取这些文件的真实内容即可:...文件就在工作目录内, 读取无需额外授权"

This is **true** but doesn't acknowledge:
1. **Why** it can read (because backend isolated the cwd)
2. **Where** results go (user retrieves via HTTP, not local disk browse)
3. **Ephemerality** (cwd is destroyed when session ends or after timeout)

### SmartSearch (smart_search.go:12-87)
- ✅ Knows it's a "文献检索代理" (retrieval agent)
- ✅ Forbids local tools (Read, WebFetch)
- ❌ **No mention of:** web delivery, async retrieval, final result format
- ❌ **Assumes:** results are **read synchronously in real-time**

**Gap Example:**
> "每篇文献一段:标题 / 作者 / 年份 / 期刊 / 1-2 句核心贡献。"

No instruction like:
- "Prepare a JSON response suitable for web rendering"
- "Format results in the provided template for frontend parsing"
- "Save final results to a file for async retrieval"

---

## 5. How Prism Already Encodes Agent Behavior Contract

**File:** `backend/internal/prism/edit.go` lines 140-152 (agentNativeProtocol)

```go
const agentNativeProtocol = `你是 Scholay 智能写作(Prism)的 LaTeX 编辑助手。用户在写一篇 LaTeX 论文,项目的所有文件就在你的当前工作目录里。

【工作方式】
- 先用 Read 读取你要修改的文件(以及为保持一致需要参考的其它文件),理解上下文。
- 用 Edit / Write 工具**直接修改**工作目录里的文件来完成指令。Edit 做定点最小替换,绝不重写整篇...
- 改完后用 1-2 句中文简短说明你做了什么(给用户看,会显示在对话里)。

【参考规范】你有一组写作规范 skill,遇到对应场景时**先用 Skill 加载对应指南再动手**...

【约束】只修改完成本指令所必需的文件与内容。不要执行 shell 命令、不要尝试自己编译(编译由系统负责)。`
```

**Key Patterns (Applicable to Web-Delivery):**
1. **Role clarity:** "你是...的 LaTeX 编辑助手" (I am X's LaTeX editor assistant)
2. **Execution model:** "Read → Understand → Edit → Report back" (synchronous feedback loop)
3. **Tool usage discipline:** "Edit 做定点最小替换" (minimal, focused edits)
4. **Constraints:** "不要执行 shell 命令" (forbidden actions)
5. **Output convention:** "用 1-2 句中文简短说明你做了什么" (concise summary for UI)

**Why Prism works differently:**
- Prism stores real edits in **DB**, not session-local files
- Agent outputs `[PRISM_PATCH]` markers instead of modifying cwd
- Result is **captured and persisted** separately from agent cwd
- So ephemerality doesn't break the workflow

---

## 6. Where to Inject Web-Delivery Self-Understanding

### Option A: Output Style (Layer 2)
**Pros:**
- Already a customization point per-agent
- Could override per-feature

**Cons:**
- Stateless, applied at session start
- Doesn't have access to runtime context (sessionID, userID, etc.)
- Would need to be **duplicated** across all output styles (paper-reviewer, future styles)
- Weaker signal — "this is how to behave" rather than "this is your runtime context"

### Option B: Per-Feature Prompt (Layer 4) ← ❌ NOT RECOMMENDED
**Cons:**
- Static, compiled into binary (`const ClawSystemPrompt = ...`)
- No access to session context
- Changing prompt = rebuild + redeploy
- Already handles feature-specific behavior; mixing in "you serve web users" dilutes focus
- Harder to evolve uniformly (each feature would need custom web-delivery instruction)

### Option C: AgentBridge Prefix (Layer 3) ← ✅ RECOMMENDED
**Pros:**
1. **Session-aware:** Has access to `sessionID`, `userID`, session context
2. **Dynamic:** Injected at WS handshake time, can be generated per-session
3. **Centralized:** Single source of truth for "web-delivery contract"
4. **Graceful degradation:** Existing per-feature prompts remain unchanged; prefix is **additive**
5. **Testable:** Can inject different prefixes for different features/users without code changes
6. **Already precedent:** buildInjectionPrefix already wraps per-feature prompt (line 454)

**How it would work:**
```go
// backend/internal/agentbridge/ws.go

func buildInjectionPrefix(systemPrompt string) string {
	webDeliveryNotice := `
【你在服务一个 Web 用户,请注意以下特殊约束】
- 你的工作目录 (~/.claude/sessions/<sessionId>) 是会话隔离的临时空间。
- 任何产出(文件、数据)必须写到该工作目录;任何不属于该目录的读写都会被后端拒绝。
- 会话结束后该目录会被清空。因此:**不要假设文件会被永久保存**。
- 对于需要用户保存的结果(下载、导出、分享),你的工作是:**生成结果文件**到工作目录,
  后端会检测到并通过 WebSocket 推送给前端。不要假设用户能本地访问文件。
- 遇到需要长期保存的数据(项目配置、论文草稿等),指导用户通过前端界面保存,
  而不是靠 agent 端文件持久化。`
  
	return "[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]\n" +
		webDeliveryNotice + "\n\n" +
		systemPrompt +
		"\n[/AGENT BRIDGE — END OF RULES]\n\n以下是用户的请求:\n"
}
```

---

## 7. Tradeoffs & Recommendations

| Layer | Awareness | Persistence | Centralization | Effort |
|-------|-----------|-------------|-----------------|--------|
| Layer 2 (Output Style) | ❌ None | Session-long | Per-style | Medium |
| Layer 3 (AgentBridge Prefix) | ✅ Full session context | Per-session | **Centralized** | Low-Medium |
| Layer 4 (Per-Feature Prompt) | ❌ None | Session-long | Per-feature | High (redeploy) |

### Recommended Implementation Strategy
1. **Identify what the agent needs to know:**
   - Session scope / isolation (`sessionWorkDir`)
   - Ephemerality (files deleted after session)
   - Web delivery model (results fetched via HTTP, not local fs)
   - Permission boundary (can't read other sessions' files)
   - Async vs. sync output (results may not be viewed immediately)

2. **Inject at Layer 3 (agentbridge buildInjectionPrefix):**
   - Modify `backend/internal/agentbridge/ws.go` buildInjectionPrefix
   - Add a web-delivery notice **before** the per-feature prompt
   - Include concrete examples for each feature:
     - **Claw:** "Upload files are in `sessionWorkDir`; results are fetched via API, not saved to disk"
     - **SmartSearch:** "Results should be formatted for JSON rendering; user retrieves via WebSocket"
   - Keep the existing per-feature prompt **unchanged** to maintain backwards compatibility

3. **Test per-feature:** Verify each feature (claw, smart_search, paper-review, etc.) understands the constraints

4. **Future evolution:** Once output styles are improved, consider **Layer 2** as a complementary place to reinforce principles (e.g., "Summary Style" could emphasize conciseness for web display)

---

## 8. Evidence from Codebase

| Question | Answer | File:Line |
|----------|--------|-----------|
| Where is agent role defined? | Output style + per-feature prompt | agent/data/claude/output-styles/paper-reviewer.md + backend/internal/prompts/claw.go |
| How is prompt injected? | WS handshake, first message only | backend/internal/agentbridge/ws.go:410-449 |
| Does agent know it's web-hosted? | ❌ No | claw.go:40-56, smart_search.go:12-87 (no "web user" mention) |
| Does agent know files are ephemeral? | ❌ No | claw.go:50 says "文件就在工作目录内,读取无需额外授权" but doesn't say *why* or *that it's temporary* |
| Can agentbridge see session context? | ✅ Yes | ws.go:186 (userID, sessionID, sessionWorkDir passed to pipe function) |
| Where should web-delivery instruction go? | Layer 3 (agentbridge prefix) | backend/internal/agentbridge/ws.go:451-457 (buildInjectionPrefix) |

---

## 9. Key Insight for CLAW Development

**Current situation:** Claw has **no notion** it serves a web user. Its prompt says:
> "backend 已经把文件放进你的当前工作目录,并在消息里用 @"路径" 的形式引用。你直接用 Read 工具读取这些文件的真实内容即可"

This is **technically correct** but **architecturally incomplete**:
- It explains *what* happens (files appear in cwd) but not *why* (because backend isolated the session)
- It doesn't say *where results go* (HTTP, not local disk)
- It doesn't acknowledge *ephemerality* (cwd is temporary)
- It doesn't guide *how to deliver to web user* (proactive file generation? formatted output?)

**Solution:** Inject at Layer 3 with explicit web-delivery contract:
```
【Web 用户会话上下文】
- 你的工作目录是临时的,会话结束后清空。不要依赖文件持久化。
- 用户结果的获取是**异步**的:你生成的文件会被后端检测并推送到前端。
- 对于需要用户保存的成果(下载论文评审、导出搜索结果),生成到工作目录,
  后端会自动处理推送。不要假设用户能本地访问。
```

This **strengthens** Claw without rewriting its existing role definition.


## Key Patterns

### 4-Layer Prompt Injection Stack
Agent role/context flows through (1) base CC system prompt (implicit), (2) output style (session-long persona), (3) agentbridge prefix (session-scoped strict rules, injected once on first message), (4) per-feature system prompts (static, compiled). Each layer is orthogonal and can override/refine lower layers.

- **How the agent is made aware:** Injected into first user_message as prefix wrapper; subsequent messages don't re-inject. Output style applies for entire session via settings.json.
- **Source:** backend/internal/agentbridge/ws.go:410-449, agent/data/claude/settings.json:2-3, backend/internal/prompts/claw.go:9

### Output Style as Persona Repository
Markdown files in agent/data/claude/output-styles/ (e.g., paper-reviewer.md) define agent's role, task constraints, and behavioral rules. Loaded by loadOutputStylesDir.ts, applied QueryEngine-wide for session. Separated from per-feature prompts.

- **How the agent is made aware:** Frontend or agent settings select style; QueryEngine resolves and applies during session startup.
- **Source:** agent/src/outputStyles/loadOutputStylesDir.ts:26-92, agent/data/claude/output-styles/paper-reviewer.md:23-100

### Dynamic Session Injection Point
buildInjectionPrefix() in ws.go wraps the per-feature system prompt with '[AGENT BRIDGE — STRICT RULES]' marker, injected **once per session** on first user_message via atomic.CompareAndSwap guard. Backend has full context (sessionID, userID, sessionWorkDir) at injection time.

- **How the agent is made aware:** Marker-wrapped content prepended to first user_message.Content; subsequent messages bypass injection. Marked by '[/AGENT BRIDGE — END OF RULES]' so agent knows where rules end.
- **Source:** backend/internal/agentbridge/ws.go:417-449 (injectSystemPromptIntoFirstUserMessage), lines 451-457 (buildInjectionPrefix)

### Per-Feature Prompt as Static Behavioral Contract
Backend holds feature-specific system prompts as Go const strings (ClawSystemPrompt, SmartSearchSystemPrompt). Stateless, compiled into binary. Wrapped by buildInjectionPrefix and sent in agentbridge prefix. Chosen dynamically by FeatureSpec.Picker but content is immutable per-deployment.

- **How the agent is made aware:** Injected as part of agentbridge prefix; agent receives it wrapped in strict-rules markers.
- **Source:** backend/internal/prompts/claw.go:12-68, backend/internal/prompts/smart_search.go:12-87

### Session-Local File Isolation Opaque to Agent
Agent cwd is set to isolated /home/bun/sessions/<sessionId> (computed by isolatedSessionWorkDir in sessionService.ts:32-35, enforced at Bun.spawn cwd parameter). Backend blocks cross-session file access via decidePermission in ws.go. But agent prompt doesn't explain **why** it can read files or that cwd is temporary.

- **How the agent is made aware:** Agent sees cwd is isolated directory; claw.go:50 says 'backend 已经把文件放进你的当前工作目录' but doesn't explain mechanism or ephemerality.
- **Source:** agent/src/server/services/sessionService.ts:32-35, agent/src/server/services/conversationService.ts:249-251, backend/internal/agentbridge/ws.go:460-472 (decidePermission)

### Prism's Native Protocol as Behavioral Template
Prism encodes agent behavior contract explicitly: read files → understand context → output marked deltas ([PRISM_PATCH]), don't write directly. Shows how to thread the needle between agent autonomy and system safety. Uses skill injection for domain-specific knowledge (prism-latex-format, etc).

- **How the agent is made aware:** Hardcoded in agentNativeProtocol const; injected into session creation. Shows role (LaTeX editor), execution model (Read→Understand→Edit→Report), constraints (no shell), output convention (mark deltas).
- **Source:** backend/internal/prism/edit.go:140-152

### Zero Web-Delivery Awareness in Current Prompts
Claw and SmartSearch prompts assume local file persistence, don't distinguish web from local delivery, give no instruction about proactive result generation or async retrieval. Say 'files in cwd' but don't say why, how long they persist, or where results go.

- **How the agent is made aware:** Read claw.go:50 'backend 已经把文件放进你的当前工作目录' and smart_search.go:84 '每篇文献一段' — both assume synchronous, real-time consumption by human, not web delivery.
- **Source:** backend/internal/prompts/claw.go:50-56, backend/internal/prompts/smart_search.go:82-87

### AgentBridge as Optimal Injection Layer for Web-Delivery Contract
Layer 3 (agentbridge prefix) is session-aware, dynamic, centralized, and already wraps per-feature prompts. Perfect place to inject web-delivery constraints without modifying per-feature static prompts. Has access to sessionID, userID, workdir at injection time.

- **How the agent is made aware:** Add web-delivery notice to buildInjectionPrefix before per-feature prompt; wrapped in same [AGENT BRIDGE] markers so agent knows it's a strict rule.
- **Source:** backend/internal/agentbridge/ws.go:451-457, backend/internal/agentbridge/spec.go:100-106 (InjectPromptOnFirstMsg flag)


## Relevance to Claw (web-delivery design)

To make the Claw agent (and future CLAW agents) self-understand web delivery, inject a web-delivery contract at Layer 3 (agentbridge buildInjectionPrefix) that explicitly states: (1) session cwd is isolated and temporary (~/.claude/sessions/<sessionId>), (2) files will be deleted when session ends, (3) results are fetched via HTTP/WebSocket by frontend, not browsed locally, (4) for persistable artifacts (downloads), generate to cwd and backend will detect/push, (5) long-term storage goes through frontend UI, not agent FS. This builds on the existing Prism pattern (read→understand→output pattern) and integrates with the current layered prompt architecture. No need to modify claw.go (Layer 4); inject proactively at Layer 3 before it, letting the static per-feature prompt remain unchanged while adding critical context about **why** the isolated cwd exists and **how results are delivered**. This closes the gap where Claw knows "files are in cwd" but not "why they're safe" or "where they go."

## Sources Consulted

- backend/internal/agentbridge/ws.go:410-449 (injectSystemPromptIntoFirstUserMessage & buildInjectionPrefix)
- backend/internal/agentbridge/spec.go:69-132 (FeatureSpec architecture)
- backend/internal/prompts/claw.go:12-68 (ClawSystemPrompt static definition)
- backend/internal/prompts/smart_search.go:12-87 (SmartSearchSystemPrompt static definition)
- agent/src/outputStyles/loadOutputStylesDir.ts:26-92 (output style loading)
- agent/data/claude/output-styles/paper-reviewer.md:1-124 (full persona definition)
- agent/src/server/services/conversationService.ts:218-301 (session startup with context injection)
- agent/src/server/services/sessionService.ts:32-35 (isolatedSessionWorkDir definition)
- backend/internal/prism/edit.go:140-152 (agentNativeProtocol as reference pattern)
- agent/src/server/services/agentBridgePreamble.ts:16-26 (stripAgentBridgeRulesPreamble shows marker used)
- agent/data/claude/settings.json:1-40 (agent settings, output style selection)
