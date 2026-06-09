# Prism: Agent-Native Content Delivery Architecture — Reusable Patterns for Web Delivery

> **Category:** internal

## Summary

Prism (Scholay's intelligent writing assistant) demonstrates the most mature "agent produces content that reaches a web user" pattern in Scholar. Its core insight is the ephemeral workspace contract: the database is the single source of truth; the agent operates in an isolated, sessionized working directory that never persists directly; the backend reads changes back and applies them atomically to the database. This decouples agent execution from data safety and enables user-facing diff/apply/reject gates. The system uses a round-trip lifecycle (prepare → cwd materialization → agent edits via native Read/Write/Edit → pending collection → user approve/reject → atomic batch apply to DB), supported by real-time diff streaming via CodeMirror merge view and WebSocket-based agent-native protocol messaging.

---

## I. Core Principle: Ephemeral Workspace + DB as Ground Truth

Prism's architecture is locked into a fundamental design (labeled "D1" in codebase):

**Database (PostgreSQL) is the exclusive single source of truth for all project files.**

Agent operations occur entirely within an isolated, ephemeral working directory (cwd) that lives in the agent session container—never persisted directly. The backend orchestrates a strict lifecycle:

```
prepare(DB current → cwd) → agent modifies cwd → collect changes → pending diff for user → apply(cwd → DB) OR reject(revert cwd)
```

This design appears in `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/spec.go:1-13`:

```
// AI 编辑走 **用户 WS**(HandleWS,同 claw/smart-search):前端持久连接,断线/重入自动续流。
// 每轮:前端先调 /round/prepare 铺源(DB current → 会话 cwd)→ 经 WS 发指令 → agent 用
// 原生 Read/Edit/Write 改 cwd(工具事件实时流式到前端驱动编辑器 diff)→ message_complete。
// 轮末**不自动落库**;前端看 diff 后 /round/apply(固化 cwd→DB)或 /round/reject(重铺源还原)。
```

## II. Full Round Lifecycle with File:Line References

### Phase 1: Prepare (铺源)

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go:55-70`

```typescript
// PrepareRound POST /user/prism/projects/:id/round/prepare
// Calls: Service.PrepareRound(ctx, userID, projectID)
```

**Implementation:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/ws_round.go:61-75`

```go
func (s *Service) PrepareRound(ctx context.Context, userID, projectID uint) error {
    // Validate project ownership
    // Ensure/create project agent session
    // Materialize all DB-current text files into agent cwd
    return s.materializeProject(ctx, projectID, sessionID)
}
```

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/workspace.go:25-42`

The actual materialization:
```go
func (s *Service) materializeProject(ctx context.Context, projectID uint, sessionID string) error {
    // Gather all current text file versions from DB
    files, _, err := s.gatherCurrent(projectID) // map[relPath]body
    // Bounded concurrent write into agent session cwd (8 concurrent)
    // Each file written to: /cwd/<relPath>
    // Idempotent: full overwrite, cwd is discardable mirror of DB
    return g.Wait() // via errgroup with limit 8
}
```

**Key:** Every file's current body is fetched from `FileVersion` (status=current) and written verbatim to the agent's workspace using `agent.PutWorkspaceFile()` API.

### Phase 2: Agent Edits in CWD

The agent operates in the cwd without any direct persistence. Files are edited via native Claude tools: Read, Write, Edit, MultiEdit. The backend routes these through `decidePermission` which restricts all writes to within the cwd (越界拒 = reject out-of-bounds paths).

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/spec.go:37-40`

Tool allowlist for Prism:
```go
var prismDisallowedTools = []string{"Bash", "NotebookEdit", "Task", "Agent"}
```

Allowed: Read, Glob, Grep, Write, Edit, MultiEdit (+ MCP tools for skills).

### Phase 3: Pending Collection (轮末读回)

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go:72-88`

```typescript
// PendingRound GET /user/prism/projects/:id/round/pending
// Returns: { files: [{ file_id, rel_path, old_body, new_body }] }
```

**Implementation:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/workspace.go:54-115`

```go
func (s *Service) collectWorkspaceChanges(ctx context.Context, projectID uint, sessionID string) ([]changedFile, error) {
    // 1. Fetch all DB-known text files
    // 2. Batch-load their current versions (避免 N×单查)
    // 3. Concurrent read from cwd for each file (up to 8 parallel)
    // 4. Compare SHA256(newBody) vs File.ContentSHA256
    // 5. Return only changed files: { fileID, relPath, oldBody, newBody, newSHA, baseVer }
}
```

The comparison is strict: only files whose content SHA256 differs from DB are marked as changed. Unreadable / non-text files are skipped (MVP constraint).

**Key Detail:** `baseVer = currentVersionID` is captured—this becomes the `BaseVersionID` pointer in the new FileVersion, forming the version graph.

### Phase 4: Pending (User Review)

**Frontend:** `/Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/prism/api/prism.ts:307-313`

```typescript
export async function fetchPendingRound(projectId: number): Promise<PrismPendingFile[]> {
  const { data } = await http.get<{ data: { files: PrismPendingFile[] } }>(
    `/user/prism/projects/${projectId}/round/pending`,
  );
  return data.data?.files ?? [];
}
```

The frontend displays a diff view using CodeMirror's merge mode (red deletions, green additions, word-level granularity).

**File:** `/Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/prism/components/LatexDiffEditor.tsx:50-77`

```typescript
unifiedMergeView({
    original: original,      // old_body from DB
    proposed: proposed,      // new_body from cwd
    mergeControls: false,    // hunk controls hidden; apply/reject at round level
    allowInlineDiffs: true   // word-level precision
})
```

Real-time diff is streamed during agent execution:
- `tool_use_complete` → optimistic preview (apply Edit/Write params locally)
- `tool_result` → refetch cwd file and update diff (debounced 250ms)

**File:** `/Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/prism/hooks/usePrismChat.ts:182-210`

### Phase 5: Apply (固化 cwd → DB)

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go:90-111`

```typescript
// ApplyRound POST /user/prism/projects/:id/round/apply
// Body: { instruction? }  ← user's clean instruction, for auto-naming
// Returns: { applied: number of files committed }
```

**Implementation:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/ws_round.go:109-148`

```go
func (s *Service) ApplyRound(ctx context.Context, userID, projectID uint, instruction string) (int, error) {
    // 1. Collect changes again (idempotent—may have new changes since pending check)
    // 2. Batch prepare VersionWrite records
    // 3. Single transaction: BatchAppendCurrentVersions
    //    - For each file: AppendCurrentVersion(fileID, newBody, newSHA, AuthorAgent, baseVersionID)
    // 4. Touch project (updated_at)
    // 5. Best-effort async auto-naming (background goroutine, if instruction provided)
    return len(changes), nil
}
```

**Atomicity:** All file versions are written in one DB transaction via `repository.go:BatchAppendCurrentVersions()`. Either all succeed or all roll back. No partial applies.

Each new FileVersion:
- `Author = "agent"`
- `Status = "current"`
- `BaseVersionID = <previous current version id>` (forms version chain)
- Previous current is marked `superseded`

### Phase 6: Reject (还原 cwd)

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go:113-128`

```typescript
// RejectRound POST /user/prism/projects/:id/round/reject
// Discards all pending changes in cwd
```

**Implementation:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/ws_round.go:150-164`

```go
func (s *Service) RejectRound(ctx context.Context, userID, projectID uint) error {
    // Re-materialize: overwrites cwd with current DB state (idempotent)
    return s.materializeProject(ctx, projectID, sessionID)
}
```

This re-runs **Phase 1**, effectively discarding all changes in the ephemeral cwd.

## III. Agent-Native Protocol: How Agent KNOWS Its Ephemeral Contract

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/edit.go:140-152`

The entire agent instruction is embedded as a single **system prompt**, injected once at session creation:

```
你是 Scholay 智能写作(Prism)的 LaTeX 编辑助手。用户在写一篇 LaTeX 论文,项目的所有文件就在你的当前工作目录里。

【工作方式】
- 先用 Read 读取你要修改的文件(以及为保持一致需要参考的其它文件),理解上下文。
- 用 Edit / Write 工具**直接修改**工作目录里的文件来完成指令。Edit 做定点最小替换,绝不重写整篇,不要改与指令无关的部分,不要动 \documentclass / 导言区(除非指令明确要求)。
- 改完后用 1-2 句中文简短说明你做了什么(给用户看,会显示在对话里)。

【约束】只修改完成本指令所必需的文件与内容。不要执行 shell 命令、不要尝试自己编译(编译由系统负责)。
```

**Key Phrase:** "项目的所有文件就在你的当前工作目录里" — tells the agent its cwd IS the project. "用 Edit / Write 工具直接修改工作目录里的文件" — agent is responsible for CHANGING FILES ITSELF, not delegating to compilation/external systems.

The protocol is **constraint-based**: the agent is told the rules, then trusted to follow them via tool use. There is no explicit "you are ephemeral, changes won't persist"—instead, the protocol frames editing as a direct responsibility and disallows side-effects (no Bash, no Task/Agent spawn, no self-compilation).

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/spec.go:104-109`

Spec configuration:
```go
return agentbridge.FeatureSpec{
    // ...
    Picker: agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, agentNativeProtocol),
    InjectPromptOnFirstMsg: true,  // ← System prompt injected exactly once on first user message
    AutoApprovePermission: true,   // ← All Read/Write path checks auto-approved if within cwd
    DisallowedTools: prismDisallowedTools,  // ← Bash/Task/Agent/NotebookEdit blocked upfront
}
```

## IV. Project-Specific vs. Generalizable Components

### Project-Specific (Prism Only, Not Reusable)

1. **LaTeX Compilation Pipeline** (`service.go:runCompile`)
   - File: `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/service.go:263-335`
   - Orchestrates TexClient.Compile(), auto-selects xelatex for CJK, caches PDF, uploads to MinIO
   - Entire block specific to LaTeX: cannot transfer to claw or other deliverables

2. **File Kind Filtering** (KindTex, KindBib, KindSty, KindCls, KindAsset)
   - MVP only handles text files; binary assets (KindAsset) skipped in cwd round-trip
   - Versioning tracks different file types but apply only processes text

3. **Writing Skill Integration** (`--add-dir` for prism-latex-format / prism-academic-writing / prism-discipline-conventions skills)
   - File: `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/spec.go:42-49`
   - Agent loads context-aware writing guidelines from skill directory
   - Specific to scholarly/academic domain

4. **Version Chaining via BaseVersionID**
   - FileVersion.BaseVersionID points to previous version for diff base
   - Enables fine-grained version history and restore-to-point
   - Tied to FileVersion model; useful for editing systems with versions

### Generalizable (Architectural Reuse)

1. **Ephemeral Workspace Contract**
   - Database as authoritative source ✓
   - Agent operates in sessionized, throwaway cwd ✓
   - Read-back + diff collection ✓
   - User-facing apply/reject gates ✓
   - Can be applied to: claw one-shot deliverables, code generation, document assembly, etc.

2. **Round Lifecycle Pattern**
   - prepare (materialize DB → cwd)
   - collect changes (cwd → diff for user)
   - apply (batch write to DB, atomic)
   - reject (re-materialize, discard)
   - **Reusable template** for any agent-as-deliverable system

3. **Bounded Concurrent I/O** (`wsConcurrency = 8`)
   - File: `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/workspace.go:23`
   - Parallel file operations with `errgroup.WithContext` and `SetLimit`
   - Reduces latency (first-byte delay) vs. serial; avoids overwhelming agent container
   - **Generic optimization**, not domain-specific

4. **Real-Time Diff Streaming**
   - tool_use_complete → optimistic preview (apply tool params locally)
   - tool_result → refetch and compare (ground truth from cwd)
   - Debounced to reduce network chattiness
   - **Frontend pattern reusable** for any read-back-heavy workflow

5. **Atomic Batch Apply in Single Transaction**
   - File: `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/repository.go:BatchAppendCurrentVersions()`
   - All-or-nothing semantics for multiple file changes
   - **Generic database pattern**, applicable whenever multi-resource consistency matters

6. **Ownership + Session Binding**
   - File: `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/edit.go:30-96`
   - Per-project agent session (not per-request), stored in `prism_projects.agent_session_id`
   - Project lock (`projectSessionMu`) to serialize concurrent setup within same process
   - Session ownership dual-written to `agent_sessions(owner_kind=project)` for standard ticket/access control
   - **Reusable session lifecycle** for any multi-turn per-entity agent system

7. **WebSocket + Resume-on-Reconnect**
   - File: `/Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/prism/api/socket.ts` (not fully read, but referenced)
   - Persistent connection via agentbridge.HandleWS (shared with claw/smart-search)
   - Automatic history reload + in-flight message recovery
   - **Shares agentbridge infrastructure** with claw

8. **Context Window Management**
   - File: `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go:173-199`
   - Real-time token estimate for user's footer display
   - Allows long conversations with pagination (recent N turns, load-earlier)
   - **Generic pattern** for managing context in long-lived sessions

## V. Lighter Version for Claw (One-Shot Deliverables)

### What to Keep

1. **Core Round Pattern** (prepare → collect → apply) but simplified:
   - prepare: create temp workspace, materialize input files
   - agent operates on temp cwd (Read/Write/Edit allowed within bounds)
   - collect: one-shot read-back after message_complete
   - apply: **no user gate** — automatically persist to destination on success

2. **Bounded Concurrent I/O** — use same wsConcurrency pattern

3. **Atomic Batch Write** — all deliverable files write in one transaction

4. **Ownership + Session Binding** — claw already uses agentbridge, can attach per-claw-run session

5. **WebSocket infrastructure** — claw already uses agentbridge.HandleWS

### What to Drop

1. **Version History** — claw deliverables don't need version chains; one final output suffices
   - Remove BaseVersionID tracking
   - Simplify to single "current" write per file, no superseding

2. **User Diff/Apply Gate** — automatic on success, no reject/abandon flow
   - Skip /round/pending, /round/apply, /round/reject endpoints
   - One-shot: message_complete → collect → write → done

3. **File Kind Discrimination** — handle any text/binary uniformly
   - Don't filter on KindAsset
   - Let agent create new files freely (store them in cwd, persist on round end)

4. **LaTeX Compilation** — remove TexClient, compile step, PDF upload
   - claw deliverables may be HTML / Markdown / code, not TeX

5. **Writing Skills Directory** — skill loading is optional
   - claw prompts can include guidelines inline; no prism-specific skill suite needed

6. **Project Auto-Naming** — not applicable; claw outputs are deliverables, not projects

### Simplified Schema for Claw

```sql
-- Minimal: one table to hold end-state deliverables
CREATE TABLE claw_deliverables (
  id BIGINT PRIMARY KEY,
  claw_run_id BIGINT NOT NULL,  -- which claw execution
  file_rel_path VARCHAR(512),    -- relative path in output
  file_kind VARCHAR(32),         -- "tex", "html", "md", "py", etc.
  content LONGTEXT,
  content_sha256 VARCHAR(64),
  size BIGINT,
  created_at TIMESTAMP
);

-- vs. Prism's three tables:
-- - prism_projects (parent entity)
-- - prism_files (file metadata + current_version_id)
-- - prism_file_versions (version chain with BaseVersionID)
```

**Backend for claw one-shot:**

```go
// Pseudo-code
func executeClawWithWorkspace(ctx, instruction, inputFiles) error {
    // 1. Create temp session
    // 2. Prepare: write input files to cwd
    // 3. Start agent on agentbridge.HandleWS
    // 4. Wait for message_complete
    // 5. collectChanges: read all modified files from cwd
    // 6. BatchInsertDeliverables(clawRunID, changes) in one txn
    // 7. Clean up temp session
    // return err
}
```

No pending/apply/reject gates. No version history. No compilation. Success = direct write; failure = nothing persists.

## VI. Real-World Differences: Prism's Maturity Features

### Concurrency & Safety

- **Per-project lock** (projectSessionMu): Serializes session creation within same process, preventing double-session leak.
- **Database-level claim** (ClaimProjectSession): Atomic compare-and-swap across processes; fallback handing for race conditions.
- **Session recreation**: Handles agent 404 / restart by detecting gone session and rebuilding (with lock held).
- **Garbage collection**: Orphaned sessions deleted best-effort.

All of these are **mature, production-grade** patterns that would be copied into claw's session lifecycle.

### Quota & Usage Tracking

- **VIP quota check** (preUserMessageChain): Before each round, check and consume feature quota; if exceeded, return clean quota_exceeded error.
- **Usage stat recording**: Track feature usage (action="edit") per user.
- **Token accounting** (onMessageComplete): Log token consumption to unified LLM token ledger for billing.

These are **billing-system integration**, reusable wherever agent execution is metered.

### Error Handling & Feedback

- **Compilation error extraction** (compile_error.go): Parse LaTeX log, extract line-numbered error blocks, provide friendly summary + technical excerpt for AI fix.
- **Stale base detection** (ErrStaleBase): Prevent apply if DB has changed since pending was collected.
- **Session gone detection** (isSessionGone): Distinguish 404 from transient errors, decide whether to retry or recreate.

These are **domain-specific**. Claw would need equivalent for its own deliverable types.

---

## Summary Table: Prism Architecture → Claw Reuse Mapping

| Component | File:Line | Prism Role | Claw Reuse |
|-----------|-----------|-----------|-----------|
| **Ephemeral Workspace** | workspace.go:25-115 | Agent edits in cwd, DB is truth | ✓ Core pattern |
| **Round Lifecycle** | ws_round.go:61-164 | prepare→apply→reject gates | ✓ Simplify to prepare→collect→write |
| **Bounded Concurrent I/O** | workspace.go:23 | 8-parallelism for files | ✓ Copy pattern |
| **Atomic Batch Write** | repository.go:BatchAppendCurrentVersions | Multi-file txn safety | ✓ Reuse |
| **Version Chaining** | model.go:FileVersion.BaseVersionID | Diff base, history | ✗ Drop for one-shot |
| **LaTeX Compilation** | service.go:runCompile | TeX→PDF pipeline | ✗ Domain-specific |
| **User Diff Gate** | handler_ws.go:72-111 | Pending review before apply | Partial: auto-apply instead |
| **Session Ownership** | edit.go:30-96 | Per-project session + dual-write | ✓ Per-run session variant |
| **WebSocket Resume** | agentbridge pattern | Disconnect/reconnect handling | ✓ Already in agentbridge |
| **Quota Check** | spec.go:69-88 | VIP enforcement before round | ✓ Reuse preMessageChain |
| **Usage Tracking** | spec.go:57-86 | Feature stat recording | ✓ Reuse pattern |
| **Token Accounting** | spec.go:90-96 | LLM cost ledger | ✓ Reuse onMessageComplete |



## Key Patterns

### Ephemeral Workspace Contract
Agent operates in a sessionized, isolated working directory (cwd) that is never directly persisted. The database is the exclusive single source of truth. Backend materializes current state into cwd before each round and reads changes back after agent completes. This decouples agent execution from persistence and enables user-facing approval gates.

- **How the agent is made aware:** System prompt (agentNativeProtocol, edit.go:140-152) tells agent 'all project files are in your current working directory' and to 'use Read/Edit/Write to directly modify files'. Tool permission boundary checks enforce cwd-only operations via decidePermission.
- **Source:** backend/internal/prism/spec.go:1-13, workspace.go:1-10, edit.go:140-152

### Round-Trip Lifecycle with User Gates
Structured four-phase flow: (1) Prepare—materialize DB current into agent cwd, (2) Collect—read cwd back, diff vs DB to find changes, (3) Pending—present diff to user for review, (4) Apply/Reject—either atomically persist all changes or re-materialize cwd to discard. No automatic apply; user must approve.

- **How the agent is made aware:** Agent is unaware of round structure; it just edits files. Backend enforces via HTTP endpoints (/round/prepare, /round/pending, /round/apply, /round/reject) and frontend state machine that gates the next round until user decides.
- **Source:** backend/internal/prism/handler_ws.go:55-128, ws_round.go:61-164

### Bounded Concurrent Materialization & Collection
File I/O to agent workspace (both write and read) uses errgroup with SetLimit(8) to parallelize without overwhelming agent container or backend. Reduces first-byte latency vs serial; maintains resource bounds.

- **How the agent is made aware:** Agent doesn't know; it's internal backend optimization. All its files appear in cwd simultaneously (from prepare) or are refetched on tool_result (by refetch debounced 250ms).
- **Source:** backend/internal/prism/workspace.go:23, materializeProject:34, collectWorkspaceChanges:82

### Atomic Batch Apply in Single Transaction
All changed files are persisted in one database transaction. For each file: append new FileVersion (author=agent, status=current, BaseVersionID=previous), mark previous version superseded. Prevents partial writes and ensures version chain consistency.

- **How the agent is made aware:** Not applicable; agent doesn't interact with DB.
- **Source:** backend/internal/prism/ws_round.go:130-135, repository.go:BatchAppendCurrentVersions (not shown but referenced)

### Per-Entity Agent Session Binding with Concurrent-Safe Claim
Each project owns a single long-lived agent session (prism_projects.agent_session_id). Concurrent requests serialize via per-project mutex; cross-process races use database-level atomic compare-and-swap (ClaimProjectSession). Orphaned sessions are garbage-collected.

- **How the agent is made aware:** Agent is unaware; session is managed by backend. Same session ID is reused across multiple rounds within same project.
- **Source:** backend/internal/prism/edit.go:25-96, repository.go:107-140

### Real-Time Diff Streaming with Optimistic Preview
During agent execution, tool events are streamed to frontend: tool_use_complete triggers local optimistic preview (apply Edit/Write params to current file state), tool_result triggers cwd refetch (debounced 250ms) to sync ground truth. Frontend CodeMirror merge view updates incrementally.

- **How the agent is made aware:** Agent is unaware; it's frontend visualization of its own tool effects. Optimistic preview is 'guess' (may be wrong); refetch is authority.
- **Source:** frontend-user/src/features/prism/hooks/usePrismChat.ts:188-209, api/prism.ts:330-337

### WebSocket Persistent Connection with Resume-on-Reconnect
Agent conversation runs over persistent WS (agentbridge.HandleWS). On disconnect, client reconnects; in-flight round is resumed: backend replays agent's last user message, frontend reloads history, any pending changes are re-collected. No message loss.

- **How the agent is made aware:** Agent is unaware; it's infrastructure. If session is lost, agent sees a 404 and a new session is created; previous work in cwd is gone but user can re-prepare and retry.
- **Source:** backend/internal/prism/handler_ws.go:49-53, frontend hooks/usePrismChat.ts:298-307

### Quota Enforcement Before Execution
Before each round, preUserMessageChain checks VIP quota (CheckAndConsume). If exceeded, returns clean quota_exceeded error. Usage is recorded (action='edit') per user. Token cost is logged post-execution to unified LLM ledger.

- **How the agent is made aware:** Agent is unaware. System prompt (spec.go) doesn't mention quota; it's enforced at API boundary.
- **Source:** backend/internal/prism/spec.go:69-96

### Domain-Specific Skill Integration via --add-dir
Agent session is launched with --add-dir pointing to directory with .claude/skills/ containing prism-latex-format, prism-academic-writing, prism-discipline-conventions skills. Agent can Skill-load these when editing relevant content.

- **How the agent is made aware:** System prompt (edit.go:147-150) tells agent about available skills and when to load them: LaTeX/citations/figures → prism-latex-format; prose editing → prism-academic-writing; discipline-specific → prism-discipline-conventions.
- **Source:** backend/internal/prism/spec.go:42-49, edit.go:147-150

### Version Chain with Diff Base (BaseVersionID)
Each FileVersion records the previous current version's ID (BaseVersionID). Enables fine-grained diff view (current vs any prior version), version restore-to-point, and full audit trail. Superseded versions are marked status=superseded.

- **How the agent is made aware:** Not applicable; agent doesn't see version history.
- **Source:** backend/internal/prism/model.go:91-101, repository.go:228-249

### Lazy Project Auto-Naming (Best-Effort Background)
After first successful apply, if title is still defaultProjectTitle ('未命名项目'), use instruction + lightweight LLM to generate a name. Runs in background (safego.Go) after apply returns; failure is silently swallowed (best-effort, no blocking).

- **How the agent is made aware:** Agent is unaware. Instruction is passed to ApplyRound by frontend (frontend stores lastInstruction for this purpose).
- **Source:** backend/internal/prism/ws_round.go:140-146


## Relevance to Claw (web-delivery design)


Prism is Scholar's reference implementation of "agent produces content that reaches user" at production scale. For claw (one-shot deliverables), we should adopt:

1. **Core Ephemeral Workspace Pattern**: Create temporary session + cwd per claw run. Materialize input files, let agent Read/Write/Edit them, then read back and persist. Drop the version history and user gates.

2. **Bounded I/O Concurrency**: Use same errgroup+SetLimit(8) pattern for materializing inputs and collecting outputs. Proven to reduce latency without resource bloat.

3. **Atomic Batch Persistence**: All deliverable files write in single DB transaction. If agent produces multiple files (code, docs, etc.), they arrive together or not at all.

4. **Session Binding**: Attach per-claw-run agent session (via agentbridge), stored in claw_runs table. Reuse Prism's lock+claim pattern for concurrent-safe session creation.

5. **Quota + Usage Tracking**: Reuse spec.go's preUserMessageChain and onMessageComplete hooks. Hook claw feature into same VIP quota system and LLM token ledger.

6. **WebSocket Infrastructure**: Claw already uses agentbridge.HandleWS. Inherit Prism's reconnect-resume logic.

7. **Real-Time Progress**: Option to stream tool events to frontend during claw run (same tool_result refetch pattern). Shows user what agent is doing in real-time.

**What NOT to copy**:
- Version history, version chaining, restore-to-point (one-shot: final output only).
- User diff/apply gate (auto-persist on message_complete success).
- LaTeX-specific logic (compilation, CJK detection, TeX skill suite).
- File kind discrimination (accept any file type agent creates).

The pattern is **immediately portable**; Prism proves the ephemeral workspace contract works at scale, handles concurrency safely, and integrates cleanly with agentbridge. Claw just needs to simplify the user interaction model (no gates) and the persistence model (one write per run, not version history).


## Sources Consulted

- backend/internal/prism/spec.go
- backend/internal/prism/edit.go
- backend/internal/prism/model.go
- backend/internal/prism/handler.go
- backend/internal/prism/handler_ws.go
- backend/internal/prism/workspace.go
- backend/internal/prism/service.go
- backend/internal/prism/ws_round.go
- backend/internal/prism/repository.go
- frontend-user/src/features/prism/api/prism.ts
- frontend-user/src/features/prism/hooks/usePrismChat.ts
- frontend-user/src/features/prism/components/PrismChatPanel.tsx
- frontend-user/src/features/prism/components/LatexDiffEditor.tsx
