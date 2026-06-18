# Archive First

## The problem

When research materials arrive, the visible standalone files are rarely the complete picture. The bulk of the corpus is often compressed inside zip archives, rar files, or nested folders. Registering only the visible files creates a false baseline: you think you've ingested 12 sources when you actually have 60.

**Do not describe a corpus as ingested until every archive has been expanded.**

## Why this matters in practice

- Planning which sources to process next depends on knowing what you have
- Deduplication is impossible if half the sources are invisible
- Priority decisions (which sources to OCR first) are distorted if the archive contents are unknown
- You will eventually need to expand the archives anyway — doing it last means rework

## The correct sequence

```
1. Inventory raw materials as received (do not open or rename anything)
2. Expand every archive into a staging area
3. Inventory the expanded contents
4. Classify and separate: PDFs, image groups, datasets, reference files
5. Check for duplicates across expanded + standalone materials
6. Register source objects
7. Generate derivatives (OCR, page images, etc.)
```

Steps 1–4 happen before any source ID is assigned. Steps 5–7 happen after.

## Staging structure

Expand archives into a dedicated staging area, not into the final working folder:

```
expanded_archives/
  RAW-0003/           ← contents of the third raw archive
    file_a.pdf
    file_b.pdf
    images/
      img_001.jpg
      img_002.jpg
  RAW-0007/
    ...
```

Record the parent archive ID (`RAW-####`) for every extracted file. This is the only way to trace a registered source back to its origin after the fact.

## What to do with expanded contents

After expansion, sort each extracted item into one of these queues:

| Queue | Contents | Next action |
|-------|---------|-------------|
| `pending_pdf_candidates` | PDF files that look like research sources | Check for duplicates, then register |
| `pending_image_groups` | Folders of images forming a logical unit | Decide handling strategy before registering |
| `reference_files` | Licenses, rights statements, metadata exports | Register as metadata, not corpus evidence |
| `datasets` | CSV, XLSX, GIS, or other structured data | Register separately; do not force into PDF |
| `ambiguous` | Anything that needs a decision before registering | Flag and decide before proceeding |

## Common mistakes

**Registering from visible files only**
You assign SRC-0001 through SRC-0004 to the four PDFs you can see. The zip file sitting next to them contains 48 more. You have now created a gap in your numbering and a false inventory baseline.

**Expanding and immediately processing**
You expand an archive and start running OCR on the extracted files before registering them. Now you have OCR output for files that don't have stable IDs yet. The chain from raw → normalized → derivative is broken.

**Treating extracted image groups as PDFs**
A folder of 120 JPEGs is not a PDF source. Decide whether it becomes a derived PDF, an image group with individual slices, or something else — before assigning an ID or running OCR.

## Lessons from practice

- A "standalone-first" registration pass is useful as a starting point, but explicitly mark it as incomplete until archives are expanded.
- Image bundles extracted from archives should never be silently ignored or automatically converted to PDF. They need a handling strategy.
- The expanded_inventory manifest is not optional. Without it, the relationship between raw archives and registered sources is lost.
