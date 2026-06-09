# How web-deliverable agents (bolt.new, v0, Lovable, Replit Agent, Manus) frame "building for a web surface"

> **Category:** external

## Summary

All five agents converge on the same core pattern: the model emits files inside a structured wrapper (an "artifact" / "project" envelope) using inline tags or fenced markers that carry a file path, and a client-side streaming parser turns that token stream into filesystem writes that drive a live preview, while the same file set is also exportable/downloadable as a project. The model is explicitly told, in its system prompt, what runtime surface it targets (bolt: "WebContainer, an in-browser Node.js runtime"; v0: "the 'Next.js' runtime ... runs entirely in the browser"; Lovable: "users can see a live preview ... in an iframe on the right side of the screen"), which both constrains what it can produce (no native binaries, no pip, etc.) and tells it the output is rendered, not just printed. bolt.new uses <boltArtifact>/<boltAction type="file"|"shell"|"start"> with strict action ordering (deps first, then files, then start); v0 uses <CodeProject>/<ReactProject> wrapping ```tsx file="..."``` blocks; Lovable uses one <lov-code> block containing <lov-write>/<lov-rename>/<lov-delete>/<lov-add-dependency>. Manus is the outlier: a general agent that works in a cloud "virtual computer" ("Manus's Computer" panel), writes deliverables (PPTX/PDF/CSV/XLSX/websites) into a workspace, surfaces them as downloadable artifacts plus optionally a deployed/shareable site, and offers replayable sessions. For a research/report agent the adoptable core is: define an artifact envelope, stream it into a preview pane, and present every emitted file as both previewable and downloadable.

---

## Scope

Researching agents that GENERATE deliverables for a web user with a live preview/download, and how each frames the agent's awareness of "building for a web surface." Covered: **bolt.new (StackBlitz)**, **v0 (Vercel)**, **Lovable**, **Replit Agent**, and **Manus** (general agent producing downloadable deliverables / shared workspace).

The strongest primary sources are the leaked/open-sourced system prompts (bolt.new's `prompts.ts` is in the public repo; bolt.diy is a faithful open re-implementation; v0 and Lovable prompts are widely mirrored). Architecture details for the preview pipeline come from StackBlitz/bolt deep-dives. Manus is less documented at the prompt level, so its section leans on product docs + analyses and is marked where inferred.

---

## 1. How files stream into a live preview AND become a downloadable project; the file-emission convention

### bolt.new — `<boltArtifact>` / `<boltAction type="file">`

bolt's model output is **not** native tool calls. It emits XML-ish tags as plain text inside the assistant message; a client-side parser extracts and executes them. The convention (verbatim from the system prompt / repo):

```xml
<boltArtifact id="snake-game" title="Snake Game">
  <boltAction type="file" filePath="package.json">{...}</boltAction>
  <boltAction type="shell">npm install</boltAction>
  <boltAction type="file" filePath="index.html">...</boltAction>
  <boltAction type="start">npm run dev</boltAction>
</boltArtifact>
```

Three action types:
- `type="file"` — "For writing new files or updating existing files. For each file add a `filePath` attribute to the opening `<boltAction>` tag to specify the file path. The content of the file artifact is the file contents." Paths are relative to cwd.
- `type="shell"` — run shell commands (npm install, etc.).
- `type="start"` — "Only use this action when you need to run a dev server or start the application."

**Action ordering is load-bearing** (verbatim): *"The order of the actions is VERY IMPORTANT. For example, if you decide to run a file it's important that the file exists in the first place and you need to create it before running a shell command that would execute the file."* Convention: update `package.json` first so `npm install` runs in parallel, then write files, then `start`. And: *"If a dev server has already been started, do not re-run the dev command when new dependencies are installed or files were updated. Assume ... changes will be picked up by the dev server"* — i.e. the model is told the preview is a long-lived hot-reloading process, not a one-shot render.

**Streaming → preview pipeline** (bolt.diy DeepWiki + PostHog/Substack deep-dives):
- The LLM response is streamed back via SSE. As chunks arrive, an `EnhancedStreamingMessageParser` "detects structured artifacts and actions, queueing them for execution" — files start being written *before generation finishes*.
- An `ActionRunner` executes queued actions sequentially via "a global execution queue to prevent race conditions." `FileAction`s create/update/delete files in the **WebContainer virtual filesystem**; a `FilesStore` + file-locking prevents concurrent modification during generation.
- `StartAction`s "spawn Node.js processes with port forwarding for preview URLs"; a `PreviewsStore` manages a `previews` array of URLs/ports, and the running dev server is shown in an iframe. The "server is your browser" — WebContainers run npm/node natively in-browser, no remote VM.

**Downloadable as a project**: bolt exposes Export → Download (zip) and (historically) Export → Open in StackBlitz from the project title menu. Same file set that drives the preview is the deliverable.

### v0 (Vercel) — `<CodeProject>` / ```tsx file="..."```

v0's emission convention (verbatim from leaked system prompt):
- *"v0 uses the `tsx file="file_path"` syntax to create a React Component in the Code Project."*
- Metadata lives in the fence opener: ` ```tsx project="Project Name" file="file_path" type="react" `, and **"NOTE: The file MUST be on the same line as the backticks."**
- Multi-file projects are wrapped: *"v0 MUST wrap `<ReactProject>` around the React components to signal it is in the same project"* (also referred to as the Code Project / `<CodeProject>` block, with a project ID, an `entry="true"` main component).
- Incremental edits: *"v0 only edits the relevant files ... DOES NOT need to rewrite all files for every change."* Primitives include `QuickEdit` (small edits), `DeleteFile`, and `MoveFile` ("fix all imports that reference the file").

**Preview/runtime**: *"The 'Next.js' runtime is a lightweight version of Next.js that runs entirely in the browser."* / *"Code Projects run in the 'Next.js' runtime."* Users preview via the **Preview tab** ("Users can preview React, Next.js, HTML, and Markdown"; "rendered on top of a white background"). **Download/deliver**: one-click **Deploy to Vercel**, open a PR, or "add to codebase" (Terminal-icon button / shadcn CLI). The Platform API exposes the same lifecycle: "prompt → project → code files → deployment."

### Lovable — one `<lov-code>` block of `<lov-write>` / `<lov-rename>` / `<lov-delete>` / `<lov-add-dependency>`

- All technical changes go in **one** `<lov-code>` block: *"Use only ONE `<lov-code>` block to wrap ALL code changes and technical details in your response, which is crucial for updating the user preview with the latest changes."* — the model is explicitly told the wrapper is what drives the preview refresh.
- `<lov-write>` creates/updates a file: *"Only use ONE `<lov-write>` block per file ... Always specify the correct file path"*; close the tag. Supports "keep existing code" abbreviation for unchanged spans.
- `<lov-rename>`, `<lov-delete>`, `<lov-add-dependency>` for the other FS/package ops; preference for a `search-replace` tool over full rewrites in later versions.
- Stack: React + Vite + Tailwind + TS, optional Supabase. (Note: the x1xhlol mirror of "Lovable/Agent Prompt" has since been updated to a Claude-Agent-SDK-based variant; the `<lov-*>` XML quotes above are from the earlier widely-mirrored version.)

### Replit Agent — full cloud workspace, files committed to a repl

Replit Agent writes code + installs deps + sets up DB inside the Replit cloud IDE; the running app shows in a **webview/preview** (sidebar or separate tab). Deliverable = the repl itself: deploys on Replit hosting to a live URL ("All artifacts deploy together"), with rollback to any prior state. Notably supports **non-app deliverables**: "Files and documents — CSVs, PDFs, PowerPoint files, Markdown docs," plus slides/videos/Design-Canvas mockups, multiple artifacts sharing one backend.

### Manus — workspace files surfaced as downloadable artifacts (+ optional deploy)

See §3.

---

## 2. How the model is told its target surface (system-prompt quotes)

This is the crux for "self-understanding web delivery." Each tool *states the surface in the system prompt*, which (a) tells the model its output is rendered/executed, and (b) constrains what it may emit.

**bolt.new** (verbatim): *"You are operating in an environment called WebContainer, an in-browser Node.js runtime that emulates a Linux system to some degree. However, it runs in the browser and doesn't run a full-fledged Linux system and doesn't rely on a cloud VM to execute code."* Hard constraints follow and shape generation: *"WebContainer CANNOT run native binaries or compile C/C++ code!"*, *"There is NO `pip` support!"*, "Git is NOT available," "Prefer writing Node.js scripts instead of shell scripts," prefer Vite. So the model knows: my files boot in a browser VM that the user is watching.

**v0** (verbatim): *"The 'Next.js' runtime is a lightweight version of Next.js that runs entirely in the browser"* and *"Code Projects run in the 'Next.js' runtime."* Plus surface/affordance awareness: *"Users can preview React, Next.js, HTML, and Markdown"*, *"Users can attach (or drag and drop) images and text files in the prompt form"* (the model knows inputs and previews are visual/web).

**Lovable** (verbatim): *"You are Lovable, an AI editor that creates and modifies web applications. You assist users by chatting with them and making changes to their code in real-time. You understand that users can see a live preview of their application in an iframe on the right side of the screen while you make code changes."* This is the cleanest example of telling the model exactly where its output appears (an iframe on the right) and that updates are reflected immediately.

**Replit Agent / Manus**: no clean public system-prompt quote for the surface line; their surface-awareness is conveyed by the product framing (a running webview / a "virtual computer" panel) rather than a quotable prompt sentence. *(Inference.)*

**Pattern**: the surface declaration does double duty — it's both an *instruction* (here is where your files land and render) and a *constraint envelope* (therefore don't emit things this surface can't run). The agent's "knowledge" of web delivery is literally a paragraph at the top of the system prompt plus the file-emission tag spec.

---

## 3. Manus specifically — surfacing produced files/reports

Manus is a **general** task agent, so it's the best analog to "agent writes a report/dataset/figure." Mechanics:

- **"Manus's Computer" panel**: a cloud virtual machine the user can watch in real time ("opens tabs, fills out forms, navigates websites independently"). It "opens a virtual computer, browses the web, runs code, creates documents, and delivers the finished product." Transparency-by-default vs. black-box assistants.
- **Deliverables written into the workspace**: "PowerPoint presentations (PPTX), PDF documents, websites, spreadsheets, images, and more," all "fully editable and ready to use." Example tasks produce "detailed rankings in multiple file outputs, such as CSV or Excel," a "market analysis report," or a "coded a functional website." One analysis summarizes it as: *"Deliverables (docs, slides, code repos, deployed sites) are written to the workspace and surfaced to the user."* *(That phrasing is from a secondary analysis, not Manus's own prompt — inference-grade.)*
- **Download + deploy + share**: files are downloadable; for web deliverables Manus includes **hosting** ("your application will be live ... within minutes"), one-click custom domains, and "Download your entire codebase at any time ... host anywhere." So a single deliverable can be (a) a downloadable file/zip and (b) a live shareable URL.
- **Replayable / shareable sessions**: past runs can be replayed step-by-step, "ideal for debugging and review ... shared with team members"; Manus "turns any task into a shared workspace for real-time team collaboration." Background notifications fire on completion since it runs in the cloud.

**Takeaway for a non-IDE agent**: Manus doesn't need a code-IDE metaphor. It treats *any* produced file as a first-class artifact in a workspace, shows the work-in-progress in a side panel, and offers download + optional publish + replay. This is the closest template to "research agent emits a report/CSV/figure."

---

## 4. What's adoptable for "agent writes a report/dataset/figure and the web chat presents it as a downloadable + previewable artifact"

Concrete, ranked by leverage:

1. **Define an artifact envelope as an output convention, not a tool.** Pick one wrapper (`<artifact>`/`<file path="...">…</file>`, or a fenced ` ```md file="report.md" ` à la v0) and instruct the model to emit deliverables inside it. A streaming parser turns it into files. This decouples "chat prose" from "deliverable bytes" cleanly and works with plain text streaming (bolt/v0/Lovable all avoid native tool calls for the *file body* for exactly this streaming reason).
2. **Carry a path/type in the opener** (`file="report.md"`, `type="markdown|csv|png"`). The frontend uses `type` to choose a previewer (Markdown render, table view for CSV, `<img>` for figures) and the path/name as the download filename. v0's "file MUST be on the same line as the backticks" is a parser-simplicity rule worth copying.
3. **Stream files into the preview before the message finishes.** bolt's `StreamingMessageParser` + queued `ActionRunner` is the reference design: detect artifact open → start writing → live-update the preview pane. For a report agent, "preview pane" = a rendered Markdown/CSV/figure panel that fills in as tokens arrive.
4. **Same artifact = previewable AND downloadable.** Every emitted file should appear in both a preview tab and a download/zip affordance (bolt Export→Download; v0 add-to-codebase/deploy; Manus download + publish). Don't make the user copy from chat.
5. **Tell the model its surface in the system prompt.** Add a Lovable-style sentence: e.g. *"The user sees your emitted artifacts rendered in a preview panel beside the chat and can download each one. Emit deliverables as files in the artifact envelope; do not paste full file contents into chat prose."* This is exactly how these tools make the agent "aware" of web delivery — it's a prompt paragraph + the tag spec, nothing more.
6. **State constraints tied to the surface.** Mirror bolt's WebContainer constraint list: tell the model what the preview can render (e.g. "figures must be PNG/SVG; tables as CSV will be rendered as a grid; no interactive servers") so it doesn't emit un-previewable junk.
7. **For richer outputs, copy Manus's "workspace + replay" framing**: a persistent per-session workspace of artifacts, completion notifications, and a shareable/replayable record — useful if a research run produces many files over a long time.

**Inference flags**: §3 Manus internals (no public system prompt) and the Replit/Manus surface-awareness lines are inferred from product docs/analyses, not quoted prompts. The bolt/v0/Lovable XML/fence conventions and surface-declaration quotes are from primary or faithfully-mirrored prompt sources.

## Key Patterns

### Artifact envelope as a text-streaming output convention
The model emits deliverable files as inline tags/fences inside an outer wrapper (bolt <boltArtifact>; v0 <CodeProject>/<ReactProject>; Lovable <lov-code>) rather than via native tool calls, so file bytes can be streamed and parsed incrementally as plain text. A client-side parser extracts each file and writes it to a (virtual) filesystem.

- **How the agent is made aware:** System prompt spells out the wrapper + the per-file tag spec the model must produce (e.g. bolt: wrap in <boltArtifact>, files as <boltAction type="file" filePath=...>; v0: ```tsx file="..."```; Lovable: one <lov-code> with <lov-write>).
- **Source:** https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts

### Per-file path/type metadata in the tag opener
Each file's path (and sometimes type/project id) lives in the opening tag (filePath=, file="...", project=/type=). The frontend uses type to choose a previewer and the path as the download/filesystem name. v0 mandates the file marker be on the same line as the backticks for parser simplicity.

- **How the agent is made aware:** Output convention documented in the system prompt with explicit examples and rules (e.g. v0: 'NOTE: The file MUST be on the same line as the backticks').
- **Source:** https://gist.githubusercontent.com/hiddenest/992eb025dc342983503e8edb83ad3b7b/raw

### Streaming parser + sequential action runner driving a live preview
As SSE chunks arrive, an EnhancedStreamingMessageParser detects artifact/action boundaries and queues them; an ActionRunner executes them sequentially (global queue, file locking) writing into the WebContainer FS, and StartAction spawns the dev server whose forwarded URL is shown in an iframe (PreviewsStore). Files appear in the preview before generation completes.

- **How the agent is made aware:** Implicit: the agent just emits ordered actions; the harness (parser+runner) interprets them. The prompt only enforces correct ordering so the runner can execute safely.
- **Source:** https://deepwiki.com/stackblitz-labs/bolt.diy

### Explicit surface declaration in the system prompt
The prompt names the exact runtime/surface the output lands in, which tells the model its output is rendered/executed (not just printed) and bounds what it may produce. bolt: 'WebContainer, an in-browser Node.js runtime'; v0: "the 'Next.js' runtime ... runs entirely in the browser"; Lovable: 'users can see a live preview ... in an iframe on the right side of the screen'.

- **How the agent is made aware:** Literally a paragraph at the top of the system prompt that describes the surface and (for bolt) its hard constraints (no native binaries, no pip, no git).
- **Source:** https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts

### Surface-tied capability constraints
Because the surface is declared, the prompt enumerates what it can't run so the model doesn't emit un-runnable output (bolt: WebContainer CANNOT run native binaries / compile C++ / use pip; prefer Vite + Node scripts).

- **How the agent is made aware:** System prompt constraint list directly under the WebContainer declaration.
- **Source:** https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts

### Action ordering & long-lived preview process awareness
Model is told actions are executed in order (create file before running it; package.json first so install runs in parallel; use a dedicated 'start' action for the dev server and DO NOT re-run it on subsequent edits because the running server hot-reloads).

- **How the agent is made aware:** Explicit ordering rules in the system prompt ('The order of the actions is VERY IMPORTANT...'; 'If a dev server has already been started, do not re-run the dev command').
- **Source:** https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/app/lib/common/prompts/prompts.ts

### Same file set is both previewable and downloadable/deployable
The exact files that drive the live preview are exported as a deliverable: bolt Export→Download zip / Open in StackBlitz; v0 Deploy-to-Vercel / open PR / add-to-codebase; Replit deploys the repl to a URL with rollback; Manus offers download codebase + one-click hosting/custom domain.

- **How the agent is made aware:** Harness/UI feature, not the agent — the agent just produces files; the product exposes download/deploy affordances on them.
- **Source:** https://support.bolt.new/building/using-bolt/projects-files

### General-agent 'virtual computer' workspace with downloadable artifacts + replay
Manus (non-IDE, general task agent) runs in a cloud VM shown in a 'Manus's Computer' side panel; produced deliverables (PPTX/PDF/CSV/XLSX/websites/reports) are written to a workspace and surfaced as downloadable, editable artifacts, optionally deployed to a live shareable URL, with replayable/shareable sessions and completion notifications.

- **How the agent is made aware:** Product architecture (cloud sandbox + workspace + UI panel); no public system-prompt quote — inferred from product docs and analyses.
- **Source:** https://workos.com/blog/introducing-manus-the-general-ai-agent


## Relevance to Claw (web-delivery design)

Our claw agent should adopt the same three-part recipe these tools use to make a model 'know' it builds for a web surface, but aimed at reports/datasets/figures rather than runnable apps: (1) An artifact-envelope output convention — instruct the model (in claw's system prompt / FeatureSpec, analogous to smartsearch's SystemPrompt prefix) to emit deliverables as files inside a wrapper like <artifact path=\"report.md\" type=\"markdown\">…</artifact> instead of pasting full contents into chat. A backend/frontend streaming parser (claw already streams agent output over WS via shared/lib/agent-stream) detects artifact open/close and routes the bytes to an artifact store + a preview pane, the way bolt's StreamingMessageParser feeds the WebContainer. (2) A one-line surface declaration in the system prompt, Lovable-style: 'The user sees your emitted artifacts rendered in a preview panel beside the chat and can download each one; emit deliverables as files, not chat prose.' This is exactly how bolt/v0/Lovable make the agent self-aware of web delivery — a prompt paragraph plus the tag spec, no special model capability. (3) Surface-tied constraints: tell the model which types the preview supports (Markdown/CSV-as-grid/PNG/SVG) so it doesn't emit un-previewable output. On the delivery side, mirror the 'same file is both previewable AND downloadable' rule (download button + zip-all), and borrow Manus's workspace+replay framing for multi-file research runs: a per-session artifact list, completion notifications (claw already has a websocket hub + message system), and a shareable record. Since claw's agent data lives as jsonl in the scholar_agent container with the backend as a black box, the artifact convention is the clean seam: parse artifacts out of the WS stream, persist file bytes via MinIO (internal/storage), and present them through a chat artifact component reusing shared/components/chat — no need to read the agent's jsonl.

## Sources Consulted

- https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts
- https://raw.githubusercontent.com/stackblitz/bolt.new/main/app/lib/.server/llm/prompts.ts
- https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/app/lib/common/prompts/prompts.ts
- https://deepwiki.com/stackblitz-labs/bolt.diy
- https://blog.stackblitz.com/posts/introducing-webcontainers/
- https://webcontainers.io/
- https://newsletter.posthog.com/p/from-0-to-40m-arr-inside-the-tech
- https://amankhan1.substack.com/p/how-ai-prototyping-tools-actually
- https://support.bolt.new/building/using-bolt/projects-files
- https://gist.githubusercontent.com/hiddenest/992eb025dc342983503e8edb83ad3b7b/raw
- https://gist.github.com/hiddenest/992eb025dc342983503e8edb83ad3b7b
- https://raw.githubusercontent.com/2-fly-4-ai/V0-system-prompt/main/v0-system-prompt(updated%2029-11-2024)
- https://v0.app/docs
- https://vercel.com/blog/build-your-own-ai-app-builder-with-the-v0-platform-api
- https://gist.github.com/oguzdelioglu/c8c25b4293cbf44354950f28cab77e47
- https://x.com/marioyordanov_/status/1905290054496321684
- https://docs.replit.com/core-concepts/agent
- https://replit.com/products/agent
- https://blog.replit.com/introducing-agent-3-our-most-autonomous-agent-yet
- https://workos.com/blog/introducing-manus-the-general-ai-agent
- https://manus.im/tools
- https://manus.im/docs/website-builder/publishing
- https://manus.im/features/webapp
- https://en.wikipedia.org/wiki/Manus_(AI_agent)
- https://www.technologyreview.com/2025/03/11/1113133/manus-ai-review/
