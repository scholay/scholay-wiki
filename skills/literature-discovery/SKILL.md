---
name: literature-discovery
description: Systematically discover and shortlist academic literature for a research project. Use when building a reading corpus from scratch, expanding an existing one, filling topic or language gaps, or turning search results into a prioritized intake queue.
---

# Literature Discovery

## The core problem

Most researchers start by downloading everything that looks relevant. This creates an unmanageable pile with no structure and no sense of what's missing. The alternative: build the corpus in deliberate waves, starting from a small seed set and expanding outward in three directions.

## Workflow

### 1. Define scope before searching

Write one sentence: what is this research about, and what is it *not* about? This sentence is your filter for every candidate you encounter.

Then build a search matrix:

| Axis | Examples |
|------|---------|
| Topic terms | main concept + synonyms + older names |
| Region/context | geographic or institutional scope |
| Object type | what specific thing you're studying |
| Time period | historical range |
| Language | all relevant languages, not just English |
| Method | field methods you're comparing against |

### 2. Start from a seed set, not a broad search

Pick 3–5 items you already know are strong:
- One overview or survey paper
- One foundational monograph or book
- One case-study cluster
- One methods paper

Do not start by downloading 200 results from a keyword search.

### 3. Expand in three directions from each seed

**Backward** — who does this paper cite? Follow references to earlier foundational work.

**Forward** — who cites this paper? Use Google Scholar, Semantic Scholar, or OpenAlex to find later work building on it.

**Lateral** — what related terms or adjacent topics does this paper *not* cover? Search those gaps explicitly.

### 4. Record every candidate before annotating

Keep a running candidate list. Add a row for every item you encounter, even if you don't have the PDF yet. Minimum fields per row:

- title, authors, year
- source (where you found it)
- language
- status: `candidate / keep / exclude / needs_pdf / needs_translation`
- reason (one line)

Do not annotate or read deeply at this stage.

### 5. Check for coverage bias

Before promoting items to intake, ask:
- Am I over-representing one language, one region, one time period?
- Are there practitioner sources, grey literature, or non-English materials I haven't touched?
- What would a critic say is missing from this list?

### 6. Promote only strong items

Only `keep`-status items move to the next stage (source intake). Everything else stays in the candidate list with a reason recorded.

## Output expectations

- A reusable search matrix
- A candidate list with statuses and one-line reasons
- A gap list: what's under-covered and why
- A `keep` queue ready for source intake

## Rules

- Search in waves. One wave = one seed's full expansion before starting the next seed.
- Never download everything from a keyword search in one pass.
- De-duplicate before promoting: DOI first, then title + year, then manual check.
- Keep translated titles and original titles together.
- Record the search URL and date for every batch — you will need to verify later.
- A candidate list with 200 items and no statuses is not useful. Triage as you go.

## References

- Read `references/search-matrix.md` for a reusable matrix template and project-specific axis examples.
