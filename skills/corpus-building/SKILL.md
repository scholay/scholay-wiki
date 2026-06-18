---
name: corpus-building
description: Extract, structure, and quality-check evidence from registered source objects. Use when converting processed documents into searchable evidence cards, managing OCR and translation layers, running quality scoring, handling noise and recovery, or maintaining a corpus index.
---

# Corpus Building

## The core problem

A folder of PDFs is not a corpus. A corpus is a collection of *addressable evidence units* — each one traceable to a specific page of a specific source, with enough context to be used in writing without reopening the original document.

This skill covers the full path from source object to evidence card, including OCR, translation, quality scoring, and the noise problems that appear at scale.

## Key concepts

**Source card** — one record per registered source. Holds metadata, processing status, and links to all derived evidence.

**Text slice** — one evidence unit extracted from a specific page range of a source. Stores the original text, cleaned OCR text, and working translation as separate layers. Never collapses them.

**Image slice** — one image evidence unit (a page scan, figure, plan, photograph, table, or diagram). Stores file path, description, and status.

**The separation rule**: a slice stores what the source *says*. AI annotations store what AI *thinks about* the slice. Do not mix them.

## Workflow

### 1. Create the source card first

Before creating any slices, create a source card for the registered source object. Minimum fields: source ID, title, language, file path, topics, status fields for OCR and translation.

### 2. Run OCR

For each source, generate per-page text output.

**Default path**: use a local OCR engine (Tesseract or equivalent). For multilingual documents, set the language pack explicitly — running an incorrect language pack produces script-mismatch noise, not just bad quality.

**Cloud OCR path** (optional): use a cloud OCR API for higher fidelity on difficult scans. Reserve this for pages that local OCR consistently fails on, not as a default for all sources.

Output per page: raw OCR text file. Keep raw output separate from any cleaned version.

### 3. Slice into evidence cards

For each page (or logical text unit), create a text slice card with:
- Slice ID (`SLC-####-T###`)
- Source ID and page reference
- Original text (from source)
- OCR-cleaned text (if different)
- Working translation (in your project's working language)
- Status fields: OCR status, translation status, verification status

For each page image, create a baseline image slice card with:
- Slice ID (`SLC-####-I###`)
- Source ID and page number
- Image file path
- Image type (page scan, figure, plan, photo, table, diagram)
- Description status

**On image descriptions**: use a multimodal model to inspect the actual image pixels. Do not use OCR output as a substitute for visual inspection. Label OCR-derived descriptions as `ocr_assisted_draft` — they are lower trust than a genuine visual description.

### 4. Run quality scoring

After slicing, score each page on:
- **OCR quality**: are there repeated characters, symbol noise, script artifacts?
- **Translation quality**: is the working language layer present and readable?

Assign a triage priority:
- `P1` — likely broken; inspect immediately before using
- `P2` — needs review; often image-heavy or missing translation
- `P3` — usable but worth spot-checking
- `OK` — acceptable for browsing

**Calibrate before scaling**: after your first new source type, inspect all P1 pages plus a sample of P2 and OK. If the scoring looks wrong, fix the scorer before running 50 more sources.

### 5. Handle noise and blocked pages

At scale, some pages will have OCR artifacts severe enough to quarantine:
- Repeated-character runs
- Script mismatch (wrong language pack)
- Symbol floods

Before bulk quarantine, **sample the flagged pages visually**. Common false positives:
- Table-of-contents pages with dotted leaders (`…………`) — readable, just unusual
- Pages in a different script than you expected — fix the language setting, not the page

For genuinely noisy pages, mark them `excluded` and log them in a blocked pages list with a reason code. Revisit after fixing the underlying cause (wrong language pack, poor scan quality, etc.) rather than leaving them permanently blocked.

### 6. Validate and rebuild

After every batch, validate that:
- Every slice card in your folder has a row in your index
- No duplicate slice IDs exist
- No index rows reference missing files

Rebuild any downstream views (app data, search indexes) from the validated corpus, not from cached state.

## Rules

- Markdown/text cards are the source of truth. CSV/database indexes are rebuildable projections.
- Never let a translation overwrite the original text or the OCR-cleaned text. Keep all three layers.
- Never use OCR output as a substitute for visual inspection of images.
- Do not create slices from unregistered source objects.
- Do not run quality scoring and then ignore the results — calibrate the scorer and act on P1 pages.
- Over-quarantine is as harmful as under-quarantine. Sample before bulk-blocking.
- Auto-generated page slices are browsing inventory, not citation-ready evidence. Mark them accordingly.
- Validate after every batch. Do not continue slicing when validation fails.

## Status vocabulary

**OCR status**: `not_started / in_progress / raw_ocr / cleaned / verified / blocked / not_needed`

**Translation status**: `not_started / machine_draft / agent_draft / pending_translation / reviewed / quote_ready / blocked / not_needed`

**Verification status**: `draft / checked / reviewed`

**Image description status**: `not_started / ocr_assisted_draft / visual_draft / reviewed / caption_ready`

## References

- Read `references/slice-schema.md` for required fields, status vocabulary, and granularity rules.
- Read `references/quality-scoring.md` for triage priority semantics, risk tags, and calibration guidance.
- Read `references/ocr-noise.md` for common noise patterns, false-positive quarantine risks, and recovery steps.
