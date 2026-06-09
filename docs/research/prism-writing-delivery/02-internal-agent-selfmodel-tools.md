# Prism Agent Self-Model, Tool Policy & Capability Surface: Depths & Gaps

> **Category:** internal

## Summary

Prism's agent-native protocol is a constraint-based system prompt (140–152 lines in edit.go) injected once per session, telling the agent it serves a LaTeX editor in an ephemeral cwd. The tool policy is binary: Bash/Task/Agent/NotebookEdit are explicitly forbidden; Read/Write/Edit/MultiEdit are allowed within cwd-bound paths (enforced by decidePermission in ws.go). Three writing skills are loaded via --add-dir: prism-latex-format, prism-academic-writing, prism-discipline-conventions. Prism does NOT use agent's full capabilities—Bash is disabled (no plot/data generation), and Task subagents are forbidden. Compared to claw (which allows Bash), Prism's restriction is intentional and structural. Key gaps: the agent is never told "you serve a remote web user" or that disk is ephemeral; cross-file awareness is implicit (no explicit context); the skills lack integration with the "what not to do" negative examples that shift agent behavior; fallback file harvesting (mentioned in claw design) is absent.

---

# Prism Agent Self-Model, Tool Policy & Capability Surface: Investigation & Gaps

## 1. The Agent's Self-Model: Full agentNativeProtocol

**File & Location:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/edit.go:140–152`

**Exact Prompt Text (Chinese):**
```
你是 Scholay 智能写作(Prism)的 LaTeX 编辑助手。用户在写一篇 LaTeX 论文,项目的所有文件就在你的当前工作目录里。

【工作方式】
- 先用 Read 读取你要修改的文件(以及为保持一致需要参考的其它文件),理解上下文。
- 用 Edit / Write 工具**直接修改**工作目录里的文件来完成指令。Edit 做定点最小替换,绝不重写整篇,不要改与指令无关的部分,不要动 \documentclass / 导言区(除非指令明确要求)。
- 改完后用 1-2 句中文简短说明你做了什么(给用户看,会显示在对话里)。

【参考规范】你有一组写作规范 skill,遇到对应场景时**先用 Skill 加载对应指南再动手**,产出更专业:
- prism-latex-format:涉及公式 / 图表 / 参考文献 / 交叉引用 / 中文(ctex)/ 转义,或修编译报错(带 l.NNN 行号)时。
- prism-academic-writing:续写 / 改写 / 润色正文(摘要 / 引言 / 方法 / 实验 / 讨论),或要求"写得更好 / 更精炼 / 更地道"时。
- prism-discipline-conventions:需符合某学科(CS·ML / 数学 / 物理 / 生物医学 / 统计 等)的结构 / 记号 / 报告规范,或对齐会议期刊模板时。

【约束】只修改完成本指令所必需的文件与内容。不要执行 shell 命令、不要尝试自己编译(编译由系统负责)。
```

### What the Agent Is TOLD (Self-Model Components):

1. **Role**: LaTeX editing helper for Scholay's intelligent writing (Prism)
2. **Context**: User is writing a LaTeX paper; all project files are in the cwd
3. **How to Edit**:
   - Read files first (with Read tool) to understand context
   - Use Edit/Write to directly modify files in cwd
   - Edit is for precise point replacement, never rewrite entire files
   - Never change `\documentclass` or preamble unless explicitly instructed
   - Summarize changes in 1–2 sentences in Chinese for the user
4. **Skill Integration**: Load writing skills (prism-latex-format, prism-academic-writing, prism-discipline-conventions) from Skill tool when encountering relevant scenarios
5. **Constraints**: Only modify files necessary for the instruction; no shell commands; no self-compilation

### Critical Absences in the Self-Model:

- **No mention of ephemeral cwd**: Agent is not told "your cwd will be discarded after this session"
- **No mention of web user**: Agent is not told "you serve a remote web user over HTTP; nothing on your disk reaches them unless explicitly delivered"
- **No round structure awareness**: Agent doesn't know about prepare/pending/apply/reject gates; it just edits
- **No file-out protocol**: No mention of how to deliver finished work to the user (unlike claw's `./out/` convention)
- **No "document reaches user" signal**: The promise "changes will be applied to the project" is implicit in the tool availability, not explicit in the prompt

## 2. Tool Policy: DisallowedTools vs. Allowed Surface

**File & Location (Disallowed):** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/spec.go:40`

**Exact prismDisallowedTools Definition:**
```go
var prismDisallowedTools = []string{"Bash", "NotebookEdit", "Task", "Agent"}
```

### What IS Prohibited (Backend Enforcement):
- **Bash**: No shell commands (prevents data generation, plot execution, external tool calls)
- **NotebookEdit**: No Jupyter notebook modification (code-execution vector)
- **Task**: No background task subagent spawn (prevents agent from creating subsidiary agents to circumvent policy)
- **Agent**: No subagent creation (prevents policy bypass via delegation)

### What CAN Be Used (Allowed via pathWithin + decidePermission):

**File Operations (cwd-bounded):**
- `Read`: Read files from cwd
- `Write`: Write new files to cwd
- `Edit`: Modify existing files in cwd (point replacement)
- `MultiEdit`: Batch edit multiple files in cwd
- `Glob`: List files in cwd (no path = defaults to cwd, safe)
- `Grep`: Search text in cwd (no path = defaults to cwd, safe)
- `LS`: List directory (path-checked by permissionAllowed)

**MCP/Web Tools (explicitly allowed in permissionAllowed, ws.go:523, 535, 539):**
- `mcp__minicod__*`: All minicod tools (scholar academic search, read-only)
- `WebFetch`, `WebSearch`: Network queries (behind egress proxy in production)
- `Skill`: Load writing guides (inline execution, tool calls within skill re-check permissions)

### Path Enforcement Mechanism:

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentbridge/ws.go:459–590`

The `permissionAllowed` function enforces **two-layer gates**:

1. **Layer 1 (spec-level):** Forbidden tools rejected outright (Bash, Task, Agent, NotebookEdit)
2. **Layer 2 (path-level):** File tools (Read/Write/Edit/MultiEdit/Glob/Grep) only approved if `pathWithin(path, sessionWorkDir)` is true
   - Relative paths: safe by default (assumed relative to cwd)
   - Absolute paths: cleaned + prefix-matched against `sessionWorkDir`
   - Cross-session reads: rejected (agent cannot read `/home/bun/sessions/<other-session-id>/...`)

**Example Fence Code (ws.go:576–590):**
```go
func pathWithin(p, workDir string) bool {
	if workDir == "" {
		return false // No workdir = conservative reject
	}
	if !path.IsAbs(p) {
		cleaned := path.Clean(p)
		return !strings.HasPrefix(cleaned, "..")  // Relative ok unless tries to escape
	}
	cleaned := path.Clean(p)
	root := path.Clean(workDir)
	return cleaned == root || strings.HasPrefix(cleaned, root+"/")
}
```

### Writing Skills: How They Load & What They Contain

**File & Location (Loading):** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/spec.go:42–49`

**Loading Mechanism:**
```go
func prismSkillAddDir() string {
	if d := strings.TrimSpace(os.Getenv("PRISM_SKILL_ADDDIR")); d != "" {
		return d
	}
	return "/prism-add"
}

// In BuildSpec():
SessionOptions: &agent.CreateSessionOptions{
	DisallowedTools: prismDisallowedTools,
	AddDirs: []string{prismSkillAddDir()},  // Agent loads .claude/skills/* from here
}
```

The agent session is created with `--add-dir /prism-add`, which points to a directory containing `.claude/skills/` with three Prism-specific writing guides. The agent can dynamically invoke these via the `Skill` tool (which is NOT disabled).

**Three Writing Skills Locations & Scope:**

**1. prism-latex-format**  
**File:** `/Users/youngp/mypro/fuck_副本/scholar/agent/data/claude/prism-skills/prism-latex-format/SKILL.md`
- **When to Use:** Editing involving formulas, figures, tables, references, cross-references, Chinese (ctex), escaping, or fixing compilation errors with line numbers
- **Tools Allowed (within skill):** Read, Glob, Grep, Edit, Write, MultiEdit
- **Content:** ~40 lines covering math notation, figures/tables, references/citations, cross-references, Chinese CJK support, escaping and error fixing
- **Key Rule:** Keep `\documentclass` and preamble unchanged; never rewrite entire files; use Edit for minimal point replacement

**2. prism-academic-writing**  
**File:** `/Users/youngp/mypro/fuck_副本/scholar/agent/data/claude/prism-skills/prism-academic-writing/SKILL.md`
- **When to Use:** Rewriting, polishing, or refining paper sections (abstract, intro, methods, experiments, discussion); or user requests "write better/more concise/more native"
- **Tools Allowed (within skill):** Read, Glob, Grep, Edit, Write, MultiEdit
- **Content:** ~35 lines covering sentence/paragraph structure, topic-first claims, active voice, argument chain localization, chapter-specific rhetoric (intro/methods/experiments/related work/abstract), compression, "de-AI" style (removing filler phrases)
- **Key Rule:** Preserve all `\cite{}` positions; only change language quality, not LaTeX structure or discipline norms

**3. prism-discipline-conventions**  
**File:** `/Users/youngp/mypro/fuck_副本/scholar/agent/data/claude/prism-skills/prism-discipline-conventions/SKILL.md`
- **When to Use:** Writing/editing must conform to a discipline's conventions (CS/ML, math/theory, physics, bio-med, materials/chemistry, statistics); or align with venue/conference templates
- **Tools Allowed (within skill):** Read, Glob, Grep, Edit, Write, MultiEdit
- **Content:** ~30 lines covering discipline-specific structure, notation systems, reporting standards (IMRAD vs NeurIPS vs CONSORT), theorem environments, reproducibility checklists
- **Key Rule:** Infer discipline from title/keywords/methods; apply appropriate conventions; clarify your choice in the response if uncertain

## 3. What Prism Does NOT Get: Intentional Capability Restrictions

### Bash is Disabled

**Why:** Bash cannot be path-bounded like file tools. In production, Bash must run in a bubblewrap sandbox with cwd+network restrictions. Prism disables it entirely because:

- No figures/plots: Agent cannot run matplotlib, gnuplot, or similar visualization tools
- No data generation: Agent cannot run Python scripts to create synthetic datasets or process raw data
- No external tool invocation: Agent cannot call pandoc, imagemagick, or domain-specific compilers
- No dynamic computation: Prism is a **text editor**, not a scientific computing platform

This is a deliberate architectural choice: Prism edits files in the user's LaTeX project; it does not generate new data or run analysis pipelines.

### Task & Agent Subagents Are Disabled

**Why:** Subagents (Task creates background tasks; Agent spawns sibling agents) could circumvent the tool policy. If the main agent could spawn a Task, that Task would inherit the full Claude Code tool set and potentially call Bash. By disabling Task/Agent:

- No policy bypass via delegation: the agent cannot "spawn a helper to run Bash"
- No cross-session context leakage: each Prism project has its own isolated session; spawning would require complex ownership tracking

### NotebookEdit is Disabled

**Why:** Code notebooks are execution vectors. Disabling NotebookEdit prevents the agent from:
- Creating .ipynb cells that execute code
- Reading notebook outputs as side-channel communication with external systems

## 4. Contrast: Prism's Restricted Surface vs. Claw's Full Surface

| Dimension | Prism | Claw |
|---|---|---|
| **Bash** | Disabled | Allowed (per ws.go:530) |
| **Read/Write/Edit** | Allowed (cwd-bounded) | Allowed (cwd-bounded) |
| **Task/Agent** | Disabled | Allowed (agent not shown, but ws.go permits if spec allows) |
| **NotebookEdit** | Disabled | Allowed |
| **MCP tools** | Allowed | Allowed |
| **Web tools** | Allowed | Allowed |
| **Self-model injection** | Yes (agentNativeProtocol) | Yes (ClawSystemPrompt) |
| **Skill integration** | Yes (3 writing skills via --add-dir) | Optional (no mandatory skills) |
| **Round/apply gates** | Yes (prepare/pending/apply/reject) | N/A (one-shot async deliverable) |

**Key Difference:** Prism is **editing-only** (write to a user's cwd, user approves before apply). Claw is **generation + delivery** (produce files in ./out/, backend harvests and delivers).

## 5. GAPS: What Prism Misses Through the Web-Delivery Lens

Prism's self-model and tool policy work **for editing existing LaTeX files**, but they have critical gaps when viewed through the lens of "the agent serves a remote web user over ephemeral scratch" (the design principle from 11-synthesis-design.md):

### GAP 1: No Web-User Self-Model

**What's Missing:** The agent is never told "you serve a remote user via HTTP; nothing on your disk automatically reaches them."

**Impact:** 
- The agent believes it's a local editor (implicit in "project files are in your cwd")
- No signal that changes only persist after user approval via the round model
- If the agent ever generated output files (e.g., a summary, a figure), it would have no explicit affordance to "deliver" them (unlike claw's `./out/` convention or the proposed `deliver_artifact` tool in 11-synthesis-design.md)
- The agent doesn't understand that its cwd is ephemeral; it might form assumptions like "I can reference files I created for the next turn" (which is true within a round, but unclear across rounds)

**Recommendation:** Inject a layer 3 prefix (via `buildInjectionPrefix` in ws.go) telling the agent:
```
你正在为一名通过【网页聊天界面】访问 Scholay 的远程用户服务 —— 不是本地终端。
- 你的当前工作目录是一块【私有、临时的草稿盘】。会话结束后它会被清空。
- 用户【看不到、打不开】你工作目录里的任何文件,除非你通过指定的交付机制主动交付。
```

### GAP 2: No Explicit File-Out / Delivery Protocol

**What's Missing:** Prism's prompt says "改完后用 1-2 句中文简短说明你做了什么", but offers no way to signal "here are deliverables for the user."

**Impact:**
- If Prism were extended to generate new files (e.g., auto-generate a table of contents, a literature summary, a cleaned dataset), there's no explicit tool to deliver them
- The only delivery path is implicit: "user clicks apply → changes persist to DB." But that assumes everything the agent writes is a desired outcome
- No rubric for "what should be delivered vs. what's scratch"; no agent-native decision point

**Evidence from 11-synthesis-design.md § 2:**
> The agent's local filesystem is private, ephemeral scratch. The only channel that reaches the human is an **explicit, typed delivery act**. 

Prism lacks this explicit act. It relies on the round/apply model, which implicitly approves all cwd changes the agent made.

**Recommendation:** If Prism expands to generate deliverables, add:
1. A `deliver_artifact(path, title, description)` tool (as proposed in 11-synthesis-design.md § 4)
2. A rubric in the prompt: "For finished work you want the user to keep (summaries, cleaned data, new sections), explicitly call deliver_artifact. For scratch/intermediate files, save them outside the deliver scope."

### GAP 3: Skill Integration Lacks Negative Examples & Boundary Rules

**What's Missing:** The three skills tell the agent "here's what good looks like", but don't explicitly teach "here's what NOT to do" or "here are the failure modes."

**Current:** prism-latex-format.md lists rules like "caption in front, label after" but doesn't include:
- Common pitfalls (e.g., "overfull lines, bad breaks, spacing bugs")
- Self-correction checks (e.g., "after editing, grep for undefined \\ref")
- Negative examples (e.g., "DON'T do this: $...$" with unpaired braces)

**Impact:** Agent must infer failure modes by trial (getting compilation errors), rather than being pre-armed with anti-patterns.

**Evidence:** skill metadata includes `when_to_use`, but no `failure_modes` or `anti_patterns` field.

**Recommendation:**
- Expand skill format to include `## Anti-patterns` sections with 3–5 common failures per skill
- Add self-check rules (e.g., prism-latex-format should include "run grep to check for undefined \\ref before marking complete")
- Consider a separate `prism-latex-quality` skill for post-edit validation (like a "linting" step)

### GAP 4: Cross-File Awareness Is Implicit, Not Managed

**What's Missing:** The prompt says "Read files to understand context", but doesn't specify:
- How deep to read (just the file being edited, or related preamble, or entire project?)
- How to track dependencies (if editing intro, should I re-read related work for consistency?)
- How to validate cross-references (after editing, should I verify all \\cite{key} exist in references.bib?)

**Impact:**
- Agent might edit without checking if a label is defined elsewhere
- Agent might change a symbol's meaning locally without checking if it's used in 10 other files
- No "validation round": agent edits, applies, user later discovers inconsistency

**Evidence from cite.go (§ 2.2):** Prism has a citation RAG system (`SearchCite` + `ApplyCite`), but:
- It operates at the **file level** (write to references.bib)
- It does **not** validate that \\cite{key} calls in other files actually exist
- User must manually invoke /cite endpoint; there's no "check citations" workflow in the editing round

**Recommendation:**
- Add a validation skill: `prism-validation` with rules like:
  - "After editing \\label or \\cite, re-read all cross-referencing files to ensure consistency"
  - "Check for undefined \\ref, undefined \\cite, unreferenced \\label"
  - "Verify all \\include/\\input files exist"
- Or: backend provides a "validate" endpoint that runs a post-edit check (grep \\ref vs \\label, check .bib keys, etc.)

### GAP 5: No Fallback Safety Net for Forgotten Deliverables

**What's Missing:** If Prism is extended to generate new files (not just edit existing ones), there's no "disk harvest" fallback as proposed in 11-synthesis-design.md § 6.

**Current:** Prism relies entirely on the round/apply model: agent edits in cwd → user approves → apply persists to DB. But if the agent writes files that should NOT be persisted (scratch, temp, failed attempts), there's no way to exclude them. The apply is all-or-nothing.

**Impact:**
- If extended to generate, agent must be perfect at signaling intent
- No safety net for "oops, I generated 20 temp.json files as scratch; the user only needs the final report.md"
- No metric to detect if agent is "forgetting to deliver" substantive outputs

**Evidence:** 03-internal-prism-precedent.md § VI notes that Prism's mature features include "best-effort async auto-naming", but no "automatic artifact harvesting" or "undelivered file detection."

**Recommendation:**
- If moving toward a delivery model, implement the fallback from 11-synthesis-design.md:
  - Snapshot cwd before each turn
  - After message_complete, diff to find new files
  - Surface undelivered net-new files as an opt-in pull tray (not auto-push)
  - Log a metric `delivery.fallback_harvest` to tune the prompt

### GAP 6: No Explicit "Scope Discipline" Rubric

**What's Missing:** The prompt says "只修改完成本指令所必需的文件与内容" (only modify files necessary for the instruction), but provides no rubric for deciding scope.

**Impact:**
- Agent might over-edit (e.g., user says "fix typos in section 3"; agent rewrites section 3 entirely)
- Agent might under-edit (e.g., user says "improve the paper"; agent makes one cosmetic change)
- No explicit coupling between "what the user asked for" and "what constitutes completion"

**Evidence:** prism-academic-writing.md includes "保持 LaTeX 结构与所有 `\cite{}` 位置不变" (keep LaTeX structure and all \\cite positions), but this is a constraint, not a scope rule.

**Recommendation:**
- Add a scope rubric to agentNativeProtocol:
  ```
  【指令理解与范围】
  - 用户给的指令是具体的 (如"改第 3 段语气")，还是宽泛的 (如"润色整篇")？
  - 具体指令 → 只改那一处；宽泛指令 → 全文扫一遍,但改动幅度不超 30%。
  - 改完后用 diff 自查：删除行数 / 修改行数 是否合理？有没有改了与指令无关的内容?
  ```

## 6. Contrast: How Claw Gets This Right (and Prism Should Too)

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prompts/claw.go:49–74`

Claw's system prompt includes:

```
你在为一个【通过网页聊天界面】访问 Scholay 的远程用户服务, 不是本地终端。务必牢记:
- 你的当前工作目录是一块【私有、临时的草稿盘】(会话结束即清空): 用它读写、组织中间文件都很好,但用户【看不到、打不开】它。
- 真正能交给用户的有两条路:
  1. 【聊天回复正文】 —— 解释、结论、较短的结果直接写在回复里。
  2. 【交付文件】 —— 把产出写进 ./out/ 子目录。凡是写进 ./out/ 的文件都会作为【可下载产物】呈现给用户。
```

**Why Claw Works Better for "Remote User":**
1. **Explicit self-model:** "you serve a remote user via web chat UI, not local terminal"
2. **Ephemeral cwd signal:** "scratch disk is wiped at session end"
3. **Delivery protocol:** Two paths (inline reply vs. ./out/ file)
4. **Fallback convention:** "anything in ./out/ auto-harvests" (not all of cwd, only ./out/)

**What Prism Lacks:**
- Prism's prompt assumes local editing (implicit in "project files in cwd")
- No ephemeral signal (agent might expect persistent cwd)
- No delivery protocol (agent can't "deliver" new artifacts)
- No scope protection (all edits auto-apply after user approval)

## 7. Recommendations Summary

### High Priority (Self-Model)

1. **Inject Layer-3 web-delivery self-model** via `buildInjectionPrefix` to ALL agentbridge features (not just claw):
   ```go
   // In agentbridge/ws.go buildInjectionPrefix():
   prefix := "[AGENT BRIDGE — STRICT RULES]\n" +
     "你正在为通过【网页聊天】访问的远程用户服务...\n" +
     "你的当前工作目录是【私有、临时草稿盘】...\n" +
     systemPrompt +
     "\n[/AGENT BRIDGE]\n"
   ```

2. **Add scope discipline rubric** to agentNativeProtocol:
   - Define what "necessary for the instruction" means (diff budget, file count limit)
   - Teach agent to self-check: "did I over-edit or under-edit?"

### Medium Priority (Skills & Validation)

3. **Expand skill format** to include anti-patterns and failure modes:
   - prism-latex-format: add "common pitfalls" (overfull lines, undefined \\ref, missing packages)
   - prism-academic-writing: add "de-AI anti-patterns" (what NOT to write)
   - prism-discipline-conventions: add "venue-specific errors" (word count, reference format)

4. **Add validation skill** (prism-validation) or backend endpoint:
   - Check for undefined \\ref, undefined \\cite, unreferenced \\label
   - Verify \\include/\\input files exist
   - Run after each edit as a self-check

5. **Document cross-file awareness**:
   - Teach agent to read preamble for macro definitions, documentclass settings, loaded packages
   - Teach agent to verify changes don't break cross-references in other files
   - Provide a "validate project" tool that checks global consistency

### Lower Priority (Future: If Prism Expands to Generation)

6. **If Prism generates new deliverables**, implement:
   - `deliver_artifact(path, title, description)` tool (from 11-synthesis-design.md)
   - Fallback disk-diff harvester for undelivered files
   - Agent self-check: "are all my outputs explicitly delivered?"

7. **Scope enforcement** (strict mode):
   - Config flag `FeatureSpec.RequireDeliverForFiles` (from 11-synthesis-design.md § 6)
   - Refuse to complete round if agent claims "I generated X" but never called deliver
   - Log metric to detect prompt gaps

## 8. How This Applies to Prism Specifically

**Today (Current State):**
- Prism edits existing LaTeX files in a user-owned project
- All edits go through the round/apply gate
- No generation of new files (except via citations → references.bib)
- Agent assumes persistent cwd (implied by "project files in cwd")

**Tomorrow (If Expanded):**
- If Prism gains the ability to auto-generate sections (e.g., "write an abstract based on the methods"), the delivery model breaks
- If Prism gains the ability to organize outputs (e.g., "create a cleaned references.bib with only cited papers"), the scope discipline becomes critical
- The current prompt would NOT signal that new files must be explicitly delivered

**Recommendation:** Start by injecting the web-delivery self-model even though Prism doesn't generate today. This future-proofs the agent and aligns Prism with claw/smart-search architecture. When Prism does expand, the agent is already thinking in terms of "I serve a web user; deliveries are explicit."

---

## Sources Consulted

- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/edit.go:140–152` (agentNativeProtocol)
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/spec.go:40, 104–116` (prismDisallowedTools, BuildSpec)
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentbridge/ws.go:410–590` (injectSystemPrompt, permissionAllowed, pathWithin, decidePermission)
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prompts/claw.go:49–74` (ClawSystemPrompt web-delivery framing)
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/cite.go:20–94` (RAG grounding via SearchCite, ApplyCite)
- `/Users/youngp/mypro/fuck_副本/scholar/agent/data/claude/prism-skills/{latex-format,academic-writing,discipline-conventions}/SKILL.md` (three writing skills)
- `/Users/youngp/mypro/fuck_副本/scholar/docs/research/agent-web-delivery/03-internal-prism-precedent.md` (round lifecycle, ephemeral workspace contract)
- `/Users/youngp/mypro/fuck_副本/scholar/docs/research/agent-web-delivery/11-synthesis-design.md` (web-delivery self-model, deliver_artifact tool, fallback harvesting)

## Key Patterns

### agentNativeProtocol (edit.go:140–152)
The system prompt injected once per Prism session. Tells agent it's a LaTeX editor with project files in cwd. Omits any mention of (a) remote web user, (b) ephemeral cwd, (c) file delivery protocol. Includes 3 optional writing skills to load via Skill tool.

- **Agent awareness:** via buildInjectionPrefix() wrapping in brackets + atomic.CompareAndSwap to inject once per WS connection (ws.go:417–449)
- **Source:** backend/internal/prism/edit.go:140–152

### prismDisallowedTools = [Bash, NotebookEdit, Task, Agent]
Four tools explicitly forbidden from Prism sessions. Bash blocks data generation/plots/shell; Task/Agent prevent policy bypass via subagent; NotebookEdit blocks code execution vectors. Enforced at agent session creation time + as backend denial in permissionAllowed (second-layer defense).

- **Agent awareness:** agent session created with --disallowed-tools=Bash,NotebookEdit,Task,Agent; backend also denies in permission_request if tool name matches (ws.go:515–521)
- **Source:** backend/internal/prism/spec.go:40

### pathWithin(p, sessionWorkDir) fence in decidePermission
File tool calls (Read/Write/Edit/MultiEdit/Glob/Grep/LS) only approved if path falls within session's isolated cwd. Relative paths safe by default; absolute paths cleaned + prefix-matched. Cross-session reads blocked. MCP/Web tools bypass this check (always allowed).

- **Agent awareness:** via permission_request/permission_response protocol: agent tries tool → backend checks path → responds with allowed=true/false. Agent sees denial and must retry or give up.
- **Source:** backend/internal/agentbridge/ws.go:576–590

### Three writing skills loaded via --add-dir /prism-add
prism-latex-format, prism-academic-writing, prism-discipline-conventions. Each a SKILL.md specifying when to invoke (user can't call; agent auto-loads via Skill tool). Contain formatting rules, writing conventions, discipline standards. No anti-patterns or negative examples; no cross-file validation rules.

- **Agent awareness:** prompt tells agent 'you have a group of writing guide skills; load them when you encounter [these scenarios]'. Agent invokes via Skill() tool, which fetches skill from --add-dir and executes inline.
- **Source:** backend/internal/prism/edit.go:147–150; agent/data/claude/prism-skills/*

### Claw's ./out/ delivery convention vs. Prism's implicit apply
Claw: agent writes to ./out/; backend auto-harvests as downloadable artifacts. Prism: agent edits in cwd; user approves via round/apply; all edits auto-persist. No explicit delivery signal. No scope protection (agent can edit as much as it wants; user must visually approve diff).

- **Agent awareness:** Claw: prompt says 'save deliverables to ./out/'. Prism: prompt says 'use Edit/Write to modify files'; no mention of ./out/ or delivery.
- **Source:** backend/internal/prompts/claw.go:58–74 vs. backend/internal/prism/edit.go:144

### No web-user self-model in agentNativeProtocol
Agent never told 'you serve a remote web user; your cwd is ephemeral scratch; nothing on disk reaches the user unless explicitly delivered'. Contrast: Claw explicitly says this (claw.go:58–61). Prism's model is implicit-local (acts like a local editor). Impacts: agent can't signal delivery intent; no rubric for scope; no fallback harvesting.

- **Agent awareness:** by absence from the prompt. Agent infers from context clues ('Edit/Write tools', 'user WS connection') but is never *told* the architectural contract.
- **Source:** backend/internal/prism/edit.go:140–152 (what's NOT there)

### Citation RAG via SearchCite + ApplyCite (not bidirectional validation)
Agent can search user's library via SearchCite, then write matching BibTeX to references.bib via ApplyCite. But no reverse: agent doesn't validate that all \cite{key} calls in the project's .tex files actually exist in references.bib. Cross-file consistency is not managed.

- **Agent awareness:** implicit: agent knows it can edit references.bib; backend tracks which citations exist. But agent has no tool to 'validate all citations', no skill that says 'after editing, check for undefined \cite'.
- **Source:** backend/internal/prism/cite.go:20–94

### Scope discipline rule 'only modify files necessary for the instruction' is stated but not rubric'd
Prompt says '只修改完成本指令所必需的文件与内容' but doesn't define what counts as 'necessary'. No diff budget, no file count limit, no self-check questions like 'did I over-edit?' Constrasts w/ claw's 'keep structure/cite positions' which is explicit.

- **Agent awareness:** by reading the rule, then inferring from user intent. No rubric to guide the inference. No validation tool to check scope post-edit.
- **Source:** backend/internal/prism/edit.go:152

### Skill integration lacks anti-patterns, failure modes, validation checks
Skills teach 'what good looks like' but not 'common pitfalls' or 'self-check after editing'. prism-latex-format doesn't list 'undefined \ref as a danger'; prism-academic-writing doesn't warn 'avoid these filler phrases'; prism-discipline-conventions doesn't specify 'run these checks for your venue'.

- **Agent awareness:** by trial-and-error: agent edits, gets compilation error, learns. No pre-armed anti-patterns.
- **Source:** agent/data/claude/prism-skills/ (all three skills lack anti-pattern sections)

### AutoApprovePermission=true + round/apply gates combine to auto-persist all cwd edits after user review
Agent's write operations are auto-approved within cwd boundary. User reviews diff via UI. User clicks 'apply' → all changed files persist to DB in one transaction. No per-file gates; no 'exclude this file' option. If agent writes files that should NOT persist, they can't be filtered out.

- **Agent awareness:** agent sees permission_response {allowed:true} for all in-cwd writes. Implicitly learns 'anything I write in cwd will persist if user clicks apply'.
- **Source:** backend/internal/prism/spec.go:107; backend/internal/prism/ws_round.go:130–135


## Relevance to Prism

The investigation reveals that Prism's agent self-model and tool policy are well-designed for **editing existing LaTeX files**, but they are missing the architectural self-understanding that Claw has acquired: "you serve a remote web user; your disk is ephemeral scratch; deliveries are explicit." This gap doesn't matter TODAY because Prism only edits (doesn't generate), and the round/apply gate implicitly signals that changes reach the user. But it becomes critical if Prism expands (e.g., to auto-generate sections, clean data, or produce summary artifacts). The recommendations are: (1) inject a Layer-3 web-delivery self-model (shared across all agentbridge features) to align Prism with claw; (2) sharpen the skills format to include anti-patterns and validation checks; (3) document cross-file awareness expectations; (4) if generation ever comes, implement the deliver_artifact tool + fallback harvester from the web-delivery design. These changes keep Prism's tool policy intact while future-proofing its self-model and adding the missing scope discipline, validation, and delivery signaling that Claw demonstrates.

## Improvement Ideas

- Inject web-delivery self-model into buildInjectionPrefix() for ALL agentbridge features (not just claw). Move the Claw preamble ('you serve a remote user over web chat; cwd is ephemeral; nothing on disk reaches user by itself') to Layer 3 (shared). This aligns all agents with the same architectural understanding in ~30 seconds of code change.
- Expand skill YAML format to include 'anti_patterns' and 'validation_checks' sections. For prism-latex-format: list 'undefined \ref' as a danger; give grep command to detect. For prism-academic-writing: list 'avoid these filler phrases'; give regex. This pre-arms the agent rather than forcing trial-and-error.
- Create a prism-validation skill that runs post-edit: checks for undefined \ref, undefined \cite, unreferenced \label, missing \include targets. Teach agent to invoke this after substantive edits. Reduces scope/consistency drift.
- Add a scope rubric to agentNativeProtocol: 'Specific instruction (fix typos in §3) → edit only that section. Broad instruction (polish paper) → full-text scan, but keep changes ≤30%. Self-check: is my diff size reasonable?' This operationalizes the 'only necessary files' constraint.
- Document cross-file awareness expectations: when editing intro, re-read related work section (3–5 min) to check for inconsistent positioning. When editing methods, check for undefined symbols in math. This is implicit in 'understand context' but should be explicit.
- If Prism ever gains generation (auto-write abstract, clean bibliography, generate table of contents), immediately implement: (a) deliver_artifact() tool with explicit semantic (b) fallback disk-diff harvester for undelivered files (c) metric delivery.fallback_harvest to detect if agent forgets to deliver. Don't wait; bake the architecture now.
- Add a 'validate project' backend endpoint (or Prism skill) that does cross-file consistency checks: grep \ref vs \label, check .bib keys, verify \cite{key} exists, detect unreferenced sections. Call this post-apply as a UX signal: 'Consistency check: OK / 3 issues found'.
- Decouple cite RAG from agent: today SearchCite/ApplyCite are direct methods on the Service. Consider moving them to a Skill (prism-citation-rag) so agent explicitly decides when to cite. This teaches the agent 'citations are not automatic; I must search and confirm'.

## Sources

- backend/internal/prism/edit.go:140–152
- backend/internal/prism/spec.go:40, 104–116
- backend/internal/agentbridge/ws.go:410–590
- backend/internal/prompts/claw.go:49–74
- backend/internal/prism/cite.go
- agent/data/claude/prism-skills/prism-latex-format/SKILL.md
- agent/data/claude/prism-skills/prism-academic-writing/SKILL.md
- agent/data/claude/prism-skills/prism-discipline-conventions/SKILL.md
- docs/research/agent-web-delivery/03-internal-prism-precedent.md
- docs/research/agent-web-delivery/11-synthesis-design.md
