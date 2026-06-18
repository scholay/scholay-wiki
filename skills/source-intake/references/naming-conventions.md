# Naming Conventions

## ID formats

| Layer | Format | Example |
|-------|--------|---------|
| Raw object (as received, untouched) | `RAW-####` | `RAW-0007` |
| Source object (normalized, stable) | `SRC-####` | `SRC-0023` |
| Text slice | `SLC-####-T###` | `SLC-0023-T004` |
| Image slice | `SLC-####-I###` | `SLC-0023-I011` |

Use zero-padded four-digit numbers. Start at `0001`. Never reuse an ID even if a source is removed.

## Normalized filename pattern

`SRC-####__year__author__short-title__lang.ext`

Examples:
- `SRC-0007__2019__smith__traditional-dwellings__en.pdf`
- `SRC-0012__2008__yang-du__luang-prabang-houses__zh.pdf`
- `SRC-0031__unk__unk__survey-report__lo.pdf`

Rules:
- Use `unk` for unknown year or author
- Use lowercase, hyphens only (no spaces, underscores, or special characters)
- Keep the short title to 3–5 words maximum
- Use ISO 639-1 language codes (`en`, `zh`, `fr`, `lo`, `th`, `ja`, etc.)

## Manifest files

Maintain these files in your source-object layer:

| File | Contents |
|------|---------|
| `raw_inventory.csv` | Every raw object as received; never modified |
| `expanded_inventory.csv` | Contents of expanded archives, linked to parent RAW id |
| `pending_pdf_candidates.csv` | PDFs extracted from archives, waiting for registration |
| `pending_image_groups.csv` | Image folders waiting for a handling strategy decision |
| `source_map.csv` | All registered source objects with IDs and paths |
| `ocr_status.csv` | OCR processing state per source |

## Manifest minimum fields

Every row in `source_map.csv` should include:

| Field | Notes |
|-------|-------|
| `source_id` | `SRC-####` |
| `object_type` | From the object type taxonomy |
| `raw_path` | Original file location (never moved) |
| `normalized_path` | Clean working copy |
| `parent_raw_id` | `RAW-####` if extracted from an archive |
| `language` | ISO 639-1 code |
| `title` | Full title |
| `year` | Publication year, or `unk` |
| `status` | See status vocabulary |
| `notes` | Any flags, decisions, or open questions |

## Status vocabulary

### Source object status
`raw_only` → `expanded` → `pending_registration` → `normalized` → `ocr_done` → `page_images_done` → `ready_for_slicing` → `blocked`

### OCR status (in `ocr_status.csv`)
`not_started` → `queued` → `raw_ocr` → `cleaned` → `verified` → `blocked` / `not_needed`

### Text quality
`born_digital` / `scan_good` / `scan_hard` / `image_only` / `mixed`

### Review status
`unreviewed` / `spot_checked` / `fully_checked`

## OCR output naming

Keep one consistent output structure per source:

```
ocr_text/
  SRC-0023/
    SRC-0023__ocr_raw.txt       ← raw OCR output, never overwritten
    SRC-0023__ocr_clean.txt     ← cleaned version
    SRC-0023__page_manifest.json ← per-page metadata
    per_page/
      page_001.txt
      page_002.txt
      ...

page_images/
  SRC-0023/
    SRC-0023__p001.jpg
    SRC-0023__p002.jpg
    ...
```

Use zero-padded three-digit page numbers. Use `jpg` for page images unless the source requires lossless format.

## Rules

- Record a source before generating any derivatives.
- Do not use the normalized filename as the citation identifier — use the citekey from the bibliography.
- If the source came from an archive, keep the `RAW-####` parent ID visible in all downstream records.
- Update manifests immediately after any intake operation — do not reconstruct them later.
- Do not let cleaned OCR text replace the raw OCR output. Keep both.
