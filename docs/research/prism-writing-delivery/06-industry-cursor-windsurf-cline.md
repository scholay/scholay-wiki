# Change-Delivery UX in Agentic Code/Doc Editors: What Prism's Round/Apply Model Should Adopt

> **Category:** industry

## Summary

Across Cursor, Windsurf/Cascade, Cline/Roo, Zed AI, and GitHub Copilot, the dominant change-delivery pattern is a clear two-stage split: a frontier "planning" model decides WHAT to change and emits a compact edit representation (search/replace blocks or "lazy" snippets with `// ... existing code ...` markers), while a separate fast "apply" model or deterministic merger turns that into the final file. The review UX has converged on a small vocabulary — a multi-file change list, per-file and per-hunk Keep/Undo (accept/reject), inline red/green diffs with arrow navigation, an all-files accept/undo, and a checkpoint per agent turn that can roll back files and/or conversation independently. The single most contested decision is whether edits land on disk before acceptance: Cursor historically staged in-memory (its prized advantage), Windsurf/Cline write to disk and rely on a shadow-git checkpoint as the safety net. Per-hunk acceptance is universally demanded — users repeatedly say the agent gets 90% right and they need to reject the 1-2 wrong hunks without discarding the rest. For Prism, the highest-leverage adoptions are: true per-hunk accept/reject within a round (not just per-file), checkpoints decoupling file-rollback from conversation-rollback, an explicit multi-file round summary, and preserving the inline-edit (Cmd-K) vs agent-round duality. Prism's existing "agent emits patch, doesn't write to disk, watcher sandbox" already matches the staged-not-on-disk camp, which is the safer design these tools are converging back toward.

---

## Scope

Prism delivers AI changes to a LaTeX project as **rounds** (a conversational turn that produces edits) and **applies** them to a DB-backed document tree, with the agent emitting patches that are NOT written to disk directly (a `scholar_prism_tex` watcher sandbox materializes files; see MEMORY `scholay-prism-plan`). That is exactly the "agentic editor change-delivery" problem. This report maps how the mature players solve it and what Prism should adopt.

The recurring architecture everywhere is a **two-stage pipeline**:

```
┌────────────────────┐   compact edit repr    ┌──────────────────┐   final file
│ PLANNING (frontier)│ ─────────────────────▶ │ APPLY (fast/det.)│ ───────────▶ review UX
│ decides WHAT        │  search/replace OR     │ merges into file │   diff + accept/reject
│ to change           │  "lazy" snippet OR udiff│                  │   + checkpoint
└────────────────────┘                        └──────────────────┘
```

---

## 1. How agents propose multi-file changes (the edit representation)

There are four edit representations in production. The choice drives speed, accuracy, and what the review UX can show.

| Representation | Who uses it | How it works | Tradeoff |
|---|---|---|---|
| **Full-file rewrite** | Cursor *apply* model; Aider `whole` | Model outputs the entire file with edits applied | Most accurate (model has seen full files in pretraining; no line-number math), but slow/costly per edit. Cursor explicitly chose this for the apply stage and made it fast with speculative decoding. ([cursor.com/blog/instant-apply](https://cursor.com/blog/instant-apply)) |
| **Search/replace blocks** | Cursor (when diffing), Aider `diff`, Roo `apply_diff` | `SEARCH ... REPLACE ...` block; matched against file (Roo uses fuzzy Levenshtein match + `:start_line:` hint, 0.8–1.0 confidence) | Avoids line-number problem; brittle on repeated/shifted context. ([aider edit-formats](https://aider.chat/docs/more/edit-formats.html), [Roo apply_diff](https://docs.roocode.com/features/tools/apply-diff)) |
| **Unified diff (simplified)** | Aider `udiff` | Modified unified-diff format, no line numbers | Aider found this cut "laziness" 3X and raised GPT-4 Turbo from 20%→61% on their benchmark. ([aider unified-diffs](https://aider.chat/docs/unified-diffs.html)) |
| **"Lazy" edit snippet** | Morph Fast Apply, OpenCode/Cursor-style | Frontier model emits ONLY changed lines with `// ... existing code ...` markers; a separate apply model merges it | Cheapest planning tokens; merge accuracy pushed onto the apply model (~98%). ([morphllm.com/fast-apply-model](https://www.morphllm.com/fast-apply-model)) |

**Multi-file orchestration** is a working-set + per-file diff list:
- **Cursor Composer / Agent**: edits span multiple files, reviewed file by file. ([skywork review](https://skywork.ai/blog/cursor-ai-review-2025-agent-refactors-privacy/))
- **Windsurf Cascade**: edits multiple files in one run, "shows its intended file list and high-level steps before touching anything," stages edits as a reviewable diff with per-step approval. ([deployhq Windsurf guide](https://www.deployhq.com/guides/windsurf))
- **GitHub Copilot Edits**: explicit "working set" — you add files to indicate scope; a "files changed bar appears above the chat input" listing all modified files. ([VS Code reviewing agent changes](https://code.visualstudio.com/learn/foundations/reviewing-and-controlling-agent-changes), [Copilot Edits Oct 2024](https://github.blog/changelog/2024-10-29-multi-file-editing-code-review-custom-instructions-and-more-for-github-copilot-in-vs-code-october-release-v0-22/))
- **Roo**: `apply_patch` applies unified-diff patches across multiple files in one operation (add/delete/update headers) for multi-file refactors. ([Roo apply_patch](https://roocodeinc.github.io/Roo-Code/advanced-usage/available-tools/apply-patch/))

---

## 2. Apply / accept / reject / per-hunk UX

The review vocabulary has **converged** to a 3-level granularity hierarchy, present in nearly every tool:

```
┌─ ALL FILES ─────────────────────────────┐   Keep all  /  Undo All
│  ┌─ PER FILE ──────────────────────────┐ │   Keep file /  Undo file
│  │  ┌─ PER HUNK / CHUNK ─────────────┐ │ │   Keep hunk /  Undo hunk   ← the critical one
│  │  │  - red (removed) / green (added)│ │ │   (arrow-nav between hunks)
│  │  └────────────────────────────────┘ │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

- **GitHub Copilot Edits** is the cleanest reference: "accept or undo changes at different levels of granularity: across all files at once… per file… or per individual diff chunk by using the inline controls." Shortcuts: **Tab** accept, **Alt+Delete** reject, **F8** next proposal. A "change summary view" aggregates all changes in one tab. ([Copilot Edits in VS](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-edits))
- **VS Code agent mode**: "Keep and Undo controls on each individual edit" → accept 9 correct, reject 1 wrong; top-level **Keep** / **Undo All**; "nothing is permanent until you explicitly accept." ([VS Code docs](https://code.visualstudio.com/learn/foundations/reviewing-and-controlling-agent-changes))
- **Cline**: inline diff per file (red/green), "Keep and Undo controls on each individual edit," arrow navigation between edits. ([Cline guide](https://www.deployhq.com/guides/cline))
- **Zed**: "accept or reject each individual change hunk, or the whole set" — in a multibuffer review pane AND (with `agent.single_file_review: true`) inline in each file with the same per-hunk controls. ([Zed Agent Panel](https://zed.dev/docs/ai/agent-panel))
- **Windsurf**: per-change accept/reject buttons on individual changes plus a whole-file Accept/Reject. ([deployhq Windsurf](https://www.deployhq.com/guides/windsurf))

**Per-hunk is non-negotiable to users.** A widely-upvoted Cursor forum thread captures the exact pain when Cursor moved to session-level bulk review: *"There are so many times when the agent does 90% of the code correct but 1 or 2 changes are wrong and need to be rejected,"* and *"I could review this feature's edits, accept what I wanted, and reject what I didn't — file by file, chunk by chunk."* They call per-hunk staging Cursor's "best UX advantage." ([Cursor forum: bring back per-change Apply](https://forum.cursor.com/t/bring-back-per-change-apply-inline-diff-review-you-re-throwing-away-your-best-ux-advantage/160856))

### The disk-vs-staged decision (the big fork)

- **Staged-in-memory (accept-then-write)**: Cursor's historical Composer — diffs shown, "these changes have already been made" is NOT true; you accept before disk. Users prize this. ([Cursor forum](https://forum.cursor.com/t/bring-back-per-change-apply-inline-diff-review-you-re-throwing-away-your-best-ux-advantage/160856))
- **Write-to-disk-then-review (revert on reject)**: Windsurf "writes to disk immediately… there is no 'accept all' diff review like Cursor's Composer… rejecting essentially reverts them using Git as your safety net." Cline writes then relies on shadow-git checkpoints. ([deployhq Windsurf](https://www.deployhq.com/guides/windsurf), [Cline checkpoints](https://docs.cline.bot/core-workflows/checkpoints))

*(Inference)* Prism's design — agent emits a patch, backend DB is the source of truth, files are NOT written to disk directly (watcher sandbox materializes) — is structurally the **staged** camp, which is the safer model users keep asking these tools to return to. Prism should lean into that advantage, not abandon it.

---

## 3. Diff presentation: inline vs side-by-side

- **Inline (red/green, in the actual editor)** is the default and preferred mode for review-in-flow: Cline, VS Code/Copilot, Cursor Cmd-K, Zed (`single_file_review`). Removals red, additions green, arrow-nav between edits. ([VS Code docs](https://code.visualstudio.com/learn/foundations/reviewing-and-controlling-agent-changes), [Cline](https://www.deployhq.com/guides/cline))
- **Aggregated review pane / multibuffer** for the multi-file overview: Copilot "change summary view," Zed's **editable** unified-diff multibuffer (`shift-ctrl-r` to open). Zed's pane being *editable* is notable — you can hand-tweak before accepting. ([Zed Agent Panel](https://zed.dev/docs/ai/agent-panel), [Copilot Edits](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-edits))

Pattern: **inline for per-hunk decisions, an aggregate pane for the multi-file mental model.** Both, not either.

---

## 4. Checkpoints / undo / rollback

This is the safety substrate that makes autonomous (auto-approve) operation tolerable.

- **Cline** is the reference implementation: a **shadow Git repo** separate from your project's real history; after each tool op Cline commits file state there; captures untracked files too. **Three restore modes** — Restore Files (revert files, keep conversation), Restore Task Only (delete messages after this point, files untouched), Restore Files & Task (full reset). Crucially decouples **file state from conversation state**. "Checkpoints make auto-approve practical." ([Cline checkpoints docs](https://docs.cline.bot/core-workflows/checkpoints))
- **VS Code/Copilot**: "Every agent response in the chat is a checkpoint"; hover → **Restore Checkpoint** rolls workspace back; **Fork** creates a new independent session from a checkpoint (parallel exploration); mid-run steering via **Steer with Message** / **Stop and Send**. ([VS Code docs](https://code.visualstudio.com/learn/foundations/reviewing-and-controlling-agent-changes))
- **Cursor**: checkpoint marked at every AI iteration in Composer; revert to a previous checkpoint undoes back to an earlier state — "automatic backup at each AI edit step." ([skywork](https://skywork.ai/blog/cursor-ai-review-2025-agent-refactors-privacy/))

Takeaway: **checkpoint = one per agent round**, and the rollback dimension (files vs conversation) must be **separable**.

---

## 5. How the agent is told a human will review

Less documented publicly (much is in leaked/reverse-engineered prompts), but the mechanisms are clear:

- **Permission/approval gating as the signal**: tools are configured `allow / deny / confirm` (Zed Tool Permissions + Agent Profiles per thread; Cline Plan vs Act + granular auto-approve incl. blocking edits outside the workspace). The agent "knows" because edit/destructive tools require confirmation rather than auto-executing. ([Zed Agent Panel](https://zed.dev/docs/ai/agent-panel), [Cline](https://www.deployhq.com/guides/cline)) — *In Prism terms this maps to the existing `agentbridge` `permission_request` auto-approve hook (MEMORY `agent-isolation-over-amputation`).*
- **Prompt phrasing**: "a prompt that tells the model to 'always explain before editing' produces a different experience than 'edit files directly without asking'." System prompts explicitly frame edits as proposals. ([VS Code reviewing](https://code.visualstudio.com/learn/foundations/reviewing-and-controlling-agent-changes), [Augment leaked prompts](https://www.augmentcode.com/learn/leaked-system-prompts-ai-coding-tools)) *(Inference: the tool's edit verb being "propose"/"str_replace" rather than "write to disk" itself conveys reviewability.)*
- **Agent self-review before handing to human** (the autonomous extreme): **GitHub Copilot coding agent** "reviews its own changes using Copilot code review before it opens the pull request… so by the time you're tagged, someone already went through it," and only acts on `@copilot` mentions from write-access users. This is the **PR-as-review-surface** model — the human reviews a diff/PR, not in-IDE hunks. ([github.blog coding agent](https://github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/), [docs: reviewing a Copilot PR](https://docs.github.com/copilot/how-tos/agents/copilot-coding-agent/reviewing-a-pull-request-created-by-copilot))

---

## 6. "Fast apply" / speculative edits models (the apply stage)

The single biggest perf lesson, and directly relevant to Prism's "agent outputs patch, something merges it."

- **Cursor Fast Apply**: planning (frontier model) is separated from applying ("should be straightforward and *instant*"). The apply model is a **fine-tuned Llama-3-70B doing full-file rewrites** at **~1000 tok/s (~13x over vanilla)** using **speculative edits** — a deterministic variant of speculative decoding where "the file you're editing is the draft," so unchanged chunks are accepted in bulk without a draft model. They deliberately rejected diffs (token efficiency, pretraining distribution favoring full files, line-number precision); where diffs are needed they use **search/replace blocks** to dodge line numbers. ([cursor.com/blog/instant-apply](https://cursor.com/blog/instant-apply), [fireworks.ai/blog/cursor](https://fireworks.ai/blog/cursor))
- **Morph Fast Apply**: explicit two-model split. Frontier model emits a **lazy snippet** (`// ... existing code ...` markers; omitting a marker = delete that section); a purpose-built **7B merge model** applies it at **~10,500 tok/s, ~98% accuracy, ~700–1,400 tokens/edit (~5x cheaper than full rewrite)**, 262K context, custom CUDA + speculative decoding. API is XML: `<instruction>`, `<code>` (full original), `<update>` (lazy snippet). One tool: `edit_file`. ([morphllm.com/fast-apply-model](https://www.morphllm.com/fast-apply-model))
- **Zed Edit Prediction (Zeta)** is the keystroke-level cousin: multi-line predictions on every keystroke, accept with alt-tab/tab. ([Zed edit prediction](https://zed.dev/docs/ai/edit-prediction))

The throughput chain: full-file-rewrite is most accurate but slow → speculative decoding makes full-file-rewrite fast (Cursor) → OR push the merge onto a tiny specialized model fed a lazy snippet (Morph). Both decouple "decide what" from "produce the bytes."

---

## 7. Inline (Cmd-K) vs Agent duality

Every tool keeps **two distinct interaction surfaces**, and users rely on both:
- **Inline/scoped** (Cursor Cmd-K, Zed inline, terminal Ctrl-K): select code → prompt → color-coded diff → Cmd+Enter accept. Fast, surgical, single-spot. ([Cursor Cmd-K](https://cursor101.com/tutorial/learn-cursor-cmdk), [Cursor terminal inline](https://docs.cursor.com/en/inline-edit/terminal))
- **Agent/Composer round** (multi-file, multi-step, checkpoints). Cursor's own framing: "Chat for exploration, Composer for creation, Cmd-K for quick fixes." ([newline](https://www.newline.co/@MaksymMitusov/next-level-cursor-cmdk-composer-and-agent-unpacked--326f7ed3))

Prism is a document/LaTeX IDE — the inline analog is "select a paragraph/equation → ask for a rewrite → inline diff in the editor," distinct from a full agent round that may touch the outline, multiple `.tex` files, and `\cite`s.

---

## What Prism should adopt (prioritized)

1. **True per-hunk accept/reject within a round, not just per-file.** This is the most-demanded feature and the one Cursor got burned for removing. Prism's round model already groups edits — expose Keep/Undo at hunk granularity with arrow-nav, plus per-file and an all-files Keep/Undo All. *(Maps cleanly onto a patch-of-hunks data model.)*
2. **Keep edits staged (not written to disk) until accepted.** Prism's DB-source-of-truth + watcher sandbox already does this; make it a first-class UX promise ("nothing is applied until you accept"), the safer side of the fork Cursor users are begging to return to.
3. **Checkpoint per round, with file-rollback decoupled from conversation-rollback** (Cline's 3-mode model). Prism already stores version + conversation history (MEMORY `scholay-prism-plan`) — wire restore modes: revert document only / truncate conversation only / both. This is what makes higher autonomy safe.
4. **Explicit multi-file round summary** (Copilot "change summary view" / Zed multibuffer): one surface listing every file the round touched with net +/- and collapse-per-file, alongside inline diffs in the editor. LaTeX projects are multi-file (chapters, preamble, bib) — the overview is necessary.
5. **Inline (Cmd-K-style) surgical edit as a separate path from agent rounds.** Select-and-rewrite a paragraph/equation with an immediate inline diff, distinct from conversational multi-file rounds.
6. **Adopt the lazy-snippet apply format for the agent's edit output** (Morph-style `% ... existing code ...` for LaTeX) merged by a deterministic/fast applier, OR search/replace blocks — NOT raw unified diffs with line numbers (every source warns line numbers are where models fail). This also yields cleaner hunks for the per-hunk UI.
7. **Tell the agent a human reviews via the tool contract + prompt**: keep the edit verb framed as "propose a patch" (it already doesn't write disk), gate via the existing `agentbridge` permission hook, and add a one-line system-prompt statement that edits are staged for human accept/reject. *(Inference, but consistent with how Cline/VS Code signal it.)*
8. *(Stretch)* **Agent self-review before surfacing** (Copilot coding-agent pattern): an optional pass where the agent critiques its own round before the human sees it — Prism already runs adversarial review loops in development (MEMORY `scholay-prism-plan`), so an in-product "self-check this round" is a natural extension.

## Key Patterns

### Two-stage planning/apply split (decide-what vs produce-bytes)
A frontier model decides what to change and emits a compact edit (search/replace or lazy snippet); a separate fast model or deterministic merger turns it into the final file. Universal across Cursor and Morph.

- **Agent awareness:** The agent's edit tool accepts only the compact edit representation (e.g., Morph edit_file with <update> lazy snippet); the apply stage is invisible to the planning model.
- **Source:** https://cursor.com/blog/instant-apply ; https://www.morphllm.com/fast-apply-model

### Three-level accept/reject granularity: all-files / per-file / per-hunk
Keep/Undo controls at chunk, file, and all-files level; inline red/green; arrow navigation between hunks. The per-hunk level is the one users insist on (90% right, reject the 1-2 wrong hunks).

- **Agent awareness:** Convention in the host editor UI; the agent emits discrete hunks that the UI renders as independently acceptable units.
- **Source:** https://learn.microsoft.com/en-us/visualstudio/ide/copilot-edits ; https://forum.cursor.com/t/bring-back-per-change-apply-inline-diff-review-you-re-throwing-away-your-best-ux-advantage/160856

### Staged-in-memory vs write-to-disk-then-revert
Cursor historically staged edits and wrote only on accept (its prized advantage); Windsurf/Cline write to disk immediately and rely on shadow-git checkpoints/Git to revert on reject.

- **Agent awareness:** Tool semantics: a propose/str_replace verb stages; a direct write verb hits disk. The agent infers reviewability from which it is given.
- **Source:** https://www.deployhq.com/guides/windsurf ; https://forum.cursor.com/t/bring-back-per-change-apply-inline-diff-review-you-re-throwing-away-your-best-ux-advantage/160856

### Checkpoint per agent turn with file/conversation decoupling
Cline shadow-git snapshot after each tool op; three restore modes (files only / task only / both). VS Code: every agent response is a checkpoint, plus Fork. Makes auto-approve safe.

- **Agent awareness:** Infrastructure-level, transparent to the agent; the host snapshots around each tool call.
- **Source:** https://docs.cline.bot/core-workflows/checkpoints ; https://code.visualstudio.com/learn/foundations/reviewing-and-controlling-agent-changes

### Avoid raw unified diffs with line numbers as the model output
Models fail at line-number precision; tools use search/replace blocks (Cursor, Roo, Aider diff), simplified line-number-free udiff (Aider), or lazy snippets with existing-code markers (Morph). Aider's udiff cut laziness 3X.

- **Agent awareness:** The edit tool's required format / system prompt examples constrain the output representation.
- **Source:** https://cursor.com/blog/instant-apply ; https://aider.chat/docs/unified-diffs.html ; https://www.morphllm.com/fast-apply-model

### Inline (Cmd-K) and agent-round are kept as distinct surfaces
Surgical select-and-edit with immediate inline diff (Cmd-K / Zed inline / terminal Ctrl-K) vs multi-file multi-step agent round with checkpoints. Cursor: 'Chat for exploration, Composer for creation, Cmd-K for quick fixes.'

- **Agent awareness:** Different entry points invoke different prompt/tool configurations; scope (selection vs working set) is passed in.
- **Source:** https://cursor101.com/tutorial/learn-cursor-cmdk ; https://zed.dev/docs/ai/edit-prediction

### Multi-file working set + change summary overview
Explicit working set declares editable files; a files-changed bar/summary view aggregates all touched files with net +/- and collapse-per-file, alongside inline diffs.

- **Agent awareness:** Working set is passed as context scope; the agent is told which files are in-scope before editing.
- **Source:** https://github.blog/changelog/2024-10-29-multi-file-editing-code-review-custom-instructions-and-more-for-github-copilot-in-vs-code-october-release-v0-22/ ; https://zed.dev/docs/ai/agent-panel

### Agent self-review before surfacing to human (PR model)
GitHub Copilot coding agent reviews its own diff with Copilot code review before opening the PR, iterates, then tags a human. Human reviews a PR/diff surface, not in-IDE hunks.

- **Agent awareness:** Explicit workflow step + the agent only acts on @copilot mentions from write-access users; framed as producing a reviewable PR.
- **Source:** https://github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/


## Relevance to Prism

Prism is an AI-native LaTeX IDE whose core loop is exactly the studied problem: an agent proposes edits in rounds, which are applied to a DB-backed document. The industry has converged on a delivery vocabulary Prism can adopt almost directly — three-level (all/file/hunk) accept-reject with inline red/green diffs and arrow-nav, a multi-file round summary, and per-round checkpoints that separately roll back document vs conversation. Prism's existing 'agent emits patch, never writes disk directly, watcher sandbox materializes' design already places it in the safer staged-not-on-disk camp that Cursor users are loudly asking to return to — so the highest-leverage move is to expose that as first-class per-hunk staged review rather than reinventing it. The fast-apply research (Cursor speculative edits, Morph lazy-snippet + 7B merge model) directly informs Prism's apply stage: use a compact edit representation (lazy snippet or search/replace, not line-numbered unified diffs) and decouple deciding-what from producing-bytes. The permission-gating + prompt-framing patterns map onto Prism's existing agentbridge permission_request hook for signaling the agent that edits are reviewed.

## Improvement Ideas

- Add per-hunk accept/reject (Keep/Undo) within a round, not just per-file — with keyboard arrow-nav between hunks and Tab/reject shortcuts; this is the single most-demanded feature (users: agent gets 90% right, need to reject 1-2 hunks).
- Make 'nothing applied until accepted' a first-class UX promise, leveraging Prism's already-staged (DB source-of-truth, no direct disk write) model — the safer side of the disk-vs-staged fork.
- Implement per-round checkpoints with Cline-style three restore modes: revert document only / truncate conversation only / both — building on Prism's existing version + conversation history storage.
- Add an explicit multi-file round summary surface (touched files, net +/-, collapse-per-file) alongside inline editor diffs, since LaTeX projects span chapters/preamble/bib.
- Keep a distinct inline 'Cmd-K' surgical-edit path (select paragraph/equation -> inline diff) separate from conversational multi-file agent rounds.
- Switch the agent's edit output to a lazy-snippet format ('% ... existing code ...' for LaTeX) or search/replace blocks merged by a deterministic/fast applier — avoid raw line-numbered unified diffs that models botch; this also produces cleaner discrete hunks for the per-hunk UI.
- Add a one-line system-prompt statement plus tool-verb framing ('propose a patch', staged for human accept/reject) so the agent explicitly knows a human reviews — reuse the agentbridge permission_request hook as the gating signal.
- Optionally add an agent self-review pass over its own round before surfacing to the user (Copilot coding-agent pattern), reusing Prism's existing adversarial review loop.
- Consider an editable diff/review pane (Zed multibuffer style) so users can hand-tweak a proposed hunk before accepting, instead of accept-or-reject-only.
- Evaluate a dedicated fast-apply path (Cursor speculative-edits or Morph-style small merge model) if apply latency on large .tex files becomes a bottleneck.

## Sources

- https://cursor.com/blog/instant-apply
- https://fireworks.ai/blog/cursor
- https://www.morphllm.com/fast-apply-model
- https://forum.cursor.com/t/bring-back-per-change-apply-inline-diff-review-you-re-throwing-away-your-best-ux-advantage/160856
- https://docs.cline.bot/core-workflows/checkpoints
- https://code.visualstudio.com/learn/foundations/reviewing-and-controlling-agent-changes
- https://learn.microsoft.com/en-us/visualstudio/ide/copilot-edits
- https://github.blog/changelog/2024-10-29-multi-file-editing-code-review-custom-instructions-and-more-for-github-copilot-in-vs-code-october-release-v0-22/
- https://github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/
- https://docs.github.com/copilot/how-tos/agents/copilot-coding-agent/reviewing-a-pull-request-created-by-copilot
- https://zed.dev/docs/ai/agent-panel
- https://zed.dev/docs/ai/edit-prediction
- https://www.deployhq.com/guides/windsurf
- https://www.deployhq.com/guides/cline
- https://docs.roocode.com/features/tools/apply-diff
- https://roocodeinc.github.io/Roo-Code/advanced-usage/available-tools/apply-patch/
- https://aider.chat/docs/more/edit-formats.html
- https://aider.chat/docs/unified-diffs.html
- https://cursor101.com/tutorial/learn-cursor-cmdk
- https://docs.cursor.com/en/inline-edit/terminal
- https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/text-editor-tool
- https://skywork.ai/blog/cursor-ai-review-2025-agent-refactors-privacy/
- https://www.augmentcode.com/learn/leaked-system-prompts-ai-coding-tools
