# Prism Frontend UX: Agent Proposal Delivery & Acceptance Surfaces

> **Category:** internal

## Summary

Prism demonstrates mature agent-native delivery via two surfaces: (1) chat-driven round-trip with CodeMirror diff review gate, user approves via /round/apply; (2) inline-edit (Cmd+K) with quick-action chips, funnels to same round model. Backend materializes ephemeral cwd, agent edits via Read/Write/Edit, frontend collects post-completion and gates persistence. Key gaps: per-hunk accept/reject disabled (round-level only), optimistic preview may lag, multi-file edits bundled without per-file drill-down.

---

# Prism Frontend UX: Agent Proposal Delivery & Acceptance

## 1. Two Delivery Surfaces

### Chat-Driven Round (Default)
**File:** `PrismWorkspace.tsx:74-309`

Three-pane layout: editor/diff (top-left 58%), chat (bottom-left 42%), PDF/error/history (right 38%).

**State machine:**
1. **Idle:** User enters instruction → `runEdit(instruction, selection?)`
2. **Prepare:** POST `/round/prepare` materializes DB into agent cwd
3. **Streaming:** Real-time socket.messages:
   - `tool_use_complete` → optimistic preview (apply Edit/Write params locally)
   - `tool_result` → debounced 250ms refetch from cwd (ground truth)
   - `message_complete` → fetch `/round/pending`
4. **Awaiting_apply:** Read-only CodeMirror diff + ChangesetCard
5. **Apply/Reject:** POST `/round/apply` (atomic write) or `/round/reject` (re-materialize)

### Inline-Edit Fast Path (Cmd+K)
1. User highlights text → floating toolbar
2. Click "编辑此处" → PrismInlineEditPrompt popup with 5 quick chips (润色/精简/扩写/改公式/更学术) or freeform
3. Submit → `runEdit(instruction, selectedText)` joins same round pipeline

**Both surfaces funnel to same backend round model (prepare → streaming → pending → apply/reject).**

---

## 2. Review Gate: LatexDiffEditor

**File:** `LatexDiffEditor.tsx:58-156`

CodeMirror **unifiedMergeView** (original=DB, proposed=cwd):
- Red deletions, green additions, word-level precision
- Floating toolbar: chunk counter + nav (↑↓) + per-chunk accept/reject (✓/✗) + "全部保留/全部撤销"

**Constraint:** `displayOnly={true}` in main editor → **per-hunk buttons hidden, round-level only**.

---

## 3. Multi-File Handling

### File Switching Lock
**File:** `PrismWorkspace.tsx:106-115`

No switching during `roundState !== 'idle'`. Backend cwd is session-global, but frontend enforces single-file editing.

### Multi-File Rounds
Backend returns all changed files; frontend picks ONE (active or first). ChangesetCard shows count only ("AI 改动 · 5 个文件"); no per-file list or drill-down.

---

## 4. PDF Preview & Delivery Model

### Compilation
Click "编译" → POST `/compile` → poll status → `<PdfViewer />` loads. Error: red alert + "让 AI 修复".

### Version History
**File:** `PrismVersionsDialog.tsx`

List versions: v#, author (user/AI), status (current/superseded), timestamp.
Restore: `/versions/:vid/restore` → makes old version current (no deletion, DAG via BaseVersionID).

### What "Delivery" Means
Round-level gate:
- Apply: POST `/round/apply` → atomic FileVersion write
- Reject: POST `/round/reject` → discard ephemeral edits

No artifact export. Files persist in project, versioned.

---

## 5. Critical Gaps

### 5.1 Per-Hunk Disabled
Buttons exist but `displayOnly={true}` hides them. Users cannot selectively approve hunks; round-level only.

**Impact:** If agent changes 5 things and user likes 4, they must reject and retry.

### 5.2 Optimistic Preview May Lag
If old_string doesn't match, preview fails silently; diff stays stale until 250ms refetch. For long rounds, user sees frozen diff.

### 5.3 Multi-File Rounds Bundled
UI shows count but no list. User must manually switch to see all changes.

### 5.4 No Artifact Delivery Tool
Prism persists back to project; no mechanism to export reports/figures. Synthesis-design.md proposes `deliver_artifact` for claw; Prism lacks it.

### 5.5 Inline-Edit Results Not Auto-Located
No scroll-to-change on completion. User must find it manually in long files.

---

## Key Patterns for Reuse

| Pattern | Source | Relevance |
|---|---|---|
| **Optimistic Preview + Refetch** | usePrismChat.ts:56-209 | Low-latency + ground truth; reusable for any editor |
| **Ephemeral Workspace Contract** | spec.go, workspace.go | DB as truth, cwd temporary, collect changes, apply atomically |
| **Round-Level Gate** | handler_ws.go | Decouples execution from persistence |
| **Selection-Based Inline Instruction** | PrismInlineEditPrompt | Fast-path via quick chips; funnels to same round |
| **Floating Diff Navigation** | LatexDiffEditor:141-153 | Chunk counter + nav in top-right |

---

## Conclusion

Prism's UX is **mature and self-consistent** around ephemeral workspace + round-level gate. No silent persistence.

**Friction points:**
1. All-or-nothing round gate (no per-hunk)
2. Optimistic preview lags (requires refetch)
3. Multi-file rounds hidden (no per-file drill-down)
4. No streaming during execution

**For claw:** Adopt ephemeral workspace pattern + add `deliver_artifact` tool. Skip round-level gate; auto-persist on success.


## Key Patterns

### Round-Level Apply/Reject Gate
Backend prepares cwd from DB, agent edits, frontend collects pending changes on message_complete, presents read-only diff, only persists on explicit /round/apply (or discards on /round/reject). No silent persistence.

- **Agent awareness:** System prompt (edit.go:140-152) states 'files in your cwd, use Read/Edit/Write'; tool permission (pathWithin) enforces cwd-only. Agent unaware of apply gate; it's backend+frontend contract.
- **Source:** backend/internal/prism/handler_ws.go:55-128, frontend-user/src/features/prism/components/PrismWorkspace.tsx:68-73, usePrismChat.ts:233-249

### Optimistic Preview + Debounced Refetch
On tool_use_complete, apply Edit/Write params speculatively (fast, may be wrong); on tool_result, schedule 250ms refetch from cwd (slow, authoritative). If preview wrong, refetch corrects.

- **Agent awareness:** Agent unaware; frontend visualization of its tool effects.
- **Source:** usePrismChat.ts:56-77 (applyToolEditPreview), 188-200 (effect handling), LatexDiffEditor.tsx:111 (merge view)

### Ephemeral Workspace: DB Ground Truth
Database exclusive source of truth. Agent in isolated, ephemeral cwd (session-scoped, reclaimed after round). Backend materializes DB into cwd at round start, collects after completion, atomically persists or discards.

- **Agent awareness:** System prompt: 'project files in your working directory'; permission boundary (pathWithin) restricts cwd-only.
- **Source:** backend/internal/prism/spec.go:1-13, workspace.go:25-115, edit.go:140-152

### Selection-Based Inline Instruction (Cmd+K)
Highlight text -> toolbar ('Edit This / Quote') -> popup with 5 quick chips or freeform -> same round model applies.

- **Agent awareness:** Agent receives instruction + selected text as context (line 192-194).
- **Source:** LatexEditor.tsx:113-129 (keymap), PrismInlineEditPrompt.tsx, PrismWorkspace.tsx:199-206

### Multi-File Rounds Without Per-File UI
Backend /round/pending returns all changed files; frontend picks one for display (active or first). ChangesetCard shows count only ('AI 改动 · N 个文件'). No per-file list or drill-down.

- **Agent awareness:** N/A; agent sees cwd, edits freely.
- **Source:** usePrismChat.ts:158-172, PrismChatPanel.tsx:206-250, PrismWorkspace.tsx:106-115

### Per-Hunk Buttons Exist But Disabled
LatexDiffEditor has getChunks, acceptChunk, rejectChunk logic + buttons (Cmd+Y/U, lines 145-151); displayOnly={true} in main editor (line 75) hides controls. Only round-level apply/discard visible.

- **Agent awareness:** N/A; UI decision.
- **Source:** LatexDiffEditor.tsx:97-101, 141-153, 58-77, PrismWorkspace.tsx:285

### Version Chain via BaseVersionID
Each FileVersion has BaseVersionID -> predecessor, forming DAG. All versions persist; apply marks old 'superseded', new 'current'. Restore to any point via /versions/:vid/restore.

- **Agent awareness:** N/A; backend schema.
- **Source:** PrismVersionsDialog.tsx, backend/internal/prism/model.go:91-101, repository.go:228-249

### File Switching Locked During Round
selectFile() returns early if busy (roundState != 'idle'), preventing user from switching files mid-round. Frontend enforces single-file editing despite cwd being session-global.

- **Agent awareness:** N/A; frontend UX constraint.
- **Source:** PrismWorkspace.tsx:106-115, 74, 243

### Atomic Batch Apply in Single Transaction
All changed files persist in one DB transaction via /round/apply. Either all succeed or all roll back. Each file: new FileVersion (author='agent', status='current', baseVersionID=<previous>).

- **Agent awareness:** N/A; hidden from agent.
- **Source:** backend/internal/prism/ws_round.go:130-135, usePrismChat.ts:233-240

### Context Token Metering
ContextMeter displays totalTokens / maxTokens via query (30s staleTime, invalidated on message_complete). Shows user when context approaches limit.

- **Agent awareness:** N/A; frontend display only. Quota enforced server-side.
- **Source:** PrismChatPanel.tsx:159-166, usePrismChat.ts:102, api/prism.ts:100-118


## Relevance to Prism

Three immediate improvements: (1) Unlock per-hunk accept/reject via feature flag 'prism-hunk-approval'; infrastructure exists. (2) Add file list/dropdown in ChangesetCard for multi-file rounds, preventing manual switching friction. (3) Stream intermediate diffs during execution, not just the final one. For claw/one-shot deliverables, adopt ephemeral workspace + add deliver_artifact tool; skip the round-level gate and auto-persist on success.

## Improvement Ideas

- Add file navigator dropdown in diff editor header for multi-file rounds
- Expose per-hunk accept/reject for advanced users via feature flag prism-hunk-approval
- Stream intermediate diffs during execution, not just final
- Add Jump to First Change button calling editorRef.gotoLine()
- Create Hunk Replay feature: reject hunk -> re-run just that hunk
- Add autosave toggle for diffs under N lines
- Extend version restore with diff preview before restore
- Wire deliver_artifact tool for Prism to export compiled PDF or datasets
- Add citation context to inline-edit based on project.bib
- Implement Undo Entire Round in version history to roll back all files in a round

## Sources

- frontend-user/src/features/prism/components/PrismWorkspace.tsx
- frontend-user/src/features/prism/components/LatexDiffEditor.tsx
- frontend-user/src/features/prism/components/LatexEditor.tsx
- frontend-user/src/features/prism/components/PrismInlineEditPrompt.tsx
- frontend-user/src/features/prism/components/PrismSelectionToolbar.tsx
- frontend-user/src/features/prism/components/PrismChatPanel.tsx
- frontend-user/src/features/prism/components/PrismVersionsDialog.tsx
- frontend-user/src/features/prism/hooks/usePrismChat.ts
- frontend-user/src/features/prism/api/socket.ts
- frontend-user/src/features/prism/api/prism.ts
- frontend-user/src/features/prism/components/chat/fold.ts
- docs/research/agent-web-delivery/03-internal-prism-precedent.md
- docs/research/agent-web-delivery/11-synthesis-design.md
