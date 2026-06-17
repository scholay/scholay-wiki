# Citation Criteria

## What each ladder level requires

### Level 1 — `checked`

The source text has been verified against the original document.

Checklist:
- [ ] Opened the original source page (PDF scan or digital text)
- [ ] Confirmed that `original_text` or `ocr_text` accurately represents what the page says
- [ ] Corrected any OCR errors found
- [ ] `verification_status` set to `checked`

A `checked` slice is safe to **paraphrase** in writing. It is not yet safe to quote directly.

---

### Level 2 — `reviewed`

The working-language translation has been confirmed accurate.

Checklist:
- [ ] Source text is already at `checked` level
- [ ] Read the working translation alongside the original text
- [ ] Confirmed the translation accurately conveys the source meaning
- [ ] Corrected or rewrote any inaccurate sections
- [ ] `translation_status` set to `reviewed`

A `reviewed` slice is safe to **paraphrase and synthesize** from in writing. It can support a claim without being quoted directly.

---

### Level 3 — `quote_ready`

The slice can be used as a direct citation, including verbatim quotation.

Checklist:
- [ ] Source text is at `checked` level
- [ ] Translation is at `reviewed` level
- [ ] Citekey exists in the bibliography and resolves correctly
- [ ] Page locator is confirmed (the exact page or page range the quote comes from)
- [ ] No remaining OCR risk flags on this page (`repeated_glyphs`, `script_mismatch`, etc.)
- [ ] `quote_ready` set to `true`

---

## Image slice criteria

An image slice is ready for use as a figure in writing when:

- [ ] The image has been **visually inspected** (by a human or multimodal model looking at the actual pixels — not inferred from OCR text)
- [ ] `description_status` is `visual_draft` or `reviewed` (not `ocr_assisted_draft`)
- [ ] Rights status is confirmed (`cleared`, `public_domain`, or `fair_use_review` with documented basis)
- [ ] The caption states the scholarly source and page number (not internal IDs)
- [ ] If a crop is used: the crop covers exactly one figure element, not a full page or a multi-figure region

`ocr_assisted_draft` descriptions are browsing inventory, not figure-ready evidence.

---

## Common shortcuts to avoid

**"The quality score is OK, so it must be citation-ready."**
Quality scores catch obvious mechanical problems. They do not verify that the text accurately represents the source, that the translation is faithful, or that the page locator is correct. Human review is always required for `quote_ready`.

**"The machine translation is fluent, so it must be accurate."**
Fluency and accuracy are different. A machine translation can read naturally while still missing a negation, mistranslating a technical term, or confusing two similar concepts. Read translation against source.

**"I reviewed it once, so it stays reviewed forever."**
If the source text or translation layer is edited after review, set the status back and re-review. Stale `reviewed` status on edited content is as bad as no review.

---

## Evidence matrix template

Keep one matrix per chapter or major section:

| Slice ID | Section | Argument role | Ladder level | Direct quote? | Notes |
|----------|---------|---------------|--------------|---------------|-------|
| SLC-0001-T003 | 2.1 | supports claim about X | reviewed | no | paraphrase only |
| SLC-0007-T012 | 3.2 | defines key term | quote_ready | yes | cite p.47 |
| SLC-0012-I005 | 4.1 | illustrates spatial layout | figure-ready | — | confirm rights |

Add a slice to the matrix when you first plan to use it in writing — not after the draft is complete.
