# Quality Scoring

## Purpose

Quality scoring turns a large batch of auto-generated slices into a triage queue. The output tells you *where to look first*, not whether something is safe to cite.

## Scoring dimensions

| Dimension | What it measures |
|-----------|-----------------|
| `ocr_score` | Readability and cleanliness of the extracted text |
| `translation_score` | Presence and apparent quality of the working-language layer |
| `overall_score` | Weighted combination for browsing triage |

## Priority levels

| Priority | Meaning | Recommended action |
|----------|---------|-------------------|
| `P1` | High risk — likely broken OCR, bad translation, or script artifacts | Inspect before any use |
| `P2` | Needs review — image-heavy, low-text, or missing translation | Sample before using |
| `P3` | Probably usable — worth spot-checking | Review before citing |
| `OK` | Acceptable for browsing | Still not automatically citation-ready |

`OK` does not mean citation-ready. It means the automated checks did not find obvious problems.

## Common risk tags

| Tag | Meaning |
|-----|---------|
| `image_only_or_low_text` | Page has very little text; may need to be handled as visual evidence |
| `repeated_glyphs` | OCR produced long runs of the same character |
| `symbol_noise` | High density of brackets, punctuation, or replacement characters |
| `script_mismatch` | Wrong language pack was used; output contains characters from another script |
| `source_language_leak` | Translation still contains source-language text |
| `translation_missing` | No working-language layer was generated |
| `description_missing` | Image slice exists but has no description or caption |

## Calibration procedure

After processing a new source type (different language, different scan quality, different layout), do not trust the scorer blindly:

1. Inspect all `P1` pages plus a 10% sample of `P2` and `OK`.
2. Identify false positives (pages scored P1 that look fine) and false negatives (pages scored OK that are broken).
3. If the error rate is significant, adjust the scorer thresholds before continuing.

**Known false-positive triggers:**
- Table-of-contents pages with long dotted leaders (`…………`) — readable, just unusual
- Pages in a different script than expected (script mismatch is a settings error, not a page error)
- Very short pages (footers, section dividers) that trigger low-text flags

**Rule**: if P1 pages account for more than 20% of a source without an obvious explanation, stop and audit before bulk-processing more sources with the same settings.

## Scoring after changes

Re-run quality scoring after any of the following:
- Re-OCR of blocked pages
- Retranslation or editing of working-language layers
- Adding or correcting image descriptions
- Changing status fields on slice cards

Quality scores read from slice frontmatter at scoring time — do not rely on cached scores after corpus edits.

## Scores are not citation decisions

Quality scores feed the `evidence-review` skill's prioritization step. The final decision about whether a slice is citation-ready always requires human review. A perfect `OK` score does not make a slice `quote_ready`.
