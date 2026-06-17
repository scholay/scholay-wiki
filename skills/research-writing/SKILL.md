---
name: research-writing
description: Draft and maintain academic papers from verified corpus evidence, manage bibliography, and produce output in any target format. Use when outlining chapters, mapping evidence to arguments, drafting or revising sections, managing citations, placing figures, or running integrity checks before building output.
---

# Research Writing

## The core problem

Two failure modes are common in AI-assisted academic writing:

1. **Writing from memory**: using AI to draft paragraphs without grounding claims in verified source evidence. Produces fluent but unchecked text.
2. **Leaking the workflow**: letting internal process terms (`corpus`, `slice`, `source card`, `OCR pipeline`) appear in the final document. The paper should read as the researcher's scholarly analysis, not as a description of how it was produced.

This skill addresses both.

## Core principle

Write from verified evidence, not from memory. Every claim in the paper should trace back to at least one evidence slice at `reviewed` or `quote_ready` level. Every figure should trace back to a reviewed image slice.

The paper is the *output* of the research system. It should not expose how the system works.

## Workflow

### 1. Build the chapter outline before drafting

For each chapter or section, define:
- The central question or argument this section answers
- The evidence slices that support the argument (from your evidence matrix)
- The figures or tables that illustrate it
- The citekeys required

Do not start drafting paragraphs before this mapping is clear.

### 2. Draft from grouped evidence

For each subsection:
1. Gather the evidence slices assigned to it
2. Identify what they collectively show
3. Write synthesis paragraphs in your own analytical voice
4. Insert citations inline as you draft — do not leave "[CITE]" placeholders

**On citations**: insert a citation only when the supporting slice is at least `verification_status: checked`. For direct quotations, `quote_ready: true` is required.

### 3. Manage bibliography in parallel

Keep one master bibliography file. One source gets one citekey.

Citekey rules:
- ASCII only
- Format: `AuthorYYYYKeyword` (e.g., `Smith2019vernacular`)
- Once a citekey appears in any draft, treat it as frozen — changing it later breaks citations silently

Add to the bibliography as you add citations to the draft, not at the end.

Verify bibliography integrity regularly:
- Every inline citation resolves to a bibliography entry
- Every bibliography entry is actually cited somewhere (no phantom references)
- Every cited slice can be traced to a source object

### 4. Place figures purposefully

A figure earns its place by serving a specific argumentative role. Place it after the paragraph that establishes why it matters, not before.

For each figure:
- Use the canonical source page image or a crop of it, not a screenshot
- Crop exactly one figure element — not a full page, not a region containing multiple independent figures
- The caption states the scholarly source and page
- Keep a record of: source image path, crop coordinates, output filename, and why this is a single figure element

### 5. Run an integrity check before every output build

Before compiling or exporting:
- Every major claim has a citation
- Every citation resolves in the bibliography
- Every figure has a documented source trail
- No internal process terms appear in the body text

### 6. Produce output in your target format

The manuscript source (LaTeX, Markdown, Word, etc.) is canonical. All exports (PDF, DOCX, HTML) are derivatives.

If you generate a manuscript snapshot for app-layer reading or collaboration, treat it as read-only — edits belong in the canonical source, not in the snapshot.

## Formatting rules for Chinese academic prose

(Skip this section if not writing in Chinese)

- **Page locators**: keep them in footnotes or endnotes, not inline in body text
- **Abbreviations**: spell out every abbreviation on first use: `中文含义（Full Term, ABBR）`
- **Term lists**: use a table for more than 3–4 term correspondences, followed by a prose paragraph that interprets the table
- **Alarm vocabulary**: avoid "濒危" (endangered), "亟待抢救" (urgently needs rescue) and similar terms unless directly supported by a cited source

## Rules

- Write only from evidence at `reviewed` level or above. Do not draft claims you cannot immediately trace to a slice.
- Do not introduce a claim without a citation trace. Unsupported claims belong in `notes/` until evidence is found.
- Do not expose internal workflow terms in the body text: `corpus`, `slice`, `SLC-`, `SRC-`, `source card`, `OCR`, `agent`. These belong in comments, notes, and working documents.
- Do not place a whole source page as a figure. Crop one meaningful figure element.
- Do not change a citekey once it appears in any draft file.
- The manuscript snapshot is read-only. Canonical edits go into the source file.
- Run bibliography integrity check before every build.

## References

- Read `references/bibliography-management.md` for citekey rules, deduplication procedure, and bibliography sync workflow.
- Read `references/figure-workflow.md` for the full figure extraction, cropping, and captioning procedure.
- Read `references/proposal-conventions.md` for doctoral proposal rhetorical structure and common mistakes to avoid.
