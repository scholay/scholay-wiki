# File-Emitting Generative Builders: How They Stream File Changes and Deliver Downloadable/Exportable Artifacts (bolt.new, v0, Lovable, Replit Agent) — and What Prism Should Adopt

> **Category:** industry

## Summary

The leading "prompt → app" builders (bolt.new, v0, Lovable, Replit Agent) share one delivery pattern: the LLM emits structured file actions that stream into a live, sandboxed preview, and the resulting project is the deliverable — exportable as a ZIP, pushable to GitHub (bi-directional sync), or one-click deployable to a live URL. bolt.new is the canonical reference for the file-action streaming convention: the model emits a single `<boltArtifact>` containing ordered `<boltAction type="file" filePath="...">` / `type="shell"` elements, parsed incrementally by a StreamingMessageParser and executed by an ActionRunner against an in-browser WebContainer that runs the dev server and serves the preview iframe. Lovable diverges by holding the project as an in-browser AST, computing minimal line diffs, and pushing them to ephemeral fly.io dev servers with Vite HMR. v0 and Replit add bi-directional GitHub sync (auto-branch + auto-commit, never push to main) and self-healing build loops (run → read errors → fix → checkpoint). For Prism, whose true deliverable is a compiled PDF plus the .tex source, the highest-leverage adoptions are: (1) a project-ZIP export route (sources + latest PDF + bibliography), (2) a prominent one-click "Download PDF" and "Download project" surface, (3) optional GitHub/Overleaf export, and (4) surfacing the existing compile-error feedback loop as a visible build status. Prism already has the compile→PDF→error-extraction loop in place; the missing piece is the export/download deliverable surface.

---

## Scope

Research into how file-emitting generative builders (a) stream file changes into a live preview, (b) let the user export/download the whole project, (c) structure the file-action streaming convention, and (d) run live-preview + build/compile feedback loops. Then: what Prism (the Scholay LaTeX IDE) should adopt to give users a downloadable deliverable.

Builders covered: **bolt.new** (StackBlitz) + its open fork **bolt.diy**, **v0** (Vercel), **Lovable**, **Replit Agent**. Plus adjacent reference points for the "deliverable" angle: Claude Artifacts / ChatGPT Canvas (download buttons), Overleaf (compile + PDF download), shadcn/v0 registry CLI.

> Convention below: **[FACT]** = directly stated in a cited source; **[INFERENCE]** = my reasoning, marked explicitly.

---

## 1. The file-action streaming convention (how the agent emits files)

### bolt.new — the canonical reference (`<boltArtifact>` / `<boltAction>`)

The LLM is prompted to wrap its entire output in one `<boltArtifact>` element containing ordered `<boltAction>` children. This is the load-bearing convention everyone else echoes.

Structure (from the bolt.new system prompt, `app/lib/.server/llm/prompts.ts`):

```xml
<boltArtifact id="kebab-case-id" title="Human Title">
  <boltAction type="shell">npm install react react-dom</boltAction>
  <boltAction type="file" filePath="src/index.js">
    ...FULL file contents here...
  </boltAction>
  <boltAction type="shell">npm run dev</boltAction>
</boltArtifact>
```

Rules baked into the prompt ([FACT], prompts.ts):
- **One artifact per response**, wrapping everything.
- `<boltArtifact>` has `id` (kebab-case, descriptive) + `title`. **For updates, reuse the prior `id`.**
- `<boltAction type="...">`: valid types are **`shell`** (run commands) and **`file`** (create/update files). bolt.diy adds a `start` type for the dev server.
- `type="file"` requires a `filePath` attribute, **relative to the working directory**; the element body is the file contents.
- **"Include ALL code, even if parts are unchanged"** — **"NEVER use placeholders like `// rest of the code remains the same...`"**. Always emit the complete, up-to-date file. (Full-file emission, not diffs.)
- **Ordering is critical**: install dependencies FIRST, create a file before any shell command that runs it, and don't re-run the dev server after it's already started.
- `npx` must always carry `--yes`.

Source: [prompts.ts](https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts) · [annotated gist](https://gist.github.com/curran/753aa62fd99b7df8f858743d605f1d02)

### Incremental parsing + execution (bolt.diy internals)

bolt.diy exposes the implementation:
- **`StreamingMessageParser`** (`app/lib/runtime/message-parser.ts`) parses `<boltArtifact>`/`<boltAction>` tags **out of the token stream as it arrives**, queueing each completed action — "real-time feedback while maintaining a clean separation between parsing and execution." [FACT]
- **`ActionRunner`** (`app/lib/runtime/action-runner.ts`) executes actions **sequentially** in the WebContainer; it owns action queuing/ordering, file locking during writes, terminal output streaming, preview-URL generation, and error recovery. Each artifact gets its own ActionRunner via `WorkbenchStore.addArtifact()`. [FACT]
- A **`StreamRecoveryManager`** monitors execution with a ~45s timeout and up to 2 recovery attempts. [FACT]

Source: [deepwiki bolt.diy](https://deepwiki.com/stackblitz-labs/bolt.diy)

**Key takeaway:** the streaming format is plain text/XML interleaved in the normal assistant message, parsed greedily so files start writing before the message finishes. The model emits **whole files**, not diffs.

### v0 (Vercel) — AI SDK Data Stream Protocol

v0 streams over the **Vercel AI SDK "Data Stream Protocol"** (SSE-based), where text/reasoning/data parts each stream with a start/delta/end pattern and unique IDs per block; custom backends set `x-vercel-ai-ui-message-stream: v1`. [FACT] v0's app-building output renders into code blocks / files in its editor. The exact file-delimiter convention v0 uses internally isn't publicly documented — **[INFERENCE]** it is functionally equivalent to bolt's "tagged file blocks in the stream," just transported over the AI SDK data-stream framing rather than raw XML.

Source: [AI SDK Stream Protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) · [AI SDK 3.4 announcement](https://vercel.com/blog/ai-sdk-3-4)

### Lovable — AST + minimal line diffs (the outlier)

Lovable does **not** re-emit whole files. The whole project is synced into the browser as an **Abstract Syntax Tree** (via Babel/SWC); edits mutate the AST; then a tight chain runs ([FACT], verbatim from the Visual Edits blog):

1. "Clean, standard-compliant JSX/TSX is generated from the modified AST"
2. "Diffs are computed to update only precisely modified lines"
3. "Changes are securely pushed to the cloud-hosted environment"
4. "An HMR event is immediately triggered back to the user's session"

Each JSX element gets a **stable unique ID at compile time via a custom Vite plugin**, enabling visual-element → source-code mapping. [FACT]

Source: [Lovable "How we built Visual Edits"](https://lovable.dev/blog/visual-edits)

### Replit Agent — full environment, not a tag protocol

Replit Agent has direct access to the **file system, terminal, package manager, database, and deploy pipeline** and operates on a prompt → plan → execute → iterate loop, creating files / installing packages / setting env vars as tool calls rather than a single tagged artifact. [FACT] It auto-commits a checkpoint at each major step.

Source: [Replit Agent docs](https://docs.replit.com/core-concepts/agent) · [LangChain Replit case study](https://www.langchain.com/breakoutagents/replit)

| Builder | Emission unit | Transport | Diff or full-file |
|---|---|---|---|
| bolt.new / bolt.diy | `<boltArtifact>`/`<boltAction type=file\|shell>` | XML tags in text stream, parsed incrementally | **Full file** |
| v0 | Code blocks/files | AI SDK Data Stream Protocol (SSE) | full file ([INFERENCE]) |
| Lovable | AST mutation → JSX | computed **line diffs** pushed to cloud dev server | **Minimal diff** |
| Replit Agent | tool calls (write/run) | agent tool loop | edits + checkpoints |

---

## 2. Live preview + build/compile feedback loop

### bolt.new / bolt.diy — in-browser WebContainer

- **WebContainer** (`@webcontainer/api`) is an in-browser Node.js runtime (Rust/WASM virtual FS over SharedArrayBuffer, Web Workers as processes, Service Worker virtual localhost). The whole dev loop runs **client-side** — "feels as if you're developing on localhost." [FACT]
- File actions write straight to the virtual FS; the dev server (e.g. Vite) runs inside the container and emits a **`server-ready` event** carrying the port; the preview iframe builds its URL from that port. File writes trip the FS watchers → **HMR** refreshes the preview without a reload. [FACT]
- `PreviewsStore` (`app/lib/stores/previews.ts`) tracks preview URLs/ports; `Preview.tsx` renders the iframe.

Source: [PostHog "How bolt.new works"](https://newsletter.posthog.com/p/from-0-to-40m-arr-inside-the-tech) · [deepwiki WebContainer system](https://deepwiki.com/stackblitz-labs/bolt.diy/3-webcontainer-system)

### Lovable / v0 / Replit — cloud ephemeral dev servers

- **Lovable**: ~4,000 ephemeral Node.js dev-server instances on **fly.io**, each an isolated container with a full copy of the app; Vite HMR pushes updates back to the session. [FACT]
- **Replit Agent**: real cloud environment; **Agent v2/v3 self-tests** in a "run → detect issue → fix" reflection loop — it executes via the REPL, periodically tests in a browser, generates a report, and fixes what it finds; a classifier detects "doom loops" (repeated failed edits) and injects a reminder to re-plan from fresh context. [FACT]
- **v0** spins up an ephemeral cloud dev server with a live preview. [FACT]

Source: [Lovable Visual Edits](https://lovable.dev/blog/visual-edits) · [Replit Agent 3 self-testing](https://www.guvi.in/blog/replit-agent-self-testing/) · [Replit decision-time guidance](https://blog.replit.com/decision-time-guidance)

### Overleaf — the compile/PDF analogue (most relevant to Prism)

Overleaf is the closest analogue to Prism's actual loop: edit `.tex` → **Recompile** (or auto-compile every few seconds) → PDF preview; a **Logs and output** panel surfaces errors/warnings (errors red, warnings orange, overfull boxes blue); a **"Stop on first error"** mode prevents error pileups. The compiled **PDF is downloadable** from the output files. [FACT]

Source: [Overleaf recompiling](https://docs.overleaf.com/getting-started/recompiling-your-project) · [Overleaf fixing errors](https://docs.overleaf.com/troubleshooting-and-support/fixing-latex-errors) · [Stop on first error](https://www.overleaf.com/learn/how-to/Using_the_Stop_on_First_Error_compilation_mode)

---

## 3. Export / download / deploy — "the deliverable"

This is the crux: in all four, **the project is the deliverable**, and there are three escape hatches — ZIP, GitHub, deploy.

### bolt.new / bolt.diy
- **Download as ZIP** (bolt.diy uses `JSZip ^3.10.1` to build the archive client-side from the WebContainer FS). [FACT]
- **GitHub** via `@octokit/rest` (create repo, push). [FACT]
- **Deploy** directly to **Netlify / Vercel / Cloudflare Pages / GitHub Pages**, or download + manual deploy. [FACT]

Source: [deepwiki bolt.diy](https://deepwiki.com/stackblitz-labs/bolt.diy) · [Deploy bolt.new to Netlify](https://dev.to/netlify/deploy-your-boltnew-app-to-netlify-1k54)

### v0 (Vercel)
- **Download ZIP**: `•••` menu → "Download ZIP". [FACT]
- **Bi-directional GitHub sync**: auto-creates a branch per chat (e.g. `v0/main-abc123`), **every code change = an automatic commit**, supports PR create/merge in-app, and **never pushes directly to `main`**. [FACT]
- **One-click deploy**: Share → Publish → live on Vercel. [FACT]
- **Import** from GitHub repo, Vercel project, or ZIP. [FACT]
- **Registry / "Open in v0"**: components can be pulled into a local project via `npx shadcn add <url>` or namespaced `npx shadcn@latest add @v0/<name>` (registry resolves transitive deps). "Open in v0" endpoint: `https://v0.dev/chat/api/open?url=[URL]`. [FACT]

Source: [v0 FAQs](https://v0.app/docs/faqs) · [export guide](https://shipper.now/export-code-v0/) · [shadcn Open in v0](https://ui.shadcn.com/docs/registry/open-in-v0) · [shadcn CLI](https://ui.shadcn.com/docs/cli)

### Lovable
- **GitHub is the recommended export** (official, continuous sync — every save pushes to the repo; "Connect to GitHub" creates the repo in 30–60s, then `git clone`). [FACT]
- **Dev Mode / manual ZIP download** also available. [FACT]
- Export bundle **includes** the Vite/React source + **`supabase/migrations`** DB schemas; **excludes** API keys/secrets/env vars (must hand-create `.env.local`). [FACT]
- Deploy: connect the GitHub repo to Vercel/Netlify for auto-deploys, or use Lovable's hosted publish. [FACT]

Source: [Lovable deployment/hosting/ownership docs](https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership) · [braingrid export guide](https://www.braingrid.ai/blog/how-to-download-lovable-project)

### Replit Agent
- One-click **deploy to a Replit URL** (no deploy config). [FACT]
- **Export via Git**: init repo → commit → push to GitHub/GitLab/Bitbucket → host elsewhere; `git diff HEAD` shows every file the agent touched. [FACT]
- Automatic **checkpoints/snapshots** (code + DB state) for time-travel rollback. [FACT]

Source: [Replit Agent docs](https://docs.replit.com/core-concepts/agent) · [DeployHQ Replit guide](https://www.deployhq.com/guides/replit)

### Single-artifact tools (Claude Artifacts / ChatGPT Canvas) — the "download button" minimum bar
- **Claude Artifacts**: per-artifact **download button** (code → file, HTML/SVG/PNG; can produce downloadable `.docx/.pptx/.xlsx/.pdf`), plus **Share & copy link** to publish/embed. [FACT]
- **ChatGPT Canvas**: export as **PDF / Markdown / DOCX**; no publish-to-web. [FACT]

Source: [Claude Artifacts vs Canvas](https://unmarkdown.com/blog/claude-artifacts-vs-chatgpt-canvas) · [Codecademy Artifacts guide](https://www.codecademy.com/article/how-to-use-claude-artifacts-create-share-and-remix-ai-content)

---

## 4. Cross-cutting patterns worth stealing

1. **The project IS the deliverable, with 3 escape hatches**: ZIP (offline ownership), GitHub (continuous sync / collaboration), deploy/publish (instant live artifact). Every serious builder offers all three.
2. **Never trap the user**: ZIP + Git export are table stakes; Lovable/Replit explicitly market "you can fully self-host without restriction." Lock-in kills adoption.
3. **Streaming files = whole-file tagged blocks, parsed incrementally** so writes/preview start before the message ends (bolt). Lovable's AST-diff approach is more surgical but far more complex; full-file is the pragmatic default.
4. **Secrets are excluded from exports by design** (Lovable). Export source + schema, never keys.
5. **Build feedback is a visible first-class loop**: Overleaf's log panel + stop-on-first-error; Replit's run→read-error→fix→checkpoint; bolt's StreamRecoveryManager. The agent should *consume* compile errors and the user should *see* build status.
6. **Checkpoints/versions are the safety net** that makes aggressive auto-editing acceptable (Replit checkpoints, Lovable named versions, v0 auto-commits).

---

## 5. What Prism should adopt (grounded in current code)

Prism's true deliverable is **a compiled PDF + the `.tex` source bundle** (not a deployable web app), so the Overleaf/Artifacts axis matters more than the "deploy to a URL" axis.

**What Prism already has** (verified in `backend/internal/prism/`):
- Per-file CRUD (`handler.go`: GetFile/CreateFile/RenameFile/DeleteFile/SaveFile).
- Async compile → PDF: `StartCompile` / `GetCompile` (`service.go:247`), `GetPDF` streams the latest successful PDF (`handler.go:296`), with compile caching by content hash (`FindCachedCompile`, `repository.go:328`).
- **A real build-feedback loop already feeding the agent**: `compile_error.go` extracts a friendly summary + excerpt from `pdflatex`/`latexmk` logs (`extractCompileError`, with a regression test on a real beidou.tex bug) — this is the LaTeX equivalent of Replit's "read the error and fix it."
- Versions + restore (`ListVersions`/`RestoreVersion`), inline-diff AI edits, `\cite` RAG.

**The concrete gap** (verified): there is **no project-ZIP export, no multi-file source download, and no GitHub push** in the prism package — `archive/zip` is not imported anywhere, and `handler.go` has no Export/Download-project route (only single-PDF stream). Today a user cannot take their whole project offline in one click.

**Prioritized adoptions:**

- **P0 — One-click "Download PDF"** surfaced prominently in `PrismWorkspace`/`PrismPreview` (the existing `GetPDF` route already streams it; just needs a `Content-Disposition: attachment` variant + a visible button). This is the Claude-Artifacts/Overleaf minimum bar and the single highest-value deliverable for an academic.
- **P0 — Project ZIP export** route: a new `ExportProject` handler that bundles **all `.tex`/`.bib`/asset source files + the latest compiled PDF** (and optionally the bib) into a ZIP via Go's `archive/zip`, served as an attachment. Mirrors bolt/v0's "Download ZIP" and Lovable's Dev-Mode download. This is the "downloadable deliverable" the prompt asks for.
- **P1 — Visible build status panel**: surface the already-extracted `extractCompileError` summary/excerpt as an Overleaf-style log panel (errors vs warnings), so the human sees the same feedback the agent consumes. Closes the loop visually.
- **P1 — Overleaf export / `.zip` re-import** (academic-native): an Overleaf-compatible source ZIP (Overleaf imports a ZIP of `.tex` sources) gives instant interop with the tool researchers already use — arguably more valuable than GitHub for this audience.
- **P2 — GitHub push** (Octokit-style, like bolt/v0/Lovable) for users who want version control; bi-directional sync is the gold standard but a one-way "push project to a new repo" is the cheap 80%.
- **P2 — Excluded-secrets discipline**: if any per-project keys/config ever enter the picture, follow Lovable and keep them out of the export.

**[INFERENCE]** Prism's full-file vs. diff choice: the memory notes "agent 出 patch 不落盘" (agent emits patches, backend is source of truth). That's closer to Lovable's diff model than bolt's full-file model. For *export* this is orthogonal — the backend already holds materialized file content in DB, so a ZIP export reads from the DB source of truth and is independent of the patch-streaming convention.

---

## Sources
See the Sources list field.

## Key Patterns

### Single-artifact, ordered file/shell actions emitted as tagged blocks in the LLM stream
bolt.new wraps each response in one <boltArtifact id title> containing ordered <boltAction type='file' filePath='...'> and type='shell' children. Rules: full-file content only (never placeholders/diffs), install deps first, create file before running it, reuse id for updates. bolt.diy adds type='start' for the dev server.

- **Agent awareness:** Hard-coded in the system prompt (app/lib/.server/llm/prompts.ts), with explicit artifact_instructions rules; the model is told the exact tag schema and ordering constraints.
- **Source:** https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts

### Incremental stream parsing + sequential execution against an in-browser runtime
StreamingMessageParser (message-parser.ts) extracts boltArtifact/boltAction tags from the token stream as they arrive and queues them; ActionRunner (action-runner.ts) executes sequentially in WebContainer, handling file locking, terminal streaming, preview-URL generation, and recovery (StreamRecoveryManager, ~45s timeout, 2 retries). Writes start before the message finishes.

- **Agent awareness:** Convention enforced by the host runtime (parser/runner code), not the model; the model just emits valid tags and the runtime does the rest.
- **Source:** https://deepwiki.com/stackblitz-labs/bolt.diy

### Live preview via dev server + HMR (in-browser WebContainer or cloud ephemeral container)
bolt runs the dev server inside an in-browser WebContainer; a server-ready event yields the port → preview iframe URL; FS watchers trigger HMR on file writes. Lovable runs ~4000 ephemeral fly.io dev containers and triggers Vite HMR back to the session. v0/Replit use cloud ephemeral dev servers.

- **Agent awareness:** Infrastructure layer (host runtime); transparent to the model.
- **Source:** https://newsletter.posthog.com/p/from-0-to-40m-arr-inside-the-tech

### AST-held project with minimal line-diff updates (Lovable's outlier model)
Lovable syncs the whole project into the browser as a Babel/SWC AST, mutates the AST, generates clean JSX/TSX, computes diffs to update only modified lines, pushes to the cloud dev server, then fires an HMR event. Each JSX element gets a stable compile-time ID via a custom Vite plugin for visual→code mapping.

- **Agent awareness:** Host tooling (Vite plugin + AST pipeline); the model proposes edits, the pipeline materializes minimal diffs.
- **Source:** https://lovable.dev/blog/visual-edits

### Three export escape hatches: ZIP, bi-directional GitHub sync, one-click deploy
v0: Download ZIP, auto-branch+auto-commit GitHub sync (never pushes to main, supports PRs), Publish to Vercel. bolt: JSZip ZIP, @octokit/rest GitHub, deploy to Netlify/Vercel/Cloudflare/GH Pages. Lovable: continuous GitHub sync (every save pushes), Dev-Mode ZIP, connect repo to Vercel/Netlify. Replit: deploy to Replit URL, Git export, checkpoints.

- **Agent awareness:** Product/UI feature, not model-driven; surfaced as buttons/menus in the editor.
- **Source:** https://v0.app/docs/faqs

### Self-healing build/compile feedback loop with checkpoints
Replit Agent runs prompt→plan→execute→iterate: runs the app, reads error output, fixes, and snapshots a checkpoint per major step; Agent 3 self-tests via REPL and browser, with a doom-loop classifier that forces re-planning. Overleaf surfaces a Logs panel + stop-on-first-error. The agent consumes errors AND the user sees build status.

- **Agent awareness:** Agent loop logic (host orchestrator) + visible log UI; the model is fed compiler/runtime error text as the next observation.
- **Source:** https://docs.replit.com/core-concepts/agent

### Secrets excluded from exports by design
Lovable export includes Vite/React source + supabase/migrations schemas but intentionally omits API keys/secrets/env vars; the user must hand-create .env.local. Ownership/portability without leaking credentials.

- **Agent awareness:** Export pipeline convention (product policy).
- **Source:** https://www.braingrid.ai/blog/how-to-download-lovable-project

### Per-artifact download button as the minimum deliverable bar
Claude Artifacts give each code artifact a download-to-file button (and can emit downloadable .docx/.pptx/.xlsx/.pdf) plus Share/embed; ChatGPT Canvas exports PDF/Markdown/DOCX. The simplest 'deliverable' is a visible one-click download on the artifact itself.

- **Agent awareness:** UI affordance on the artifact panel; not model-driven.
- **Source:** https://unmarkdown.com/blog/claude-artifacts-vs-chatgpt-canvas


## Relevance to Prism

Prism is a LaTeX IDE whose real deliverable is a compiled PDF plus the .tex/.bib source bundle, so the Overleaf + Claude-Artifacts 'download the artifact' axis matters more than the 'deploy to a URL' axis the web builders emphasize. The agent-native delivery lens maps cleanly: the file-action streaming convention is the agent→workspace channel, and the export surface is the workspace→user channel. Prism already implements the harder half — an agent-consumed compile-error feedback loop (internal/prism/compile_error.go extractCompileError), async compile→PDF streaming (GetPDF), content-hash compile caching, versions/restore, and inline-diff AI edits. The missing half is the deliverable surface: there is no project-ZIP export, no multi-file source download, and no GitHub push in the prism package (archive/zip is not imported; handler.go only streams a single PDF). The concrete, low-risk adoptions are a one-click 'Download PDF' (Content-Disposition variant on the existing GetPDF route), a project-ZIP export route that bundles sources + latest PDF via Go archive/zip (mirroring bolt/v0 'Download ZIP' and Lovable Dev-Mode download), an Overleaf-compatible source ZIP for academic interop, and a visible build-status/log panel that surfaces the error summary the agent already extracts. These directly answer 'give the user a downloadable deliverable' without touching the patch-streaming internals (export reads from the DB source of truth).

## Improvement Ideas

- P0: Add a one-click 'Download PDF' on PrismWorkspace/PrismPreview — reuse the existing GetPDF stream with a Content-Disposition: attachment variant (and a sensible filename derived from the project title). Lowest effort, highest user value for academics; matches the Claude-Artifacts/Overleaf minimum bar.
- P0: Add an ExportProject ZIP route (new handler in internal/prism) that bundles all .tex/.bib/asset source files from the DB source of truth + the latest compiled PDF into a single archive via Go archive/zip, served as an attachment. This is the missing 'downloadable deliverable' — archive/zip is currently unused in the prism package.
- P1: Surface a visible build-status / log panel in the workspace that renders the already-extracted compile-error summary+excerpt (extractCompileError in compile_error.go), Overleaf-style (errors vs warnings). Closes the build feedback loop for the human, not just the agent.
- P1: Offer an Overleaf-compatible source ZIP export (zip of .tex sources Overleaf can import). For researchers this interop is arguably higher-value than GitHub and trivially built on top of the ZIP export.
- P2: One-way 'Push project to a new GitHub repo' (Octokit-style, like bolt/v0/Lovable) for users who want version control; defer full bi-directional sync. Reinforces 'no lock-in / you own your work'.
- P2: Make exports secrets-clean by policy (follow Lovable) — never include any per-project API keys/config in the ZIP if such config is ever introduced.
- Consider streaming-write UX parity with bolt: when the agent emits a file patch, optimistically show the file as 'writing…' in PrismFileSidebar and auto-trigger a recompile on completion (debounced, like Overleaf auto-compile), so preview/PDF refresh feels live.
- Adopt Replit-style visible checkpoints around agent edit rounds: Prism already has versions/restore — surface an automatic checkpoint per AI edit round and a one-line diff summary so users can confidently accept aggressive multi-file patches.

## Sources

- https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts
- https://gist.github.com/curran/753aa62fd99b7df8f858743d605f1d02
- https://deepwiki.com/stackblitz-labs/bolt.diy
- https://deepwiki.com/stackblitz-labs/bolt.diy/3-webcontainer-system
- https://deepwiki.com/stackblitz/bolt.new
- https://newsletter.posthog.com/p/from-0-to-40m-arr-inside-the-tech
- https://github.com/stackblitz/bolt.new
- https://dev.to/netlify/deploy-your-boltnew-app-to-netlify-1k54
- https://v0.app/docs/faqs
- https://shipper.now/export-code-v0/
- https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- https://vercel.com/blog/ai-sdk-3-4
- https://ui.shadcn.com/docs/registry/open-in-v0
- https://ui.shadcn.com/docs/cli
- https://lovable.dev/blog/visual-edits
- https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership
- https://www.braingrid.ai/blog/how-to-download-lovable-project
- https://docs.replit.com/core-concepts/agent
- https://www.langchain.com/breakoutagents/replit
- https://www.guvi.in/blog/replit-agent-self-testing/
- https://blog.replit.com/decision-time-guidance
- https://www.deployhq.com/guides/replit
- https://docs.overleaf.com/getting-started/recompiling-your-project
- https://docs.overleaf.com/troubleshooting-and-support/fixing-latex-errors
- https://www.overleaf.com/learn/how-to/Using_the_Stop_on_First_Error_compilation_mode
- https://unmarkdown.com/blog/claude-artifacts-vs-chatgpt-canvas
- https://www.codecademy.com/article/how-to-use-claude-artifacts-create-share-and-remix-ai-content
