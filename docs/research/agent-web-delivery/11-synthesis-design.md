# Agent-Native Web Delivery for Scholar: Teaching the Agent It Serves a Remote User Over Ephemeral Scratch

## Summary

Scholar's claw/smart-search/prism agents run in a per-session isolated cwd but have NO architectural notion that they serve a remote web user and that their disk is ephemeral scratch that never reaches the user by itself. The fix is agent-native: give the agent (a) a correct self-model injected at the agentbridge first-message prefix (Layer 3) — "you serve a user over the web, your cwd is private scratch, nothing on disk reaches the user unless you deliver it" — and (b) a single first-class affordance, a `deliver_artifact(path, title, description)` tool whose very description teaches the negative fact the agent cannot infer (files on disk are invisible to the user). The backend intercepts the deliver tool_use_complete frame in the existing agent2front pipe (the same seam that already auto-approves permission_request and harvests message_complete usage), validates path within the session cwd, harvests the bytes via GetWorkspaceFile/ReadWorkspaceFileFull, persists to MinIO, and emits a typed `artifact` frame the frontend folds into a download/preview card. The hard backend rule (list the output dir after each turn and harvest unannounced files) is kept ONLY as a secondary safety net for when the agent forgets to call deliver. This borrows Claude Artifacts' signaling+rubric, smolagents' final_answer "the description IS the teaching" mechanism, code-interpreter's known-output-dir convention, MCP resource field shapes for the wire, and Prism's agentNativeProtocol as the in-code prompt template — all mapped onto existing primitives (buildInjectionPrefix, decidePermission/pathWithin, OnMessageComplete, GetWorkspaceFile, claw file proxy, agent readTree).

## Core Principle

The agent's local filesystem is private, ephemeral scratch; the only channel that reaches the human is an explicit, typed delivery act. We make the agent ARCHITECTURALLY understand this by giving it (1) a correct self-model — injected once per session as a strict-rules prefix that states it serves a remote web user over a chat UI and that nothing on disk is visible to that user unless explicitly delivered — and (2) exactly one affordance to act on that understanding: a `deliver_artifact` tool whose description teaches the un-inferable negative fact. The backend's job is to faithfully execute and secure that delivery, not to guess what the agent meant to hand off; a disk-harvest fallback exists purely as a safety net for the turn where the agent forgets to deliver.

## Recommended Mechanism

A custom first-class `deliver_artifact(path, title, description)` agent tool whose description IS the teaching mechanism (borrowed from smolagents' final_answer and AutoGPT's finish.reason), PAIRED WITH a self-model prompt injected at the agentbridge first-message prefix (Layer 3, via buildInjectionPrefix). The tool gives the agent something to DO with the understanding; the prefix gives it the understanding and the create-vs-inline rubric (borrowed from Claude Artifacts / OpenAI Canvas). The backend intercepts the deliver tool's tool_use_complete in the existing agent2front interception seam (identical pattern to decidePermission and extractMessageCompleteUsage), validates+harvests+persists+emits a typed artifact frame. This is preferred over a pure-prompt convention (no deterministic seam, fold drift risk), a pure inline-tag envelope (pollutes the jsonl transcript, fragile stream-parsing, breaks real-time-fold==history-fold), and a full MCP resource server (heavyweight, agent is a black box). MCP resource field NAMES (uri/mimeType/size/audience) are still borrowed for the wire shape so the artifact frame is standards-shaped rather than bespoke.

---

# Agent-Native Web Delivery for Scholar

> Teaching the claw/smart-search/prism agent that it serves a USER OVER THE WEB, that its per-session cwd is EPHEMERAL SCRATCH, and that it must PROACTIVELY DELIVER final content — as the agent's OWN understanding, with a hard backend rule only as a safety net.

---

## 0. The problem, precisely

Today the agent runs in a per-session isolated cwd (`/home/bun/sessions/<sessionId>`), reads uploaded files there with native `Read`, and writes/edits freely. The backend pipes its WS stream to the browser. But **nothing in the agent's self-model says it serves a remote web user**:

- `prompts.ClawSystemPrompt` has an "附件协议" (files-in → Read) but says nothing about files-out. It assumes a human consumes the chat text synchronously. (`backend/internal/prompts/claw.go:50-56`)
- The agent discovers its sandbox **empirically**, by getting `permission_request` denials from `decidePermission` — it is never *told* the cwd is isolated, temporary, and invisible to the user. (`backend/internal/agentbridge/ws.go` `permissionAllowed`/`pathWithin`)
- When the agent generates a report/figure/dataset, it does what every studied framework documents as the canonical failure (smolagents "path-instead-of-object" bug; OpenAI forum "annotations only cover files the model bothers to mention"): it writes a file, then *mentions a path in chat*. The user — who has **no filesystem and no shell** — never receives it.

The user's explicit preference: this should be the **agent's own understanding**, driven by prompt/tooling/architecture, not a hard-coded backend file-transfer rule. Hard rules are acceptable only as a safety net.

---

## 1. Core architectural principle

> **The agent's local filesystem is private, ephemeral scratch. The only channel that reaches the human is an explicit, typed delivery act.**

Two halves, both agent-native:

1. **A correct self-model** — the agent is *told*, once per session, in strict-rules language: *you serve a remote user over a chat UI; your cwd is private scratch that is wiped when the session ends; the user cannot see, browse, or download anything on disk; the only way a file reaches the user is for you to deliver it.*
2. **One affordance to act on it** — a single `deliver_artifact(path, title, description)` tool whose **description teaches the un-inferable negative fact** ("files on disk are NOT visible or downloadable to the user until you deliver them"). The tool gives the understanding somewhere to go.

The backend's role is to **faithfully execute and secure** the delivery the agent chose — not to guess intent. A disk-harvest fallback exists purely for the turn where the agent forgets.

This mirrors the meta-lesson from the OpenHands/SWE-agent/aider research: **human-awareness belongs at handoff boundaries** (deliver = the handoff), not as ambient "a user is watching your screen" framing, and the agent's internal interface (Read/Write/Edit in cwd) stays concise and machine-optimized.

---

## 2. The recommended mechanism (and why)

**Primary mechanism = a custom `deliver_artifact` tool + a Layer-3 self-model prompt.** They are two parts of one contract:

| Part | What it does | Borrowed from |
|---|---|---|
| **`deliver_artifact(path, title, description)` tool** | The affordance. Its **description** is the teaching mechanism: states the negative fact the model can't infer, and the create-vs-inline rubric. Calling it is the explicit handoff. | smolagents `final_answer` ("the system-prompt line + the tool's existence reprogram the self-model"); AutoGPT `finish(reason)`; Claude Artifacts `<antThinking>` pre-commit reasoning gate; CrewAI `output_file` task contract |
| **Layer-3 self-model prefix** | The understanding. Injected once per session via `buildInjectionPrefix`: "you serve a remote web user, cwd is ephemeral scratch, nothing on disk reaches the user by itself, deliver substantial self-contained deliverables." | Claude Artifacts / OpenAI Canvas dual-list "create-vs-inline" rubric + bias-to-inline; bolt.new/Lovable "explicit surface declaration in the prompt"; Prism's in-code `agentNativeProtocol` as the structural template |
| **Wire shape of the emitted artifact frame** | `{type:'artifact', uri, filename, mimeType, size, title, description}` | MCP resource field names (`uri`/`mimeType`/`size`/`audience:['user']`); Vercel AI SDK `file` part `{filename,mediaType,url}` |

### Why a tool, not the alternatives

- **vs. a pure prompt convention ("save deliverables to ./out, just tell the user")** — no deterministic backend seam; the backend would have to NLP-scrape filenames out of chat (the fragile annotation-style approach OpenAI's own forum abandoned). It also can't survive the team's iron rule that **real-time fold must equal history fold** — a prose mention folds differently than a typed event.
- **vs. an inline `<artifact>...</artifact>` tag envelope (Claude Artifacts / bolt.new style)** — the agent here is a **black box producing jsonl** that the backend treats opaquely. Inlining full file bytes into the assistant text stream bloats the transcript/jsonl, forces a stateful stream-parser into `shared/lib/agent-stream`, and risks the deliverable bytes ending up in the LLM's own context on the next turn. The research is explicit: large artifacts should be a fetchable link (MCP `resource_link`), not base64 embedded in the stream.
- **vs. a full MCP resource server** — the cleanest *data* model (`resources/list` + `resources/read` + `audience` annotation), but it's a whole capability surface to stand up inside the black-box agent container. We **borrow MCP's field names** for the artifact frame without paying for a resource server. (Revisit only if we later want the agent to *re-read its own past deliverables*.)
- **A tool is the lowest-friction agent-native seam we already have infrastructure for.** The agent already emits `tool_use_complete` frames; the backend already intercepts frames mid-pipe (`decidePermission`, `extractMessageCompleteUsage`). The agent already ships a near-identical precedent — `SendUserFileTool` gated behind `feature('KAIROS')` (`agent/src/tools.ts`). A deliver tool slots into the existing tool registry and the existing interception seam with zero new transport.

---

## 3. Where the self-understanding lives (and why)

Scholar's prompt stack has 4 layers (validated against the codebase):

| Layer | Mechanism | Scope | Use it for delivery? |
|---|---|---|---|
| **L1 base CC system prompt** | baked into the Claude Code fork | global, opaque | ❌ can't edit per-deployment; not session-aware |
| **L2 output style** | `agent/data/claude/output-styles/*.md` (e.g. `paper-reviewer.md`) | whole session, persona | ❌ static, not aware of *this* session's hosting context |
| **L3 agentbridge first-message prefix** | `buildInjectionPrefix` → `injectSystemPromptIntoFirstUserMessage`, gated by `FeatureSpec.InjectPromptOnFirstMsg`, `atomic.CompareAndSwap`-guarded so it injects once | session-scoped, dynamic, **backend has sessionID/userID/workdir at injection time** | ✅ **PRIMARY HOME** |
| **L4 per-feature prompt** | `prompts.ClawSystemPrompt`, Prism's `agentNativeProtocol` (Go const, StaticPicker) | feature-static | ✅ secondary: the rubric + the "deliver_artifact exists" note can live here too |

### Decision: the self-model lives at **L3 (agentbridge prefix)**, the rubric + tool-usage note lives at **L4**.

- **The "you serve a web user / cwd is ephemeral" self-model is a property of the HOSTING CONTEXT, not the feature.** Every agentbridge feature (claw, smart-search, prism, peerreview) runs the same way: isolated cwd, WS pipe, remote browser, no user filesystem access. So the truth belongs in the shared L3 layer, injected by `buildInjectionPrefix` for *all* features with one code change, wrapped in the existing `[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]` markers the agent already respects.
- **L3 is the only layer with the session's runtime facts** — it can name the literal cwd path and (later) the literal deliverable-output subdir, exactly as code-interpreter prompts quote `/mnt/data` verbatim and bolt.new declares its WebContainer surface.
- **The create-vs-inline rubric and "you have a `deliver_artifact` tool; use it for substantial deliverables" go in L4** (`ClawSystemPrompt`, and a shared snippet for prism/smart-search), because *what counts as a deliverable* is mildly feature-flavored (claw: reports/translations/figures; prism: it's the LaTeX doc itself via the round model; smart-search: usually inline). This matches the Artifacts/Canvas finding that the **paired examples that move the trigger boundary** are best kept next to the feature persona.

Concretely, `buildInjectionPrefix` gains a shared web-delivery preamble before the per-feature prompt:

```
[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]
你正在为一名通过【网页聊天界面】访问 Scholay 的远程用户服务 —— 不是本地终端。
- 你的当前工作目录是一块【私有、临时的草稿盘】。读写它来完成任务是鼓励的,但
  会话结束后它会被清空。
- 用户【看不到、打不开、下载不了】你工作目录里的任何文件。聊天文字之外,磁盘上的
  东西不会自己到达用户手里。
- 当你产出一份用户应当【拿到/下载】的成品(报告、整理好的数据、图、文档),你必须
  调用 deliver_artifact 工具把它交付给用户。只在聊天里写一句"我把文件存到了 xxx"
  是【无效的】—— 用户收不到。
[... 既有 per-feature prompt ...]
[/AGENT BRIDGE — END OF RULES]
```

---

## 4. The `deliver_artifact` tool (agent side)

A new tool in `agent/src/tools/DeliverArtifactTool/`, registered in `agent/src/tools.ts` exactly like the existing `SendUserFileTool` precedent.

**Schema:**
```ts
name: "deliver_artifact"
input: {
  path: string        // relative-to-cwd path of the file to deliver
  title: string       // user-facing card title
  description: string // 1-sentence "what this is" (AutoGPT finish.reason analogue)
}
```

**Description (the teaching mechanism — verbatim intent):**
> "Deliver a finished file to the user. The user accesses Scholay through a web chat UI and has NO filesystem or shell access — **files you write to disk are invisible and undownloadable to the user until you call this tool.** Use it for substantial, self-contained deliverables the user should keep or download (reports, cleaned datasets, generated figures, documents). Do NOT use it for short explanations, intermediate scratch, or content that belongs inline in chat — when in doubt, answer inline. `path` must be a file inside your working directory."

**Execute behavior:** the tool itself is near-trivial (like smolagents' return-the-arg `final_answer`). The real web work happens backend-side at the interception seam. The tool's `execute` can simply `stat` the path (exists/non-empty/inside cwd) and return a structured `tool_result` confirmation (`{delivered:true, path}`) — this also gives the agent an in-transcript signal that delivery happened, and gives us a `final_answer_checks`-style validation gate (reject path missing/empty/outside cwd; the agent sees the corrective `tool_result` and retries — the same self-correction loop smolagents uses).

The deliver tool is added to the agentbridge feature's allowed set; it is **never** in `disallowedTools`.

---

## 5. Backend: intercept, validate, harvest, persist, emit

The interception happens in the **existing `agent2front` goroutine in `ws.go`** — the same loop that today runs `decidePermission` (auto-approve) and `extractMessageCompleteUsage` (`OnMessageComplete`). We add a third interceptor, gated by a new `FeatureSpec.OnDeliverArtifact` hook so it stays feature-opt-in and zero-cost for features that don't want it.

Flow when a `tool_use_complete` with `toolName == "deliver_artifact"` is seen:

1. **Parse** `{path, title, description}` from the frame (same JSON-probe pattern as `decidePermission`).
2. **Validate path** with the existing `pathWithin(path, sessionWorkDir)` — the artifact MUST be inside the session cwd sub-tree. This reuses the exact fence that already blocks cross-session reads.
3. **Harvest bytes** via the existing `agent.Client`: `GetWorkspaceFile` (≤1MB preview / images as dataUrl) or `ReadWorkspaceFileFull` (`?full=1`) for large text — both already exist (`backend/internal/agent/client.go`).
4. **Enforce caps + MIME policy**: size cap, MIME sniff, and the `claw/file.go` `allowedRasterMIME` + `nosniff` + SVG-rejection rules (generalized to a download path with `Content-Disposition: attachment` for non-previewable types, per the research's "generalize the cookie-auth proxy to a download endpoint" note).
5. **Persist off-box** to MinIO (`internal/storage`) before the ephemeral cwd is reclaimed (the code-interpreter "ephemeral-container persistence mandate"). Record a row in a new `agent_artifacts` table keyed by the `agent_sessions` mapping (owner_kind/owner_id + feature_key + sessionId), with `{id, filename, mime, size, storage_key, title, description, created_at}`.
6. **Emit a typed `artifact` frame** to the front, MCP/Vercel-shaped:
   `{type:'artifact', id, uri:"/api/v1/user/<feature>/artifact/<id>", filename, mimeType, size, title, description}`.
   - This frame MUST be added to the agent's `REPLAYABLE_TYPES` (`agent/src/server/ws/handler.ts`) **or** be re-emitted by the backend on resync, so it survives reconnect (the research's explicit caveat that even Anthropic emits no "file ready" event and relies on polling — we do better by emitting an explicit frame).
   - Large artifacts are delivered as the **fetchable URL** (MCP `resource_link` pattern), never base64-embedded in the WS stream.
7. **Forward** the original `tool_use_complete`/`tool_result` too (so the chat log shows "delivered X"), then the frontend folds the `artifact` frame into a card.

A new authenticated download endpoint `GET /<feature>/artifact/:id` (sibling of `GetSessionFile`) streams bytes from MinIO with `OwnsSession`/owner check + `nosniff` + `Content-Disposition`. Images can preview inline (reusing the `claw/file.go` raster proxy logic); everything else downloads.

---

## 6. The FALLBACK (secondary safety net — the hard backend rule)

The agent-native path is primary. The hard rule earns its keep only for the turn where the agent **forgets to deliver** something it clearly produced. It is the "list output dir" half that all five code-interpreter systems converged on as the robust contract.

**Mechanism — disk diff + harvest on `message_complete`:**

1. The backend already has every primitive except one: the agent **already exposes `readTree`** (`GET .../workspace/tree`, `WorkspaceTreeResult{state, entries:[{name,path,isDirectory}]}` in `agent/src/server/services/workspaceService.ts`). The **only missing piece is a Go client method `ListWorkspaceFiles`** in `backend/internal/agent/client.go` (mirrors the existing `GetWorkspaceFile`).
2. On turn start, snapshot the cwd tree (or the designated output subdir). On `message_complete`, snapshot again and **diff** to find newly-created files in the session that were NOT already delivered via `deliver_artifact`.
3. For each undelivered new file, **do not silently push it** — instead surface a **low-confidence "generated files" tray** frame (a `system_notification` subtype already exists in the protocol) listing them, so the user can pull them, and log a metric `delivery.fallback_harvest` so we can measure how often the agent forgets and tighten the prompt.

**Why secondary, deliberately weaker:** auto-harvesting *everything* the agent wrote would re-introduce exactly the failure mode the user wants to avoid — a "hard backend file-transfer rule" that delivers scratch files, temp outputs, and intermediate artifacts the agent never meant for the user (the smolagents/code-interpreter research shows annotation-less directory dumps are noisy). So the fallback is **opt-in-to-pull, not auto-push**, scoped to net-new files, and instrumented to drive the agent back toward calling `deliver_artifact`. The prompt is the source of truth; the fallback is the seatbelt.

A configurable strict mode (`FeatureSpec.RequireDeliverForFiles`) can additionally refuse to mark a turn "complete" in the UI sense if the agent's text *claims* it produced a downloadable file but never called deliver — the claw analogue of smolagents "keep running until final_answer." Default off (advisory), because false positives on "I saved a draft to scratch" would be annoying.

---

## 7. Map to existing primitives (every piece)

| Design piece | Existing primitive | File |
|---|---|---|
| Self-model injection point | `buildInjectionPrefix` + `injectSystemPromptIntoFirstUserMessage` (once-per-session via `atomic.CompareAndSwap`), gated by `FeatureSpec.InjectPromptOnFirstMsg` | `backend/internal/agentbridge/ws.go`, `spec.go` |
| Per-feature rubric + tool note | `prompts.ClawSystemPrompt` (StaticPicker); Prism `agentNativeProtocol` as the in-code template | `backend/internal/prompts/claw.go`, `backend/internal/prism/edit.go` |
| Deliver tool interception seam | the `agent2front` goroutine that already runs `decidePermission` + `extractMessageCompleteUsage` | `backend/internal/agentbridge/ws.go` (`safego.Go("agentbridge-ws-agent2front…")`) |
| Path fence for delivered file | `pathWithin(p, sessionWorkDir)` (cwd sub-tree, abs+rel branches) | `backend/internal/agentbridge/ws.go` |
| Tool-level allow/deny consistency | `permissionAllowed` / `specDeny` (deliver tool added to allowed; never in `disallowedTools`) | `backend/internal/agentbridge/ws.go`, `spec.go` |
| Harvest bytes | `GetWorkspaceFile` / `ReadWorkspaceFileFull` | `backend/internal/agent/client.go` |
| Persist + serve + XSS/MIME hardening | `claw/file.go` `GetSessionFile` (`OwnsSession`, basename-only, `allowedRasterMIME`, `nosniff`, size cap, dataUrl decode) → generalize to artifact download endpoint | `backend/internal/claw/file.go`, `internal/storage` (MinIO) |
| Ownership keying | `agent_sessions` ownership table (owner_kind/owner_id + feature_key); `feature.OwnsSession` | per `agent-sessions-ownership-unify` memory |
| Usage/billing parallel | `OnMessageComplete` hook + `NewDBUsageRecorder` (the new `OnDeliverArtifact` hook mirrors it) | `backend/internal/agentbridge/spec.go`, `claw/spec.go` |
| Fallback list-dir | agent `readTree` (`workspace/tree`, `WorkspaceTreeResult`) — needs Go client `ListWorkspaceFiles` | `agent/src/server/services/workspaceService.ts`, `agent/src/server/api/sessions.ts`; new method in `backend/internal/agent/client.go` |
| Deliver tool registration precedent | `SendUserFileTool` gated behind `feature('KAIROS')` | `agent/src/tools.ts` |
| Artifact frame survives reconnect | `REPLAYABLE_TYPES` + resync replay | `agent/src/server/ws/handler.ts` |
| Frontend fold (real-time == history) | `foldMessagesIntoTurns` + `shared/lib/agent-stream` + `shared/lib/agent-history` | `frontend-user/src/features/claw/components/chat/fold.ts`, `frontend-user/src/shared/lib/*` |

---

## 8. Security invariants (preserved)

1. **`OwnsSession`** gates every artifact read/download (no cross-user access) — same as `GetSessionFile`.
2. **`pathWithin` sub-tree check** on the delivered `path` — the deliver tool cannot exfiltrate `/etc/passwd`, another session's cwd, or `~/.claude/projects/*` jsonl. This is the *same* fence as `decidePermission`; deliver does NOT get a privileged read path.
3. **MIME/XSS**: keep `allowedRasterMIME` + `nosniff` for inline image preview; reject `image/svg+xml` inline; non-raster/non-previewable types only via `Content-Disposition: attachment` (never rendered same-origin). No base64 SVG ever inlined.
4. **Size caps**: artifact harvest enforces a cap (extend `maxProxyImageBytes` philosophy to a general `maxArtifactBytes`); large text uses `ReadWorkspaceFileFull` with a ceiling, not unbounded.
5. **No bytes in the LLM transcript**: artifact bytes go MinIO→download URL; only metadata (`uri/filename/mime/size/title`) crosses the wire and lands in the frame. Avoids transcript bloat and re-feeding deliverable bytes into the next turn's context.
6. **WS auth unchanged**: ws_token one-time ticket (no naked JWT in URL). Artifact download uses the cookie/header path of `UserAuthMiddleware` like `GetSessionFile`.
7. **Fallback never auto-pushes**: the disk-diff safety net surfaces a *pull* tray, scoped to net-new files, so it can't leak scratch.

---

## 9. Contrast: agent-native vs. the hard backend rule

| | Agent-native (chosen primary) | Hard backend rule (chosen fallback only) |
|---|---|---|
| What it is | Agent understands web delivery + calls `deliver_artifact` | Backend lists cwd after each turn and harvests files |
| Who decides what's a deliverable | The agent (with rubric) — distinguishes a finished report from scratch/temp, like Artifacts' create-vs-inline gate | The backend (blindly) — can't tell a deliverable from `tmp.json` |
| Failure mode | Agent forgets to deliver (caught by fallback) | Delivers noise: scratch, intermediates, PDFs the user uploaded, `.aux` files — the exact "jarring card-spam" the Artifacts/Canvas research warns against |
| Self-correction | Agent sees `deliver_artifact` validation `tool_result`, retries (smolagents loop) | None — backend is dumb about intent |
| Maintainability | Behavior lives in one prompt + one tool description; tune by editing text | Behavior is filename heuristics + ignore-lists that rot |
| Matches user preference | ✅ agent's own understanding | ❌ exactly the hard-coded rule the user rejected |
| Where it earns its keep | — | The single turn where the agent produced a real deliverable but forgot to call deliver: the seatbelt, surfaced as an opt-in pull tray + metric to drive prompt fixes |

The hard rule is genuinely useful — but only as a *secondary, weaker, non-auto-push* net. Making it primary would deliver the wrong things and reproduce the problem the user is trying to avoid.

---

## 10. Phased implementation plan

**Phase 0 — Self-model only (prompt-only, ship same day, zero new endpoints).**
Inject the web-delivery self-model into `buildInjectionPrefix` (shared, all agentbridge features) + add a "save deliverables to your working directory and tell the user clearly" line to `ClawSystemPrompt`. No tool yet; the agent at least stops assuming local persistence and starts being explicit. Measures the floor.

**Phase 1 — MVP `deliver_artifact` (the agent-native core).**
Add the tool (`agent/src/tools/DeliverArtifactTool/` + register in `tools.ts`); add `OnDeliverArtifact` hook + interception in `agentbridge/ws.go` (parse → `pathWithin` → `GetWorkspaceFile`/`ReadWorkspaceFileFull` → MinIO → `agent_artifacts` row → emit `artifact` frame); add `agent_artifacts` migration + `GET /<feature>/artifact/:id` download endpoint (reuse `claw/file.go` hardening); fold the `artifact` frame into a download/preview card in claw chat (`fold.ts` + a shared chat part, keeping real-time fold == history fold). Add `artifact` to `REPLAYABLE_TYPES`. Wire the L4 rubric + paired examples into `ClawSystemPrompt`.

**Phase 2 — Fallback safety net.**
Add `ListWorkspaceFiles` to the Go agent client (agent `readTree` already exists); snapshot-diff cwd around the turn in `agentbridge/ws.go`; surface undelivered net-new files as a `system_notification` "generated files" pull tray; log `delivery.fallback_harvest` metric.

**Phase 3 — Hardening + breadth.**
Generalize to smart-search/peerreview/prism (prism already has its round model — deliver is mostly N/A there, but the self-model still applies); add the optional `RequireDeliverForFiles` strict mode; add `deliver_artifact` validation gate (final_answer_checks analogue); admin/analytics view of delivery completion rate; signed-URL option for very large downloads if the proxy becomes a bottleneck.

---

## 11. Wire shape (for implementers)

Artifact frame (agent→front, MCP/Vercel-shaped):
```json
{ "type": "artifact",
  "id": "uuid",
  "uri": "/api/v1/user/claw/artifact/<id>",
  "filename": "literature-review.md",
  "mimeType": "text/markdown",
  "size": 18234,
  "title": "锂电池固态电解质综述",
  "description": "整理了 12 篇近三年工作的对比综述,可下载" }
```
`deliver_artifact` tool_result (agent-internal, for self-correction):
```json
{ "delivered": true, "path": "literature-review.md" }
```
on validation failure: `{ "delivered": false, "error": "path not found in working directory" }`.

---

## 12. Open questions (for the user)

See the structured list.

---

## Phased Implementation Plan

### Phase 1: Phase 0 — Self-model prompt only

Inject the shared web-delivery self-model (you serve a remote web user / cwd is ephemeral scratch / nothing on disk reaches the user by itself / deliver substantial deliverables) into the agentbridge first-message prefix for all features, and add an explicit files-out line to the claw per-feature prompt. No new tool or endpoint. Ships immediately; establishes the floor and lets us measure how often the agent still just mentions paths.

**Files touched:**
- `backend/internal/agentbridge/ws.go (buildInjectionPrefix)`
- `backend/internal/prompts/claw.go (ClawSystemPrompt)`

### Phase 2: Phase 1 — MVP deliver_artifact (agent-native core)

Add the deliver_artifact tool whose description teaches the negative fact; register it in the agent tool registry (precedent: SendUserFileTool). Add FeatureSpec.OnDeliverArtifact hook and intercept the deliver tool_use_complete in the existing agent2front pipe (same seam as decidePermission/extractMessageCompleteUsage): validate path via pathWithin, harvest bytes via GetWorkspaceFile/ReadWorkspaceFileFull, persist to MinIO, write an agent_artifacts row keyed by agent_sessions ownership, emit a typed artifact frame, and add it to REPLAYABLE_TYPES. Add GET /<feature>/artifact/:id download endpoint reusing claw/file.go hardening. Fold the artifact frame into a download/preview card keeping real-time fold == history fold. Put the create-vs-inline rubric + paired examples in the L4 claw prompt.

**Files touched:**
- `agent/src/tools/DeliverArtifactTool/DeliverArtifactTool.ts`
- `agent/src/tools.ts`
- `agent/src/server/ws/handler.ts (REPLAYABLE_TYPES)`
- `backend/internal/agentbridge/ws.go (interception)`
- `backend/internal/agentbridge/spec.go (OnDeliverArtifact field)`
- `backend/internal/claw/spec.go (wire hook)`
- `backend/internal/claw/file.go (generalize to artifact download)`
- `backend/internal/claw/handler.go (artifact download handler)`
- `backend/cmd/server/routes_user.go (artifact route)`
- `docker/mysql/migrations/NNNN_agent_artifacts_fields.sql`
- `docker/mysql/migrations/NNNN_agent_artifacts_indexes.sql`
- `backend/internal/prompts/claw.go (rubric + examples)`
- `frontend-user/src/features/claw/components/chat/fold.ts`
- `frontend-user/src/features/claw/api/types.ts`
- `frontend-user/src/shared/components/chat (artifact card part)`

### Phase 3: Phase 2 — Fallback safety net (secondary)

Add ListWorkspaceFiles to the Go agent client (agent-side readTree already exists). Snapshot the session cwd tree at turn start and on message_complete; diff to find net-new files not delivered via deliver_artifact; surface them as an opt-in pull tray via a system_notification subtype (never auto-push). Log a delivery.fallback_harvest metric to drive prompt tuning.

**Files touched:**
- `backend/internal/agent/client.go (ListWorkspaceFiles)`
- `backend/internal/agentbridge/ws.go (snapshot/diff + system_notification tray)`
- `frontend-user/src/features/claw/components/chat/fold.ts (generated-files tray)`
- `frontend-user/src/shared/lib/agent-stream.ts (if a new frame subtype is needed)`

### Phase 4: Phase 3 — Hardening + breadth

Generalize the contract to smart-search/peerreview (and confirm prism's round model needs only the self-model, not deliver). Add optional FeatureSpec.RequireDeliverForFiles strict mode (refuse to treat a turn as cleanly complete when the agent claims a file but never delivered) and a deliver_artifact validation gate (final_answer_checks analogue). Add an admin/analytics view of delivery completion rate. Add a signed-URL download option for very large artifacts if the cookie-auth proxy becomes a bottleneck.

**Files touched:**
- `backend/internal/agentbridge/spec.go (RequireDeliverForFiles)`
- `backend/internal/agentbridge/ws.go (strict mode + validation gate)`
- `backend/internal/smartsearch/spec.go`
- `backend/internal/peerreview/* (opt-in)`
- `backend/internal/admin/* (delivery analytics)`
- `frontend-user/src/features/admin/* (delivery completion view)`


## Open Questions / Decisions for the User

- Output subdir convention: do we tell the agent to save deliverables to a dedicated subdir (e.g. ./out, the /mnt/data analogue) so the fallback diff is cleaner, or let it save anywhere in cwd and rely solely on deliver_artifact? A dedicated subdir makes the safety-net diff far less noisy but adds one more rule the agent must follow.
- Storage backend and retention: persist delivered artifacts to MinIO (matches feedback module) — for how long? Tie lifetime to the session, to a fixed TTL, or keep indefinitely as user-owned downloads? This affects whether artifacts should also surface in a per-user 'my files' view rather than only in the chat transcript.
- Strict enforcement default: should RequireDeliverForFiles (refuse-to-complete when the agent claims a file but never delivered) ever be ON by default for claw, or always advisory? False positives on 'I saved a draft to scratch' could annoy users; the safe default is advisory + metric.
- Cross-session / library integration: should a delivered artifact be auto-linkable into the user's existing Library (user_library_*) or Staging Area, given those durable stores already exist? This would make 'deliver' also a 'save to my corpus' action and align with the research's durable-handoff principle.
- Interactive HTML deliverables: if the agent ever delivers runnable HTML (a chart, a small viewer), do we render it in a sandboxed iframe (copying Claude Artifacts' literal sandbox declarations — no browser storage, allowed-libs whitelist) or restrict deliverables to non-executable types for now to avoid the XSS surface?
- Multi-file / zip delivery: should deliver_artifact accept a directory or multiple paths (bolt.new 'zip-all' affordance) for multi-file research runs, or strictly one file per call with a frontend 'download all' that zips client-side?
- Naming collision with KAIROS SendUserFileTool: the agent already ships SendUserFileTool behind feature('KAIROS'). Do we reuse/rename that tool for our deliver semantics, or add a distinct deliver_artifact to avoid coupling to the KAIROS feature flag and its existing transport assumptions?
- Prism scope: prism already delivers via its DB-as-source round/apply model, so deliver_artifact is largely redundant there — confirm prism only needs the L3 self-model and is explicitly excluded from the deliver tool to avoid two competing delivery paths in one feature.
