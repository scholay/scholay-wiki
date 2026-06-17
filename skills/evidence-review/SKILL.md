---
name: evidence-review
description: Assess and promote corpus slices toward citation readiness. Use when deciding whether a piece of evidence can be cited, upgrading machine-translated layers to reviewed translations, building evidence matrices for writing, or prioritizing which sources to review first.
---

# Evidence Review

## The core problem

Most corpus slices are created by automated pipelines: OCR, machine translation, auto-generated descriptions. They are useful for browsing, but not safe to cite. The gap between "we have 10,000 slices" and "we can write the paper" is evidence review — the deliberate process of deciding which slices are trustworthy enough to quote and cite.

Without a clear ladder between "raw" and "citation-ready," researchers either over-trust machine output or spend time reviewing everything equally. Neither is efficient.

## The citation readiness ladder

| Level | Status | What it means |
|-------|--------|---------------|
| 0 | `draft` | Auto-generated, not yet looked at by a human |
| 1 | `checked` | Source text verified against the original document |
| 2 | `reviewed` | Working translation confirmed accurate; can be paraphrased safely |
| 3 | `quote_ready` | Can be quoted or cited directly; citekey and page locator confirmed |

Only level 3 slices should appear as direct citations in writing. Level 2 is sufficient for paraphrase and synthesis.

**The key insight**: levels 0 and 1 are about accuracy of the *source text*. Levels 2 and 3 are about the *translation/working layer*. They are separate judgments.

## Workflow

### 1. Prioritize what to review

Don't review everything. Identify which slices are thesis-critical first:
- Slices already referenced in your writing or notes
- Slices from your highest-value sources
- Slices that answer your core research questions directly

For each priority cluster, look at quality scores from corpus building (`P1` pages need review before any other use; `P2` should be sampled).

### 2. Per-slice review procedure

For each slice you're reviewing:

1. Open the original source page alongside the slice card.
2. Verify that the source text (original excerpt or OCR text) accurately represents the page. Correct OCR errors if found.
3. Set `verification_status: checked` when source text is confirmed.
4. Review the working translation: does it accurately convey the source meaning? Correct or rewrite as needed.
5. Set `translation_status: reviewed` when the working layer is trusted.
6. If this slice is suitable for direct quotation or citation:
   - Confirm the citekey exists in your bibliography
   - Confirm the page locator is correct
   - Set `quote_ready: true`

### 3. Maintain an evidence matrix

For each chapter or section you're writing, keep a simple matrix:

| Slice ID | Chapter | Section | Role | Status | Notes |
|----------|---------|---------|------|--------|-------|
| SLC-0001-T003 | Ch2 | 2.1 | supports claim about X | reviewed | paraphrase only |
| SLC-0007-T012 | Ch3 | 3.2 | direct quotation | quote_ready | cite p.47 |

This makes the link between your argument and your evidence explicit and checkable.

### 4. Run the integrity check before writing

Before each writing session, verify:
- Every slice you plan to cite has at least `verification_status: checked`
- Every slice you plan to quote directly has `quote_ready: true`
- Every citekey in your evidence matrix resolves in your bibliography

## Rules

- Do not promote a slice to `quote_ready` based on quality scores alone. Human review of both source text and translation is required.
- Do not cite from `machine_draft` or `agent_draft` translation layers directly. These are working materials, not citation materials.
- Separate source text accuracy from translation accuracy — they are different judgments, made at different stages.
- A slice at `reviewed` level is safe to paraphrase. A slice at `quote_ready` level is safe to quote.
- When you first use a slice in writing, add it to the evidence matrix immediately.
- OCR-assisted image descriptions (`ocr_assisted_draft`) are not citation-ready visual evidence.

## References

- Read `references/citation-criteria.md` for the full checklist of what each ladder level requires for text and image slices.
