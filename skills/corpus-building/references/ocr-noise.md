# OCR Noise: Patterns, Quarantine, and Recovery

## Why noise happens

OCR noise is usually not random. It has causes — and the right response depends on identifying the cause, not just blocking the page.

## Common noise patterns

| Pattern | Likely cause | Right fix |
|---------|-------------|-----------|
| Long runs of the same character (`aaaaaaa`, `........`) | Table of contents, figure list, or low-contrast scan | Re-OCR with preprocessing; do not quarantine |
| Characters from the wrong script | Wrong language pack configured | Re-run OCR with the correct language setting |
| Flood of brackets, replacement characters (`▪`, `□`, `?`) | Encoding mismatch or corrupt scan | Check the source file; may need a different OCR engine |
| Source-language text surviving into translation | Translation model passed characters it could not identify | Fix the OCR layer first; retranslate |
| Very short or empty output | Image-only page, figure, or full-page photograph | This is correct behavior — handle as image evidence |

## Before quarantining pages in bulk

Quarantining marks pages as `excluded` and removes them from the active corpus. **Over-quarantine is as harmful as under-quarantine** — blocked pages are invisible, and you may lose evidence you needed.

Before running a bulk quarantine pass:

1. Pull a sample of 10–20 flagged pages and inspect them visually.
2. Identify which pattern you're dealing with (see table above).
3. Fix the underlying cause if possible (wrong language pack, preprocessing needed) before quarantining.
4. Quarantine only after you've confirmed the pages are genuinely unrecoverable with current tooling.

## Quarantine procedure

When quarantine is the right call:

1. Mark affected slices `ocr_status: blocked` and `excluded: true`.
2. Log every excluded page in a blocked-pages list with: source ID, page number, reason code, and date.
3. Rebuild your corpus index and any downstream views after quarantine.

Reason codes: `ocr_noise` / `unrecoverable_scan` / `image_only` / `pending_better_ocr`

## Recovery procedure

Quarantined pages should be revisited, not permanently abandoned.

**For `ocr_noise` pages**: re-run OCR with:
- Corrected language settings
- Image preprocessing (contrast adjustment, deskew, despeckling)
- A different OCR engine if available

If re-OCR produces clean text:
1. Restore the source text into the slice card
2. Set `ocr_status: cleaned`
3. Set translation status to pending (do not fabricate a translation)
4. Validate the corpus index
5. Rebuild downstream views

**For `image_only` pages**: these are correct — the page has no meaningful text. Create or update an image slice card instead.

**For `pending_better_ocr` pages**: log these separately. They are waiting for a better tool or API, not a settings fix.

## After recovery

Recovered pages have clean source text but no working-language translation. They need a translation pass before they can be reviewed for citation use. Do not mark them `reviewed` or `quote_ready` based on OCR recovery alone.
