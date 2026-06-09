# How Claude Artifacts & OpenAI Canvas Instruct the Model to Emit a Web-Surfaced, Self-Contained Deliverable

> **Category:** external

## Summary

Both products solve the same problem — "model produces a standalone work product that the web UI lifts out of the chat into a side panel" — but with two different signaling mechanisms. Claude Artifacts uses an INLINE XML tag convention: the model wraps the deliverable in `<antArtifact identifier=... type=... title=...>` (preceded by a one-sentence `<antThinking>` self-justification), and the web front-end stream-parses these tags out of the assistant message, captures the content, and renders it in a sandboxed iframe panel, leaving a clickable card in chat. OpenAI Canvas instead uses a TOOL/FUNCTION mechanism: a `canmore` namespace with `create_textdoc` / `update_textdoc` / `comment_textdoc` functions injected into the system prompt; the model "opens the canvas" by calling the function. In BOTH cases the system prompt is the thing that teaches the model the web-serving context and a near-identical decision rule: create the deliverable only for substantial (>15 / >10 lines), self-contained, reusable, user-owned content, and otherwise stay inline — defaulting to NOT creating one when unsure. Versioning is by stable identity: Claude reuses the kebab-case `identifier` across the artifact lifecycle (same id = update, new id = new artifact); Canvas edits "the most recent document" and rewrites the whole body via a `.*` regex pattern. Directly adoptable for our claw agent: an explicit signaling envelope + a system-prompt-encoded "is-this-a-deliverable?" rubric + a stable id for create-vs-update, all of which our agentbridge could surface as deliverable cards.

---

## Scope & method

Researched via primary sources: the leaked-then-acknowledged Claude 3.5 Sonnet Artifacts system prompt (Anthropic acknowledged & later published artifact prompts), the leaked OpenAI `canmore` (Canvas) system prompt from TheBigPromptLibrary, the official OpenAI Canvas announcement, and reputable reverse-engineering / analysis (Reid Barber, Simon Willison). I retrieved the two system prompts **verbatim** (via `curl` on the raw gist / raw GitHub file) so the quotes below are exact, not paraphrased. Where I infer, I mark it **[INFERENCE]**.

---

## 1. Signaling mechanism — "this chunk is a standalone artifact, render it specially"

There are **two distinct designs**, and the contrast is the most important finding for us.

### A. Claude Artifacts → inline special XML tags (NOT a tool call)

The model emits the deliverable **inline in the normal assistant text stream**, wrapped in a custom XML tag. From the verbatim system prompt:

> "2. Wrap the content in opening and closing `` `<antArtifact>` `` tags.
> 3. Assign an identifier to the `` `identifier` `` attribute of the opening `` `<antArtifact>` `` tag... For new artifacts, the identifier should be descriptive and relevant to the content, using kebab-case (e.g., "example-code-snippet").
> 4. Include a `` `title` `` attribute...
> 5. Add a `` `type` `` attribute..."

Concrete shape from a worked example in the prompt:

```
<antArtifact identifier="factorial-script" type="application/vnd.ant.code" language="python" title="Simple Python factorial script">
def factorial(n):
    ...
</antArtifact>
```

The `type` is a **MIME type** that tells the front-end how to render. Verbatim list:
- `application/vnd.ant.code` (+ `language="python"` attr) — code
- `text/markdown` — documents
- `text/html` — single-file HTML pages (rendered as a live webpage)
- `image/svg+xml` — SVG, rendered
- `application/vnd.ant.mermaid` — Mermaid diagram, rendered
- `application/vnd.ant.react` — React component, rendered live

How the web layer turns the tag into a side panel (reverse-engineering, Reid Barber): the front-end **stream-parses** the `antArtifact` tag out of the message, reads `identifier`/`type`/`title`, replaces the inline block with a **clickable card/link** in the chat, and renders the extracted content into a **sandboxed iframe** on `https://www.claudeusercontent.com` via `window.postMessage()`. So the tag is a pure **output convention** — no function-calling protocol involved; the cleverness is entirely in (a) the system prompt teaching the convention and (b) a streaming parser on the client.

Anthropic also added a **pre-commit reasoning gate**, the `<antThinking>` tag:

> "1. Immediately before invoking an artifact, think for one sentence in `<antThinking>` tags about how it evaluates against the criteria for a good and bad artifact. Consider if the content would work just fine without an artifact. If it's artifact-worthy, in another sentence determine if it's a new artifact or an update to an existing one (most common)."

This forces the model to (1) justify artifact-worthiness and (2) decide create-vs-update **before** emitting the envelope.

### B. OpenAI Canvas → a tool/function namespace (`canmore`)

Canvas is the opposite design: the system prompt injects a **tool namespace** and the model "opens the canvas" by **calling a function**, not by emitting inline markup. Verbatim:

> "## canmore
> // # The `canmore` tool creates and updates text documents that render to the user on a space next to the conversation (referred to as the "canvas").
> // Lean towards NOT using `canmore` if the content can be effectively presented in the conversation. Creating content with `canmore` can be unsettling for users as it changes the UI."

Three functions (verbatim type signatures):

```ts
namespace canmore {
  type create_textdoc = (_: {
    name: string,
    type: ("document" | "webview" | "code/bash" | "code/javascript" | ... | "code/other"),
    content: string,
  }) => any;

  type update_textdoc = (_: {
    updates: { pattern: string, multiple: boolean, replacement: string }[],
  }) => any;

  type comment_textdoc = (_: {
    comments: { pattern: string, comment: string }[],
  }) => any;
}
```

So Canvas's signaling mechanism is **structured tool-calling**: `create_textdoc` = make a new side-panel doc; `update_textdoc` = mutate the current one; `comment_textdoc` = attach non-destructive review comments. The `type` parameter (`"document"`, `"code/*"`, `"webview"`) drives the editor/renderer choice, exactly analogous to Claude's MIME type.

**Key architectural takeaway:** same outcome (lift content into a side panel), two mechanisms — **inline output-convention tag (Claude)** vs **system-prompt-injected tool call (OpenAI)**. The tool-call approach is cleaner to parse server-side; the inline-tag approach streams naturally and needs only a client-side parser.

---

## 2. How the model is made to understand the web-serving context (the decision rule)

In **both** systems, the **system prompt** is the sole vehicle: it (a) describes the UI surface in plain language and (b) gives an explicit rubric for create-vs-inline, biased toward NOT creating.

### Claude — verbatim rubric

> "Artifacts are for substantial, self-contained content that users might modify or reuse, displayed in a separate UI window for clarity."

> "# Good artifacts are...
> - Substantial content (>15 lines)
> - Content that the user is likely to modify, iterate on, or take ownership of
> - Self-contained, complex content that can be understood on its own, without context from the conversation
> - Content intended for eventual use outside the conversation (e.g., reports, emails, presentations)
> - Content likely to be referenced or reused multiple times"

> "# Don't use artifacts for...
> - Simple, informational, or short content...
> - Primarily explanatory, instructional, or illustrative content...
> - Suggestions, commentary, or feedback on existing artifacts
> - Conversational or explanatory content that doesn't represent a standalone piece of work
> - Content that is dependent on the current conversational context to be useful
> - ...Request from users that appears to be a one-off question"

The **bias-to-inline** is explicit:

> "# Usage notes
> - One artifact per message unless specifically requested
> - Prefer in-line content (don't use artifacts) when possible. Unnecessary use of artifacts can be jarring for users.
> - The assistant errs on the side of simplicity and avoids overusing artifacts..."

> "7. If unsure whether the content qualifies as an artifact... err on the side of not creating an artifact."

Anthropic reinforces the rule with **few-shot examples of NOT creating** — e.g. for "rundown of common Python list methods" the model's `<antThinking>` reads: *"putting this in a separate artifact window would make it harder for the user to quickly scan... Keeping it in our chat makes the info more glanceable."* And for a binary-search explanation: *"the code is part of the explanation, not a standalone tool. Putting this in an artifact would disrupt the learning flow."*

**Environment awareness** is also taught in-prompt. The Claude 4 version explicitly names the runtime surface and its constraints (Simon Willison's analysis of the official published prompt): *"NEVER use localStorage, sessionStorage, or ANY browser storage APIs in artifacts. These APIs are NOT supported and will cause artifacts to fail in the Claude.ai environment"*; it whitelists importable libraries (lucide-react, recharts, d3, Three.js r128, Papaparse, SheetJS, etc.); and it tells the model about file access via `window.fs.readFile()`. So "you are running in a sandboxed iframe inside a web app" is **stated literally** to the model.

### OpenAI Canvas — verbatim rubric

> "// ## Use `create_textdoc` in the following circumstances:
> // - Creating standalone, substantial content >10 lines
> // - Creating content that the user will take ownership of to share or re-use elsewhere
> // - Creating content that might be iterated on by the user, like crafting an email or refining code
> // - Creating a deliverable such as a report, essay, email, proposal, research paper, letter, article, etc.
> // - Explicit user request: if the user asks to put this in the canvas, start a doc..."

> "// ## Do NOT use `create_textdoc`...:
> // - Content is simple or short <10 lines
> // - Content is primarily informational, such as an explanation, answering a question, or providing feedback
> // - Content that is mostly explanatory or illustrative, like a step by step guide...
> // - Content that the user is unlikely to take ownership of, modify, or re-use elsewhere
> // - Content that is primarily conversational or dependent on the chat context to be understood..."

Crucially it explains **why** to bias against, in UX terms:

> "// If unsure whether to trigger `create_textdoc`... lean towards NOT triggering `create_textdoc` as it can be surprising for users."

OpenAI's prompt goes further than Claude's with **paired positive/negative examples that hinge on intent, not topic**:
- SHOULD: "Write an email to my boss that I need the day off" / "Write pandas code to collect data from apis" / "Can you start a blog post about coffee?"
- SHOULD NOT: "Email subject line for email to my boss requesting time off" / "Teach me api data collection on pandas" / "How do I write a blog post about coffee?"

i.e., **deliverable vs explanation of how to make the deliverable** is the decision axis.

### OpenAI trained the boundary (not just prompted it)

Beyond the prompt, OpenAI **fine-tuned** the trigger decision. From the official announcement (and corroborating coverage): they taught the model to open canvas for "Write a blog post about the history of coffee beans" while avoiding over-triggering on Q&A like "Help me cook a new recipe," and report a **decision-boundary accuracy of 83% (writing) and 94% (coding)** vs a zero-shot prompted GPT-4o baseline, using ">20 automated evaluations" and synthetic data; they **deliberately biased coding against triggering** to avoid disrupting power users. The official help/announcement also note canvas opens **automatically when output is roughly >10 lines or a workspace would help**, and the user can force it with **"use canvas"**. **[INFERENCE]** Anthropic likely also did post-training on the artifact decision, but I found no published Anthropic numbers — Anthropic's public artifacts story is prompt-centric.

---

## 3. Artifact identity / versioning / update semantics

### Claude — stable kebab-case `identifier` is the version anchor

> "3. ...For updates, reuse the prior identifier... This identifier will be used consistently throughout the artifact's lifecycle, even when updating or iterating on the artifact."

Worked update example from the prompt — the `<antThinking>` reads *"This request is a direct modification of the existing 'factorial-calculator' artifact... I'll reuse the ... identifier to maintain continuity and show the evolution of our code,"* and the re-emitted `<antArtifact>` carries the **same `identifier="factorial-script"`**. The front-end keys off identifier match: **same id → new version of the same panel; new id → new artifact** (Reid Barber). The model is also told to emit the **whole** thing every time:

> "6. Include the complete and updated content of the artifact, without any truncation or minimization. Don't use "// rest of the code remains the same..."."

So Claude's update model = **full replacement keyed by stable id**, with version history maintained by the client.

### OpenAI Canvas — implicit "current document" + regex-patch rewrite

Canvas has a weaker identity model. Each created doc gets a `textdoc_id` (Reid/Medium analysis: *"Unique identifier for the created text document. Used for unambiguous reference in future operations"*), **but `update_textdoc` cannot target an arbitrary id** — it edits **the most recent** doc:

> "// - Trigger `update_textdoc` when the user asks for edits... If multiple documents exist, this will target the most recent."

Updates are expressed as **Python-regex find/replace** with a strong "rewrite the whole thing" default:

> "// - Rewrite the entire document (using ".*") for most changes — you should always rewrite for type "code/*", and mostly rewrite for type "document".
> // - Use targeted changes (patterns other than ".*") ONLY within type "document" for isolated, specific, and small changes..."

And `comment_textdoc` adds **non-destructive** review annotations (regex-anchored), used when the user wants suggestions rather than edits — a capability Claude's artifacts don't have inline.

**Comparison:** Claude's id-keyed full-replacement is more robust for "many concurrent deliverables" (each has a stable handle); Canvas's "most-recent-doc + regex patch" is simpler but can't update an older doc by reference.

---

## 4. Directly adoptable for our case (claw agent → deliverable card in web chat)

Our claw/agentbridge stack already streams agent output over WS into a `shared/components/chat` renderer and folds tool events. To surface "agent produced a report/file" as a **deliverable card**, the patterns above map cleanly:

1. **Choose a signaling mechanism — prefer the tool/structured approach (Canvas-style) over inline tags for a backend-mediated agent.** Our agent is a black box producing jsonl turns through agentbridge; a dedicated event/tool (e.g. an MCP tool or a typed message `type:"deliverable"` with `{id, kind, title, content|uri}`) is far easier to fold deterministically than stream-parsing a custom `<artifact>` tag out of free text. Claude's inline-tag design only wins when you control the streaming client parser and want zero protocol overhead. **[INFERENCE]** Given our existing fold pipeline (`shared/lib/agent-stream`, history `agent-history`), a structured event is the lower-risk fit and keeps real-time fold == history fold (a rule the team already enforces).

2. **Encode the "is this a deliverable?" rubric in the feature's SystemPrompt prefix.** `agentbridge.FeatureSpec` already supports injecting a SystemPrompt prefix on the first user message. Port the *exact* dual-list rubric: create a deliverable for substantial (>~15 lines), self-contained, user-owned, reusable, "intended for use outside the chat" content (reports, exported files); keep inline for explanations/short/conversational content; **default to inline when unsure**. Include 2-3 paired positive/negative examples on the deliverable-vs-explanation axis (the Canvas trick) — these examples are what move the boundary in practice.

3. **Adopt a stable id for create-vs-update.** Use Claude's `identifier` pattern: deliverable carries a kebab-case stable id; same id = new version of the same card (bump a version, keep history), new id = new card. This is the cleanest semantics and matches how our `agent_sessions` already maps ownership — a deliverable card row can be keyed `(session, deliverable_id)`.

4. **Render in a sandboxed surface and tell the agent its constraints in-prompt.** If a deliverable can be HTML/interactive, copy Claude's literal environment statements (sandboxed iframe, allowed libraries, "no localStorage/sessionStorage", file access mechanism). The model only respects sandbox limits if the prompt *names them*. For our likely case (markdown report / file), render as a card that opens a side panel with the markdown/file preview — no iframe needed initially.

5. **Optionally split "edit" from "comment" (Canvas).** If reviewers should leave non-destructive suggestions on a generated report, Canvas's `comment_textdoc` (anchored, non-mutating) is a good template that maps onto our existing peer-review/审稿 line-comment UX.

6. **One deliverable per message, bias to inline.** Both products cap to one artifact/doc per turn unless asked and warn that surprise UI changes are "jarring/unsettling." Adopt verbatim — it prevents the agent from spamming cards for trivial output and keeps the chat the primary surface.

**Net:** the reusable design is a three-part contract — **(envelope/tool to declare a deliverable) + (system-prompt rubric that defines deliverable-vs-inline with paired examples and a default-to-inline bias) + (stable id for create-vs-update with full-content replacement)**. Canvas teaches us the tool-based variant + that the trigger boundary benefits from real eval/fine-tuning; Artifacts teaches us the inline-tag variant + the strongest identity/versioning model and the `<antThinking>` pre-commit gate.

## Key Patterns

### Inline special-tag deliverable envelope (antArtifact)
Model emits the deliverable inline in the normal text stream wrapped in `<antArtifact identifier=... type=<mime> title=... [language=...]>...</antArtifact>`. The web client stream-parses the tag, lifts the content into a sandboxed iframe side panel, and leaves a clickable card in chat. type is a MIME (application/vnd.ant.code|react|mermaid, text/html, text/markdown, image/svg+xml) that selects the renderer. No function-calling protocol — pure output convention.

- **How the agent is made aware:** System prompt (the <artifacts_info> block) defines the tag, attributes, MIME list and worked few-shot examples. The model is told the syntax literally and told never to mention the tags/MIME types to the user.
- **Source:** https://gist.github.com/dedlim/6bf6d81f77c19e20cd40594aa09e3ecd

### Pre-commit reasoning gate (antThinking)
Before emitting the envelope, the model must write one sentence in <antThinking> judging the content against the good/bad-artifact criteria and 'would this work fine without an artifact', then a second sentence deciding new-vs-update. Forces an explicit, logged create-vs-inline + create-vs-update decision.

- **How the agent is made aware:** System prompt step 1 mandates the <antThinking> tag immediately before any artifact; few-shot examples show it used both to create and to decline.
- **Source:** https://gist.github.com/dedlim/6bf6d81f77c19e20cd40594aa09e3ecd

### Tool-namespace deliverable (canmore: create/update/comment_textdoc)
Canvas injects a `canmore` tool namespace; the model 'opens the canvas' by calling create_textdoc({name,type,content}); edits via update_textdoc({updates:[{pattern,multiple,replacement}]}); non-destructive review via comment_textdoc({comments:[{pattern,comment}]}). The side panel is driven by structured tool-calls, not inline markup. type param ('document'|'code/*'|'webview') picks the editor/renderer.

- **How the agent is made aware:** System prompt injects the namespace with TypeScript-style signatures + extensive '## How to use', 'Use ... in the following circumstances', and paired SHOULD/SHOULD-NOT example lists as code comments above each function.
- **Source:** https://github.com/0xeb/TheBigPromptLibrary/blob/main/SystemPrompts/OpenAI/gpt4o_canvas_10032024.md

### Deliverable-vs-inline rubric with bias-to-inline
Near-identical rubric in both systems: create a side-panel deliverable only for substantial (>15/>10 lines), self-contained, user-owned, reusable content (reports/emails/essays/code files); keep inline for short/explanatory/conversational/context-dependent content; when unsure, DO NOT create. Both warn that unnecessary panel creation is 'jarring/unsettling' to users.

- **How the agent is made aware:** System prompt: Claude's 'Good artifacts are…/Don't use artifacts for…/Usage notes' lists; Canvas's 'Use create_textdoc when…/Do NOT use…' lists, both with explicit 'err on the side of not creating' instructions.
- **Source:** https://gist.github.com/dedlim/6bf6d81f77c19e20cd40594aa09e3ecd

### Deliverable-vs-explanation decision axis taught by paired examples
The trigger boundary is taught as intent-based, not topic-based: 'Write an email to my boss' (create) vs 'Email subject line for that email' (inline); 'Write a blog post about coffee' (create) vs 'How do I write a blog post about coffee?' (inline). The same topic flips on whether the user wants the artifact itself or an explanation of how to make it.

- **How the agent is made aware:** System prompt includes explicit paired SHOULD/SHOULD-NOT user-request examples (Canvas) and decline-to-create few-shot transcripts (Claude).
- **Source:** https://github.com/0xeb/TheBigPromptLibrary/blob/main/SystemPrompts/OpenAI/gpt4o_canvas_10032024.md

### Stable kebab-case identifier as version anchor
Claude assigns a descriptive kebab-case `identifier` to a new artifact and REUSES it for every subsequent edit ('used consistently throughout the artifact's lifecycle'). Client keys off identifier: same id = new version of the same panel, new id = new artifact. Model must always emit the COMPLETE updated content (no '// rest unchanged').

- **How the agent is made aware:** System prompt steps 3 & 6 + a worked update example whose <antThinking> states it reuses the prior identifier to maintain continuity.
- **Source:** https://gist.github.com/dedlim/6bf6d81f77c19e20cd40594aa09e3ecd

### Most-recent-doc + regex-patch rewrite (Canvas update model)
Canvas update_textdoc targets 'the most recent' document (cannot address an older textdoc_id), applying ordered Python-regex find/replace; default is full rewrite via pattern '.*' (always for code/*, mostly for document); targeted patterns only for small isolated edits in documents. comment_textdoc adds non-destructive anchored review comments.

- **How the agent is made aware:** System prompt usage notes on update_textdoc/comment_textdoc spell out the .* rewrite default, the most-recent targeting, and when to comment vs edit.
- **Source:** https://github.com/0xeb/TheBigPromptLibrary/blob/main/SystemPrompts/OpenAI/gpt4o_canvas_10032024.md

### Trained decision boundary + auto-open heuristics
Beyond prompting, OpenAI fine-tuned the open-canvas decision (reported 83% writing / 94% coding accuracy vs zero-shot baseline, >20 evals + synthetic data; coding deliberately biased against triggering). Canvas auto-opens at roughly >10 lines or when a workspace would help, and users can force with 'use canvas'.

- **How the agent is made aware:** Post-training (model weights) for the boundary; system prompt + UI for the >10-line/auto-open behavior and the 'use canvas' explicit trigger.
- **Source:** https://openai.com/index/introducing-canvas/

### In-prompt environment/sandbox declaration
Claude is told literally that artifacts run in the Claude.ai sandboxed iframe with specific constraints: 'NEVER use localStorage/sessionStorage/ANY browser storage APIs … will cause artifacts to fail in the Claude.ai environment', a whitelist of importable libraries, and file access via window.fs.readFile(). Front-end renders artifacts in an iframe on claudeusercontent.com via window.postMessage().

- **How the agent is made aware:** System prompt states the runtime constraints and allowed libraries explicitly; the model only respects sandbox limits because the prompt names them.
- **Source:** https://simonwillison.net/2025/May/25/claude-4-system-prompt/


## Relevance to Claw (web-delivery design)

Our claw agent already streams agent turns over WS through agentbridge into shared/components/chat with a fold pipeline (shared/lib/agent-stream, history shared/lib/agent-history) and an ownership table (agent_sessions). To turn 'agent produced a report/file' into a deliverable card we should adopt a three-part contract from these products: (1) a SIGNALING MECHANISM — prefer Canvas's structured tool/event over Claude's inline tag, because our agent is a black box producing jsonl and a typed deliverable event (or MCP tool) folds deterministically and keeps real-time fold == history fold (a rule the team enforces); (2) a SYSTEM-PROMPT RUBRIC injected via FeatureSpec.SystemPrompt prefix — port the verbatim dual-list 'create-vs-inline' criteria plus 2-3 paired deliverable-vs-explanation examples and a default-to-inline bias, since the paired examples are what actually move the trigger boundary; (3) a STABLE kebab-case id for create-vs-update with full-content replacement and client-side version history, keyed onto an agent_sessions-style row (session, deliverable_id). Optionally add a non-destructive comment channel (Canvas comment_textdoc) that maps onto our existing peerreview line-comment UX. Cap one deliverable per turn and bias to inline to avoid jarring card-spam. If a deliverable is ever interactive HTML, copy Claude's literal in-prompt sandbox declarations (allowed libs, no browser storage, file-access API) and render in an iframe.

## Sources Consulted

- https://gist.github.com/dedlim/6bf6d81f77c19e20cd40594aa09e3ecd
- https://gist.githubusercontent.com/dedlim/6bf6d81f77c19e20cd40594aa09e3ecd/raw
- https://github.com/0xeb/TheBigPromptLibrary/blob/main/SystemPrompts/OpenAI/gpt4o_canvas_10032024.md
- https://raw.githubusercontent.com/0xeb/TheBigPromptLibrary/main/SystemPrompts/OpenAI/gpt4o_canvas_10032024.md
- https://openai.com/index/introducing-canvas/
- https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it
- https://techcrunch.com/2024/10/03/openai-launches-new-canvas-chatgpt-interface-tailored-to-writing-and-coding-projects/
- https://claude.com/blog/artifacts
- https://www.reidbarber.com/blog/reverse-engineering-claude-artifacts
- https://simonwillison.net/2025/May/25/claude-4-system-prompt/
- https://njpearman.github.io/2024-09-06/the-claude-artifacts-system-prompt-or-message
- https://venturebeat.com/ai/anthropic-to-release-system-prompts-for-artifacts-latest-claude-family-prompts-found-incomplete
