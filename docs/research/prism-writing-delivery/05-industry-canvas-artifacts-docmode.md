# How AI Document Editors Deliver Agent-Authored Prose (Canvas, Artifacts, Notion AI, Gemini Docs, Copilot Word) + What OpenAI Prism Actually Is

> **Category:** industry

## Summary

OpenAI Prism is a real, shipping product (launched Jan 28, 2026): a free, browser-based, LaTeX-native research workspace with GPT-5.2 built in, evolved from OpenAI's acquisition of the Crixet LaTeX platform. The Scholay "智能写作" feature is therefore cloning a concrete competitor, not a hypothetical one. Prism's editing model is human-in-the-loop and document-centric: the model works inside the project context (structure, equations, refs), proposes changes that the user accepts via Keep/Undo per suggestion, with optional track-change-style visual diffs. Across the broader field, two delivery archetypes dominate: (1) regex/string-replacement edit operations against a live document (OpenAI Canvas's leaked `canmore` tool, Claude Artifacts' create/update/rewrite ops) where the model emits targeted patches and the host renders versions; and (2) native track-changes/suggestion-mode redlines (Microsoft Copilot in Word, Claude for Word, Notion suggested edits) where every AI edit lands as an accept/reject revision anchored to specific text. The single most adoptable artifact for Prism is Canvas's `canmore` system-prompt contract — explicit, quotable rules for when to create vs edit, and when to do a targeted patch vs a full rewrite.

---

## 0. Scope & method

Researched via web search + fetch (OpenAI's own domains 403 WebFetch, so primary claims are corroborated through InfoQ, The Decoder, Engadget, HKUST Library, thesisai, plus leaked-system-prompt mirrors on GitHub). Inferences are explicitly marked **[INFERENCE]**. The local "Prism" project here (Scholay 智能写作) is a *clone target*; "OpenAI Prism" below always means the real OpenAI product.

---

## 1. Is "OpenAI Prism" real? — YES, and it's the exact thing being cloned

**Confirmed real and shipping.** OpenAI Prism launched **January 28, 2026** as a *free, cloud-based, LaTeX-native workspace for scientists* with **GPT-5.2** integrated directly into the authoring environment. Anyone with a ChatGPT account can use it; no subscriptions or seat limits; unlimited collaborators (more powerful AI features gated to paid plans over time).

Key facts:
- **Built on Crixet.** "Prism builds on the foundation of Crixet, a cloud-based LaTeX platform that OpenAI acquired and has since evolved into Prism." So OpenAI did *not* build the LaTeX engine from scratch — they bought a LaTeX-native editor and bolted GPT-5.2 in. (the-decoder, remio, InfoQ)
- **Runs entirely in the browser**, "fully LaTeX-native," compiles without local tooling. (InfoQ)
- **Positioned as "a Claude Code-like app for scientific research"** by Engadget — i.e., an *agentic* tool that automates tedious workflow (bibliography writing, lit search) while "preserv[ing] accountability and keep[ing] researchers in control." (Engadget)
- URLs: `openai.com/prism/`, `prism.openai.com`, `openai.com/index/introducing-prism/`.

This directly validates the internal memory note (`scholay-prism-plan`): Scholay Prism = clone of OpenAI Prism, an AI-native LaTeX IDE. The architecture the team already locked (backend DB as source of truth, agent emits patches that don't touch disk, sandboxed tex watcher) is a *reasonable mirror* of how Prism behaves from the outside.

### How OpenAI Prism's AI editing works (the part most relevant to Scholay)

- **Document-centric, not chat-centric.** "Instead of switching to a separate chat interface, you can highlight text inside the document and ask the AI to perform specific actions" (make a paragraph more formal, expand an intro, strengthen a thesis). (thesisai review)
- **Model has project context.** "the model works within the project context, with access to document structure, equations, references, and prior revisions" and assists with "revising text, adjusting formatting, updating equations and tables, and locating relevant literature while preserving internal consistency." (InfoQ)
- **Human-in-the-loop apply.** "whenever it detects an issue and proposes a change, it will always ask you to confirm before applying — you can choose to **Keep** or **Undo** each suggestion." (HKUST Library)
- **Track-change-style diffs.** Per the thesisai review: "The AI then proposes edits directly in the document, which you can **accept or reject line by line**," with visual indicators highlighting "additions and deletions clearly." **[INFERENCE: reviewer terminology, not necessarily OpenAI's exact UI labels.]**
- **Citations:** built-in citation management + **Zotero sync** for reference discovery (InfoQ); agent can "add BibTeX entries to refs.bib and insert corresponding citations into paper.tex" (HKUST). Note: one reviewer stresses Prism "does not automatically manage references for you" beyond standard LaTeX bibliographies — so the automation is *assisted*, not magic.
- **Multimodal input:** upload images of equations/diagrams/whiteboard sketches → auto-converted to LaTeX (mixed accuracy in early hands-on tests — s-anand, HKUST).
- **Collaboration:** real-time multi-author co-editing, inline comments, discussion threads, granular edit/view permissions, unlimited collaborators. (InfoQ, HKUST)
- **Live PDF preview** alongside the editor so edits' effect on compiled output is immediate. (thesisai)

---

## 2. The two delivery archetypes (how agent prose actually reaches the user)

Every product surveyed falls into one (or a blend) of two patterns:

```
Archetype A — EDIT-OPERATIONS against a live doc        Archetype B — NATIVE TRACK-CHANGES / SUGGESTIONS
(model emits patches; host applies + versions)          (every AI edit = an accept/reject revision)
┌───────────────┐  emit ops   ┌──────────────┐         ┌───────────────┐ emit edits ┌──────────────────┐
│ model         │────────────▶│ host editor  │         │ model         │───────────▶│ doc in "suggest" │
│ (canmore /    │ pattern→repl│ applies,      │         │ (Copilot/     │  anchored  │  mode → red/green│
│  artifact ops)│  or ".*"    │ keeps versions│         │  Claude/Notion│  to spans  │  user ✔/✗ each   │
└───────────────┘             └──────────────┘         └───────────────┘            └──────────────────┘
   OpenAI Canvas, Claude Artifacts,                       MS Copilot in Word, Claude for Word,
   (OpenAI Prism = blend: ops under the hood,              Notion suggested edits
    track-change UX on top)
```

---

## 3. Per-product breakdown

### 3.1 OpenAI Canvas — the most quotable system-prompt contract (`canmore`)

Canvas opens a document pane beside the chat. The model is given a tool namespace **`canmore`** with **three functions** (this is the leaked/observed system prompt, widely mirrored):

1. **`create_textdoc`** — `{ name, type, content }`; `type` ∈ `document` (markdown) | `code/*` | `webview` (HTML).
2. **`update_textdoc`** — `{ updates: [{ pattern, multiple, replacement }] }`. **Patterns are Python regex** used with `re.finditer`; replacements via `re.Match.expand`.
3. **`comment_textdoc`** — `{ comments: [{ pattern, comment }] }`. Adds **non-destructive, anchored** suggestions without changing content; `pattern` via `re.search`.

**Verbatim-quality rules (from mirrors):**
- When to create: "Creating standalone, substantial content >10 lines"; "content that the user will take ownership of to share or re-use"; "a deliverable such as a report, essay, email, proposal, research paper, letter, article."
- When NOT to create: "Content is simple or short <10 lines"; "primarily informational, such as an explanation"; "mostly explanatory or illustrative, like a step by step guide"; "primarily conversational or dependent on the chat context."
- **Rewrite vs targeted edit:** "ALWAYS REWRITE CODE TEXTDOCS (type=\"code/*\") USING A SINGLE UPDATE WITH \".*\" FOR THE PATTERN." For `document` type: "default to rewriting the entire document unless the user has a request that changes only an isolated, specific, and small section that does not affect other parts."

**Writing shortcuts (UI):** *Suggest edits* (inline feedback w/ accept/reject), *Adjust the length* (shorter/longer), *Change reading level* (Kindergarten→Graduate), *Add final polish* (grammar/clarity/consistency). **Versioning:** "back button" restores previous versions. Users can also **directly edit** the doc.

**Known limitations (Medium technical writeup):** only the most-recent doc is editable; the model has *no visibility into user-made edits* (risk of overwriting); default behavior leans to full `.*` rewrites rather than true diffing.

### 3.2 Claude Artifacts — create / update / rewrite ops

Three operation modes: **`create`** (new artifact), **`update`** (targeted **string replacement**, each match must occur **exactly once**, whitespace-sensitive), **`rewrite`** (full regeneration for substantial change). Claude "intelligently chooses between targeted inline edits for small changes and full rewrites only when necessary." Around **Oct 23–24, 2025** an undocumented editor upgrade delivered **3–4× faster updates** via inline string replacement instead of full regeneration. (Hyperdev)
- **Versioning:** "Switch between different versions using the version selector"; editing a prior chat message branches a new artifact set. "Your edits won't change Claude's memory of the original content."
- **Accept/export:** "Changes appear directly in the artifact window"; "Copy content to your clipboard"; "Download files." (support.claude.com)

### 3.3 Microsoft Copilot in Word — native, word-level Track Changes (the gold standard for auditable accept/reject)

- **Draft with Copilot / Make changes:** highlight text → Copilot icon → *Make changes* / *Auto rewrite* → navigate variants with arrows → *Keep it* / *Discard*, or refine in the compose box. (Microsoft Support)
- **Native Track Changes (shipped to legal/finance, ~Apr 15, 2026):** "the ability to turn on Track Changes from Copilot itself, not just from Word manually." Edits are "visible by default, transparent, auditable, and granular." **Word-level granularity.** "Every Copilot edit lands directly in the working Word document as a tracked change, same as if a partner or associate had made the edit manually." Reviewers "review in the standard Word track-changes pane, accept, reject, or comment per change." (Windows Forum, Windows News)
- **Comment threads:** Copilot can "add, read, reply to, and manage comment threads anchored to the correct text."

### 3.4 Claude for Word (beta) — AI redlines anchored to comments

"When you flip it into suggested edits mode, every change Claude makes shows up as a **native Word tracked revision**" — deletions red, insertions green, accept/reject via Word's review pane. It "reads your heading styles, your numbering schemes, your defined terms, your cross-references" and, crucially, "reads each comment thread, understands what text the comment is anchored to, edits that specific passage as a tracked change, and replies to the comment thread explaining what it did." (smithstephen)

### 3.5 Notion AI + Suggested Edits

- **AI invocation:** highlight text → *Ask AI* / type `/AI`; built-in actions *Improve writing*, *Proofread*, *Explain*, *Reformat*, *Translate*, tone rewrite.
- **Accept AI output:** *Insert below*, *Accept*, *Replace*, or *Try again* / *Discard*.
- **Suggested Edits mode (collaboration):** `•••` → *Suggest edits* → header shows *Suggesting*; type to suggest additions, delete to suggest removals; needs *Can comment* access; owner hovers and accepts `✔️` / rejects `❌`, or replies. **Note:** Notion docs do *not* document AI auto-writing into suggestion mode — it's primarily a human-collaboration feature. **[INFERENCE: AI + suggestion-mode are currently separate surfaces.]**

### 3.6 Google Docs + Gemini ("Help me write")

- Entry: *Help me write* button (empty doc) or highlight → pencil icon.
- **Refine** menu: *Tone* (Formal/Casual), *Rephrase*, *Shorten*, *Elaborate*, *More formal*, *Custom* (own prompt).
- **Apply:** *Replace* (overwrite selection / accept), *Insert* (add below), *Close* (keep existing). Newer 2026 updates add "co-edit with Gemini." Largely a **replace-the-selection** model rather than persistent track-changes. (Google Docs Help, 9to5Google)

---

## 4. Comparison matrix

| Product | How model emits edits | Inline patch vs full rewrite | Suggestions / track-changes | Versioning | Accept mechanism | Export |
|---|---|---|---|---|---|---|
| **OpenAI Prism** | Agentic, project-context; proposes changes | Targeted, in-document; line-by-line | Yes — add/delete diff highlights; comments/threads | "prior revisions" accessible | **Keep / Undo** per suggestion | LaTeX-native, browser compile → PDF |
| **OpenAI Canvas** | `canmore` regex ops (`pattern`→`replacement`) | Both; **`.*` rewrite default**, targeted only if "isolated, specific, small" | `comment_textdoc` anchored, non-destructive | "back button" restore | Accept/reject inline suggestions | Copy / (code run) |
| **Claude Artifacts** | create / **update (exact string match)** / rewrite | Both; inline if unique match, else full | (no formal track-changes) | version selector; message-branch | implicit (window updates) | Copy / Download |
| **Copilot in Word** | Edits land as **native Track Changes** | Selection rewrite or doc-wide | **word-level** redlines + comment threads | Word doc history | **Accept/Reject per change** in review pane | Word doc |
| **Claude for Word** | Native Word tracked revisions | passage-level, comment-anchored | red/green redlines | Word history | accept/reject in review pane | Word doc |
| **Notion AI** | Block-level rewrite/insert | replace selection / insert below | separate human "Suggest edits" (✔️/❌) | page history | Accept / Replace / Insert | export page |
| **Gemini Docs** | Replace-selection generation | replace selection | (none persistent) | Docs version history | Replace / Insert / Close | Docs export |

---

## 5. System-prompt conventions worth quoting (public)

The richest publicly-mirrored contract is Canvas's `canmore`. The transferable conventions:
1. **Gate document creation behind intent** ("ONLY use if you are 100% SURE the user wants to iterate on a long document … or explicitly ask for canvas"; the >10-lines / deliverable / take-ownership heuristics).
2. **Bias to whole-doc rewrite for code, targeted edits only for prose** ("isolated, specific, and small section that does not affect other parts").
3. **Separate a non-destructive comment channel** (`comment_textdoc`: "Each comment should be a specific and actionable suggestion") from the mutating channel — so the agent can *suggest* without *applying*.
4. **Anchor edits/comments to text spans** (regex in Canvas; comment-thread anchoring in Copilot/Claude-for-Word) rather than positional offsets.

---

## 6. What's adoptable for Scholay Prism (the local feature)

Given the locked architecture (backend DB = source of truth, agent emits patches that don't touch disk, sandboxed tex watcher), the field validates and extends current choices:

1. **Adopt a `canmore`-style tool contract in the agent's system prompt.** Make the create-vs-edit and targeted-patch-vs-full-rewrite decisions *explicit rules*, not implicit model behavior. Scholay already does "AI出patch不落盘" — formalize the patch op schema (anchored find/replace + a `rewrite-whole-file` escape hatch) and the decision rules verbatim-style.
2. **Add a non-destructive "comment/suggest" channel** distinct from the apply channel (Canvas `comment_textdoc`, Copilot/Claude comment-thread replies). This is currently the biggest UX gap vs. Prism/Copilot: an agent that can leave anchored suggestions the user reviews without mutating the doc.
3. **Keep/Undo per change = the Prism contract; match it.** Memory already notes inline-diff acceptance exists; ensure it's *per-hunk* accept/reject (Copilot's word-level granularity is the bar), not all-or-nothing.
4. **Anchor edits to content (regex/string match), not byte offsets** — survives concurrent edits and matches how Canvas/Claude/Copilot all do it. Note Canvas's *exactly-once-match* requirement (Claude Artifacts) as a guardrail to avoid ambiguous patches.
5. **Cross-file one-shot patch + comment-anchored edits** (Claude-for-Word reads comment threads, edits the anchored passage, replies). For a LaTeX project (paper.tex + refs.bib + sections), this maps directly to the "跨文件一轮patch" item already on Scholay's backlog.
6. **Track-change visual diff (add green / delete red)** is now table-stakes — present in Prism, Copilot, Claude-for-Word. Confirm the inline-diff renderer covers deletions, not just insertions.
7. **The model must not assume it's the only editor.** Canvas's documented failure (no visibility into user edits → overwrites) argues for re-reading current doc state from the DB source-of-truth before each patch and rejecting stale-anchor patches.

---

## 7. Notable risks / gotchas from the field
- Canvas's `.*`-rewrite default is *cheap to implement but expensive in tokens and destroys user concurrent edits* — Scholay should prefer real diffing, which Claude's Oct-2025 inline-replacement upgrade showed yields 3–4× speedups.
- Image→LaTeX is *unreliable* in real Prism today (multiple reviewers flagged errors) — set expectations / keep human-in-loop.
- Notion shows AI-writing and suggestion-mode are still *separate surfaces* industry-wide; unifying "agent edits arrive as reviewable suggestions" is still differentiating.

## Key Patterns

### regex/string-replacement edit operations (find pattern → replacement), with a full-rewrite escape hatch
OpenAI Canvas's `canmore.update_textdoc` takes `{pattern, multiple, replacement}` Python-regex ops; Claude Artifacts' `update` does exact-once string replacement, `rewrite` for big changes. The model emits patches; the host applies and versions.

- **Agent awareness:** Agent system prompt defines the tool namespace + schema + explicit rules (when to use create vs update, when to rewrite with '.*' vs targeted edit).
- **Source:** https://github.com/edoardoavenia/chatgpt-system-prompts/blob/main/canmore.md

### Explicit create-vs-edit and rewrite-vs-targeted decision rules in the system prompt
canmore: create only for standalone >10-line deliverables the user owns; for code ALWAYS rewrite with '.*'; for documents rewrite-whole unless change is 'isolated, specific, and small'.

- **Agent awareness:** Verbatim natural-language imperatives in the agent system prompt (some ALL-CAPS).
- **Source:** https://baoyu.io/blog/prompt/full-prompt-chatgpt-4o-with-canvas

### Non-destructive anchored comment/suggest channel separate from the mutating edit channel
canmore.comment_textdoc adds actionable, pattern-anchored comments without changing content; Copilot/Claude-for-Word reply to comment threads anchored to specific spans.

- **Agent awareness:** Separate tool function in the system prompt; model chooses comment vs update based on whether user implied direct update.
- **Source:** https://gist.github.com/dg/72bc9f585a068d2e9c4edc5ae4c6d9ee

### Native track-changes: every AI edit becomes an accept/reject revision at word-level granularity
Microsoft Copilot in Word lands edits as native tracked changes (visible/auditable/granular), reviewed in the standard track-changes pane accept/reject per change; Claude for Word renders red deletions/green insertions.

- **Agent awareness:** Host integration converts model output into Word revision objects; comment-thread anchoring tells the model which passage to edit.
- **Source:** https://windowsforum.com/threads/copilot-in-word-gets-word-level-track-changes-comments-and-better-structure.413242/

### Human-in-the-loop Keep/Undo per suggestion (document-centric, highlight-to-edit)
OpenAI Prism: highlight text in-document, ask for an action; the model proposes a change and always asks to confirm — Keep or Undo each suggestion, accept/reject line-by-line with add/delete highlights.

- **Agent awareness:** Product UX contract; model operates within project context (structure, equations, refs, prior revisions).
- **Source:** https://library.hkust.edu.hk/news-events/news/prism-new-ai-latex-editor-academic-writing

### Versioning via host-managed version selector / restore, independent of model memory
Canvas 'back button' restores prior versions; Claude Artifacts 'version selector' + message-branching; user edits don't alter the model's memory of original content.

- **Agent awareness:** Host feature, not model-driven; the model receives a textdoc_id to reference the current doc.
- **Source:** https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them


## Relevance to Prism

Scholay's 智能写作 is explicitly cloning OpenAI Prism, which this research confirms is a real shipping product (free LaTeX-native browser workspace, GPT-5.2, built on the acquired Crixet platform, positioned as 'Claude Code for science'). That validates the team's locked architecture (DB source-of-truth, agent emits patches not touching disk, sandboxed tex watcher). The agent-native delivery lens points to four concrete adoptions: (1) formalize a canmore-style tool contract in the agent system prompt with explicit create-vs-edit and targeted-patch-vs-full-rewrite rules (the single most quotable public artifact); (2) add a non-destructive anchored comment/suggest channel distinct from the apply channel — the biggest UX gap vs Prism/Copilot; (3) make accept/reject per-hunk at fine granularity matching Copilot's word-level bar and Prism's Keep/Undo-per-suggestion; (4) anchor edits to content via string/regex match (exactly-once guard) rather than byte offsets, and re-read current doc state before patching to avoid Canvas's documented overwrite-on-stale-state failure.

## Improvement Ideas

- Encode a `canmore`-style tool contract in the Scholay agent system prompt: explicit schema for an anchored find/replace patch op plus a whole-file rewrite escape hatch, and verbatim decision rules (when to create a doc, when to targeted-edit vs full-rewrite) modeled on Canvas's '.*'-default-but-targeted-for-isolated-changes rule.
- Add a non-destructive 'suggest/comment' agent channel separate from the apply channel (mirror canmore.comment_textdoc + Copilot/Claude-for-Word comment-thread replies) so the agent can leave anchored, actionable suggestions the user reviews without mutating the LaTeX.
- Make inline-diff acceptance per-hunk accept/reject at fine granularity (Copilot word-level; Prism Keep/Undo per suggestion) rather than all-or-nothing, and ensure the diff renderer shows deletions (red) as well as insertions (green).
- Anchor patches to content (string/regex match with an exactly-once guard like Claude Artifacts) instead of byte offsets, and re-read the DB source-of-truth doc state before each patch — rejecting stale-anchor patches — to avoid Canvas's documented overwrite-on-unknown-user-edits failure.
- Implement the backlog 'cross-file one-shot patch' as comment-anchored edits across paper.tex + refs.bib + sections, replying to each anchor with what changed (Claude-for-Word pattern), which also covers the BibTeX-add + \cite-insert flow Prism advertises.
- Adopt Claude's Oct-2025 inline-string-replacement optimization rationale: prefer real diffing over '.*' full rewrites to cut token cost and latency 3-4x and preserve concurrent user edits.
- Surface a version selector / restore (Canvas back-button, Artifacts version selector) decoupled from agent memory, so user manual edits and agent patches both produce restorable versions without confusing the model's view of 'original'.
- Set realistic expectations for image/equation -> LaTeX (real Prism is error-prone per multiple hands-on reviews): keep it human-in-the-loop with an explicit confirm step.

## Sources

- https://openai.com/index/introducing-prism/
- https://openai.com/prism/
- https://www.infoq.com/news/2026/01/openai-prism/
- https://the-decoder.com/openais-prism-combines-latex-editor-reference-manager-and-gpt-5-2-in-one-tool/
- https://www.engadget.com/ai/openai-releases-prism-a-claude-code-like-app-for-scientific-research-180000454.html
- https://library.hkust.edu.hk/news-events/news/prism-new-ai-latex-editor-academic-writing
- https://www.thesisai.io/blog/openai-prism-ai-latex-editor-review/
- https://www.s-anand.net/blog/openai-prism-for-latex/
- https://www.remio.ai/post/openai-prism-launches-free-latex-workspace-with-gpt-5-2-for-scientists
- https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it
- https://openai.com/index/introducing-canvas/
- https://github.com/edoardoavenia/chatgpt-system-prompts/blob/main/canmore.md
- https://gist.github.com/dg/72bc9f585a068d2e9c4edc5ae4c6d9ee
- https://baoyu.io/blog/prompt/full-prompt-chatgpt-4o-with-canvas
- https://medium.com/@dave1010/chatgpts-canvas-beta-feature-internal-details-a7c1e2477149
- https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- https://hyperdev.matsuoka.com/p/claudeais-quiet-revolution-in-artifact
- https://support.microsoft.com/en-us/copilot-word
- https://techcommunity.microsoft.com/blog/microsoft365copilotblog/copilot-in-word-new-capabilities-for-document-workflows/4508974
- https://windowsforum.com/threads/copilot-in-word-gets-word-level-track-changes-comments-and-better-structure.413242/
- https://windowsnews.ai/article/microsoft-copilot-in-word-gains-native-track-changes-for-legal-and-finance-document-review.413272
- https://www.smithstephen.com/p/claude-for-word-gives-lawyers-native
- https://www.notion.com/help/suggested-edits
- https://www.notion.com/help/guides/notion-ai-for-docs
- https://support.google.com/docs/answer/13951448?hl=en
- https://9to5google.com/2026/03/10/google-docs-gemini-upgrade/
