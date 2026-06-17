# Figure Workflow

## The two rules that matter most

1. **One figure, one figure element.** Never place a full source page or a region containing multiple independent figures. Crop to exactly one meaningful element.
2. **Canonical source images, not screenshots.** Use the page image file from your source object layer. Do not capture from a PDF viewer, browser, or presentation.

## Figure types

Before cropping, identify what type of figure this is. The crop should match its argumentative role:

| Type | What to preserve |
|------|-----------------|
| Map | Full extent including legend, scale bar, and north arrow |
| Plan / floor plan | Complete boundary including all walls, labels, and dimension strings |
| Section / elevation | Full height including ground line and roof; all labels |
| Photograph | Full frame unless a specific detail is the subject |
| Diagram / schematic | Complete diagram including all labels and connecting elements |
| Table | Full table including all column headers and row labels |
| Graph / chart | Full chart area including axes, legend, and title |

## Cropping procedure

1. Locate the canonical source page image for this source and page.
2. View the full page before deciding on crop boundaries.
3. If boundaries are uncertain, overlay a temporary grid and choose from grid coordinates.
4. Crop conservatively — a small amount of white margin is better than losing content at the edge.
5. Only whiteout surrounding text if it clearly belongs to a different figure element on the same page.

Record each crop as a repeatable specification:
- output filename
- source image path
- crop box (left, top, right, bottom in pixels)
- label describing the figure element
- note explaining why this is a single element
- any whiteout boxes applied

Store crop specifications in a script, not as ad hoc operations. This makes figures rebuildable and auditable.

## Caption rules

A figure caption must state:
- the scholarly source (author, year, or institution)
- the page or figure number from the source
- a brief description of what the figure shows

A caption must not state:
- internal file paths or corpus IDs
- processing notes or status
- your own analysis (that belongs in the body text)

Example:
> Plan of a traditional dwelling, Ban Chom Khong. Source: Bounyavong 2019, p. 47.

Not:
> SLC-0003-I012, crop from SRC-0003__p047.jpg

## Figure placement

Place a figure **after** the paragraph that establishes its argumentative role. A figure without a setup paragraph is visual decoration, not evidence.

The body paragraph should explain:
- what the figure shows
- why it matters for the current argument
- what the reader should notice

The caption then provides the citation trail. The reader should be able to follow: body claim → figure → caption → source → corpus slice.

## Integrity check before output build

Before compiling or exporting:
- [ ] Every figure has a canonical source page image on file
- [ ] Every crop covers exactly one figure element
- [ ] No crop cuts off map edges, legends, dimension strings, walls, or axis labels
- [ ] Every caption states the scholarly source and page
- [ ] No caption contains internal IDs or processing notes
- [ ] Figure appears after the paragraph that establishes its role
