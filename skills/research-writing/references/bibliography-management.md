# Bibliography Management

## The core rule

One source gets one citekey. One citekey stays stable once it appears in any draft file.

## Citekey format

Recommended: `AuthorYYYYKeyword`

Examples:
- `Smith2019vernacular`
- `UNESCO2023heritage`
- `LiZhang2021spatial`

Rules:
- ASCII characters only
- No spaces or special characters
- If no author, use institution or a short title token
- Keep it short enough to type comfortably

**Once a citekey appears in any draft or note file, treat it as frozen.** Changing it later breaks all citations silently.

## De-duplication

Before assigning a new citekey, check whether the source is already in the bibliography.

Check in this order:
1. DOI or stable URL (exact match)
2. Title + year (exact match)
3. Fuzzy title match (for translated or scanned sources with OCR errors in metadata)
4. Manual review

When duplicates are found, keep the entry with the richest metadata and merge the others into notes.

## Adding new entries

Add a bibliography entry when you first add a citation to a draft — not at the end of the project.

For each new entry, record at minimum:
- citekey
- source_id (your corpus ID for this source)
- entry type (article, book, report, thesis, misc)
- authors
- title
- year
- publisher or journal
- DOI or URL if available
- language

For non-standard sources (scans, archival documents, web snapshots, image collections), build the entry manually. Do not generate a bib entry from a filename.

## Integrity checks

Run these checks regularly, not just before submission:

**Forward check**: every citekey used in a draft resolves to an entry in the bibliography.

**Backward check**: every entry in the bibliography is actually cited somewhere. Remove phantom entries.

**Source trace**: every cited entry can be traced to a source object in your corpus (via source_id or DOI). You should be able to find the original document for any citation.

**Locator check**: for citations that require a page number, figure number, or other locator — confirm the locator is correct, not assumed.

## Syncing with reference managers

If you use a reference manager (Zotero, Mendeley, etc.):
- Export to `.bib` format using a stable key plugin (e.g. Better BibTeX for Zotero)
- Do not let the reference manager auto-rename keys after the first export — key stability is your responsibility
- Treat the `.bib` file as the master; the reference manager is a metadata editing tool

## Nonstandard source types

Some source types need hand-built bibliography entries:

| Type | Notes |
|------|-------|
| Archival document | Record repository, collection name, document number, and access date |
| Scanned book with no digital record | Record physical library, call number, and scan date |
| Web page or report | Record URL, access date, and issuing organization |
| Image collection | Record provenance, rights, and collection reference |
| Personal communication | Usually cited in a footnote, not a formal bibliography entry |

## What not to do

- Do not cite from a PDF filename (`SRC-0012__2008__yang-du__...`). Use the scholarly reference.
- Do not create two active citekeys for the same source.
- Do not overwrite a manually verified entry with a weaker auto-generated export.
- Do not let bibliography management slip to the end of a project.
