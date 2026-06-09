# Agent-Native Figure/Table/Document Delivery: Industry Patterns and What Prism Should Adopt

> **Category:** industry

## Summary

AI writing/analysis tools deliver figures and exported documents through a small set of repeatable patterns: an agent writes Python (matplotlib/pandas) into a sandboxed code-execution environment, the runtime returns the chart as base64 PNG (or a file in a known output directory), the result is embedded into the conversation/document, and the document is exported via a pandoc/typst/LaTeX pipeline. The security model is consistent across vendors: untrusted model-generated code runs in an isolated, network-disabled, ephemeral sandbox (gVisor/Firecracker), with file I/O over an explicit upload/download channel. Prism's blocker is that its agent disallows Bash, so it cannot run python/matplotlib to generate figures, even though its sibling feature claw already runs Bash safely in the same hardened, egress-only agent container and already implements an OpenAI-style "out/ artifact directory" download mechanism. Prism also has a network-isolated LaTeX compile sandbox (prism_tex) that triple-locks shell-escape OFF, so pythontex/minted in-document plotting is impossible there. The recommended path: generate figures with python/matplotlib inside the agent container (which is the correct, hardened place to run code), emit PDF/PNG figures into the project, \includegraphics them, and add a pandoc-based LaTeX→docx and a PDF download as the exported deliverables — reusing claw's artifact pattern and not weakening the compile sandbox. This keeps code execution and TeX compilation in separate hardened sandboxes, matching the industry split.

---

# Agent-Native Figure / Table / Document Delivery: Industry Patterns and What Prism Should Adopt

## 1. The problem, framed against Prism's current architecture

Prism is an agent-native LaTeX writing IDE. The agent edits files in a per-session working directory (cwd), the user reviews a diff and applies it (round/apply), and the document is compiled to PDF in a separate, locked-down sandbox. Two design decisions block figure/data generation today:

1. **The Prism agent disallows `Bash`** — so it cannot run python/matplotlib to produce a plot.
   - `backend/internal/prism/spec.go:40` — `var prismDisallowedTools = []string{"Bash", "NotebookEdit", "Task", "Agent"}`
   - Rationale in the comment at `spec.go:11,37`: "Bash 无法路径限定" (Bash is a shell, can't be path-confined by the permission broker).

2. **The LaTeX compile sandbox (`prism_tex`) triple-locks shell-escape OFF and has no network**, so in-document code (pythontex/minted/`\write18`) is impossible there by design.
   - `prism_tex/Dockerfile:60-67` — env `shell_escape=f openin_any=p openout_any=p`, plus `texmf.cnf`, plus CLI `-no-shell-escape` (`prism_tex/entrypoint.sh:40-41`).
   - `docker-compose.yml:374` — `network_mode: none`, `read_only: true`, `cap_drop: ALL`.

The crucial internal finding: **the sibling feature `claw` already runs Bash safely** in the same hardened agent container (for pandoc/python file conversion), and **already implements the exact "known output directory" delivery pattern** that OpenAI's Code Interpreter uses (`backend/internal/claw/artifact.go`). Prism does not need to invent anything — it needs to reuse what claw proved, plus add export formats.

---

## 2. How industry tools generate a figure and deliver it

### 2.1 The dominant pattern: agent writes Python → sandbox returns base64 image → embed

**ChatGPT Advanced Data Analysis (Code Interpreter)** and **Julius AI** both work the same way: the model receives a single `execute_python` tool, writes matplotlib/pandas code, the sandbox runs it and returns stdout + `display_data` (the chart as base64 PNG), and the UI renders the PNG inline with a download link.

The tool schema is minimal — one `code` string argument ([E2B blog](https://e2b.dev/blog/build-ai-data-analyst-with-sandboxed-code-execution-using-typescript-and-gpt-4o)):

```javascript
{
  type: 'function',
  function: {
    name: 'execute_python',
    description: 'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.',
    parameters: { type: 'object',
      properties: { code: { type: 'string', description: 'The python code to execute in a single cell.' } },
      required: ['code'] }
  }
}
```

The chart comes back as base64 PNG inside the result, then is written to a file / streamed to the UI:

```javascript
if (result && result.png) {
  fs.writeFileSync('image_1.png', Buffer.from(result.png, 'base64'))
}
// E2B: result.display_data[0]["image/png"]
```

This same base64-PNG round-trip also lets the model *see* its own chart via vision (`data:image/png;base64,...`) and iterate ([E2B](https://e2b.dev/blog/build-ai-data-analyst-with-sandboxed-code-execution-using-typescript-and-gpt-4o)).

- ChatGPT: "spins up a sandboxed Python environment server-side, writes code, executes it, returns both output and code"; provides a "download link for each generated chart" and supports "Export the cleaned dataframe as a new CSV" ([OpenAI Help](https://help.openai.com/en/articles/8437071-advanced-data-analysis-chatgpt), [Obot AI guide](https://obot.ai/resources/learning-center/chatgpt-advanced-data-analysis/)).
- Julius: "writes and executes actual code in sandboxed environments... up to 32GB RAM," each user's code in "isolated Python execution environments," and export is "PNG charts, CSV results, and summary reports" via a Download button; "Show Code" reveals the generated Python/R/SQL ([Julius graph maker](https://julius.ai/home/graph-maker), [Tooliverse review](https://tooliverse.ai/tools/julius)).

### 2.2 Claude Artifacts: a *different* model — generated UI code, not server-side Python

Claude artifacts do **not** run Python for charts. The model **writes React/HTML+JS** (using bundled **Recharts**, plus Chart.js / D3 via CDN, Lucide, shadcn/ui), and the Claude.ai client renders it in a **sandboxed iframe preview**. The sandbox "can't access your local files, make requests to external APIs, or interact with anything outside the chat" — "everything is either hardcoded from your prompt or computed within the sandbox" ([MindStudio](https://www.mindstudio.ai/blog/what-is-claude-interactive-visualization-generative-ui)).

Implication for Prism: Claude's model produces *interactive, browser-rendered* charts (great for a chat UI, not for a print LaTeX paper). For an academic paper you want a **static vector/raster figure embedded in the PDF**, which is the ChatGPT/Julius/Python path, not the Recharts path. (Inference: Prism's deliverable is a compiled document, so the Python→PDF-figure path fits; a Recharts-style live preview could be a *secondary* in-IDE preview, but it doesn't end up in the paper.)

### 2.3 Two ways a matplotlib figure ends up in a LaTeX document

[jwalton.info PGF guide](https://jwalton.info/Matplotlib-latex-PGF/):

| Approach | matplotlib emits | LaTeX inserts via | Rendered by | Fonts | Caveats |
|---|---|---|---|---|---|
| **PDF/PNG (recommended)** | `plt.savefig('fig.pdf')` | `\includegraphics{fig.pdf}` | matplotlib (pre-rendered) | manual match | self-contained, fast compile, **no shell-escape needed** |
| **PGF backend** | `.pgf` drawing commands | `\input{fig.pgf}` | LaTeX at compile time | auto-match document font | `.pgf` can explode in size; slow compile; can blow pdfTeX memory; needs `text.usetex` |
| **tikzplotlib** | `.tex` PGFPlots | `\input{}` | LaTeX | auto-match | 3D plots fail; large scatter bloats ([tikzplotlib](https://github.com/nschloe/tikzplotlib)) |

**Key for Prism:** the **savefig-PDF + `\includegraphics` path requires no shell-escape and no network in the TeX sandbox** — so it works with prism_tex *as-is*. The PGF/pythontex paths would require running Python *during LaTeX compilation*, which the hardened prism_tex sandbox correctly forbids. So figures must be generated **before** compilation, in the agent container, then dropped into the project as PDF/PNG.

### 2.4 Data tables

Tables are pure text generation: the agent (or its Python) emits a `booktabs` `tabular` (LaTeX) or a pipe table (Markdown). For data-derived tables, the established practice is "generate Python code to transform data... present as a string representing a corresponding LaTeX table," and LLMs are strongly biased toward pandas/markdown table output because those token sequences dominate training data ([CSV→LaTeX](https://www.csvtools.com/csv-to-latex/), [search synthesis](https://www.tablesgenerator.com/)). For Prism this needs **no new infrastructure** — the agent already writes `.tex`; a skill nudging `booktabs` + `\input{tables/foo.tex}` is enough. Optionally Python (`df.to_latex()`) for data-driven tables.

---

## 3. Document export pipelines (LaTeX→PDF, LaTeX→docx, markdown→PDF)

- **LaTeX→PDF**: latexmk + pdflatex/xelatex. Prism **already does this** (`prism_tex`, served via `GetPDF` at `routes_user.go:119`).
- **LaTeX→docx (pandoc)**: `pandoc paper.tex -o paper.docx`. Caveats: figures need `--resource-path` so pandoc finds them; `--reference-doc=ref.docx` applies Word styles; complex LaTeX (custom macros, TikZ) degrades — "isolate the problem area by commenting out sections" ([pandoc issue #2572](https://github.com/jgm/pandoc/issues/2572), [HackMD: Pandoc limitations](https://hackmd.io/@wmvanvliet/rynY4IYXq), [JHU Pandoc guide](https://support.cmts.jhu.edu/hc/en-us/articles/26564986730637-Pandoc-LaTeX-Conversion-Process)). Pandoc converts TikZ/raw-PDF figures poorly, so a docx export pairs best with raster/PNG figures.
- **Markdown→PDF**: pandoc with a PDF engine — pdflatex, **typst** (fast, no full TeX), or **weasyprint** (HTML/CSS). Pandoc lists engines: `pdflatex, lualatex, xelatex, latexmk, tectonic, wkhtmltopdf, weasyprint, pagedjs-cli, prince, context, typst` ([Pandoc MANUAL](https://pandoc.org/MANUAL.html)).
- **Reproducible (code+narrative+figures→doc)**: **Quarto** runs embedded code, captures figures, and renders to PDF/docx/HTML — bundles the Typst CLI ([Quarto Typst](https://quarto.org/docs/output-formats/typst.html), [R-bloggers](https://www.r-bloggers.com/2024/01/making-pretty-pdfs-with-typst-and-quarto/)). (Inference: overkill for Prism today, but the *figure-capture-then-embed* idea is exactly what Prism needs.)

**Critical pandoc constraint:** pandoc runs as a shell command, i.e. **it needs Bash**. In Prism it must run **in the agent container** (which has pandoc + python3 installed, `agent/Dockerfile:43-45`) — **not** in prism_tex (which has no pandoc and is network-isolated). Or the backend Go can shell pandoc out itself in a constrained step (inference).

---

## 4. The security model for running code to make figures (consistent across vendors)

Every vendor treats model-generated code as **untrusted** and confines it identically:

- **Isolation**: gVisor (OpenAI) or Firecracker microVMs (E2B, many others). gVisor's `runsc` intercepts syscalls in a Go user-space kernel (Sentry) before they hit the host ([Northflank](https://northflank.com/blog/how-to-sandbox-ai-agents), [ITNEXT](https://itnext.io/openais-code-execution-runtime-replicating-sandboxing-infrastructure-a2574e22dc3c)). OpenAI confirmed gVisor for "higher-risk tasks" ([Ryan Govostes teardown](https://ryan.govost.es/2025/openai-code-interpreter/)).
- **Network OFF**: OpenAI's Code Interpreter sandbox — "Network policies prohibit outbound connections; TCP port scans reveal no open ports, and the DNS server is unreachable" ([Govostes](https://ryan.govost.es/2025/openai-code-interpreter/)).
- **File I/O over an explicit channel**: a small web server exposes `/upload` and `/download`; the client verifies size/existence to prevent TOCTOU ([Govostes](https://ryan.govost.es/2025/openai-code-interpreter/)). This is the **"known input/output directory"** model.
- **Ephemeral + resource-capped**: warm pools, per-session sandboxes, RAM/CPU/PID limits ([digitalapplied](https://www.digitalapplied.com/blog/ai-agent-sandboxing-isolation-patterns-2026)).

**Prism already matches this model — twice.** The agent container: `cap_drop: ALL`, `no-new-privileges`, mem 1.5G / cpus 2 / pids 512, and network only via an egress proxy on an `internal` Docker network with no NAT — "agent only on scholar-agent-net (internal, no NAT), can't reach mysql/redis/minio" (`docker-compose.yml:317-332`). The TeX container: `network_mode: none`, read-only rootfs, no caps, pids 256 (`docker-compose.yml:374-389`). This is **stronger isolation than "run python in cwd"** — it is the right place to run matplotlib.

**The architectural insight: keep code execution and TeX compilation in *separate* hardened sandboxes** — exactly the split OpenAI/Overleaf use. Overleaf disables shell-escape precisely because letting TeX run arbitrary shell is dangerous ([Overleaf CLSI #244](https://github.com/overleaf/clsi/issues/244), [Overleaf #217](https://github.com/overleaf/overleaf/issues/217)). Prism should **never** turn on shell-escape in prism_tex; instead, run Python in the agent sandbox and pass the resulting figure file across.

---

## 5. What Prism already has vs. the gaps

| Capability | Industry | Prism today | Gap |
|---|---|---|---|
| Sandboxed code execution | gVisor/Firecracker, net off | Agent container: caps dropped, egress-only, pids/mem capped | Present but **Bash disallowed for Prism** (`spec.go:40`) |
| Generate matplotlib figure | python+matplotlib in sandbox | python3 installed, but **no matplotlib/numpy/pandas** (`agent/Dockerfile:43-45`) | Add libs + allow Bash |
| Embed figure in doc | base64 PNG inline / file in cwd | Agent can already `Write` files to cwd | Just need the figure file → `\includegraphics` |
| LaTeX→PDF | latexmk | **Yes** (`GetPDF`, prism_tex) | None |
| LaTeX→docx (pandoc) | pandoc | **No** (no docx route, `grep` empty) | Add pandoc step + download route |
| Download artifacts | known `out/` dir + manifest | **claw has it** (`claw/artifact.go`); Prism does not | Reuse claw pattern for figures/docx |
| Data tables | `df.to_latex()` / booktabs | Agent writes `.tex` already | Skill nudge only |

claw's delivery pattern is the template (`backend/internal/claw/artifact.go:5-17`): the agent writes deliverables into `./out/`, optionally with `out/manifest.json` (`{artifacts:[{file,title,description}]}`), and the backend lists/serves them with path-traversal guards (`artifactRelPath` only allows `out/<basename>`) and `nosniff` + raster-only image policy. This is explicitly described in the code as "OpenAI Code-Interpreter 式『已知输出目录』范式."

---

## 6. Recommended adoption for Prism (concrete, staged)

**Stage 1 — Figures via Python in the agent sandbox (no TeX-sandbox changes):**
1. Install `python3-matplotlib python3-numpy python3-pandas` in `agent/Dockerfile` (alongside existing pandoc/python3/openpyxl). (Inference: ~adds size; pin versions.)
2. Allow `Bash` for the Prism feature — but keep the other denials. Reuse claw's proven posture: claw runs Bash in this same container with no `DisallowedTools` and relies on container isolation, not the permission broker, for safety (`claw/spec.go` has no `SessionOptions`; the WS broker comment at `agentbridge/ws.go:526-529` already says "Bash 放行... 把 Bash 关进 cwd + 断网, 而不是靠这里的 permission 裁决"). Remove `"Bash"` from `prismDisallowedTools` (`prism/spec.go:40`), keep `NotebookEdit/Task/Agent`.
3. Add a Prism skill (mirrors the existing `prism-*` skills mounted via `--add-dir /prism-add`, `prism/spec.go:113`) instructing the agent: write `figures/<name>.py`, run it to emit `figures/<name>.pdf` (or `.png`), then `\includegraphics{figures/<name>}`. Use savefig-PDF (vector, no shell-escape needed) — **not** PGF/pythontex.
4. round/apply already carries the new figure files cwd→DB; prism_tex compiles them via `\includegraphics` unchanged (no shell-escape, no network needed).

**Stage 2 — Document export deliverables (PDF download + docx):**
5. **PDF download**: trivial — `GetPDF` already streams the compiled PDF; add `?download=1` → `Content-Disposition: attachment` (copy claw's pattern at `artifact.go:239-241`).
6. **LaTeX→docx via pandoc**: run pandoc in the agent container (it has pandoc) over the applied project files with `--resource-path` pointing at the figure dir and an optional `--reference-doc`; deliver the `.docx` as a download. Reuse claw's `out/` artifact + manifest mechanism, or add a Prism-specific `ExportDocx` route. Set expectations: pandoc degrades on TikZ/custom macros, so pair docx export with raster/PDF figures and warn the user.
7. **Optional markdown→PDF / typst** path is unnecessary for Prism (LaTeX is the source of truth).

**Stage 3 — Data tables:** skill-only — instruct the agent to emit `booktabs` `tabular` (or `df.to_latex()` for data-derived tables) and `\input{tables/foo.tex}`. No infra.

**Do NOT:** enable shell-escape in prism_tex, install matplotlib/Python into prism_tex, or give prism_tex network. Keep the two-sandbox split (code-exec sandbox = agent container; TeX-render sandbox = prism_tex), which is exactly the industry separation.

---

## 7. Inferences vs. cited facts

- **Cited**: vendor mechanisms (§2–§4) are from the URLs listed. Prism/claw internals (§1, §5, §6 file references) are read directly from the repo.
- **Inferred** (marked inline): that matplotlib libs add notable image size; that a Recharts-style live preview is only a secondary in-IDE feature (the paper needs a static figure); that backend Go could shell pandoc itself instead of via the agent; that Quarto is overkill. These are design judgments, not observed facts.

## Key Patterns

### Single execute_python tool; sandbox returns chart as base64 PNG; UI embeds inline + offers download
ChatGPT ADA, Julius, and E2B-based agents all give the model one code-exec tool, run python/matplotlib in a sandbox, and return display_data with image/png base64. The image is rendered inline and downloadable; the model can also re-ingest it via vision to iterate.

- **Agent awareness:** Tool schema (one 'code' string arg) + system prompt convention that charts go to display_data / a known output dir
- **Source:** https://e2b.dev/blog/build-ai-data-analyst-with-sandboxed-code-execution-using-typescript-and-gpt-4o

### Known output directory ('out/') with optional manifest.json for delivering downloadable artifacts
OpenAI Code-Interpreter style: the agent writes finished deliverables to a conventional output dir; backend lists+serves them with path-traversal guards. Prism's sibling 'claw' already implements this exactly, including out/manifest.json {file,title,description}.

- **Agent awareness:** Prompt/skill convention ('write deliverables to ./out/'); backend enforces out/<basename> only
- **Source:** backend/internal/claw/artifact.go:5-17,108-125

### Generate figures BEFORE compilation (savefig PDF + includegraphics), never run code during TeX compile
matplotlib savefig('fig.pdf') + \includegraphics needs no shell-escape; PGF/pythontex/minted require running code during LaTeX compile, which hardened compile sandboxes forbid. Overleaf disables shell-escape for the same reason.

- **Agent awareness:** Writing skill instructs savefig-PDF path; compile sandbox physically blocks shell-escape
- **Source:** https://jwalton.info/Matplotlib-latex-PGF/

### Untrusted model code runs in isolated, network-OFF, ephemeral sandbox (gVisor/Firecracker) with file I/O over an explicit upload/download channel
OpenAI's Code Interpreter: gVisor, no outbound network, DNS unreachable, files via /upload /download with TOCTOU checks. Same model across E2B/Julius. Prism's agent container and prism_tex already match (caps dropped, egress-only/none network, resource caps).

- **Agent awareness:** Enforced by container runtime + network policy, not by the agent; agent only sees a normal filesystem
- **Source:** https://ryan.govost.es/2025/openai-code-interpreter/

### Two separate hardened sandboxes: one for code execution, one for document rendering
Code-exec (python/pandoc) and TeX rendering are isolated separately so a TeX exploit can't run shell and a code exploit can't reach the network. Prism already has both: agent container (Bash/python, egress-only) and prism_tex (network_mode:none, shell-escape triple-locked off).

- **Agent awareness:** Topology/compose config; agent feature spec sets DisallowedTools per feature
- **Source:** docker-compose.yml:317-332,374-389

### LaTeX/markdown -> docx/PDF via pandoc with --resource-path for figures and --reference-doc for styles
pandoc is the de-facto export bridge; needs resource-path so it finds figure files and a reference doc for Word styling. Degrades on TikZ/custom macros, so pair docx export with raster/PDF figures.

- **Agent awareness:** Backend/agent runs pandoc as a shell step (agent container has pandoc installed); not a model decision
- **Source:** https://github.com/jgm/pandoc/issues/2572

### Data tables are pure text generation (booktabs tabular / df.to_latex / markdown pipe tables)
No special infra; agent emits a .tex table or df.to_latex() output and \input{}s it. LLMs strongly favor pandas/markdown table token sequences.

- **Agent awareness:** Skill/prompt convention nudging booktabs + \input
- **Source:** https://www.csvtools.com/csv-to-latex/


## Relevance to Prism

Prism is the project's agent-native writing IDE, and the open question is how to let its agent produce figures, data tables, and exported documents and deliver them to the web user. The research shows the industry path is unambiguous and Prism is already 80% there: the agent container is a correctly hardened, network-isolated, resource-capped code-execution sandbox (the right place to run python/matplotlib), and the sibling feature claw already implements the OpenAI-style 'known output directory' download delivery with a manifest. The only blockers are (a) Prism's feature spec disallows Bash, and (b) the agent container lacks matplotlib/numpy/pandas, and (c) there is no docx export and no PDF download flag. The adoptable plan reuses existing, proven internal mechanisms (claw's artifact pattern, the prism-* skill mount, GetPDF) rather than building new infrastructure, and crucially preserves the security invariant the project already enforces: keep code execution in the agent sandbox and never weaken the prism_tex compile sandbox (no shell-escape, no network), by generating figures as PDF/PNG BEFORE compilation and \\includegraphics-ing them.

## Improvement Ideas

- Remove 'Bash' from prismDisallowedTools (backend/internal/prism/spec.go:40), matching claw which already runs Bash safely in the same hardened agent container; keep NotebookEdit/Task/Agent denied. Rely on container isolation (cap_drop/egress-only/pids), not the permission broker, for Bash safety as the code already does for claw.
- Add python3-matplotlib + python3-numpy + python3-pandas to agent/Dockerfile (next to existing pandoc/python3/openpyxl at line 43-45) so the agent can generate figures and data-derived tables.
- Add a Prism writing skill (mounted via the existing --add-dir /prism-add path, spec.go:113) that instructs: write figures/<n>.py -> savefig('figures/<n>.pdf') (vector, no shell-escape) -> \includegraphics{figures/<n>}; emit data tables as booktabs/df.to_latex into tables/<n>.tex + \input{}. Explicitly forbid PGF/pythontex/minted (would need shell-escape in the TeX sandbox).
- Add ?download=1 to the existing GetPDF route (routes_user.go:119) to set Content-Disposition: attachment, copying claw's pattern (artifact.go:239-241) — instant PDF deliverable with zero new infra.
- Add a LaTeX->docx export: run pandoc (already installed in the agent container) over applied project files with --resource-path to the figures dir and an optional --reference-doc; deliver the .docx via claw's out/ artifact mechanism or a Prism-specific ExportDocx route. Warn that TikZ/custom-macro fidelity degrades, so prefer raster/PDF figures for docx.
- Reuse claw's out/ + manifest.json artifact delivery (claw/artifact.go) for Prism's non-document deliverables (standalone figure PNGs, exported data CSVs) instead of inventing a new download path; it already has path-traversal guards, nosniff, and raster-only image policy.
- Do NOT enable shell-escape, install Python, or grant network in prism_tex — preserve the two-sandbox split. If a fully self-contained reproducible build is ever wanted, evaluate a Quarto-style capture step inside the agent container, not inside the TeX sandbox.

## Sources

- https://e2b.dev/blog/build-ai-data-analyst-with-sandboxed-code-execution-using-typescript-and-gpt-4o
- https://help.openai.com/en/articles/8437071-advanced-data-analysis-chatgpt
- https://obot.ai/resources/learning-center/chatgpt-advanced-data-analysis/
- https://julius.ai/home/graph-maker
- https://tooliverse.ai/tools/julius
- https://www.mindstudio.ai/blog/what-is-claude-interactive-visualization-generative-ui
- https://ryan.govost.es/2025/openai-code-interpreter/
- https://northflank.com/blog/how-to-sandbox-ai-agents
- https://itnext.io/openais-code-execution-runtime-replicating-sandboxing-infrastructure-a2574e22dc3c
- https://www.digitalapplied.com/blog/ai-agent-sandboxing-isolation-patterns-2026
- https://jwalton.info/Matplotlib-latex-PGF/
- https://github.com/nschloe/tikzplotlib
- https://pandoc.org/MANUAL.html
- https://github.com/jgm/pandoc/issues/2572
- https://hackmd.io/@wmvanvliet/rynY4IYXq
- https://support.cmts.jhu.edu/hc/en-us/articles/26564986730637-Pandoc-LaTeX-Conversion-Process
- https://quarto.org/docs/output-formats/typst.html
- https://www.r-bloggers.com/2024/01/making-pretty-pdfs-with-typst-and-quarto/
- https://github.com/overleaf/clsi/issues/244
- https://github.com/overleaf/overleaf/issues/217
- https://www.csvtools.com/csv-to-latex/
- https://www.tablesgenerator.com/
