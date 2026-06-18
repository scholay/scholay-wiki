# Slice Schema

## Required record types

### Source card

One file per registered source. Created before any slices.

Minimum fields:

| Field | Description |
|-------|-------------|
| `source_id` | Stable ID (`SRC-####`) |
| `title` | Full title |
| `authors` | Author list |
| `year` | Publication year |
| `language` | Primary language of the source |
| `file_path` | Path to the normalized source file |
| `topics` | Subject tags |
| `citekey` | Bibliography key (one per source, stable once set) |
| `ocr_status` | Processing state of the text layer |
| `translation_status` | Processing state of the working-language layer |

---

### Text slice

One file per extracted text evidence unit.

Minimum fields:

| Field | Description |
|-------|-------------|
| `slice_id` | Stable ID (`SLC-####-T###`) |
| `slice_type` | `text` |
| `source_id` | Parent source |
| `page_start` | First page of this slice |
| `page_end` | Last page of this slice |
| `tags` | Subject tags |
| `ocr_status` | See status vocabulary |
| `translation_status` | See status vocabulary |
| `verification_status` | See status vocabulary |
| `quote_ready` | `true` only after all citation criteria are met |

Body sections (keep as separate, never-overwriting layers):

- `original_text` — exact text from the source
- `ocr_text` — OCR-cleaned version (if different)
- `working_translation` — translation into your project's working language

---

### Image slice

One file per page image, figure, plan, photograph, table, or diagram.

Minimum fields:

| Field | Description |
|-------|-------------|
| `slice_id` | Stable ID (`SLC-####-I###`) |
| `slice_type` | `image` |
| `source_id` | Parent source |
| `page` | Source page number |
| `image_kind` | `page_scan / figure / photo / plan / diagram / table / crop` |
| `image_path` | Path to the image file |
| `crop_path` | Path to a crop (if the image is a crop of a larger page) |
| `caption` | Caption from the original source, if any |
| `working_caption` | Caption in your working language |
| `visual_status` | See status vocabulary |
| `description_status` | See status vocabulary |
| `rights_status` | `source_page / unknown / cleared / restricted / public_domain` |
| `selected` | `true` when promoted to active evidence |

---

## Status vocabulary

### OCR status
`not_started` → `in_progress` → `raw_ocr` → `cleaned` → `verified` → `blocked` / `not_needed`

### Translation status
`not_started` → `machine_draft` → `agent_draft` → `pending_translation` → `reviewed` → `quote_ready` → `blocked` / `not_needed`

### Verification status
`draft` → `checked` → `reviewed`

### Image description status
`not_started` → `ocr_assisted_draft` → `visual_draft` → `reviewed` → `caption_ready`

### Image visual status
`auto_page` → `needs_description` → `described` → `checked` → `selected_figure` → `blocked`

---

## Granularity rules

- Slice by logical unit: one argument, one figure, one data table, or one page. Not by random fragment size.
- Page-level auto-slices are acceptable for first-pass inventory. Keep them at `draft` status until reviewed.
- If a quote requires surrounding explanation, store the quote in the slice and the explanation as a separate annotation layer.
- If OCR is noisy, preserve the raw OCR text and place the cleaned version in a separate field — never overwrite.
- If translation is provisional, mark it `machine_draft` and do not promote until reviewed.

## Index rule

Every slice must have a corresponding row in the corpus index file (`slices.csv` or equivalent). If the index and the file system disagree, the files are the source of truth — rebuild the index from files.
