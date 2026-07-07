# Prism struct-redesign — Implementation Status (2026-06-30)

Branch: `prism-struct-redesign`. Built against the plan in `REPORT.md` Part III.
**Cutover is OFF** (`PRISM_STRUCT_ENABLED` unset) → live behavior unchanged: new projects still mint `legacy`, all 26 existing projects stayed `legacy` & editable (`read_only:false`).

## ✅ Done & verified end-to-end (docker, real PDFs)

### Phase 0 — dual-track flag + read-only freeze (safety)
- Migration `docker/mysql/migrations/0053_prism_struct_fields.sql` — adds `schema_version`(default `legacy`), `doc_struct`, `struct_version_id` to `prism_projects` + `prism_struct_versions` table. **Applied cleanly** (schema-sync ran 55 migrations; 26 existing projects → `legacy`, zero data movement).
- `prism.Project.ReadOnly()` + `structEnabled` flag (`model.go`); computed `read_only` exposed via GORM `AfterFind` (`repository.go`).
- Server-side write guards: `ownedWritableProject` (handler.go) on UpdateProject/CreateFile/RenameFile/DeleteFile/SaveFile/RestoreVersion/CiteApply; `wsWritableProject` (handler_ws.go) on IssueWSTicket/PrepareRound/ApplyRound/RejectRound. **Verified**: `PUT /files` on a struct project → `400 该项目为旧版项目,仅支持查看 / 编译 / 导出`.
- Frontend: `schema_version`+`read_only` on `PrismProject`; `PrismPage` branches struct→`PrismWorkspaceV2`, legacy→`PrismWorkspace readOnly`; legacy workspace prop-gated read-only (editor read-only, chat/AI/autosave disabled, "只读·旧版" badge). `tsc -b` + `vite build` clean.

### Phase 1 — struct spine + projector (the canonical→PDF pipeline)
- `struct_model.go` (DocStruct schema + parse/marshal/default), `struct_repository.go` (version chain + `UpsertFileBody`), `struct_service.go` (GetStruct/SaveStruct/materialize/initStruct), `struct_handler.go` (GET/PUT struct + templates), `projector.go` (deterministic struct→.tex/.bib).
- Endpoints wired: `GET /templates`, `GET/PUT /projects/:id/struct`.
- `prism_tex/Dockerfile` + `texlive-publishers` (rebuilt; IEEEtran available).
- **Verified E2E**: `PUT /struct` (heading/paragraph/inline-cite/inline-math/special-char-escaping/list/bibliography) → projector → `main.tex`+`references.bib` → existing `Compile` pipeline → **real 83 KB PDF** (`%PDF-`). Struct version chain row written; `GET /struct` round-trips.

### Phase 2 — new struct workspace (first cut, builds)
- `StructRenderer.tsx` (struct→markdown via shared `MarkdownRenderer` with remark-math/rehype-katex — KaTeX rendered, never raw LaTeX), `PrismWorkspaceV2.tsx` (rendered doc + editable front-matter title/abstract/keywords + **template selector** + "保存并编译" + exact PDF preview), struct API hooks in `api/prism.ts`.

### Phase 3 — deterministic template swap (core thesis proven)
- **Verified E2E**: same struct with `targetTemplate:ieee-conf` → `\documentclass[conference]{IEEEtran}` + `\IEEEauthorblockN{Ada Lovelace}` + `\IEEEauthorblockA{Analytical Engine Lab, London, UK}` → **real IEEE PDF** (51 KB). Same `authors[]` array projects to the journal-specific author macros — swap-not-rewrite confirmed.

## ⛔ NOT done (honest gaps — multi-week / cross-repo)

- **Phase 2 agent struct-op protocol** (`emit_struct_ops`/`ApplyStructOps`, select→ask-AI, rendered tracked-changes, full WYSIWYG body editing). Requires changes in the **`scholar_agent` container** (separate codebase; it was returning HTTP 501 in this env). The V2 workspace currently edits front-matter + recompiles; body editing is via struct only, not yet agent-driven.
- **Phase 3 remainder**: dedicated `POST /projects/:id/template` (deterministic swap endpoint — swap *capability* already works via `PUT /struct`), a 3rd template (elsarticle/sn-jnl), `compile_check` (.log parsing for page-limit/Overfull), conformance panel, MathLive inline-math editing, `go:embed` template registry (templates are currently Go-native in `projector.go`).
- **Phase 4**: Pandoc struct→`.docx`, `clone-to-struct` escape hatch endpoint. (The **cutover flag itself is implemented** — flip `PRISM_STRUCT_ENABLED=true` to mint new projects as `struct` + freeze legacy.)

## 🔄 Session 2 continuation (2026-07-01) — Phase 3 & 4 completed + verified

- **Phase 3 complete**: `projector.go` refactored to per-template document assembly (each journal owns its structure, not just author macros); added **elsarticle** (label-based `\author[i]`↔`\affiliation[i]{organization=,country=}`, `frontmatter` env). `POST /projects/:id/template` (deterministic swap) + `GET /projects/:id/conformance` (required front-matter check). **Verified E2E**: same struct → article (68KB) / ieee-conf `\IEEEauthorblockN` (52KB) / elsarticle `\author[1]` (112KB), all compile to real PDFs; conformance flags Elsevier's missing abstract+affiliation.
- **Phase 4 (in-repo parts) complete**:
  - `POST /projects/:id/clone-to-struct` — legacy → new struct project carrying old body as one `OpaqueBlock` (safe extraction between `\begin{document}…\end{document}`, `\maketitle` stripped). **Verified**: clone compiles successfully.
  - `GET /projects/:id/export/docx` — struct→Markdown→**Pandoc**→.docx (pandoc already in backend image; runs in backend, not prism_tex). **Verified**: valid `.docx` (PK zip).
- **Frontend wired**: V2 gets template selector + **conformance panel** + **导出 Word** button; legacy read-only workspace gets **升级到新版** (clone) button. `tsc`+`vite` clean, deployed.

## 🔄 Session 3 (2026-07-01) — Agent struct-op protocol DONE + verified with a LIVE agent turn

**Design (verified as the right call):** instead of a new `emit_struct_ops` agent tool, struct projects give the agent a clean **`document.md`** working copy (`structToEditorMarkdown`); the agent edits Markdown with its normal file tools; `ApplyRound` parses `document.md`→struct (`parseEditorMarkdown`). Reuses 100% of the WS/round/streaming/ticket infra — agent side needs no new tool.

- `md_bridge.go` — invertible struct↔restricted-Markdown (frontmatter `---` title/abstract/keywords; `#` headings; `$…$`/`$$…$$` math; `[@key]` cites; `**b**`/`_i_`; ```` ```latex ```` opaque). Hand-rolled (both serialize+parse are ours over a fixed dialect).
- `workspace.go materializeProject` branches struct → writes `document.md`. `ws_round.go ApplyRound`/`PendingRound` branch struct → `applyStructRound`/`pendingStructRound` (parse `document.md` → merge into struct → `SaveStruct` → re-project → recompilable). Agent only edits title/abstract/keywords/body; authors/affiliations/bibliography/targetTemplate preserved from the existing struct.
- **Guard fix**: added `Project.EditFrozen()` (frozen-legacy only). WS round endpoints now use `EditFrozen()` not `ReadOnly()` — so struct projects (which `ReadOnly()==true` re: the *legacy* file endpoints) are correctly **allowed** through the WS editing flow.
- System prompt: added a Markdown-mode section — if cwd has `document.md`, edit Markdown (not LaTeX); conventions documented.
- Frontend `PrismWorkspaceV2`: chat panel (reuses `usePrismChat`+`PrismChatPanel`) with **auto-apply on completion** → refetch struct + recompile (chat-primary, no manual diff review in v1).
- **VERIFIED with a real DeepSeek turn**: sent "扩充引言…复杂度 $O(n^2)$" over WS → agent did `Read:document.md`→`Edit:document.md` (Markdown, not LaTeX) → apply parsed it → **struct body grew 2→7 blocks** with a real Chinese intro + `[@vaswani2017attention]` cite parsed into a cite inline → **recompile success**.

## 🔄 Session 4 (2026-07-01) — polish: compile_check + docx citeproc done; sn-jnl blocked on class

- **compile_check** (verified): migration `0054` adds `page_count`/`overfull_count` to `prism_compiles`; `runCompile` parses the `.log` on success (`Output written on … (N pages`, count `Overfull \hbox`); `GET /conformance` now reports `page_count` vs the template `page_limit` (IEEE=8) and flags overflow ("N 处内容溢出边距"). Verified: page_count populated, Overfull surfaced.
- **docx citeproc** (verified): docx export writes a temp `references.bib` from `struct.bibliography` and runs `pandoc --citeproc --bibliography=…`; cites emit `[@key]`. Verified: valid `.docx` (PK), grows with the processed bibliography.
- **sn-jnl (Springer)**: projection code is **written and correct** (`assembleSNJnl`: index binding `\author*[1]{\fnm{}\sur{}}` + `\affil*` + `\abstract{}`-command) but **de-registered** — `sn-jnl.cls` is NOT in debian `texlive-publishers` (needs the CTAN `springernature` package bundled into `prism_tex`, a separate infra task). Re-enable = install the class + uncomment the registry line. Live templates: **article / ieee-conf / elsarticle** (all compile).

## 🔄 Session 5 (2026-07-01) — the 5 polish items done

- **figure 资产物化 (VERIFIED E2E)**: `POST /projects/:id/assets` (multipart) → MinIO + a `KindAsset` file + `struct.assets` + an appended figure block. `TexClient.Compile` now stages **binary** assets into the job dir; `gatherAssets` pulls them from MinIO (asset SHAs folded into the compile cache key); projector emits `\includegraphics`. Verified: upload a valid PNG → `\includegraphics{figures/…png}` → **compile success with the image staged**. Frontend: "插入图片" upload button in V2.
- **流式渲染态 diff 审阅 (built)**: removed struct-v1 auto-apply; when the agent finishes, V2 shows the pending **`document.md` markdown diff** (readable — headings/prose/`$math$`, not raw LaTeX) via `LatexDiffEditor` + a 应用/放弃 bar (`chat.apply`/`chat.reject`).
- **MathLive 公式编辑 (built)**: `mathlive@0.110` added, **lazy-loaded** (816 KB → its own `mathlive.min` chunk, 226 KB gzip, not in the main bundle). "插入公式" opens a `<math-field>` editor → outputs LaTeX → appends a `displayMath` block → save + recompile.
- **Springer template (VERIFIED)**: `sn-jnl.cls` is **not on CTAN** (Springer distributes it directly; all probes 404) — so instead added **`llncs` (Springer LNCS)** which IS in `texlive-publishers`: positional `\author{…\inst{1} \and …\inst{2}}` + `\institute{…}` binding (the 3rd model). Verified compile. `assembleSNJnl` code kept for when the class is obtained.
- **go:embed template registry (VERIFIED)**: metadata moved to `//go:embed templates/*/manifest.json` (data-driven: name/doc_class/class_opts/bib_style/packages/page_limit); assembly funcs stay Go (author-binding is logic), joined by key. Verified: registry loads from embed (IEEE page_limit=8 comes from the manifest).

Live templates: **article / ieee-conf / elsarticle / llncs** (all compile). 

### Still NOT done
- `sn-jnl` needs its class obtained from Springer (not on CTAN) + bundled into `prism_tex`, then re-registered (code + `templateFuncsByKey` entry + a manifest ready). Everything else from the redesign is implemented.

## Cutover (2026-07-01: made unconditional — the flag was removed)
Per owner decision, cutover is **hardcoded on** (no env, no flag). `CreateProject` always mints `struct`; `Project.ReadOnly()` returns true for all (legacy file-edit endpoints disabled); `EditFrozen()` freezes only `legacy` projects (struct edits via the WS/struct endpoints). New projects → new struct workspace; existing `legacy` projects → read-only (view/compile/export) with an "升级到新版" clone button. The old `PRISM_STRUCT_ENABLED` env + `structEnabled`/`StructEnabled()` were deleted. No lossy auto-import of old LaTeX (escape hatch = `clone-to-struct`, which carries the old body as one `OpaqueBlock`).
