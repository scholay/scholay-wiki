# Prism's Core Delivery Model: Ephemeral Workspace Lifecycle & Multi-File Atomicity

> **Category:** internal

## Summary

Prism's architecture enforces a strict ephemeral workspace contract where the PostgreSQL database is the single source of truth, and the agent operates in an isolated, sessionized working directory (cwd) that never persists directly. The system implements a four-phase round-trip lifecycle (prepare → agent edits → collect changes → apply/reject) with real-time diff streaming and atomic batch persistence. The backend reads changes back from the agent's cwd using ReadWorkspaceFileFull, compares SHA256 hashes against DB state, and commits all changes in a single transaction via BatchAppendCurrentVersions, forming a version chain via BaseVersionID. Key gaps include lack of support for agent-created new files, no partial-accept per-hunk, fragile multi-file consistency under failure, and no explicit agent-native understanding of its ephemeral nature.

---

# Prism's Core Delivery Model: Ephemeral Workspace Lifecycle & Multi-File Atomicity

## Executive Overview

Prism demonstrates Scholar's most mature "agent produces content for remote user" delivery pattern at production scale. The core insight is the **ephemeral workspace contract**: the database is the single source of truth; the agent operates in an isolated, sessionized cwd that is never directly persisted; the backend orchestrates a strict lifecycle that materializes current state, lets the agent edit, reads changes back, and applies them atomically to the database. This decouples agent execution from data safety and enables user-facing approval gates.

The implementation is **multi-file aware**: all changed files within a single round are persisted in one database transaction (all-or-nothing semantics via `BatchAppendCurrentVersions`), and each FileVersion records its predecessor via `BaseVersionID` to form a version chain. However, critical gaps exist: the agent cannot create new files, no per-hunk acceptance, and no agent-native prompt telling the agent it operates in ephemeral scratch.

---

## 1. Full Round Lifecycle: Prepare → Agent Edits → Pending → Apply/Reject

### Phase 1: Prepare (DB Current → Session CWD)

**Endpoint & Flow:**
- `POST /user/prism/projects/:id/round/prepare` → `Service.PrepareRound(ctx, userID, projectID)` → `materializeProject(ctx, projectID, sessionID)`
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go:55-70`
- **Implementation:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/workspace.go:25-42`

**Execution:**
```go
func (s *Service) materializeProject(ctx context.Context, projectID uint, sessionID string) error {
    files, _, err := s.gatherCurrent(projectID) // map[relPath]body, text files only
    if err != nil {
        return err
    }
    g, gctx := errgroup.WithContext(ctx)
    g.SetLimit(wsConcurrency)  // wsConcurrency = 8 (bounded parallelism)
    for relPath, body := range files {
        relPath, body := relPath, body
        g.Go(func() error {
            return s.agent.PutWorkspaceFile(gctx, sessionID, relPath, []byte(body))
        })
    }
    return g.Wait()
}
```

**Key Details:**
- `gatherCurrent(projectID)` fetches all DB-known text files by batch-loading `FileVersion` records (no N×single-query penalty)
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/service.go:200-244`
  - Filters by `FileKind != KindAsset` (binary assets deferred, text only in MVP)
  - Returns `map[relPath]string` (relPath → current body) + content hash (for compile caching)
- **Bounded concurrency:** 8 parallel `PutWorkspaceFile` calls via `errgroup.WithLimit(8)`
  - Reduces first-byte latency vs. serial; avoids overwhelming agent container
- **Idempotent:** Full overwrite—cwd is always a perfect mirror of DB current state
- **No locking:** Agent session is per-project (isolated); concurrent /prepare calls within same project simply re-materialize (idempotent)

---

### Phase 2: Agent Edits in CWD (via Native Tools)

**Agent operates without direct DB interaction.** Files are modified via native Claude tools:
- **Allowed:** `Read`, `Glob`, `Grep`, `Write`, `Edit`, `MultiEdit` (+ MCP skills)
- **Disallowed:** `Bash`, `Task`, `Agent`, `NotebookEdit` (no side effects, no shell execution)
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/spec.go:37-40`

**Agent-Native Protocol (System Prompt):**
The entire agent instruction is injected once at session creation as a strict-rules prefix:
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/edit.go:140-152`

The prompt tells the agent "all project files are in your cwd" and to "use Edit/Write to directly modify files," but **does NOT explicitly say the cwd is ephemeral or that the agent's edits won't persist directly**. This is a critical gap: the agent lacks a correct self-model that it serves a remote user over the web and that nothing on disk reaches the user unless explicitly delivered.

---

### Phase 3: Pending Collection (轮末读回 CWD → Diff)

**Endpoint:**
- `GET /user/prism/projects/:id/round/pending` → `Service.PendingRound(ctx, userID, projectID)`
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go:72-88`

**Implementation:**
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/workspace.go:54-115`

The backend reads cwd files via `ReadWorkspaceFileFull` and compares SHA256 hashes:
1. Batch-load all DB-known files' current versions
2. Bounded concurrent read (8 parallel) from cwd for each file
3. SHA256 comparison: only files whose hash differs from DB are marked changed
4. Capture `baseVer = currentVersionID` for version chain
5. Return changed files with old/new bodies

**Key Details:**
- **ReadWorkspaceFileFull:** The critical read-back function with `?full=1` to bypass 1MB truncation
- **No truncation safety issue:** Large TeX files are fully retrieved
- **Multi-file handling:** Calls bounded by 8-parallelism
- **Real-time diff during agent execution:** Frontend refetches files after each `tool_result` (debounced 250ms) to update CodeMirror merge view

---

### Phase 4: Pending (User Review via Web UI)

**Frontend displays:**
- CodeMirror merge view (red deletions, green additions, word-level granularity)
- User decides: apply or reject

---

### Phase 5: Apply (固化 CWD → DB)

**Endpoint:**
- `POST /user/prism/projects/:id/round/apply` → `Service.ApplyRound(ctx, userID, projectID, instruction)`
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go:90-111`

**Atomicity Mechanism:**
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/repository.go:269-299`

```go
func (r *Repository) BatchAppendCurrentVersions(items []VersionWrite, author string) ([]FileVersion, error) {
    out := make([]FileVersion, 0, len(items))
    err := r.db.Transaction(func(tx *gorm.DB) error {
        for _, it := range items {
            // Supersede old current → insert new version → update file pointer
            // All in one transaction: either all succeed or all roll back
        }
        return nil
    })
    return out, err
}
```

**Key Details:**
- **Single transaction:** All files either commit together or all roll back—no partial applies
- **Version chain:** Each new FileVersion records `BaseVersionID = previous current version id`
- **Author = "agent":** All applies from agent round marked as "agent"
- **Status flow:** Previous "current" → "superseded"; new version → "current"
- **File metadata update:** `current_version_id`, `content_sha256`, `size` all atomic
- **Auto-naming:** Runs in background (best-effort) with timeout; failure is silently swallowed

---

### Phase 6: Reject (还原 CWD)

**Endpoint:**
- `POST /user/prism/projects/:id/round/reject` → `Service.RejectRound(ctx, userID, projectID)`
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go:113-128`

**Effect:** Re-materializes the cwd with current DB state, discarding all agent edits from this round. Idempotent (full overwrite).

---

## 2. Database as Source of Truth: Read-Back Enforcement

### Architecture D1: Locked Design

Database is the exclusive single source of truth; agent CWD is ephemeral mirror.

**ReadWorkspaceFileFull: The Critical Read-Back**

Called during pending collection (`collectWorkspaceChanges()`) and real-time diff:
- `s.agent.ReadWorkspaceFileFull(ctx, sessionID, relPath)` with `?full=1` parameter
- **File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/workspace.go:90`

Large TeX files are fully retrieved; no truncation safety issue documented.

---

## 3. Version History: FileVersion + BaseVersionID + User Review

### FileVersion Model

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/model.go:90-101`

```go
type FileVersion struct {
    ID            uint      // Primary key
    FileID        uint      // Which file
    VersionNo     int       // Monotonic version counter (per file)
    Body          string    // Full text content
    ContentSHA256 string    // Hash for change detection
    Author        string    // "user", "agent"
    Status        string    // "current", "superseded"
    BaseVersionID *uint     // Pointer to previous current version (forms chain)
    CreatedAt     time.Time
}
```

### Version Chain via BaseVersionID

When a new version is created (apply phase):
1. Previous "current" version is marked "superseded"
2. New version is inserted with `BaseVersionID = old current version id`
3. File's `current_version_id` pointer is updated to the new version

### No Per-Hunk Accept

**The entire round is atomic:** accept all changed files or reject all. No "accept this hunk, reject that hunk" granularity.

### Restore-to-Point

Users can restore any historical version, which appends it as a new "current" version (preserving audit trail).

---

## 4. Gaps & Critical Shortcomings (Delivery Lens)

### Gap 1: Agent-Created NEW Files (Files Not in DB)

**Current behavior:**
- MVP only tracks DB-known files
- If agent calls `Write("new_report.md", ...)` to a file not in prism_files, that file lives in cwd but is **never collected or applied to DB**
- When reject happens, new files are discarded

**Impact:** Multi-file deliverables cannot be completed if agent creates files.

### Gap 2: No Per-Hunk Partial Accept

Full round is atomic: apply all changed files or reject all. No "accept this edit to main.tex, reject this edit to references.bib" granularity.

### Gap 3: Failure & Rollback Robustness

**Not fully documented:**
- What happens if `readWorkspaceFileFull` fails mid-collect?
- What if `BatchAppendCurrentVersions` fails partway (should be impossible due to single transaction, but confirm)?
- If DB state changed between prepare and apply (concurrent user edit), is stale-base detected?

### Gap 4: Agent Lacks Self-Model (Ephemeral Awareness)

**Critical gap:** The agent is **not told** it serves a remote user over the web and that its cwd is ephemeral scratch.

Current prompt tells agent to edit files in cwd, but does **NOT** tell agent:
- "the user is remote, accessing this over a web UI"
- "your cwd is private scratch that is wiped after the session ends"
- "nothing on your disk reaches the user unless you deliver it"

**Impact:** Agent has no explicit "deliver this to the user" affordance. For claw (code + docs deliverables), this is a blocker.

---

## 5. Endpoints Summary

| Endpoint | Phase | Purpose |
|---|---|---|
| `/user/prism/projects/:id/round/prepare` | 1 | Materialize DB → cwd |
| `/user/prism/projects/:id/round/pending` | 3 | Collect changes, return diff |
| `/user/prism/projects/:id/round/apply` | 5 | Batch persist cwd → DB |
| `/user/prism/projects/:id/round/reject` | 6 | Discard changes |
| `/user/prism/projects/:id/workspace/file` | 2,3 | Real-time refetch for diff |

---

## 6. Relevance to Claw (Agent-Native Delivery Lens)

Prism is Scholar's reference implementation. For claw (one-shot deliverables), adopt:

1. **Core ephemeral workspace pattern:** Create temp session + cwd per claw run. Materialize input files, let agent edit, read back and persist. Drop version history and user gates.

2. **Bounded I/O concurrency:** Same 8-parallel pattern for material & collect.

3. **Atomic batch persistence:** All deliverable files write in single transaction.

4. **Session binding:** Attach per-claw-run session via agentbridge; reuse Prism's lock+claim pattern.

5. **Quota + usage tracking:** Reuse spec.go hooks; wire into same VIP quota and LLM token ledger.

6. **Real-time progress:** Option to stream tool events during claw run.

**Critical gap Prism surfaces:** The agent lacks self-model (ephemeral awareness) and explicit delivery affordance. For claw, this is a blocker. **Fix:** Inject Layer-3 self-model prefix telling all agentbridge features they serve remote web users with ephemeral cwd. Add `deliver_artifact` tool (description teaches the negative fact: "files on disk are invisible until you deliver"). Fallback disk-harvest as safety net (secondary, not auto-push).


## Key Patterns

### Ephemeral Workspace Contract: DB as Single Source of Truth
The database (PostgreSQL) is the exclusive source of truth; the agent operates in an isolated, sessionized cwd that is never directly persisted. Prepare phase materializes current DB state to cwd; pending phase reads cwd back and diffs against DB; apply phase atomically persists changes to DB; reject phase re-materializes to discard edits.

- **Agent awareness:** Agent is not explicitly told it's ephemeral—prompt only says 'all files are in cwd' and to 'use Edit/Write'. Agent learns boundary empirically via tool permission checks (pathWithin). **Critical gap:** no explicit self-model that agent serves remote user.
- **Source:** workspace.go:1-10, spec.go:1-13, edit.go:140-152, ws_round.go:61-164

### Four-Phase Round Lifecycle with User Approval Gate
Phase 1 (Prepare): materialize DB→cwd via PutWorkspaceFile (8-parallel). Phase 2: agent modifies cwd via Read/Write/Edit tools. Phase 3 (Pending): collect changes via ReadWorkspaceFileFull, SHA256 comparison, return diff. Phase 4 (User): CodeMirror merge view, user decides apply or reject. Phase 5 (Apply): atomic batch write to DB via BatchAppendCurrentVersions. Phase 6 (Reject): re-materialize to discard.

- **Agent awareness:** Agent is unaware of round structure; it just edits files. Backend enforces via HTTP endpoints (/prepare, /pending, /apply, /reject) and frontend state machine that gates next round.
- **Source:** handler_ws.go:55-128, ws_round.go:61-164, workspace.go:54-115

### ReadWorkspaceFileFull: Critical Read-Back with SHA256 Change Detection
During pending collection, each DB-known file is read from cwd via agent.ReadWorkspaceFileFull (with ?full=1 to bypass 1MB truncation). SHA256 hash is compared against File.ContentSHA256 (from DB). Only files with differing SHA are marked as changed. Unreadable or non-text files are silently skipped.

- **Agent awareness:** N/A; agent doesn't know it's being read back. But read-back happens real-time during execution (frontend refetches after tool_result, debounced 250ms) to drive CodeMirror diff updates.
- **Source:** workspace.go:89-102, ws_round.go:210-232

### Atomic Batch Multi-File Persistence in Single Transaction
All changed files are persisted in one GORM transaction via BatchAppendCurrentVersions. For each file: supersede old current version → insert new version (with BaseVersionID pointing to previous) → update file's current_version_id pointer. If any step fails, entire transaction rolls back. No partial commits.

- **Agent awareness:** N/A; agent doesn't interact with DB.
- **Source:** repository.go:269-299, ws_round.go:130-135

### Version Chain via BaseVersionID: Diff Base & History
Each FileVersion records BaseVersionID = previous current version's id. This forms a version chain: V1 (author=user) → V2 (author=agent, base=V1) → V3 (author=user, base=V2). Enables fine-grained diff (V3 vs V2), restore-to-point (append V2's body as new V3), and full audit trail.

- **Agent awareness:** N/A; agent doesn't see version history.
- **Source:** model.go:91-101, repository.go:228-254, history.go:25-44

### Bounded Concurrent I/O (errgroup.SetLimit(8))
Both materialize (PutWorkspaceFile) and collect (ReadWorkspaceFileFull) use errgroup with SetLimit(8). Reduces first-byte latency vs serial; avoids overwhelming agent container or backend memory. Each file operation is independent; any failure cancels remaining via context.

- **Agent awareness:** Agent doesn't know; it's internal backend optimization. All files appear in cwd simultaneously.
- **Source:** workspace.go:23, 33-34, 81-82

### Per-Project Agent Session Binding with Concurrent-Safe Claim
Each project owns one long-lived agent session (prism_projects.agent_session_id). Within-process concurrency serialized by per-project mutex (projectSessionMu). Cross-process races use atomic compare-and-swap (ClaimProjectSession). Dual-write to agent_sessions(owner_kind=project) for standard OwnsSession coverage.

- **Agent awareness:** Agent is unaware; session is managed by backend. Same session ID reused across multiple rounds within same project.
- **Source:** edit.go:24-96, repository.go:118-141

### Real-Time Diff Streaming with Optimistic Preview
During agent execution: tool_use_complete → frontend optimistically applies Edit/Write params locally (guess). tool_result → backend refetches cwd file (ReadWorkspaceFileFull, debounced 250ms), returns ground truth. Frontend CodeMirror merge view updates incrementally with actual changes.

- **Agent awareness:** Agent doesn't know; it's frontend visualization of its own tool effects. Optimistic preview may be wrong; refetch is authority.
- **Source:** hooks/usePrismChat.ts:182-210

### WebSocket Persistent Connection with Resume-on-Reconnect
Agent conversation runs over persistent WS (agentbridge.HandleWS). On client disconnect, reconnect replays agent's last message; backend re-fetches conversation history (GetWSMessages with pagination), frontend reloads messages. No message loss. If session is lost mid-round, agent sees 404; backend recreates session + replays message.

- **Agent awareness:** Agent is unaware; it's infrastructure. If session is lost, agent sees 404; new session created; previous cwd is gone but user can re-prepare.
- **Source:** handler_ws.go:49-53, ws_round.go:166-183, edit.go:100-114

### Quota Enforcement Before Execution (VIP)
Before each round, preUserMessageChain checks VIP quota (CheckAndConsume). If exceeded, returns clean quota_exceeded error. Usage is recorded (action='edit') per user per round. Token cost is logged post-execution to unified LLM ledger.

- **Agent awareness:** Agent is unaware. System prompt doesn't mention quota; it's enforced at API boundary.
- **Source:** spec.go:69-96


## Relevance to Prism

Prism is Scholar's reference implementation of "agent produces content that reaches a remote user over the web" at production scale, using an ephemeral workspace contract that decouples agent execution from data safety. For claw and other agent-native deliverables, we should adopt: (1) Core ephemeral workspace pattern: per-claw-run session + temp cwd, materialize inputs, agent edits, read back, auto-persist (no user gate for one-shots). (2) Bounded concurrent I/O: same 8-parallel pattern. (3) Atomic batch persistence: all deliverable files in one transaction. (4) Session binding: per-claw-run session via agentbridge. (5) Quota + usage: reuse spec.go hooks. (6) WebSocket infra: claw already uses agentbridge.HandleWS. (7) Real-time progress: stream tool events during run. **Critical gap Prism surfaces:** Agent lacks self-model (ephemeral awareness) and explicit delivery affordance. For claw, this is a blocker. **Fix:** Inject Layer-3 self-model prefix telling all agentbridge features they serve remote web users with ephemeral cwd. Add deliver_artifact tool whose description teaches the agent it must explicitly hand off files. Fallback disk-harvest as safety net (secondary, not auto-push).

## Improvement Ideas

- Support agent-created NEW files: Use agent readTree at round end to detect files written by agent that don't exist in prism_files. Decide: auto-persist to DB? require explicit deliver? treat as scratch? Blocker for multi-file deliverables (agent produces summary.md + data.csv in one round).
- Implement stale-base detection: Before apply, check if BaseVersionID is still current in DB (concurrent user edit scenario). Warn user or auto-merge if safe. Currently no detection of conflicting hand-edits.
- Add per-hunk accept/reject: Allow user to cherry-pick edits within files at pending review. Requires splitting into hunks; more complex UI but higher control for long agent runs.
- Inject agent self-model prefix (Layer 3): Tell all agentbridge features they serve remote web users with ephemeral cwd. This is the foundation for true agent-native delivery across platform. Currently prism doesn't surface gap because LaTeX documents are the deliverable; claw will expose it.
- Add deliver_artifact tool (secondary to self-model): Once agent knows cwd is ephemeral, give explicit affordance to hand off files. Tool description teaches negative fact: 'files on disk are invisible until you deliver'. Backend intercepts, validates path, harvests bytes, persists to MinIO, emits artifact frame. Fallback disk-harvest as safety net.
- Improve failure robustness: Document transaction boundary + client retry logic for apply. Add explicit rollback/compensation for partial failures (currently best-effort/silent). Clarify what happens if BatchAppendCurrentVersions fails partway.
- Support binary assets in round trips: Currently MVP skips KindAsset files. Extend materialize/collect to handle them (requires agent sandbox support + MIME type checks). Enables agent to create/modify images, PDFs within a round.
- Implement ErrStaleBase check: Model already has stale-base error type; implement actual check before apply: if BaseVersionID is not current anymore (user edited file between prepare and apply), warn user or attempt smart merge.
- Add delivery completion metrics: Log delivery.fallback_harvest (when disk-harvest catches files agent forgot to deliver), delivery.apply_count, delivery.reject_count. Use these to tune prompts and detect agent failure patterns early.

## Sources

- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/ws_round.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/workspace.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/service.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/handler_ws.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/repository.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/model.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/history.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/files.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/edit.go
- /Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/spec.go
- /Users/youngp/mypro/fuck_副本/scholar/docs/research/agent-web-delivery/03-internal-prism-precedent.md
- /Users/youngp/mypro/fuck_副本/scholar/docs/research/agent-web-delivery/11-synthesis-design.md
