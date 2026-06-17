---
name: source-intake
description: Organize, classify, and register raw research materials into a stable, trackable source layer. Use when processing newly collected PDFs, archives, image folders, or mixed downloads; assigning stable IDs; maintaining intake manifests; or deciding what type of object each material is before any processing begins.
---

# Source Intake

## The core problem

Research materials accumulate in chaotic ways: some arrive as standalone PDFs, some inside zip archives, some as image folders, some as web pages saved to disk. Processing them without first understanding what you have creates a false baseline — you think you've ingested everything when the most important items are still locked inside a zip file.

**Rule zero: expand all archives before claiming anything is ingested.**

## Object types

Before assigning an ID to anything, classify it:

| Type | Description |
|------|-------------|
| `source_pdf` | A PDF that can be processed directly |
| `derived_pdf` | A PDF you generate from images, scans, or web pages |
| `image_group` | A folder of images that form a logical unit (scanned pages, figures) |
| `dataset` | Structured data files (CSV, XLSX, JSON, GIS) |
| `reference_file` | Rights, permissions, licenses, or metadata files |
| `archive` | ZIP, RAR, or other compressed container — expand first, then classify contents |
| `ambiguous` | Needs a decision before it can be registered |

## Workflow

### 1. Inventory before touching

Before doing anything else, list what you have and where it came from. Keep a raw inventory file. Do not rename or move anything in the raw layer.

### 2. Expand all archives

Expand every archive into a staging area. Note the parent archive ID for each extracted file so you can trace it back later.

Update these manifests after expansion:
- `expanded_inventory` — what came out of which archive
- `pending_pdf_candidates` — PDFs waiting for registration
- `pending_image_groups` — image folders waiting for a handling decision

### 3. Check for duplicates

Before assigning a new ID, check whether this item is already registered. Match on: DOI or URL first → title + year → manual review.

### 4. Assign stable IDs

Once an item is confirmed unique and classified, assign a stable ID. Recommended format:

- Raw objects: `RAW-####` (source as received, untouched)
- Processed source objects: `SRC-####` (stable, normalized copy)

Keep both IDs in your manifest so the chain from raw to processed is always traceable.

### 5. Normalize

Create one clean, stable copy of each source object:
- **PDF**: copy with a stable filename into your normalized folder
- **Image group**: document the group strategy before doing anything else (will this become a derived PDF, or stay as individual images?)
- **Dataset**: register and note the format; do not force into PDF
- **Web page**: preserve the URL and access date; create a PDF capture if needed

### 6. Record derivatives separately

If you generate page images, OCR text, or other derivatives from a source object, record them in a separate manifest — not in the raw inventory. Keep the chain: raw → normalized → derivative.

## Rules

- Never rename or overwrite files in the raw layer. All transformations happen in a separate staging or working layer.
- Do not register a source object before checking for duplicates.
- Do not force image groups into PDF form by default — decide the handling strategy first.
- Do not force datasets, license files, or ambiguous objects into PDF form.
- Manifests must make parent–child relationships explicit (which archive did this PDF come from?).
- Record the source before generating any derivatives.
- If a source is ambiguous, mark it `status: pending_decision` rather than guessing.

## Manifest minimum fields

For each registered source object, record at minimum:
- stable ID (`SRC-####`)
- object type (from the type table above)
- original raw path
- normalized/working path
- parent raw ID (if from an archive)
- language
- status
- notes

## References

- Read `references/naming-conventions.md` for ID formats, filename patterns, and status vocabulary.
- Read `references/archive-first.md` for why archive expansion must come before registration, and common mistakes when skipping it.
