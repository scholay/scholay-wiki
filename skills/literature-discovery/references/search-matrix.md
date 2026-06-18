# Search Matrix Template

## How to use this template

Fill in the rows before running any searches. The matrix forces you to think through what you're looking for — and what you're *not* looking for — before opening a database.

## Matrix

| Axis | Primary terms | Synonyms / variants | Exclusions |
|------|--------------|---------------------|------------|
| Core topic | | | |
| Sub-topic / aspect | | | |
| Geographic scope | | | |
| Object type | | | |
| Time period | | | |
| Languages to search | | | |
| Methods to compare | | | |

## Search query construction

From the matrix, build compound queries:

```
[core topic] AND [geographic scope]
[core topic] AND [object type]
[synonym] AND [time period]
[language variant] AND [sub-topic]
```

Keep a log of every query you run:

| Date | Database | Query | Results | Kept | Notes |
|------|----------|-------|---------|------|-------|
| | | | | | |

## Candidate status vocabulary

| Status | Meaning |
|--------|---------|
| `candidate` | Discovered, not yet evaluated |
| `keep` | Evaluated, relevant, promote to source intake |
| `exclude` | Evaluated, not relevant (record the reason) |
| `needs_pdf` | Relevant but no file available yet |
| `needs_translation` | Relevant but language access barrier |
| `duplicate` | Already registered under a different discovery path |

## Useful discovery tools

- **OpenAlex** (openalex.org) — open bibliographic graph; free API; good for forward/backward citation traversal
- **Semantic Scholar** — strong for AI/CS/biomedical; useful citation graph
- **Google Scholar** — broad coverage; no API; use for citation counts and forward search
- **WorldCat** — good for finding books and theses
- **JSTOR / ProQuest** — useful for humanities and social science journals
- **National library catalogs** — essential for regional language literature

## Gap audit checklist

Before closing a discovery round:

- [ ] Have I searched in all relevant languages?
- [ ] Have I traced backward from at least 3 strong seed items?
- [ ] Have I traced forward from at least 2 high-citation items?
- [ ] Have I searched for practitioner reports, grey literature, and institutional publications?
- [ ] Is there a time period I haven't covered?
- [ ] Is there a geographic region that's under-represented?
