# Scholay Prism — Agent-Native Delivery Optimization Design

## Summary

Prism already nails the hardest part of agent-native delivery: a DB-source-of-truth, ephemeral-cwd, four-phase round/apply model with real-time diff streaming, a hardened two-sandbox security split (agent container egress-only + prism_tex network_none/shell-escape-off), per-project session isolation, anti-hallucination library-RAG cite, version chains, and quota/usage hooks. The round/apply model is the RIGHT path — keep it, do not move to Canvas-inline auto-apply or bolt file-actions. The optimization opportunity is fourfold: (1) sharpen the agent's self-model so it explicitly knows cwd is ephemeral, that nothing reaches the user until a round is applied, and that it should generate (not just edit); (2) unlock latent capability already in the code — per-hunk accept/reject (LatexDiffEditor has it, gated by displayOnly), multi-file round navigation (PendingRound already returns all files), agent-created new files (collectWorkspaceChanges deliberately skips them); (3) add a compile-fix auto-loop (extractCompileError already produces the line-numbered context; just wire the loop); (4) ship the deliverable surface and comingSoon items — LaTeX→docx via pandoc (already in agent container), project .zip, figure/data generation via sandboxed Bash+matplotlib in the agent container (claw already runs Bash safely there), venue templates + outline planner (venue_template_key column already exists). Every proposal maps to an existing primitive; net new infra is minimal.

## Current-State Assessment (agent-native delivery lens)

Through the agent-native delivery lens, Prism is the platform's strongest implementation and is genuinely good: the deliverable (the LaTeX document + compiled PDF) reaches the web user through a disciplined contract where DB is single source of truth, the agent edits an ephemeral session cwd it never persists, the backend reads back via ReadWorkspaceFileFull + SHA256 diff and atomically commits in one transaction (BatchAppendCurrentVersions) forming a BaseVersionID version chain, and the user gates persistence with apply/reject over a CodeMirror diff. Security is exemplary (two hardened sandboxes, pathWithin fence, DisallowedTools, ws-ticket auth). The single biggest gap is that the agent has no explicit self-model of its situation: agentNativeProtocol (edit.go:140-152) tells it "files are in cwd, use Edit/Write" but never says "your cwd is ephemeral scratch, you serve a remote web user, nothing reaches them until the round is applied, and you may GENERATE not just edit." This implicit-local self-model is harmless today (Prism only edits text) but becomes the blocker for every growth direction — figure generation, data tables, new files, exported artifacts — because the agent doesn't know it's allowed/expected to produce, nor how delivery works. The secondary gap is latent capability left disabled in code (per-hunk accept via displayOnly, multi-file diff nav, new-file persistence) and missing deliverable surfaces (docx/zip export, compile-fix loop, venue templates) — all cheap because the primitives already exist.


## Top Recommendations

- Rewrite agentNativeProtocol (edit.go) into an accurate agent self-model — ephemeral cwd, remote web user, round-apply delivery contract, generation-is-allowed, scope rubric — and lift facts 1-2 into a SHARED Layer-3 prefix in agentbridge.buildInjectionPrefix so claw/smart-search/peerreview inherit it. Highest leverage, ~1 day, no risk.
- Unlock per-hunk accept/reject that already exists: remove `displayOnly` on the awaiting_apply diff in PrismWorkspace.tsx, and change ApplyRound to persist the user-edited (hunk-filtered) bodies the frontend posts (fall back to cwd read-back). The merge editor logic is fully built.
- Wire the compile-fix AUTO-loop (2-3 iterations, same-error-twice guard, quota-metered) feeding extractCompileError's line-numbered excerpt back as a round — the extractor and the prompt already exist; only the loop is missing.
- Enable figure/data generation by removing Bash from prismDisallowedTools (spec.go:40), adding python3-matplotlib/numpy/pandas to agent/Dockerfile, and a prism-figures skill that emits figures/*.pdf via savefig + includegraphics — reusing claw's already-safe Bash-in-egress-only-container; NEVER touch the network_none/shell-escape-off prism_tex sandbox.
- Persist agent-created NEW files and assets: extend collectWorkspaceChanges to read the cwd tree and include new text files (fileID=0) + harvest figures to MinIO, creating prism_files rows inside the apply transaction — unblocks generation, cross-file rounds, and the outline planner.
- Ship deliverables: ?download=1 on GetPDF (polish), a project .zip export via Go archive/zip from the DB source of truth (Overleaf-importable), and LaTeX→.docx via pandoc (already in the agent container) as a dedicated backend export step.
- Add a multi-file changeset surface (PendingRound already returns all files; stop picking files[0]) with net +/- and per-file switch — LaTeX projects span preamble/chapters/bib.
- Implement the already-defined ErrStaleBase check before apply, and a non-destructive comment/suggest channel (Canvas/Copilot parity) for review-my-draft + outline approval without mutating the LaTeX.
- Deliver venue templates (venue_template_key column already exists) replacing the single scaffold, plus a reformat-to-venue skill — and a prism-validation skill (undefined \ref/\cite, unreferenced \label) surfaced as a one-line consistency signal post-apply.
- Sharpen the three prism skills with explicit anti-patterns + self-checks (generalize the existing \legend-comma negative example) instead of letting the agent learn by compile-error trial-and-error.

---

# Scholay Prism — Agent-Native Delivery Optimization Design

> Lead-architect design doc. Lens: the agent uses its full capability; the local cwd is ephemeral; the deliverable (the document itself, plus downloadables) must reach the remote web user well. This is OPTIMIZATION of a working round/apply system, not a greenfield build.

---

## 0. What I verified in the code (corrects/refines the research)

Before designing, I read the whole module. Several research "gaps" are already partly built — which changes the plan from "build" to "unlock":

| Claim in research | Code reality | Implication |
|---|---|---|
| Per-hunk accept/reject "disabled" | `LatexDiffEditor.tsx` has full `getChunks/acceptChunk/rejectChunk` + keymap (⌘Y/⌘U) + floating nav. `PrismWorkspace.tsx:285` passes `displayOnly` → controls hidden | **Unlock, don't build.** Flip one prop + wire onChange→apply edited body |
| No PDF download | `PrismWorkspace.tsx:152 downloadPdf()` already does blob download via `http.get(.../pdf, blob)` | **Already shipped.** Just add `?download=1` server variant + filename polish |
| Compile-fix loop missing | `fixCompile()` (PrismWorkspace.tsx:218) is a **manual one-shot**; `extractCompileError` (compile_error.go) already produces `summary`+`excerpt` with `l.NNN` | **Wire the loop**, don't build the extractor |
| Venue templates absent | `Project.VenueTemplateKey *string` (model.go:64) + `venue_template_key` column (migration 0009, "Phase B") already exist | Schema is ready; need templates + selection UI |
| Bash too dangerous for figures | Claw **already runs Bash** in the *same* agent container (`ws.go:530-532`); container is egress-only via `scholar-agent-net` (internal) + `egress-proxy` | The agent container is the correct, already-hardened place to run python/matplotlib |
| `PRISM_COMING_SOON` blocks Prism | `.env` has `PRISM_COMING_SOON=false` | Prism is live locally; comingSoon items (venue/outline) are real backlog |
| New files / assets handled | `collectWorkspaceChanges` (workspace.go:65-73) deliberately skips `KindAsset` and **only tracks DB-known files** | Agent-created files (figures, new sections) are silently dropped — a real blocker for generation |
| Multi-file round UI | `PendingRound` returns **all** changed files; `usePrismChat.finalizeRound` picks `files[0]` only | Backend ready; frontend shows one file at a time |

prism_tex compile sandbox already ships `texlive-pictures` (TikZ/PGF) but with shell-escape triple-locked off and `network_mode: none`. The agent container ships `pandoc` + `python3` + `openpyxl` but **not** `matplotlib`/`numpy`/`pandas`.

---

## 1. KEEP — the load-bearing decisions that are correct

These are not just "fine," they are the reason Prism is the reference implementation. Do not touch them:

1. **Round/apply with a user gate.** DB = single source of truth; agent edits ephemeral cwd; backend reads back + diffs + atomically commits; user applies/rejects. This is the safest point on the disk-vs-staged spectrum (see §4). Keep `ws_round.go`'s prepare/pending/apply/reject as the spine.
2. **The two-sandbox security split.** Code execution stays in the egress-only agent container; LaTeX rendering stays in `prism_tex` (network_none, shell-escape off). Never merge them, never enable shell-escape, never give `prism_tex` python or network.
3. **`pathWithin` + `DisallowedTools` + ws-ticket auth.** The permission fence and one-time WS ticket are correct; any new tool must remain inside this fence.
4. **Per-project session isolation** (`prism_projects.agent_session_id` + `projectSessionMu` + `ClaimProjectSession`). No cross-project context bleed.
5. **Library-RAG cite as the anti-hallucination moat** (`cite.go`). Every `\cite{key}` is backed by a real `user_library_papers` row. Keep this as the *default* even after adding DOI import (§7.4).
6. **Bounded concurrent I/O** (`errgroup.SetLimit(8)`), content-hash compile cache, CJK→xelatex auto-detect, version chain via `BaseVersionID`. All good; reuse for new file types.

---

## 2. The agent self-model (highest leverage, ~1 day, change `edit.go`)

Today `agentNativeProtocol` (edit.go:140-152) is *implicit-local*: "files are in cwd, use Edit/Write, don't compile." The agent behaves like a local editor with no notion of its real situation. Compare claw's prompt (`prompts/claw.go:58-74`), which explicitly tells the agent it serves a remote web user over a private ephemeral scratch disk and how delivery works.

**CHANGE: rewrite `agentNativeProtocol` to give the agent an accurate self-model.** Add four facts it currently lacks:

1. **Situation.** "You serve a remote user editing a LaTeX paper through a web IDE. Your current working directory is a private, ephemeral working copy of their project, re-materialized from the database before every round and discarded after. The user does not see your disk."
2. **Delivery contract.** "Everything you write or edit inside the working directory is collected at the end of the round and shown to the user as a reviewable diff; they decide whether to keep it. Nothing reaches the user automatically — your job each round is to leave the working copy in the exact state you want the user to review."
3. **Generation is allowed.** "You may not only edit existing files but also create new `.tex`/`.bib` files and (when figures or data tables are needed) generate them. (Gated on §5/§6 capability rollout.)"
4. **Scope rubric** (operationalize the vague "only necessary files"): "Specific instruction (fix §3 typos) → edit only that span. Broad instruction (polish the paper) → full pass but keep the diff proportional; do not rewrite unrelated sections or the preamble unless asked. Before finishing, re-read your diff: is its size justified by the instruction?"

**Architecture note (do it once, share it):** put facts 1–2 (the web-delivery self-model) into a **shared Layer-3 prefix** in `agentbridge.buildInjectionPrefix` (ws.go:451-453) so claw, smart-search, peerreview *and* prism all inherit the same accurate self-understanding, with each feature's `agentNativeProtocol`/Picker prompt appended as Layer-4 specifics. This is the "inject self-model prefix" idea from two research streams, done at the right layer.

**Sharpen the skills too** (the three `prism-skills/*/SKILL.md`). They teach "what good looks like" but lack anti-patterns and self-checks. `prism-latex-format` already has one excellent negative example (the `\legend` comma trap, line 17) — generalize that:
- Add an `## 反模式 / 自查` section to each skill: undefined `\ref`/`\cite`, unreferenced `\label`, filler-phrase regex for academic-writing, venue-specific checklist for discipline-conventions.
- Add a new **`prism-validation` skill** the agent loads after substantive edits: grep `\ref` vs `\label`, `\cite{}` vs `.bib` keys, balanced environments. Surface its result as a one-line UX signal ("一致性检查:通过 / 发现 3 处问题").

---

## 3. Unlock latent capability (cheap; code already exists)

### 3.1 Per-hunk / partial accept (CHANGE `PrismWorkspace.tsx`, no backend)
The merge editor already supports it. Flip the gate:
- Remove `displayOnly` on the **awaiting_apply** diff (keep it during streaming, where the cwd is still moving). During streaming the diff is a live preview; once `roundState === 'awaiting_apply'`, render the same `LatexDiffEditor` *with* controls so the user can ⌘Y/⌘U individual chunks.
- Wire `onChange(merged)` → the edited body is what `/round/apply` should persist. **This requires a backend change:** `ApplyRound` currently re-reads cwd; instead let the frontend POST the *user-edited* per-file bodies (the hunk-filtered result) and persist those, falling back to cwd read-back when none provided. This is the "editable diff pane" pattern (Zed multibuffer) and the universally-demanded per-hunk control (Cursor forum).

### 3.2 Multi-file round surface (CHANGE `usePrismChat.ts` + a small file-list component)
`PendingRound` already returns every changed file. Replace `finalizeRound`'s `files[0]` pick with a **changeset list**: a header strip showing touched files with net +/- (compute from old/new body), click to switch the diff editor between files, plus an "apply all / reject all" and (with §3.1) per-file keep/drop. This is the GitHub-Copilot-style multi-file summary that LaTeX projects (preamble + chapters + bib) genuinely need.

### 3.3 Agent-created new files (CHANGE `workspace.go` + `repository.go`)
`collectWorkspaceChanges` only iterates DB-known files. To support generation (new section files, generated `figures/*.tex`, `tables/*.tex`), add a second pass:
- Call agent `ListWorkspaceFiles` (already used by claw) to read the cwd tree.
- For text files present in cwd but **absent from `prism_files`** and matching the allowed extensions (`safeRel` + `isTextExt`), include them as `changedFile` with `fileID=0` (new) and `baseVer=nil`.
- In `ApplyRound`, when `fileID==0`: create the `prism_files` row (via existing `CreateTextFile`-equivalent) then `AppendCurrentVersion`, all inside the same transaction as `BatchAppendCurrentVersions`. Author = agent.
- Keep a guard: ignore agent-created files outside the project's allowed kinds, and **never** auto-persist files the agent put in a scratch dir if we later adopt a `./scratch/` convention.
- Metric: log `delivery.new_file_count` per apply to watch for over-generation.

---

## 4. Round/apply vs Canvas-inline vs Cursor accept/reject vs bolt file-actions — why Prism's path is right

| Model | What lands where | Granularity | Stale-edit safety | Fit for Prism |
|---|---|---|---|---|
| **Canvas inline** (`canmore` regex patch / full-rewrite) | Mutates the live doc; host versions it | Whole-doc or targeted op | Documented overwrite-on-stale-state failure | Too eager; mutates before review |
| **Cursor accept/reject** (staged in-memory, per-hunk) | Staged, applied on accept | all/file/hunk | Safe (staged) | Closest sibling; Prism already staged |
| **bolt file-actions** (`<boltAction type=file>` full-file, auto-run) | Streamed straight to WebContainer, auto-executes | Whole file, no gate | None (relies on shadow-git) | Wrong: auto-apply, no academic review gate |
| **Prism round/apply** | Agent edits ephemeral cwd; backend reads back; **user gates DB commit** | round → (with §3.1) per-hunk | Safe; can add stale-base check (§8) | **Correct** |

**Justification.** Academic writing is high-stakes and human-in-the-loop by nature (this is exactly OpenAI Prism's Keep/Undo-per-suggestion and Overleaf's "nothing applied until you click Apply"). Prism already sits in the *safer* "staged, not on disk before accept" camp that Cursor users are loudly asking Cursor to return to. The agent uses **full native Edit/Write/MultiEdit** (not a brittle line-numbered-diff format models botch — see Aider/Morph findings), the backend does deterministic read-back + SHA diff (Claude's Oct-2025 real-diffing rationale: cheaper, preserves concurrent edits), and the user reviews. The only thing to borrow from the others is **granularity** (per-hunk, §3.1) and **content-anchoring/stale detection** (§8) — both additive, not a model change. We do NOT adopt Canvas's mutate-then-review or bolt's auto-apply.

---

## 5. Figures & data generation via sandboxed Bash (ADD; reuse claw's pattern)

This is the biggest *capability* expansion and the research is unambiguous: generate figures with python/matplotlib **inside the agent container** (the correct hardened place), emit `figures/*.pdf` (vector, no shell-escape needed), `\includegraphics` them, and **never** run code during TeX compile. The industry standard is two separate sandboxes — which Prism already has.

**Decision: enable Bash in Prism sessions, NOT a new sandbox.** Claw already runs Bash safely in the identical container; spinning up a third sandbox is wasted infra.

Concretely:
1. **`spec.go:40` — remove `"Bash"` from `prismDisallowedTools`** (keep `NotebookEdit`, `Task`, `Agent` denied — Task/Agent bypass the permission broker). Bash safety relies on container isolation (cap_drop, egress-only, pids/mem caps), exactly as it does for claw today — not on `pathWithin` (Bash can't be path-limited).
2. **`agent/Dockerfile` — add `python3-matplotlib python3-numpy python3-pandas`** next to the existing `pandoc/python3/openpyxl` (line 43-45).
3. **New skill `prism-figures`** (mounted via existing `--add-dir /prism-add`): teach the convention — write `figures/<n>.py` → `savefig('figures/<n>.pdf')` (vector) → `\includegraphics{figures/<n>}`; data tables as `booktabs`/`df.to_latex()` into `tables/<n>.tex` + `\input{}`. **Explicitly forbid** PGF/pythontex/minted (they'd need shell-escape in the TeX sandbox, which is locked off).
4. **Persist generated binary assets.** Extend the new-file pass (§3.3) to also harvest `figures/*.pdf|*.png` as `KindAsset`: read raw bytes from the agent cwd (claw's `DownloadSessionArtifact` raw-byte path), store to MinIO (`scholar-prism` bucket, the `MinioObjectKey` field already exists on `File`), create the `prism_files` row. Then `gatherCurrent`/`materializeProject` must round-trip assets back into the compile job dir and the next round's cwd (currently both skip `KindAsset`). This is the "support binary assets in round trips" item.
5. **Security invariant restated:** figures are generated as PDF/PNG **before** compilation in the agent sandbox; `prism_tex` stays network_none + shell-escape-off + python-free. No change to the compile sandbox.

Risk to weigh (Open Question §11): enabling Bash widens Prism's tool surface to claw's level. Acceptable because it's the same container and same isolation, but it does mean a malicious prompt could run arbitrary python in the (network-restricted) sandbox — already true for claw. Gate behind the §2 self-model + the figures skill so the agent only reaches for it when figures/data are needed.

---

## 6. Compile-error auto-fix loop (ADD; wire existing pieces)

`extractCompileError` already yields the line-numbered `excerpt` the agent needs; `fixCompile` already builds the exact prompt — but it's a manual one-shot. Make it a bounded loop:

- **New service method `RunCompileFixLoop`** (in `service.go`/`ws_round.go`): compile → if error, run a round seeded with the `log_excerpt` → re-compile → repeat. Cap at **2–3 iterations** with a **"same error signature twice → stop"** guard (compare normalized `error_summary`).
- **Meter it.** Each iteration goes through `preUserMessageChain` → `vip.CheckAndConsume` so the loop can't silently burn quota; token cost logged via `onMessageComplete`. Surface progress over the WS ("修复尝试 1/3…").
- **Keep the manual "让 AI 修复" button** as the entry; the loop is what it triggers.
- **Build-status panel.** The right pane already shows `error_summary`; render warnings-vs-errors Overleaf-style and the loop's per-iteration state so the human sees the feedback loop, not just the agent.

---

## 7. Downloadable deliverables (ADD; the workspace→user channel)

The document reaching the user *as a document* is Prism's core promise; downloadables are the academic-interop layer competitors monetize. All read from the **DB source of truth** (export never touches the agent cwd):

### 7.1 PDF download — already done; polish (P0)
`downloadPdf()` exists. Add server-side `?download=1` to `GetPDF` (handler.go:296) setting `Content-Disposition: attachment; filename*=UTF-8''<title>.pdf` (copy claw artifact.go:239-241) so a plain link works too.

### 7.2 Project `.zip` export (P0-P1)
**New `ExportProject` handler** in `internal/prism`: bundle all current text files (from `gatherCurrent`) + assets (MinIO) + latest compiled PDF via Go `archive/zip` (currently unused in the package), served as attachment. This is bolt/v0/Lovable "Download ZIP" and gives an **Overleaf-importable source zip** (arguably higher value than GitHub for researchers). Secrets-clean by policy (no API keys ever in the zip).

### 7.3 LaTeX→`.docx` via pandoc (P1, marquee gap)
The #1 cross-format need (co-authors comment in Word). **New `ExportDocx`**: run `pandoc main.tex -o out.docx --bibliography references.bib --resource-path=<figures>` — pandoc is **already in the agent container**. Two implementation options:
- (a) Reuse claw's `out/` artifact mechanism: ask the agent to run pandoc and drop `out/<title>.docx`, harvest as artifact. Zero new infra but couples export to an agent round.
- (b) Dedicated backend export step in the agent container via a one-shot session. Cleaner UX (a button, not a chat turn). **Prefer (b).**
Warn in UI that complex equations/TikZ degrade (~90% fidelity) — pair with raster/PDF figures from §5.

### 7.4 `.bib` export + DOI/arXiv import (P1-P2)
Export `references.bib` directly (trivial). Extend `cite.go`: add DOI/arXiv→BibTeX resolution (network is fine — this is backend, not the compile sandbox) and a **reference checker** (`\cite` with no entry / unused entry). Keep library-RAG as the grounded default (the moat).

---

## 8. Stale-base detection (ADD; the error type already exists)

`ErrStaleBase` (errors.go:15) is defined but unused. Implement the check the model anticipates: before `ApplyRound` persists, verify each file's `BaseVersionID` is still the current version in DB (i.e., the user didn't hand-edit between prepare and apply — possible because auto-save is paused during a round but a second tab could write). If stale: warn the user / offer re-prepare, or smart-merge if the changed spans don't overlap. This is the "content-anchored, reject-stale" safety the Canvas-overwrite failure teaches.

---

## 9. Venue templates + outline planner (the comingSoon items)

### 9.1 Venue templates (`venue_template_key` column ready)
- Ship a small registry of starter templates (NeurIPS/ICML/CVPR/IEEE/ACM/Elsevier/generic-article) replacing the single `scaffoldMainTex` (service.go:52). Select at project creation; store in `VenueTemplateKey`.
- **"Reformat to <venue>" agent skill** (loaded via `--add-dir`): swap `\documentclass`/preamble, reorder front-matter, preserve content — OpenPrism-style one-click conversion through the normal round/apply diff so the user reviews the reformat.

### 9.2 Outline planner
- A "plan the paper" mode: the agent proposes a section outline (titles + 1-line intent) as a **comment/suggest channel** (see §10), the user approves, then it scaffolds `sections/*.tex` + `\input{}` in `main.tex` via one cross-file round (now possible with §3.3 new-file support). This is the natural home for the "cross-file single round" backlog item.

---

## 10. Non-destructive comment/suggest channel (ADD; biggest UX gap vs Canvas/Copilot)

All of Canvas (`canmore.comment_textdoc`), Copilot, and Claude-for-Word have a **suggest channel separate from the mutate channel**. Prism only has mutate (edit cwd). Add an anchored, non-mutating suggestion mode: the agent emits suggestions tied to spans (e.g., a `prism_suggestions` channel or `% PRISM_SUGGEST` anchors) that render as review comments the user can accept-into-an-edit or dismiss — without changing the LaTeX. This powers "review my draft," the outline planner's approval step, and the cross-file consistency report from `prism-validation`. Build on the existing WS frame stream; no DB schema needed if suggestions live in the agent turn.

---

## 11. Cross-file single round (backlog item, now unblocked)

The agent *already* can read/edit multiple files in one cwd round (no per-file gate at the agent level). What was missing is (a) new-file persistence (§3.3), (b) a multi-file review UI (§3.2), (c) cross-file validation (`prism-validation` skill, §2). With those three, "edit intro + add `\cite` + append to references.bib + fix a `\ref` across `methods.tex`" lands as one reviewable round — the Claude-for-Word per-anchor flow Prism's cite feature wants.

---

## 12. Mapping every proposal to existing primitives

| Proposal | Existing primitive(s) touched |
|---|---|
| Self-model prefix | `edit.go agentNativeProtocol`, `agentbridge ws.go buildInjectionPrefix`, `spec.go Picker` |
| Skill anti-patterns + validation | `prism-skills/*/SKILL.md`, `--add-dir /prism-add` (spec.go:113) |
| Per-hunk accept | `LatexDiffEditor.tsx` (un-gate `displayOnly`), `usePrismChat.ts`, `ApplyRound` (accept edited bodies) |
| Multi-file surface | `PendingRound`/`PendingFile` (ws_round.go), `usePrismChat finalizeRound`, new file-list component |
| New-file + asset persistence | `workspace.go collectWorkspaceChanges/materializeProject`, `repository.go BatchAppendCurrentVersions`, `File.MinioObjectKey` |
| Figures/data via Bash | `spec.go prismDisallowedTools`, `agent/Dockerfile`, new `prism-figures` skill, claw raw-byte read |
| Compile-fix loop | `compile_error.go extractCompileError`, `service.go runCompile`, `fixCompile` (PrismWorkspace), `preUserMessageChain` quota |
| PDF download polish | `handler.go GetPDF` (`?download=1`), `downloadPdf()` |
| Project zip / docx / bib export | new `ExportProject`/`ExportDocx` handlers, `gatherCurrent`, MinIO, pandoc (agent container), claw `out/` pattern |
| Stale-base | `errors.go ErrStaleBase`, `BatchAppendCurrentVersions`, `ApplyRound` |
| Venue templates | `Project.VenueTemplateKey` (model.go), `scaffoldMainTex` → registry, reformat skill |
| Outline planner + suggest channel | new mode over `agentbridge.HandleWS` stream, §3.3 new-file round |

## 13. Security — invariants that must survive every change

- `prism_tex`: stays `network_mode: none`, `read_only`, `cap_drop: ALL`, shell-escape triple-locked off, python-free. Figures are pre-rendered in the agent sandbox; the compile sandbox only runs latexmk on files. **No exceptions.**
- Agent container: Bash enabled (=claw parity) relies on container isolation (egress-only `scholar-agent-net` internal + `egress-proxy`, cap_drop, pids/mem caps), **not** on `pathWithin`. Keep `Task`/`Agent`/`NotebookEdit` denied (they bypass the permission broker).
- `pathWithin` fence stays for file tools; new file/asset harvest validates `safeRel` and allowed kinds before persisting; exports validate basenames (claw `artifactRelPath` pattern), strip secrets, raster-only images + nosniff.
- ws-ticket-only WS auth, per-project ownership check (GetProject) on every endpoint — unchanged.

---

## Phased Plan

### Phase 1: Phase 1 — Self-model + skill sharpening (lowest risk, highest leverage)

Rewrite agentNativeProtocol with accurate situation/delivery/generation/scope facts. Lift the web-delivery self-model into a shared Layer-3 prefix in agentbridge. Add anti-patterns + self-check sections to the three prism skills; add a prism-validation skill. No behavior change to the round machinery; pure prompt/skill work. Verify with a few rounds that scope discipline and validation invocation improve.

**Files touched:**
- `backend/internal/prism/edit.go`
- `backend/internal/agentbridge/ws.go`
- `agent/data/claude/prism-skills/prism-latex-format/SKILL.md`
- `agent/data/claude/prism-skills/prism-academic-writing/SKILL.md`
- `agent/data/claude/prism-skills/prism-discipline-conventions/SKILL.md`
- `agent/data/claude/prism-skills/prism-validation/SKILL.md (new)`

### Phase 2: Phase 2 — Unlock latent UX: per-hunk + multi-file review + compile-fix loop

Un-gate displayOnly on the awaiting_apply diff and wire onChange→apply edited bodies; change ApplyRound to accept frontend-posted per-file bodies (fallback to cwd read-back). Replace files[0] pick with a multi-file changeset list (net +/-, file switch, apply/reject all). Implement RunCompileFixLoop (2-3 iters, same-error guard, quota-metered) and a build-status panel. Add ?download=1 to GetPDF.

**Files touched:**
- `frontend-user/src/features/prism/components/LatexDiffEditor.tsx`
- `frontend-user/src/features/prism/components/PrismWorkspace.tsx`
- `frontend-user/src/features/prism/hooks/usePrismChat.ts`
- `frontend-user/src/features/prism/api/prism.ts`
- `backend/internal/prism/ws_round.go`
- `backend/internal/prism/handler_ws.go`
- `backend/internal/prism/handler.go`
- `backend/internal/prism/service.go`

### Phase 3: Phase 3 — Generation: new files, figures/data via sandboxed Bash, asset round-trips

Remove Bash from prismDisallowedTools; add matplotlib/numpy/pandas to agent Dockerfile; add prism-figures skill (savefig→PDF→includegraphics, forbid pythontex/minted). Extend collectWorkspaceChanges to detect agent-created text files (fileID=0) and harvest figures/*.pdf|png to MinIO as KindAsset; create rows in the apply transaction. Make materializeProject/gatherCurrent round-trip assets into cwd and compile job dirs. Add delivery metrics (new_file_count, fallback). Implement ErrStaleBase check before apply.

**Files touched:**
- `backend/internal/prism/spec.go`
- `agent/Dockerfile`
- `agent/data/claude/prism-skills/prism-figures/SKILL.md (new)`
- `backend/internal/prism/workspace.go`
- `backend/internal/prism/repository.go`
- `backend/internal/prism/service.go`
- `backend/internal/prism/model.go`
- `backend/internal/prism/errors.go`
- `backend/internal/prism/ws_round.go`

### Phase 4: Phase 4 — Deliverables: zip/docx/bib export + DOI import + reference checker

Add ExportProject (Go archive/zip from DB source of truth: sources + assets + latest PDF; Overleaf-importable). Add ExportDocx (dedicated agent-container pandoc step, --bibliography/--resource-path). Export references.bib; extend cite.go with DOI/arXiv→BibTeX resolution and a reference checker. New routes + frontend buttons (export menu).

**Files touched:**
- `backend/internal/prism/export.go (new)`
- `backend/internal/prism/cite.go`
- `backend/internal/prism/handler.go`
- `backend/cmd/server/routes_user.go`
- `frontend-user/src/features/prism/components/PrismWorkspace.tsx`
- `frontend-user/src/features/prism/api/prism.ts`

### Phase 5: Phase 5 — comingSoon: venue templates, outline planner, suggest channel

Build a venue template registry (replace scaffoldMainTex), selection at project creation storing VenueTemplateKey; add a reformat-to-venue skill. Implement a non-destructive comment/suggest channel over the WS stream. Build the outline planner mode (propose outline → user approves via suggest channel → scaffold sections/*.tex + \input via one cross-file round, using Phase 3 new-file support).

**Files touched:**
- `backend/internal/prism/service.go`
- `backend/internal/prism/templates.go (new)`
- `backend/internal/prism/handler.go`
- `agent/data/claude/prism-skills/prism-venue/SKILL.md (new)`
- `frontend-user/src/features/prism/components/PrismHome.tsx`
- `frontend-user/src/features/prism/components/PrismChatPanel.tsx`
- `backend/internal/agentbridge/ws.go`


## Open Questions

- Enabling Bash in Prism (§5) brings it to claw's tool surface in the same container. We accept it because isolation is identical (egress-only, cap_drop), but: do we want a feature flag to roll figures generation out gradually, and should the figures skill be the only path that nudges Bash use so the agent doesn't reach for shell on plain text edits?
- Per-hunk apply (§3.1) means ApplyRound persists frontend-posted bodies instead of re-reading cwd. Is the security/consistency tradeoff acceptable (frontend becomes the authority for the accepted text), or do we need the backend to re-validate the posted body is a subset/merge of cwd vs DB to prevent a malicious client persisting arbitrary content? (Note ownership is already checked; this is about content integrity.)
- docx export fidelity: pandoc gets ~90%; equations/TikZ degrade. Do we ship it with an explicit 'best-effort, touch up in Word' disclaimer (cheap, high value) or invest in a better equation path (OMML) before launch?
- New-file harvest scope (§3.3): should agent-created files auto-persist on apply (treated like edits), or require an explicit per-file opt-in in the multi-file review UI? Auto-persist is simpler but risks the agent over-creating scratch files; per-file opt-in is safer but more friction.
- Asset round-tripping (§5.4): figures live in MinIO as KindAsset but must re-materialize into both the next round's agent cwd and the compile job dir. What's the size/count cap per project, and do we need a cleanup policy for orphaned figure versions in the version chain?
- Compile-fix loop (§6): what's the right iteration cap and quota cost model — does each fix iteration consume a full VIP edit credit, or should the loop count as one metered action with a token ceiling? Burning quota silently is the failure mode to avoid.
- Outline planner / suggest channel (§10): build suggestions as ephemeral agent-turn content (no schema) or as a persisted prism_suggestions table? Ephemeral is cheaper but loses suggestions on reload; persisted enables 'review later' but adds a table + lifecycle.
- Should the shared Layer-3 self-model prefix (§2) be opt-in per feature (a spec flag) or applied to all agentbridge features unconditionally? Smart-search/claw already have their own delivery prompts; double-stating the self-model could be redundant or could conflict — needs a quick prompt-diff review per feature before rollout.
