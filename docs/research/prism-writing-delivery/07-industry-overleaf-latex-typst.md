# LaTeX-Specific AI Writing Assistants: Delivery Models & What Prism Should Adopt

> **Category:** industry

## Summary

Surveyed how academic-writing/LaTeX AI assistants deliver value: Overleaf (Error Assist + Writefull/AI Assist), Typst/TypeTeX, SciSpace, Jenni AI, Paperpal, and AI-native LaTeX editors (OpenAI Prism, OpenPrism, LMMs-Lab Writer, Octree, TexMate). Two delivery paradigms dominate: (1) in-editor AI that proposes inline red/green diffs the user accepts/applies (Overleaf, OpenAI Prism, Octree's "autonomous edit with approval"), and (2) agent/tool pipelines that emit submission-ready artifacts — compiled PDF, exported DOCX with editable equations (OMML), and journal-formatted packages (SciSpace, Paperpal). The recurring deliverables academic users expect are: a compiling PDF (with an auto-fix loop so they never debug LaTeX), a Word/DOCX export for non-LaTeX co-authors and journals (the single biggest cross-format pain), automated BibTeX/citation management grounded in real sources, venue/journal templates with one-click reformat, generated figures/tables/equations as ready LaTeX, and track-changes/review for collaboration. Scholar Prism already nails the inline-diff round/apply model, compile-error extraction feeding the AI, library-RAG \cite, and PDF download; the highest-leverage gaps are an automatic compile-fix retry loop, venue templates, export-to-DOCX, fuller bib automation, figure/table/TikZ generation, and a review/comment layer.

---

## Scope & method

Researched LaTeX-specific and broader academic AI writing tools via web search + primary-source fetch, focused on the **delivery** angle (how the AI's output reaches the academic user) rather than raw model quality. Tools covered: **Overleaf** (Error Assist, Writefull, AI Assist), **Typst / TypeTeX**, **SciSpace**, **Jenni AI**, **Paperpal**, and AI-native LaTeX editors **OpenAI Prism**, **OpenPrism**, **LMMs-Lab Writer**, **Octree**, **TexMate**, plus the **Pandoc** LaTeX→Word workflow that academics fall back on today.

I also grounded recommendations against the actual Scholar Prism codebase (`backend/internal/prism/`, `frontend-user/src/features/prism/`) so "what to adopt" reflects real gaps, not features Prism already has.

---

## 1. The two delivery paradigms

### A. In-editor inline-diff (accept/reject) — the "Cursor for LaTeX" model

This is what Prism already does, and it's the dominant pattern among AI-native editors:

- **Overleaf Error Assist**: "the affected lines appear in **red**, with the suggested change in **green**." Fixes are *not* auto-applied — the user clicks **Apply suggestion**, then it auto-recompiles. Crucially, "**Nothing is sent until you select Suggest fix**." ([docs.overleaf.com/.../error-assist](https://docs.overleaf.com/integrations-and-add-ons/ai-features/error-assist))
- **OpenAI Prism**: "proposes edits directly in the document, which you can accept or reject" with "line-by-line accept/reject options," alongside live side-by-side PDF compilation. ([thesisai.io review](https://www.thesisai.io/blog/openai-prism-ai-latex-editor-review/))
- **Octree**: "**Autonomous editing — AI makes changes directly (with your approval)**" rather than only suggestions — framed as "ground-up AI integration." ([useoctree.com blog](https://www.useoctree.com/blog/overleaf-alternatives-research-writing-2026))
- **LMMs-Lab Writer**: "Edits are reflected in the editor in **real-time**" — *"You: 'Add a related work section…' Agent: writes directly to main.tex in real-time"* — eliminating copy-paste. ([github.com/EvolvingLMMs-Lab/lmms-lab-writer](https://github.com/EvolvingLMMs-Lab/lmms-lab-writer))
- **OpenPrism** formalizes **three modes** (directly relevant to Prism's roadmap):
  1. **Chat Mode** — read-only Q&A
  2. **Agent Mode** — "Generates diffs for user confirmation before applying"
  3. **Tools Mode** — "Executes multi-step operations with multi-file edits"
  ([github.com/OpenDCAI/OpenPrism](https://github.com/OpenDCAI/OpenPrism))
- **TexMate** splits this into **Agent I (Ctrl+I)** chat-with-history and **Agent K (Ctrl+K)** inline edit-in-place — the same split Prism has between chat panel and Cmd+K inline edit. ([texmate.es](https://texmate.es/))

**Takeaway:** Prism's round → diff → apply/reject model with WS-streamed tool events is already best-in-class for this paradigm. The differentiators competitors add on top are **(a) an auto-fix retry loop** and **(b) a Tools/multi-file mode**.

### B. Agent → artifact pipeline (deliver a finished file)

SciSpace and Paperpal treat the deliverable as a **downloadable, submission-ready artifact**, not an editor state:

- **SciSpace**: agents "auto-format your manuscript to submission guidelines, manage references in any citation style, and export a submission-ready file to **Word, LaTeX, or PDF**." Manuscript Formatter outputs "a publish-ready paper that you can download at the end," with "100K journal formats." ([scispace.com/t/latex](https://scispace.com/t/latex/), [help: bibliographies](https://scispace.com/help/en/articles/10864981-how-to-automatically-generate-bibliographies-in-scispace))
- **Paperpal**: "**Submission Readiness** runs **over 30 checks** covering structure, formatting, consistency, and journal requirements"; "format papers to match specific journal submission guidelines with support for over **2,000 journals**"; ships AI-disclosure templates (OUP, PLOS, SAGE). ([paperpal.com submission-ready](https://paperpal.com/blog/news-updates/product-updates/make-your-manuscript-submission-ready))

**Takeaway:** Prism delivers *into* the IDE (round/apply) and offers PDF download, but has **no "export the finished thing for the outside world"** path. That's the biggest delivery gap relative to SciSpace/Paperpal.

---

## 2. The compile-error fix loop (LaTeX-specific killer feature)

Two flavors exist:

| Tool | Loop behavior | Context sent to model |
|---|---|---|
| **Overleaf Error Assist** | **Manual, single-shot** — user clicks "Suggest fix," reviews red/green, applies, recompiles. Does *not* auto-iterate; user can hit refresh for a new suggestion. Each invocation = 1 use of daily AI allowance. | "The full error message" + "Relevant lines of code from your project" + "A list of file names in your project." ([error-assist docs](https://docs.overleaf.com/integrations-and-add-ons/ai-features/error-assist)) |
| **OpenPrism** | **Automatic detect-and-fix with retry loop** — "automatically detect and fix LaTeX compilation errors with **retry loop**"; parses logs, one-click jump to error location. | Parses compilation logs (retry count/prompt undocumented). ([OpenPrism](https://github.com/OpenDCAI/OpenPrism)) |
| **LMMs-Lab Writer** | Goes further down the stack: "**If a package is missing, it's installed on the fly during compilation**" (auto-detects/installs TinyTeX/MiKTeX/TeX Live). ([lmms-lab-writer](https://github.com/EvolvingLMMs-Lab/lmms-lab-writer)) |

**Prism today** (verified in code): `backend/internal/prism/compile_error.go` already does the *hard* part Overleaf does — it extracts `! error` + `l.NNN <source>` blocks from the full log into a `summary` (line-numbered, for the UI red bar) and an `excerpt` (≤1800 runes, for precise AI localization). The code comment even documents the failure mode it fixes: without the `l.NNN` line "it can only guess." But this is currently surfaced as context for a *user-initiated* edit — there is **no automatic compile → if error → feed excerpt to agent → re-edit → re-compile loop**. Adding that loop (bounded, e.g. ≤2–3 iterations, with the existing `extractCompileError` output as the agent prompt) is the single highest-leverage LaTeX-specific feature, and the infrastructure is 80% there.

*(Inference: a bounded retry count + "stop if same error twice" guard is advisable — OpenPrism's exact policy is undocumented, but unbounded loops burn tokens/quota, which Prism already meters via `vip.CheckAndConsume` + `llm_token_usage`.)*

---

## 3. Bibliography / \cite automation

Tiered maturity across tools:

- **Prism today** (`backend/internal/prism/cite.go`): RAG-grounded — candidates come **only** from the user's real library (`user_library_papers`), `ApplyCite` writes deterministic-keyed BibTeX into `references.bib` idempotently, returns `\cite{key}`. Strong anti-hallucination guarantee ("agent cannot invent references from memory"). This is *better grounded* than most competitors. **Limits:** no DOI/PMID → BibTeX import, no Zotero/Mendeley sync, no reference-style switching, no "fix/verify existing references" checker.
- **SciSpace** is the reference benchmark: agents for **DOI→BibTeX**, **Citation Extractor** (messy lists/PDFs/URLs → BibTeX/RIS/CSL-JSON, resolves DOI/PMID/PMCID/ISBN), **Reference Checker**, **Citation Manager** with export to BibTeX/RIS/EndNote/CSL-JSON, Zotero/Mendeley integration, 9,000+ styles. ([scispace bibliographies help](https://scispace.com/help/en/articles/10864981-how-to-automatically-generate-bibliographies-in-scispace))
- **Jenni AI**: 1,700+ citation styles; "connects every AI-suggested sentence to the precise location in your source PDF"; Zotero/Mendeley import; LaTeX equation support (describe or upload image). ([docs.jenni.ai export-and-import](https://docs.jenni.ai/docs/export-and-import/))

**Adopt for Prism:** keep the library-RAG core (it's the moat), add **DOI/arXiv → BibTeX resolution** and a **reference checker** ("this \cite has no entry / this entry is unused / this DOI doesn't resolve"). These compose cleanly with the existing idempotent `references.bib` writer.

---

## 4. Templates / venue styles

- **OpenPrism**: built-in templates for **ACL, CVPR, NeurIPS, ICML** with **one-click conversion preserving existing content**; a "Template Transfer" with Legacy (LaTeX→LaTeX) and MinerU (PDF→Markdown→LaTeX) modes using LLM content mapping. ([OpenPrism](https://github.com/OpenDCAI/OpenPrism))
- **SciSpace**: "100K journal formats"; Manuscript Formatter does "headings, abstract/keywords blocks, reference style conversion, and figure/table numbering," plus a **checklist preview** flagging policy items (AI/data/ethics) and a **change-log** of edits+rationale. ([scispace LaTeX hub](https://scispace.com/t/latex/))
- **Paperpal**: 2,000+ journals, 30+ readiness checks, AI-disclosure templates per publisher. ([paperpal](https://paperpal.com/blog/news-updates/product-updates/make-your-manuscript-submission-ready))

**Prism today:** ships one generic `article` scaffold (`scaffoldMainTex` in `service.go`, explicitly "对齐 OpenAI Prism 的 article 起始模板"). **Adopt:** a small set of high-value venue templates (NeurIPS/ICML/CVPR/IEEE/ACM/Elsevier) selectable at project creation, plus an agent skill for "reformat this project to <venue>" that swaps documentclass/preamble and reorders front-matter. Prism's per-project agent session + `--add-dir` skill mechanism (`prismSkillAddDir`) is the natural home for venue-convention skills (it already loads writing/discipline/LaTeX-format skills the same way).

---

## 5. Export to DOCX (the biggest unmet academic need)

This is the cross-format pain that recurs in every author-workflow discussion:

> "LaTeX is the best tool for writing scientific papers, while Microsoft Word is the best tool for **commenting** on manuscripts — so the ideal workflow is to write in LaTeX and **send a .docx version to co-authors** for comments." Advisors prefer Word's Comments/Track-changes; manual conversion breaks "equations becoming unreadable images, references breaking, tables collapsing." ([Pandoc LaTeX→Word workflow](https://youvenz.github.io/blog/2026-03-05-convert-latex-to-word-with-pandoc-preserve-equations/), [ja01.chem.buffalo.edu](https://ja01.chem.buffalo.edu/etcetera/latex-pandoc-word.html))

How tools solve it:
- **SciSpace LaTeX-to-Word agent**: converts ".tex → DOCX while preserving structure, citations, styles," and a dedicated **LaTeX equation → Word converter** that produces "fully editable Word equations (**OMML**)." ([scispace LaTeX hub](https://scispace.com/t/latex/))
- **Jenni / Paperpal**: export to .docx / .tex / HTML; Paperpal lives *inside* Word/Google Docs/Overleaf as integrations.
- **DIY**: Pandoc gets "~90% of the way," but equation numbering and the "final 10%" need manual fixup. ([HackMD pandoc limitations](https://hackmd.io/@wmvanvliet/rynY4IYXq))

**Prism today:** only PDF download (`downloadPdf` in `PrismWorkspace.tsx` hits `/user/prism/projects/:id/pdf`). **No DOCX path.** **Adopt:** a backend **export-to-DOCX endpoint** — the prism_tex sandbox already has a full TeX environment; add Pandoc there and run `pandoc main.tex -o out.docx --bibliography references.bib` inside the same watcher/shared-volume model used for compilation (`texclient.go`). Even at "90% fidelity," a one-click "Export for co-authors (.docx)" is a marquee deliverable competitors charge for. *(Inference: equation OMML fidelity will be imperfect via vanilla Pandoc; SciSpace's OMML quality is a paid differentiator. A reasonable v1 is Pandoc DOCX + a note that complex equations may need touch-up.)*

---

## 6. Collaboration / track-changes / review

- **Overleaf** is the benchmark: real-time multi-author editing, **Track Changes**, inline **commenting**, and a **Reviewer** role that "can only make and respond to comments and make tracked changes" (cannot edit) — "Switching to Reviewing automatically turns on Track Changes." Premium-gated. ([docs.overleaf.com/collaborating/reviewing-and-reviewers](https://docs.overleaf.com/collaborating/reviewing-and-reviewers))
- **Typst**: team-based collaborative web app for scientific writing. ([typst.app](https://typst.app/))
- **OpenAI Prism / OpenPrism / Octree / Jenni**: support project sharing / "real-time collaboration"; Jenni adds co-author comments + suggested edits.

**Prism today:** single-user per-project agent session; version history (`PrismVersionsDialog`, `history.go`) exists but no multi-user real-time editing, comments, or track-changes. This is a larger build (CRDT/OT + presence) — likely **not** the next priority vs. compile-loop/export/bib, but worth noting that "Word for comments" demand is partly *why* DOCX export matters: it's the cheap substitute for not having native track-changes. **Inference:** ship DOCX-export-for-comments first (cheap, high value), defer real-time co-editing.

---

## 7. Figure / table / equation generation

Every mature tool generates these as ready-to-paste LaTeX:
- **Overleaf**: **Table Generator** (image/prompt → LaTeX table) and **Equation Generator** (image/prompt → LaTeX equation), both inserting code directly; **TeXGPT** generates figures/skeletons/outlines. ([overleaf.com/about/ai-features](https://www.overleaf.com/about/ai-features))
- **TikZ generators** (Underleaf, Octree, etc.): "describe any diagram → publication-quality TikZ"; **image → TikZ** converters; **pgfplots** for data charts. ([underleaf.ai/tools/tikz-generator](https://www.underleaf.ai/tools/tikz-generator))

**Prism today:** the agent has Write/Edit and can emit LaTeX, but there's no dedicated, grounded **table-from-image / equation-from-image / data → pgfplots-chart / prompt → TikZ** affordance. **Adopt:** these as agent skills or quick-action toolbar buttons; image→LaTeX-table/equation is especially high-value and maps to a single multimodal call producing a diffable insert (fits the existing round/apply flow).

---

## Delivery-feature matrix (synthesis)

| Capability | Overleaf | OpenAI Prism | OpenPrism | SciSpace | Paperpal | Jenni | **Scholar Prism (now)** |
|---|---|---|---|---|---|---|---|
| Inline red/green diff, accept/apply | ✅ | ✅ | ✅ | — | — | partial | ✅ (round/apply) |
| Compile-error AI fix | ✅ manual | ✅ | ✅ **retry loop** | — | — | — | ⚠️ extraction only, no loop |
| Live PDF preview / download | ✅ | ✅ | ✅ | PDF export | — | — | ✅ |
| Export to DOCX | — | — | — | ✅ (OMML eqns) | ✅ | ✅ | ❌ |
| Venue/journal templates | via gallery | basic | ✅ ACL/CVPR/NeurIPS/ICML | ✅ 100K | ✅ 2000 | — | ❌ (1 generic) |
| Bib automation (DOI/import/check) | Writefull | manual BibTeX | basic | ✅ deep | ✅ | ✅ Zotero | ⚠️ library-RAG only |
| Figure/table/eqn generation | ✅ | — | — | — | — | eqn | ❌ |
| Track-changes / review | ✅ | sharing | ✅ collab | change-log | — | comments | ❌ (versions only) |
| Submission-readiness checks | — | — | peer-review | ✅ | ✅ 30+ | — | ❌ |
| Anti-hallucination cite grounding | — | — | — | — | — | PDF-link | ✅ **(unique strength)** |

---

## Recommended adoption priority for Prism

1. **Auto compile-fix loop** (highest ROI, infra mostly built): wire `extractCompileError` → agent round → recompile, bounded ≤2–3 iters, metered by existing vip/token accounting.
2. **Export-to-DOCX** ("for co-authors / journal"): add Pandoc to the prism_tex sandbox, new export endpoint mirroring `texclient.go`'s watcher model. Cheap proxy for missing track-changes.
3. **Venue templates** (NeurIPS/ICML/CVPR/IEEE/ACM/Elsevier) at project creation + a "reformat to <venue>" skill via the existing `--add-dir` mechanism.
4. **Bib automation upgrades**: DOI/arXiv→BibTeX import + reference checker, composed onto the existing idempotent `references.bib` writer; keep library-RAG as the grounded default.
5. **Figure/table/equation generation** as quick actions (image→table/equation, data→pgfplots, prompt→TikZ) feeding the round/apply diff.
6. **(Later) Review/comment layer** and submission-readiness checklist; real-time co-editing is a much larger build and lower near-term ROI than 1–5.

## Key Patterns

### Inline red/green diff with explicit accept/apply, never silent auto-apply
Overleaf Error Assist shows affected lines in red and the suggested change in green; the user must click Apply, then it auto-recompiles. 'Nothing is sent until you select Suggest fix.' OpenAI Prism, Octree, OpenPrism Agent Mode all gate edits behind user confirmation. Matches Prism's round→diff→apply/reject.

- **Agent awareness:** N/A (industry product UX); for Prism the agent emits Edit/Write tool events streamed to the editor, and apply/reject is a separate user-driven HTTP call (round/apply)
- **Source:** https://docs.overleaf.com/integrations-and-add-ons/ai-features/error-assist

### Automatic compile-error fix retry loop
OpenPrism 'automatically detects and fixes LaTeX compilation errors with retry loop'; parses logs and offers one-click jump to error location. Overleaf does single-shot manual fixes. The model is fed the full error message + relevant source lines + file list.

- **Agent awareness:** The orchestrator parses the compile log, extracts the error block (! msg + l.NNN source), and re-prompts the agent automatically until compile succeeds or a retry cap is hit
- **Source:** https://github.com/OpenDCAI/OpenPrism

### Three AI interaction modes: Chat (read-only) / Agent (diff-then-confirm) / Tools (multi-step multi-file)
OpenPrism formalizes a progression from passive Q&A to confirmed diffs to autonomous multi-file operations. TexMate splits into Agent I (chat) vs Agent K (inline edit). This separates 'ask' from 'edit' from 'orchestrate'.

- **Agent awareness:** Mode is a UI toggle that changes which tools the agent is granted and whether edits auto-stream vs require confirmation
- **Source:** https://github.com/OpenDCAI/OpenPrism

### Deliver a submission-ready artifact (PDF/DOCX/LaTeX package), not just editor state
SciSpace and Paperpal treat the deliverable as a downloadable file: 'export a submission-ready file to Word, LaTeX, or PDF'; auto-format to journal guidelines; run 30+ readiness checks. DOCX export with editable OMML equations is a paid differentiator.

- **Agent awareness:** A finalize/export agent step runs formatting + conversion and returns a downloadable file; readiness checks produce a checklist artifact
- **Source:** https://scispace.com/t/latex/

### LaTeX→Word/DOCX export is the #1 cross-format need (co-author comments + journal Word submission)
Authors write in LaTeX but co-authors/advisors comment in Word (Track Changes). Manual conversion breaks equations/refs/tables. Pandoc gets ~90%; equation numbering + final 10% need fixup. SciSpace converts .tex→DOCX preserving structure/citations and equations as editable OMML.

- **Agent awareness:** N/A (workflow finding); for Prism this is a backend Pandoc run in the TeX sandbox, not an agent action
- **Source:** https://youvenz.github.io/blog/2026-03-05-convert-latex-to-word-with-pandoc-preserve-equations/

### Citation/bibliography automation with grounding (DOI/PDF/library → BibTeX, plus reference checking)
SciSpace: DOI→BibTeX, Citation Extractor (PDFs/URLs/messy lists → BibTeX/RIS/CSL-JSON), Reference Checker, Zotero/Mendeley sync, 9,000+ styles. Jenni links every suggested sentence to its source PDF location. Prism's library-RAG cite is more anti-hallucination-grounded than most but narrower.

- **Agent awareness:** Dedicated citation agents/tools resolve identifiers to structured BibTeX; a reference checker validates \cite↔.bib consistency
- **Source:** https://scispace.com/help/en/articles/10864981-how-to-automatically-generate-bibliographies-in-scispace

### One-click venue/journal template conversion preserving content
OpenPrism ships ACL/CVPR/NeurIPS/ICML templates with one-click conversion preserving existing content + Template Transfer (LaTeX→LaTeX and PDF→Markdown→LaTeX via LLM mapping). SciSpace has 100K journal formats with auto-format (headings, abstract/keywords, reference-style conversion, figure/table numbering).

- **Agent awareness:** Template selected at creation; a 'reformat to <venue>' skill/agent swaps documentclass/preamble and reorders front-matter
- **Source:** https://github.com/OpenDCAI/OpenPrism

### Figure/table/equation generation as ready-to-paste LaTeX (incl. image→LaTeX, prompt→TikZ, data→pgfplots)
Overleaf Table Generator and Equation Generator turn images/prompts into inserted LaTeX. Underleaf/Octree generate publication-quality TikZ from descriptions and convert images→TikZ; pgfplots for data charts.

- **Agent awareness:** Quick-action buttons or agent skills invoke a (multimodal) call that returns a LaTeX snippet inserted via the normal diff flow
- **Source:** https://www.overleaf.com/about/ai-features

### Reviewer role + track-changes + comments for collaboration
Overleaf: real-time multi-author edit; Reviewer role can only comment + make tracked changes (cannot edit); switching to Reviewing auto-enables Track Changes. Demand for Word-style commenting is partly why DOCX export matters as a cheaper substitute.

- **Agent awareness:** N/A (collaboration infra, not agent-driven); roles/permissions enforced by the editor backend
- **Source:** https://docs.overleaf.com/collaborating/reviewing-and-reviewers


## Relevance to Prism

Scholar Prism is an explicit clone of OpenAI Prism's AI-native LaTeX IDE, so these competitors define the bar. Through the agent-native delivery lens, Prism already wins on two axes others lack: (1) WS-streamed inline-diff round/apply with full version history, and (2) anti-hallucination library-RAG \cite (agent literally cannot invent a reference — every key is backed by a real user_library_papers row). The delivery gaps are concrete and mostly cheap to close because the infrastructure exists: the compile-error extractor (compile_error.go) already produces exactly the line-numbered context an auto-fix loop needs but isn't wired into a loop; the TeX sandbox watcher model (texclient.go) is the natural place to add Pandoc for DOCX export; the per-project agent session + --add-dir skill mechanism (prismSkillAddDir) is where venue-template and figure/table-generation skills slot in; and the idempotent references.bib writer (cite.go) is the base for DOI-import and reference-checking. The single biggest unmet academic need across all sources — LaTeX→DOCX so non-LaTeX co-authors/journals can consume the work — is entirely absent from Prism today (only PDF download exists), and it's a marquee deliverable competitors monetize.

## Improvement Ideas

- Add an automatic compile-fix loop: after a failed compile, feed extractCompileError's excerpt (already line-numbered, already implemented in compile_error.go) to the agent as a round, re-compile, repeat up to ~2-3 iterations with a 'same error twice → stop' guard; meter it via the existing vip.CheckAndConsume + llm_token_usage so the loop can't burn quota silently.
- Build an Export-to-DOCX endpoint by adding Pandoc to the prism_tex sandbox and running 'pandoc main.tex -o out.docx --bibliography references.bib' via the same shared-volume watcher model as Compile (texclient.go); surface as a 'Export for co-authors (.docx)' button next to the existing PDF download. Document that complex equations may need touch-up (vanilla Pandoc ~90% fidelity).
- Ship a small set of venue templates (NeurIPS/ICML/CVPR/IEEE/ACM/Elsevier) selectable at project creation (vs the single generic scaffoldMainTex), plus a 'reformat to <venue>' agent skill loaded via the existing --add-dir mechanism that swaps documentclass/preamble and reorders front-matter while preserving content (OpenPrism-style one-click conversion).
- Extend bibliography automation beyond library-RAG: add DOI/arXiv→BibTeX resolution and a reference checker (\cite with no entry / unused entry / unresolvable DOI), composed onto the existing idempotent references.bib writer; keep library-RAG as the grounded default to retain the anti-hallucination moat.
- Add figure/table/equation generation as quick actions feeding the round/apply diff: image→LaTeX table, image→LaTeX equation, prompt→TikZ, and data→pgfplots chart (Overleaf/Underleaf parity). Image→table/equation is a single multimodal call producing a diffable insert.
- Introduce explicit AI modes mirroring OpenPrism (Chat read-only / Agent diff-then-confirm / Tools multi-file) so users can pick the autonomy level; Prism already has the chat panel + Cmd+K inline split (TexMate's Agent I/K), so this is mostly surfacing tool-grant policy as a UI toggle.
- Add a lightweight submission-readiness checklist (Paperpal/SciSpace style: structure, missing sections, undefined refs, AI-disclosure template) as a final-step artifact before export, reusing peer-review/peerreview2 analysis where applicable.
- Defer real-time co-editing/track-changes (large CRDT/OT + presence build); ship DOCX-export-for-comments first as the cheap, high-value substitute for the 'co-authors comment in Word' workflow.

## Sources

- https://docs.overleaf.com/integrations-and-add-ons/ai-features/error-assist
- https://www.overleaf.com/about/ai-features
- https://docs.overleaf.com/collaborating/reviewing-and-reviewers
- https://www.overleaf.com/learn/how-to/Track_Changes_in_Overleaf
- https://www.digital-science.com/blog/2025/06/digital-science-launches-new-cutting-edge-ai-writing-tools-for-20-million-overleaf-users/
- https://openai.com/prism/
- https://www.thesisai.io/blog/openai-prism-ai-latex-editor-review/
- https://github.com/OpenDCAI/OpenPrism
- https://github.com/EvolvingLMMs-Lab/lmms-lab-writer
- https://www.useoctree.com/blog/overleaf-alternatives-research-writing-2026
- https://texmate.es/
- https://scispace.com/t/latex/
- https://scispace.com/agents/latex-to-word-218ib3aw
- https://scispace.com/help/en/articles/10864981-how-to-automatically-generate-bibliographies-in-scispace
- https://scispace.com/agents/journal-ready-c2ixvitn
- https://paperpal.com/blog/news-updates/product-updates/make-your-manuscript-submission-ready
- https://paperpal.com/
- https://jenni.ai/
- https://docs.jenni.ai/docs/export-and-import/
- https://typst.app/
- https://www.typetex.app/alternatives/overleaf-alternatives
- https://www.underleaf.ai/tools/tikz-generator
- https://youvenz.github.io/blog/2026-03-05-convert-latex-to-word-with-pandoc-preserve-equations/
- https://hackmd.io/@wmvanvliet/rynY4IYXq
- https://ja01.chem.buffalo.edu/etcetera/latex-pandoc-word.html
