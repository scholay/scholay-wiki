import { http, HttpResponse } from "msw";
import type {
  Journal,
  Paper,
  PaperAuthor,
  UpstreamSource,
} from "@/shared/api/types";
import type { FeatureTool } from "@/types/feature-tool";
import { mockJournals, mockNews, mockPapers, mockTools } from "./fixtures";

type JsonObject = Record<string, unknown>;
type ContentKind = "blog" | "resources" | "qa";

const MOCK_NOW = "2026-07-28T08:00:00.000Z";

interface MockFeedbackAttachment {
  id: number;
  uploadKey: string;
  name: string;
  size: number;
  type: "image" | "file";
  mimeType: string;
  body: Blob;
}

interface MockFeedbackSubmission {
  id: number;
  email: string;
  content: string;
  category: string;
  attachmentsKey: string;
  createdAt: string;
}

const feedbackAttachments = new Map<number, MockFeedbackAttachment>();
const feedbackSubmissions: MockFeedbackSubmission[] = [];
let nextFeedbackAttachmentId = 7_001;
let nextFeedbackId = 9_001;

function apiSuccess<T>(data: T, message = "success"): Response {
  return HttpResponse.json({ code: 0, message, data });
}

function apiNotFound(message: string): Response {
  return HttpResponse.json({ code: 404, message }, { status: 404 });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: Request): Promise<JsonObject> {
  try {
    const value: unknown = await request.clone().json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInt(value: unknown, fallback: number, maximum = 100): number {
  return Math.max(
    1,
    Math.min(maximum, Math.trunc(numberValue(value, fallback))),
  );
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => text(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function lower(value: unknown): string {
  return text(value).trim().toLocaleLowerCase();
}

function routePath(path: string, request: Request): string {
  let pathname = path;
  try {
    if (/^https?:\/\//i.test(path)) pathname = new URL(path).pathname;
  } catch {
    pathname = new URL(request.url).pathname;
  }
  pathname = pathname.split("?")[0] ?? pathname;
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return pathname.replace(/^\/api\/v1(?=\/|$)/, "") || "/";
}

function isSource(value: string): value is UpstreamSource {
  return value === "stc" || value === "olx" || value === "pmd";
}

function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = Math.max(0, (page - 1) * pageSize);
  return items.slice(start, start + pageSize);
}

// ─── 论文 / 学者 ────────────────────────────────────────────────────────────

function paperSearchText(paper: Paper): string {
  return [
    paper.title,
    paper.abstract,
    paper.venue,
    ...(paper.fieldsOfStudy ?? []),
    ...(paper.authors ?? []).map((author) => author.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function paperMatchesQuery(paper: Paper, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  const haystack = paperSearchText(paper);
  if (haystack.includes(q)) return true;
  const tokens = q.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.some((token) => token.length > 1 && haystack.includes(token)))
    return true;
  // 中文产品走查时经常输入泛化词；让 Mock 保持有结果，方便检查完整列表态。
  return (
    /[\u3400-\u9fff]/u.test(q) && /(论文|科研|人工智能|学术|模型|学习)/u.test(q)
  );
}

function sourceFromPaperId(paperId: string): UpstreamSource {
  if (paperId.startsWith("olx:")) return "olx";
  if (paperId.startsWith("pmd:")) return "pmd";
  return "stc";
}

function barePaperId(paperId: string): string {
  return decodeURIComponent(paperId).replace(/^(stc|olx|pmd):/i, "");
}

function findPaper(paperId: string): Paper | undefined {
  const bare = barePaperId(paperId);
  return mockPapers.find(
    (paper) => paper.paperId === paperId || barePaperId(paper.paperId) === bare,
  );
}

function generatedPaper(paperId: string): Paper {
  const seed =
    mockPapers[Math.abs(checksum(paperId)) % mockPapers.length] ??
    mockPapers[0];
  return {
    ...seed,
    paperId,
    source: sourceFromPaperId(paperId),
    title: seed?.title ?? `Mock paper ${paperId}`,
    isFavorited: false,
  };
}

function richPaper(paper: Paper): JsonObject {
  const authors = paper.authors ?? [];
  const authorText = authors
    .map((author) => author.name)
    .filter(Boolean)
    .join(" and ");
  return {
    ...paper,
    url:
      paper.url ??
      `https://www.semanticscholar.org/paper/${encodeURIComponent(paper.paperId)}`,
    publicationDate: paper.publicationDate ?? `${paper.year ?? 2024}-06-15`,
    journal: {
      name: paper.venue ?? "Scholay Mock Proceedings",
      volume: String(((paper.year ?? 2024) % 20) + 1),
      pages: "101-118",
    },
    tldr: {
      model: "scholay-mock",
      text:
        paper.abstract?.split(/[.!?。]/u)[0] ||
        "A representative mock research result.",
    },
    bibtex: `@article{${paper.paperId.replace(/[^a-z0-9]/gi, "_")},
  title={${paper.title ?? "Untitled"}},
  author={${authorText || "Scholay Mock Author"}},
  year={${paper.year ?? 2024}},
  journal={${paper.venue ?? "Scholay Mock Proceedings"}}
}`,
  };
}

async function handlePaperSearch(request: Request): Promise<Response> {
  const body = await readJson(request);
  const query = text(body.query).trim();
  const requestedSource = lower(body.source);
  const source = isSource(requestedSource) ? requestedSource : undefined;
  const offset = Math.max(0, Math.trunc(numberValue(body.offset, 0)));
  const limit = positiveInt(body.limit, 10);

  let candidates = source
    ? mockPapers.filter((paper) => paper.source === source)
    : [...mockPapers];
  const matched = candidates.filter((paper) => paperMatchesQuery(paper, query));
  // Mock 输入不必恰好命中 fixture；无文本命中时回退当前源的完整数据，保证可调试列表态。
  candidates = matched.length > 0 ? matched : candidates;

  const yearFrom = numberValue(body.yearFrom || body.year_from, 0);
  const yearTo = numberValue(body.yearTo || body.year_to, 0);
  const dateFrom = text(body.dateFrom || body.date_from);
  const dateTo = text(body.dateTo || body.date_to);
  const venues = stringList(body.venue).map((item) => item.toLocaleLowerCase());
  const fields = stringList(body.fieldsOfStudy).map((item) =>
    item.toLocaleLowerCase(),
  );
  const minCitations = numberValue(body.minCitationCount, 0);
  const requiresOA = ["true", "1", "yes"].includes(lower(body.openAccessPdf));

  candidates = candidates.filter((paper) => {
    if (yearFrom > 0 && (paper.year ?? 0) < yearFrom) return false;
    if (yearTo > 0 && (paper.year ?? 9999) > yearTo) return false;
    if (
      dateFrom &&
      (paper.publicationDate ?? `${paper.year ?? 0}-01-01`) < dateFrom
    )
      return false;
    if (
      dateTo &&
      (paper.publicationDate ?? `${paper.year ?? 9999}-12-31`) > dateTo
    )
      return false;
    if (
      venues.length > 0 &&
      !venues.some((venue) => lower(paper.venue).includes(venue))
    ) {
      return false;
    }
    if (
      fields.length > 0 &&
      !fields.some((field) =>
        (paper.fieldsOfStudy ?? []).some((paperField) =>
          paperField.toLocaleLowerCase().includes(field),
        ),
      )
    ) {
      return false;
    }
    if (requiresOA && !paper.isOpenAccess) return false;
    return (paper.citationCount ?? 0) >= minCitations;
  });

  const sort = lower(body.sort);
  if (sort.includes("citation") || sort.includes("cited")) {
    candidates.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
  } else if (sort.includes("date") || sort.includes("year")) {
    candidates.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }

  const total = candidates.length;
  const rows = candidates
    .slice(offset, offset + limit)
    .map((paper) => richPaper(paper));
  const next = offset + rows.length < total ? offset + rows.length : undefined;
  return apiSuccess({
    data: {
      total,
      offset,
      ...(next == null ? {} : { next }),
      data: rows,
      sourcesQueried: source ? [source] : ["stc", "olx", "pmd"],
      actualSource: source ?? rows[0]?.source ?? "stc",
    },
    originalQuery: query,
    actualQuery: query,
    searchSuggestions: query
      ? [`${query} review`, `${query} benchmark`, `${query} applications`]
      : [],
    hasSuggestions: false,
    searchStrategy: "mock-fixture",
    sourcesTried: source ? [source] : ["stc"],
    sourcesFailed: [],
  });
}

async function handlePaperBatch(request: Request): Promise<Response> {
  const body = await readJson(request);
  const ids = stringList(body.paperIds);
  const seen = new Set<string>();
  const papers = ids
    .filter((id) => id && !seen.has(id) && seen.add(id))
    .map((id) => {
      const found = findPaper(id);
      const source = found?.source ?? sourceFromPaperId(id);
      return richPaper({
        ...(found ?? generatedPaper(id)),
        paperId: id,
        source,
      });
    });
  return apiSuccess(papers);
}

function paperReferences(paperId: string, request: Request): Response {
  const url = new URL(request.url);
  const offset = Math.max(0, numberValue(url.searchParams.get("offset"), 0));
  const limit = positiveInt(url.searchParams.get("limit"), 100);
  const sourcePaper = findPaper(paperId);
  const candidates = mockPapers.filter(
    (paper) => paper.paperId !== sourcePaper?.paperId,
  );
  const rows = candidates.slice(offset, offset + limit).map((paper, index) => {
    const citation = {
      ...richPaper(paper),
      source: paper.source ?? sourceFromPaperId(paper.paperId),
    };
    // 同时覆盖上游曾出现过的 direct 与 { citedPaper } 两种引用结构。
    return index % 3 === 1 ? { citedPaper: citation } : citation;
  });
  const next =
    offset + rows.length < candidates.length ? offset + rows.length : undefined;
  return apiSuccess({ offset, ...(next == null ? {} : { next }), data: rows });
}

function paperDetail(paperId: string): Response {
  const paper = findPaper(paperId) ?? generatedPaper(paperId);
  return apiSuccess(
    richPaper({
      ...paper,
      paperId,
      source: paper.source ?? sourceFromPaperId(paperId),
    }),
  );
}

function allAuthors(): PaperAuthor[] {
  const byId = new Map<string, PaperAuthor>();
  for (const paper of mockPapers) {
    for (const author of paper.authors ?? []) {
      const id =
        author.authorId || `mock-${lower(author.name).replace(/\s+/g, "-")}`;
      if (!byId.has(id)) byId.set(id, { ...author, authorId: id });
    }
  }
  return [...byId.values()];
}

function findAuthor(authorId: string): PaperAuthor {
  const decoded = decodeURIComponent(authorId);
  return (
    allAuthors().find((author) => author.authorId === decoded) ?? {
      authorId: decoded,
      name: decoded
        .replace(/^a-/, "")
        .split(/[-_]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      affiliations: ["Scholay Mock Research Lab"],
    }
  );
}

function authorDetail(authorId: string): Response {
  const author = findAuthor(authorId);
  const authored = mockPapers.filter((paper) =>
    paper.authors?.some((item) => item.authorId === author.authorId),
  );
  const score = Math.abs(checksum(author.authorId ?? authorId));
  return apiSuccess({
    ...author,
    authorId: author.authorId ?? authorId,
    name: author.name ?? "Mock Researcher",
    affiliations: author.affiliations?.length
      ? author.affiliations
      : ["Scholay Mock Research Lab", "Open Science Institute"],
    homepage: "https://example.edu/researchers/mock",
    url: `https://www.semanticscholar.org/author/${encodeURIComponent(authorId)}`,
    paperCount: Math.max(authored.length, 42 + (score % 120)),
    citationCount: 8_400 + (score % 80_000),
    hIndex: 28 + (score % 65),
    orcid: "0000-0002-1825-0097",
    source: authored[0]?.source ?? sourceFromPaperId(authorId),
  });
}

function authorPapers(authorId: string, request: Request): Response {
  const url = new URL(request.url);
  const offset = Math.max(0, numberValue(url.searchParams.get("offset"), 0));
  const limit = positiveInt(url.searchParams.get("limit"), 50);
  const author = findAuthor(authorId);
  const exact = mockPapers.filter((paper) =>
    paper.authors?.some((item) => item.authorId === author.authorId),
  );
  const supporting = mockPapers
    .filter((paper) => !exact.includes(paper))
    .slice(0, Math.max(0, 6 - exact.length))
    .map((paper) => ({
      ...paper,
      authors: [
        author,
        ...(paper.authors ?? []).filter(
          (item) => item.authorId !== author.authorId,
        ),
      ],
    }));
  const papers = [...exact, ...supporting];
  const rows = papers.slice(offset, offset + limit).map(richPaper);
  return apiSuccess({ total: papers.length, offset, data: rows });
}

function searchSuggestions(request: Request): Response {
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() ?? "";
  const requestedSource = url.searchParams.get("source") ?? "";
  const source = isSource(requestedSource) ? requestedSource : undefined;
  const paperLimit = positiveInt(url.searchParams.get("paperLimit"), 5, 10);
  const authorLimit = positiveInt(url.searchParams.get("authorLimit"), 5, 10);
  let papers = mockPapers.filter(
    (paper) =>
      (!source || paper.source === source) && paperMatchesQuery(paper, query),
  );
  if (papers.length === 0) {
    papers = mockPapers.filter((paper) => !source || paper.source === source);
  }
  const paperSuggestions = papers.slice(0, paperLimit).map((paper) => ({
    id: paper.paperId,
    title: paper.title ?? "Untitled paper",
    authorsYear: `${paper.authors?.[0]?.name ?? "Unknown"} · ${paper.year ?? "n.d."}`,
    source: paper.source ?? source ?? "stc",
  }));
  const authorSuggestions = allAuthors()
    .filter(
      (author) =>
        !query || lower(author.name).includes(query.toLocaleLowerCase()),
    )
    .slice(0, authorLimit)
    .map((author, index) => ({
      ...author,
      paperCount: 35 + index * 18,
      hIndex: 24 + index * 7,
      source: source ?? (index % 2 === 0 ? "stc" : "olx"),
    }));
  return apiSuccess({ papers: paperSuggestions, authors: authorSuggestions });
}

async function translationSse(request: Request): Promise<Response> {
  const body = await readJson(request);
  const rawTitle = text(body.title, "Research paper");
  const knownTitles: Record<string, string> = {
    "Attention Is All You Need": "注意力机制就是你所需要的一切",
    "Denoising Diffusion Probabilistic Models": "去噪扩散概率模型",
    "Highly accurate protein structure prediction with AlphaFold":
      "使用 AlphaFold 进行高精度蛋白质结构预测",
  };
  const titleZh = knownTitles[rawTitle] ?? `《${rawTitle}》的中文译题`;
  const xml =
    `<title_zh>${escapeXml(titleZh)}</title_zh>` +
    "<abstract_zh>本文介绍了一项具有代表性的研究工作，系统说明了研究问题、方法设计、实验结果与应用价值。</abstract_zh>" +
    "<tldr_zh>核心结论：该方法在准确性、效率和可扩展性方面取得了有竞争力的结果。</tldr_zh>";
  const chunks = splitString(xml, 42)
    .map(
      (chunk) =>
        `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`,
    )
    .join("");
  return HttpResponse.text(`${chunks}data: [DONE]\n\n`, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ─── 期刊 ─────────────────────────────────────────────────────────────────

function journalUnified(journal: Journal): JsonObject {
  const issns = journal.issns ?? [];
  const works = 45_000 + journal.id * 173;
  return {
    id: journal.id,
    canonical_name: journal.canonical_name,
    issn_l: issns[0] ?? null,
    print_issn: issns[0] ?? null,
    electronic_issn: issns[1] ?? issns[0] ?? null,
    source_count: journal.source_count ?? 5,
    sources: "crossref,openalex,jcr,fqb,scimago,doaj,submission",
    crossref_publisher: journal.publisher ?? null,
    doaj_publisher: journal.is_oa ? (journal.publisher ?? null) : null,
    crossref_total_dois: works,
    crossref_current_dois: Math.round(works * 0.08),
    openalex_country: journal.country ?? null,
    openalex_type: journal.type ?? "journal",
    openalex_works_count: works,
    openalex_cited_by_count: works * 28,
    openalex_h_index: journal.openalex_h_index ?? 100,
    openalex_2yr_mean_citedness: String(
      (journal.jcr_impact_factor ?? 3.2).toFixed(2),
    ),
    openalex_is_oa: journal.is_oa ? 1 : 0,
    doaj_is_in_doaj: journal.is_oa ? 1 : 0,
    wikidata_label_zh: `${journal.canonical_name}（示例译名）`,
    jcr_impact_factor:
      journal.jcr_impact_factor == null
        ? null
        : String(journal.jcr_impact_factor),
    jcr_quartile: journal.jcr_quartile ?? null,
    jcr_year: 2025,
    fqb_major_category: journal.canonical_name.includes("Machine")
      ? "计算机科学"
      : "综合性期刊",
    fqb_major_quartile: journal.fqb_quartile
      ? `${journal.fqb_quartile} [12/186]`
      : null,
    fqb_top: journal.fqb_quartile === "1" ? "是" : "否",
    fqb_year: 2025,
    ccf_rank: journal.ccf_rank ?? null,
    ccf_field: journal.ccf_rank ? "人工智能" : null,
    ccf_year: journal.ccf_rank ? 2025 : null,
    scimago_best_quartile: journal.jcr_quartile ?? "Q2",
    scimago_sjr: String(
      Math.max(0.8, (journal.jcr_impact_factor ?? 3) / 5).toFixed(3),
    ),
    scimago_year: 2025,
    scirev_first_review_months: "2.4",
    scirev_overall_rating: "4.3",
    gjqk_warning_level: journal.gjqk_warning ? "中" : null,
    gjqk_year: journal.gjqk_warning ? 2026 : null,
    has_xr: journal.xr_quartile ? 1 : 0,
    xr_year: journal.xr_quartile ? 2025 : null,
    xr_major_category: journal.xr_quartile
      ? "Multidisciplinary Sciences"
      : null,
    xr_major_category_cn: journal.xr_quartile ? "综合性科学" : null,
    xr_major_quartile: journal.xr_quartile ? `${journal.xr_quartile} 区` : null,
    xr_top: journal.xr_top ? "是" : "否",
    has_submission: journal.has_submission ? 1 : 0,
  };
}

function filterJournals(journals: Journal[], body: JsonObject): Journal[] {
  const keyword = lower(body.keyword || body.name);
  const issn = lower(body.issn);
  const publisher = lower(body.publisher);
  const country = lower(body.country);
  const typeFilter = lower(body.type);
  const jcr = lower(body.jcr_quartile);
  const fqb = lower(body.fqb_quartile);
  const scimago = lower(body.scimago_best_quartile);
  const ccf = lower(body.ccf_rank);
  const isOA = text(body.is_oa);
  const minIF = numberValue(body.min_impact_factor, 0);
  const maxIF = numberValue(body.max_impact_factor, Number.POSITIVE_INFINITY);
  const minH = numberValue(body.min_h_index, 0);
  const maxH = numberValue(body.max_h_index, Number.POSITIVE_INFINITY);
  const minSources = numberValue(body.min_sources, 0);

  return journals.filter((journal) => {
    const unified = journalUnified(journal);
    if (
      keyword &&
      ![journal.canonical_name, journal.publisher, ...(journal.issns ?? [])]
        .join(" ")
        .toLocaleLowerCase()
        .includes(keyword)
    ) {
      return false;
    }
    if (
      issn &&
      !(journal.issns ?? []).some((item) => lower(item).includes(issn))
    )
      return false;
    if (publisher && !lower(journal.publisher).includes(publisher))
      return false;
    if (country && !lower(journal.country).includes(country)) return false;
    if (typeFilter && lower(journal.type) !== typeFilter) return false;
    if (jcr && lower(journal.jcr_quartile) !== jcr) return false;
    if (fqb && lower(journal.fqb_quartile) !== fqb) return false;
    if (scimago && lower(unified.scimago_best_quartile) !== scimago)
      return false;
    if (ccf && lower(journal.ccf_rank) !== ccf) return false;
    if (isOA === "1" && !journal.is_oa) return false;
    if (isOA === "0" && journal.is_oa) return false;
    const impactFactor = journal.jcr_impact_factor ?? 0;
    if (impactFactor < minIF || impactFactor > maxIF) return false;
    const hIndex = journal.openalex_h_index ?? 0;
    if (hIndex < minH || hIndex > maxH) return false;
    return (journal.source_count ?? 0) >= minSources;
  });
}

function sortJournals(journals: Journal[], body: JsonObject): Journal[] {
  const field = lower(body.sort_by);
  const direction = lower(body.sort_dir) === "asc" ? 1 : -1;
  const value = (journal: Journal): number | string => {
    if (field.includes("impact")) return journal.jcr_impact_factor ?? -1;
    if (field.includes("h_index")) return journal.openalex_h_index ?? -1;
    if (field.includes("source_count")) return journal.source_count ?? 0;
    if (field.includes("name") || field.includes("canonical"))
      return journal.canonical_name;
    return journal.jcr_impact_factor ?? 0;
  };
  return [...journals].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (typeof av === "number" && typeof bv === "number")
      return (av - bv) * direction;
    return String(av).localeCompare(String(bv), "zh-CN") * direction;
  });
}

async function journalList(request: Request): Promise<Response> {
  const body = await readJson(request);
  const page = positiveInt(body.page, 1, 10_000);
  const pageSize = positiveInt(body.page_size, 20);
  const all = sortJournals(filterJournals([...mockJournals], body), body);
  const pageRows = paginate(all, page, pageSize);
  return apiSuccess({
    rows: pageRows.map((journal) => ({ unified: journalUnified(journal) })),
    page,
    pageSize,
    total: all.length,
    totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
    hasMore: page * pageSize < all.length,
  });
}

async function journalSearch(request: Request): Promise<Response> {
  return journalList(request);
}

async function journalGet(request: Request): Promise<Response> {
  const body = await readJson(request);
  const id = numberValue(body.id, 0);
  const journal =
    mockJournals.find((item) => item.id === id) ??
    mockJournals[Math.abs(Math.trunc(id)) % mockJournals.length];
  if (!journal) return apiNotFound("期刊不存在");
  const impact = journal.jcr_impact_factor ?? 3;
  return apiSuccess({
    unified: journalUnified({ ...journal, id: id || journal.id }),
    cover: {
      color: journal.is_oa ? "#16a34a" : "#1f2937",
      abbreviation: journal.canonical_name
        .split(/\s+/)
        .map((word) => word[0])
        .join("")
        .slice(0, 4),
    },
    sources: {
      openalex: {
        counts_by_year: Array.from({ length: 6 }, (_, index) => {
          const year = 2020 + index;
          const works = 2_400 + index * 310 + (journal.id % 9) * 37;
          return {
            year,
            works_count: works,
            oa_works_count: Math.round(works * (journal.is_oa ? 0.92 : 0.28)),
            cited_by_count: works * (9 + index * 2),
          };
        }),
      },
      jcr: {
        all_years: Array.from({ length: 6 }, (_, index) => ({
          year: 2020 + index,
          impact_factor: Math.max(
            0.5,
            impact - (5 - index) * impact * 0.035,
          ).toFixed(1),
          if_quartile: journal.jcr_quartile ?? "Q2",
          if_rank: `${Math.max(1, 24 - index * 2)}/186`,
          category: "Multidisciplinary Sciences",
        })),
      },
      submission: {
        main: {
          has_guideline: journal.has_submission ?? true,
          has_latex: journal.has_submission ?? true,
        },
        latex: {
          class: journal.canonical_name.includes("Nature")
            ? "sn-jnl.cls"
            : "article.cls",
        },
        guidelines_md_url: null,
      },
    },
  });
}

function journalStats(): Response {
  const countries = new Map<string, number>();
  for (const journal of mockJournals) {
    const country = journal.country ?? "Unknown";
    countries.set(country, (countries.get(country) ?? 0) + 1);
  }
  const quartileCount = (quartile: string) =>
    mockJournals.filter((journal) => journal.jcr_quartile === quartile).length;
  return apiSuccess({
    totalJournals: 38_642,
    oaCount: 12_780,
    sourceCoverage: {
      crossref: "38214",
      openalex: "37480",
      jcr: "21406",
      fqb: "15472",
      scimago: "28680",
      doaj: "12780",
    },
    countryDistribution: [...countries.entries()].map(([country, cnt]) => ({
      country,
      cnt,
    })),
    quartileDistribution: {
      jcr: ["Q1", "Q2", "Q3", "Q4"].map((q) => ({
        q,
        cnt: quartileCount(q) || 1_900 + Number(q.slice(1)) * 730,
      })),
      fqb: ["1", "2", "3", "4"].map((q) => ({
        q,
        cnt:
          mockJournals.filter((journal) => journal.fqb_quartile === q).length ||
          800,
      })),
    },
  });
}

async function journalSuggest(request: Request): Promise<Response> {
  const body = await readJson(request);
  const query = lower(body.q);
  const limit = positiveInt(body.limit, 10, 20);
  let rows = mockJournals.filter((journal) =>
    lower(journal.canonical_name).includes(query),
  );
  if (rows.length === 0) rows = [...mockJournals];
  return apiSuccess({
    suggestions: rows.slice(0, limit).map((journal) => ({
      id: journal.id,
      canonical_name: journal.canonical_name,
      issn_l: journal.issns?.[0],
      source_count: journal.source_count ?? 5,
      openalex_works_count: numberValue(
        journalUnified(journal).openalex_works_count,
      ),
    })),
  });
}

async function journalsByNames(request: Request): Promise<Response> {
  const body = await readJson(request);
  const names = stringList(body.names);
  const results: Record<string, { unified: JsonObject }> = {};
  for (const name of names) {
    const query = name.toLocaleLowerCase();
    const journal =
      mockJournals.find(
        (item) =>
          item.canonical_name.toLocaleLowerCase() === query ||
          item.canonical_name.toLocaleLowerCase().includes(query) ||
          query.includes(item.canonical_name.toLocaleLowerCase()),
      ) ?? mockJournals[Math.abs(checksum(name)) % mockJournals.length];
    if (journal) results[name] = { unified: journalUnified(journal) };
  }
  return apiSuccess({ results });
}

// ─── OA / 新闻 ─────────────────────────────────────────────────────────────

function resolveOpenAccess(request: Request): Response {
  const doi = (new URL(request.url).searchParams.get("doi") ?? "")
    .trim()
    .toLocaleLowerCase();
  const matched = mockPapers.find(
    (paper) => lower(paper.externalIds?.DOI) === doi,
  );
  const isOA = matched?.isOpenAccess ?? !doi.includes("closed");
  return apiSuccess({
    doi,
    is_oa: isOA,
    ...(isOA
      ? {
          url: matched?.openAccessPdf?.url ?? "/api/v1/mock-assets/paper.pdf",
          is_pdf: true,
          host_type:
            matched?.openAccessPdf?.status === "gold"
              ? "publisher"
              : "repository",
          version: "publishedVersion",
          license: "cc-by",
        }
      : {}),
  });
}

function newsDetailItem(item: (typeof mockNews)[number]): JsonObject {
  const date = item.published_at.slice(0, 10);
  return {
    ...item,
    url: item.sources[0]?.url ?? "#",
    body_md: `## 事件概览

${item.summary}

## 关键变化

- 新方案强调科研过程的可追溯性，并要求关键结论可回到原始证据。
- 参与机构将先在文献发现、研究协作和成果发布三个场景开展试点。
- 后续评估会同时关注准确性、研究者体验与治理成本。

## 对研究者的影响

短期内，研究团队需要更清晰地记录 AI 辅助环节、数据来源与人工复核过程。长期看，这类标准有望降低跨工具协作成本，让研究资产在不同平台之间安全迁移。

> 本页面为纯前端 Mock 数据，适合验证长正文、列表、引用来源和可信度说明的视觉状态。`,
    body_html: "",
    credibility_note:
      "Mock 内容综合多个公开信号生成，仅用于产品设计与前端调试。",
    original_date: date,
    heat_measured_at: MOCK_NOW,
    updated_at: MOCK_NOW,
  };
}

function newsList(request: Request): Response {
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") === "heat" ? "heat" : "latest";
  const section = url.searchParams.get("section") ?? "";
  const page = positiveInt(url.searchParams.get("page"), 1, 100_000);
  const pageSize = positiveInt(url.searchParams.get("page_size"), 12, 50);
  let items = mockNews.filter((item) => !section || item.section === section);
  items = [...items].sort((a, b) =>
    sort === "heat"
      ? b.heat_external - a.heat_external
      : b.published_at.localeCompare(a.published_at),
  );
  return HttpResponse.json({
    items: paginate(items, page, pageSize),
    has_more: page * pageSize < items.length,
  });
}

function newsTrending(request: Request): Response {
  const limit = positiveInt(
    new URL(request.url).searchParams.get("limit"),
    10,
    30,
  );
  const items = [...mockNews]
    .sort((a, b) => b.score + b.heat_trend - (a.score + a.heat_trend))
    .slice(0, limit);
  return HttpResponse.json({ items });
}

function newsDetail(slug: string): Response {
  const item = mockNews.find((news) => news.slug === decodeURIComponent(slug));
  if (!item) return HttpResponse.json({ error: "not found" }, { status: 404 });
  const related = mockNews
    .filter((news) => news.slug !== item.slug)
    .slice(0, 3);
  return HttpResponse.json({ item: newsDetailItem(item), related });
}

// ─── 功能广场 / Skills ────────────────────────────────────────────────────

const extraTools: FeatureTool[] = [
  {
    id: 4,
    slug: "jupyterlab",
    name: "JupyterLab",
    name_en: "JupyterLab",
    tagline: "面向数据分析与可复现研究的交互式计算环境",
    description_md: "把代码、数据、图表和说明组织在同一个可复现工作区。",
    category: "stats-econometrics",
    category_label: "统计与计量",
    tags: ["Python", "Notebook", "可复现研究"],
    price_type: "free",
    is_open_source: true,
    languages: ["中文", "English"],
    platforms: ["Web", "macOS", "Windows", "Linux"],
    access_type: "both",
    official_url: "https://jupyter.org",
    access: {
      type: "both",
      official_url: "https://jupyter.org",
      download: { provider: "PyPI", url: "https://jupyter.org/install" },
    },
    spec: {
      core_use: "交互式计算",
      audience: "数据科学家、研究者",
      scenarios: ["探索性分析", "教学演示", "复现实验"],
      workflow: ["创建环境", "导入数据", "运行 Notebook", "导出报告"],
      key_features: ["Notebook", "终端", "扩展生态"],
    },
    stats: {
      rating: 4.9,
      rating_count: 980,
      monthly_visits: 2_400_000,
      favorites: 18_200,
    },
    status: "published",
    sort_weight: 88,
    view_count: 72_400,
    favorite_count: 18_200,
    created_at: "2026-05-12T08:00:00.000Z",
  },
  {
    id: 5,
    slug: "overleaf",
    name: "Overleaf",
    name_en: "Overleaf",
    tagline: "多人实时协作的在线 LaTeX 写作平台",
    description_md:
      "提供模板、版本历史、评论与实时编译，适合论文和项目申请书协作。",
    category: "writing-latex",
    category_label: "学术写作",
    tags: ["LaTeX", "协作", "模板"],
    price_type: "freemium",
    is_open_source: false,
    languages: ["English"],
    platforms: ["Web"],
    access_type: "website",
    official_url: "https://www.overleaf.com",
    access: { type: "website", official_url: "https://www.overleaf.com" },
    stats: {
      rating: 4.8,
      rating_count: 730,
      monthly_visits: 14_000_000,
      favorites: 15_600,
    },
    status: "published",
    sort_weight: 86,
    view_count: 69_200,
    favorite_count: 15_600,
    created_at: "2026-06-03T08:00:00.000Z",
  },
  {
    id: 6,
    slug: "gephi",
    name: "Gephi",
    name_en: "Gephi",
    tagline: "探索复杂网络与关系数据的开源可视化软件",
    description_md: "适合引文网络、合作网络和知识图谱的布局、筛选与指标分析。",
    category: "viz-plotting",
    category_label: "绘图与可视化",
    tags: ["网络分析", "可视化", "开源"],
    price_type: "free",
    is_open_source: true,
    languages: ["English"],
    platforms: ["macOS", "Windows", "Linux"],
    access_type: "download",
    official_url: "https://gephi.org",
    access: {
      type: "download",
      official_url: "https://gephi.org",
      download: {
        provider: "Official",
        url: "https://gephi.org/users/download/",
      },
    },
    stats: {
      rating: 4.6,
      rating_count: 284,
      monthly_visits: 220_000,
      favorites: 4_900,
    },
    status: "published",
    sort_weight: 72,
    view_count: 31_600,
    favorite_count: 4_900,
    created_at: "2026-03-18T08:00:00.000Z",
  },
  {
    id: 7,
    slug: "biopython",
    name: "Biopython",
    name_en: "Biopython",
    tagline: "生物信息学计算与序列分析的 Python 工具包",
    description_md: "覆盖序列、结构、数据库检索和常见生物信息文件格式。",
    category: "bio-life",
    category_label: "生物与生命科学",
    tags: ["生物信息", "Python", "序列分析"],
    price_type: "free",
    is_open_source: true,
    languages: ["English"],
    platforms: ["macOS", "Windows", "Linux"],
    access_type: "download",
    official_url: "https://biopython.org",
    access: {
      type: "download",
      official_url: "https://biopython.org",
      download: {
        provider: "PyPI",
        url: "https://pypi.org/project/biopython/",
      },
    },
    stats: {
      rating: 4.7,
      rating_count: 190,
      monthly_visits: 310_000,
      favorites: 3_800,
    },
    status: "published",
    sort_weight: 68,
    view_count: 22_700,
    favorite_count: 3_800,
    created_at: "2026-02-21T08:00:00.000Z",
  },
  {
    id: 8,
    slug: "journal-finder",
    name: "Journal Finder",
    name_en: "Journal Finder",
    tagline: "根据摘要与关键词匹配候选投稿期刊",
    description_md: "比较学科覆盖、影响力、开放获取政策与预计审稿周期。",
    category: "journal-metrics",
    category_label: "期刊与评价",
    tags: ["期刊匹配", "投稿", "影响因子"],
    price_type: "free",
    is_open_source: false,
    languages: ["中文", "English"],
    platforms: ["Web"],
    access_type: "website",
    official_url: "/journals",
    access: { type: "website", official_url: "/journals" },
    stats: {
      rating: 4.5,
      rating_count: 126,
      monthly_visits: 86_000,
      favorites: 2_140,
    },
    status: "published",
    sort_weight: 82,
    view_count: 19_500,
    favorite_count: 2_140,
    created_at: "2026-07-10T08:00:00.000Z",
  },
];

const publicTools: FeatureTool[] = [...mockTools, ...extraTools];

function toolsList(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const category = params.get("category") ?? "";
  const access = params.get("access_type") ?? "";
  const price = params.get("price_type") ?? "";
  const openSource = params.get("open_source") ?? "";
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase();
  const page = positiveInt(params.get("page"), 1, 10_000);
  const pageSize = positiveInt(params.get("page_size"), 24);
  const sortBy = params.get("sort_by") ?? "view_count";
  const sortOrder = params.get("sort_order") === "asc" ? 1 : -1;
  let items = publicTools.filter((tool) => {
    if (category && tool.category !== category) return false;
    if (price && tool.price_type !== price) return false;
    if (
      access &&
      tool.access_type !== access &&
      !(
        tool.access_type === "both" &&
        (access === "website" || access === "download")
      )
    ) {
      return false;
    }
    if (openSource === "open" && tool.is_open_source !== true) return false;
    if (openSource === "closed" && tool.is_open_source === true) return false;
    if (
      query &&
      ![
        tool.name,
        tool.name_en,
        tool.tagline,
        tool.description_md,
        ...(tool.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    ) {
      return false;
    }
    return true;
  });
  items = [...items].sort((a, b) => {
    const value = (tool: FeatureTool): number | string => {
      if (sortBy === "name") return tool.name;
      if (sortBy === "created_at") return tool.created_at ?? "";
      if (sortBy === "favorite_count") return tool.favorite_count ?? 0;
      return tool.view_count ?? 0;
    };
    const av = value(a);
    const bv = value(b);
    if (typeof av === "number" && typeof bv === "number")
      return (av - bv) * sortOrder;
    return String(av).localeCompare(String(bv), "zh-CN") * sortOrder;
  });
  return apiSuccess({
    items: paginate(items, page, pageSize),
    total: items.length,
    page,
  });
}

function toolsCategories(): Response {
  const taxonomy: Array<[string, string]> = [
    ["stats-econometrics", "统计与计量"],
    ["chem-materials", "化学与材料"],
    ["bio-life", "生物与生命科学"],
    ["math-numerical", "数学与数值计算"],
    ["viz-plotting", "绘图与可视化"],
    ["engineering-cad", "工程与 CAD"],
    ["lit-manage-pdf", "文献管理与 PDF"],
    ["writing-latex", "学术写作与 LaTeX"],
    ["journal-metrics", "期刊与科研评价"],
    ["medical-reference", "医学参考"],
    ["general-utility", "通用效率"],
    ["other", "其他"],
  ];
  // fixture 里的旧分类归并到新版 12 类展示。
  const categoryAliases: Record<string, string> = {
    literature: "lit-manage-pdf",
    reference: "lit-manage-pdf",
  };
  const categories = taxonomy.map(([slug, label]) => ({
    slug,
    label,
    count: publicTools.filter(
      (tool) => (categoryAliases[tool.category] ?? tool.category) === slug,
    ).length,
  }));
  return apiSuccess({ categories, total: publicTools.length });
}

function toolDetail(idOrSlug: string): Response {
  const decoded = decodeURIComponent(idOrSlug);
  const tool = publicTools.find(
    (item) => item.slug === decoded || String(item.id) === decoded,
  );
  return tool ? apiSuccess(tool) : apiNotFound("工具不存在或未公开");
}

interface MockSkillCard {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  authorName: string;
  installCount: number;
  visibility: "public";
  updatedAt: string;
  installed: boolean;
  isOwner: boolean;
}

const mockSkills: MockSkillCard[] = [
  {
    id: 501,
    slug: "systematic-review-copilot",
    name: "系统综述协作助手",
    tagline: "从研究问题、检索式到纳排记录，保持综述流程可追溯",
    category: "literature",
    authorName: "Scholay Research",
    installCount: 2864,
    visibility: "public",
    updatedAt: "2026-07-27T08:00:00.000Z",
    installed: true,
    isOwner: false,
  },
  {
    id: 502,
    slug: "academic-writing-style",
    name: "学术写作风格校对",
    tagline: "检查论证结构、术语一致性和过度表述，不改动研究结论",
    category: "writing",
    authorName: "Lin Lab",
    installCount: 1942,
    visibility: "public",
    updatedAt: "2026-07-25T08:00:00.000Z",
    installed: false,
    isOwner: false,
  },
  {
    id: 503,
    slug: "reproducibility-checklist",
    name: "可复现性检查清单",
    tagline: "按数据、代码、环境、统计与报告维度审查复现材料",
    category: "research",
    authorName: "Open Methods CN",
    installCount: 1180,
    visibility: "public",
    updatedAt: "2026-07-22T08:00:00.000Z",
    installed: false,
    isOwner: false,
  },
  {
    id: 504,
    slug: "journal-response-letter",
    name: "审稿意见回复信",
    tagline: "逐条组织 reviewer comment、修改说明与正文定位",
    category: "publishing",
    authorName: "Paper Craft",
    installCount: 976,
    visibility: "public",
    updatedAt: "2026-07-18T08:00:00.000Z",
    installed: false,
    isOwner: false,
  },
  {
    id: 505,
    slug: "research-data-dictionary",
    name: "研究数据字典生成器",
    tagline: "从表结构和样例值生成变量定义、口径说明与质量检查建议",
    category: "data",
    authorName: "Yu Lin",
    installCount: 624,
    visibility: "public",
    updatedAt: "2026-07-12T08:00:00.000Z",
    installed: false,
    isOwner: true,
  },
];

function skillMarkdown(skill: MockSkillCard): string {
  return `---
name: ${skill.slug}
description: ${skill.tagline}
---

# ${skill.name}

## 使用时机

当用户需要${skill.tagline}时使用本技能。

## 工作流

1. 明确目标、范围与交付格式。
2. 检查输入材料是否完整，并列出关键假设。
3. 分阶段执行，每个结论保留来源与证据。
4. 输出结构化结果、风险提示和下一步建议。

## 约束

- 不虚构论文、数据、引文或实验结果。
- 对不确定信息明确标注，必要时请求用户确认。
- 涉及外部写操作时先说明目标和影响范围。
`;
}

function skillDetail(skill: MockSkillCard, request: Request): JsonObject {
  const origin = new URL(request.url).origin;
  const downloadUrl = `${origin}/api/v1/skills/${skill.slug}/download`;
  return {
    ...skill,
    descriptionMd: `# ${skill.name}\n\n${skill.tagline}\n\n适合希望把科研过程变得结构化、可复核的团队。`,
    whenToUse: `用户提出与“${skill.category}”相关的多步骤任务，且需要稳定工作流时。`,
    declaredTools: ["web_search", "read_file", "write_report"],
    skillMd: skillMarkdown(skill),
    version: 3,
    moderationStatus: "approved",
    contentSource: "original",
    fileManifest: [
      { path: "SKILL.md", size: skillMarkdown(skill).length },
      { path: "references/checklist.md", size: 1480 },
      { path: "templates/report.md", size: 820 },
    ],
    install: {
      downloadUrl,
      claudeCodeCurl: `curl -L "${downloadUrl}" | tar -xz -C ~/.claude/skills`,
      marketplaceAdd: `claude plugin marketplace add ${origin}/api/v1/skills/marketplace.json`,
      installMdUrl: `${origin}/api/v1/skills/install.md`,
      shareUrl: `${origin}/skills/${skill.slug}`,
    },
    createdAt: "2026-05-18T08:00:00.000Z",
  };
}

function skillsMarket(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase();
  const category = params.get("category") ?? "";
  const sort = params.get("sort") ?? "popular";
  const page = positiveInt(params.get("page"), 1, 10_000);
  const pageSize = positiveInt(
    params.get("pageSize") ?? params.get("page_size"),
    24,
  );
  let list = mockSkills.filter((skill) => {
    if (category && skill.category !== category) return false;
    return (
      !query ||
      [skill.name, skill.tagline, skill.authorName, skill.category]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    );
  });
  list = [...list].sort((a, b) =>
    sort === "recent"
      ? b.updatedAt.localeCompare(a.updatedAt)
      : b.installCount - a.installCount,
  );
  return apiSuccess({
    list: paginate(list, page, pageSize),
    total: list.length,
    page,
    pageSize,
  });
}

function publicSkill(slug: string, request: Request): Response {
  const decoded = decodeURIComponent(slug);
  const skill = mockSkills.find(
    (item) => item.slug === decoded || String(item.id) === decoded,
  );
  return skill
    ? apiSuccess(skillDetail(skill, request))
    : apiNotFound("该 skill 不存在或未公开");
}

function downloadSkill(slug: string): Response {
  const skill = mockSkills.find(
    (item) => item.slug === decodeURIComponent(slug),
  );
  if (!skill) return apiNotFound("该 skill 不存在或未公开");
  // 浏览器只需验证下载流程；Mock 内容保留为可读文本，便于设计走查时直接检查。
  return HttpResponse.text(skillMarkdown(skill), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${skill.slug}.tar.gz"`,
      "X-Mock-Archive": "plain-text-skill-md",
    },
  });
}

function publicSkillMd(slug: string): Response {
  const skill = mockSkills.find(
    (item) => item.slug === decodeURIComponent(slug),
  );
  if (!skill) return apiNotFound("该 skill 不存在或未公开");
  return HttpResponse.text(skillMarkdown(skill), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

// ─── 帮助内容 / 公共配置 ─────────────────────────────────────────────────

async function uploadFeedbackAttachments(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return HttpResponse.json(
      { code: 4002, message: "文件格式错误，请重新选择后上传", data: null },
      { status: 400 },
    );
  }

  const suppliedKey = form.get("uploadKey");
  const uploadKey =
    typeof suppliedKey === "string" && suppliedKey.trim()
      ? suppliedKey.trim()
      : createMockUploadKey();
  const files = form
    .getAll("files")
    .filter((entry): entry is File => typeof entry !== "string");

  if (files.length === 0) {
    return HttpResponse.json(
      { code: 4003, message: "没有上传文件", data: null },
      { status: 400 },
    );
  }

  const attachments: Array<{
    id: number;
    name: string;
    url: string;
    size: number;
    type: "image" | "file";
  }> = [];

  for (const file of files) {
    const id = nextFeedbackAttachmentId++;
    const mimeType = file.type || inferFeedbackMimeType(file.name);
    const fileType: "image" | "file" = mimeType.startsWith("image/")
      ? "image"
      : "file";
    const body = new Blob([await file.arrayBuffer()], { type: mimeType });
    feedbackAttachments.set(id, {
      id,
      uploadKey,
      name: file.name || `attachment-${id}`,
      size: file.size,
      type: fileType,
      mimeType,
      body,
    });
    attachments.push({
      id,
      name: file.name || `attachment-${id}`,
      url: `/api/v1/public/feedback/attachment/${id}?key=${encodeURIComponent(uploadKey)}`,
      size: file.size,
      type: fileType,
    });
  }

  return apiSuccess({ uploadKey, attachments }, "附件上传成功");
}

async function createFeedback(request: Request): Promise<Response> {
  const body = await readJson(request);
  const email = text(body.email).trim();
  const content = text(body.content).trim();
  const category = text(body.category, "other");
  const attachmentsKey = text(body.attachmentsKey).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    return HttpResponse.json(
      { code: 4001, message: "请填写有效邮箱", data: null },
      { status: 400 },
    );
  }
  if (content.length < 10 || content.length > 5_000) {
    return HttpResponse.json(
      { code: 4001, message: "反馈内容需为 10–5000 个字符", data: null },
      { status: 400 },
    );
  }
  const allowedCategories = new Set([
    "bug",
    "feature",
    "complaint",
    "praise",
    "other",
  ]);
  if (!allowedCategories.has(category)) {
    return HttpResponse.json(
      { code: 4001, message: "反馈类型不正确", data: null },
      { status: 400 },
    );
  }

  const id = nextFeedbackId++;
  const createdAt = new Date(
    Date.parse(MOCK_NOW) + (id - 9_001) * 60_000,
  ).toISOString();
  const linkedAttachments = [...feedbackAttachments.values()]
    .filter(
      (attachment) => attachmentsKey && attachment.uploadKey === attachmentsKey,
    )
    .map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      url: `/api/v1/public/feedback/attachment/${attachment.id}?key=${encodeURIComponent(attachment.uploadKey)}`,
      size: attachment.size,
      type: attachment.type,
    }));

  feedbackSubmissions.push({
    id,
    email,
    content,
    category,
    attachmentsKey,
    createdAt,
  });

  return apiSuccess(
    {
      id,
      email,
      content,
      attachments: JSON.stringify(linkedAttachments),
      userId: 1001,
      username: "Mock 体验用户",
      ip: "127.0.0.1",
      ipLocation: "纯前端 Mock 环境",
      status: "pending",
      category,
      replyContent: "",
      repliedAt: null,
      repliedBy: "",
      assignedTo: null,
      internalNotes: "",
      firstResponseAt: null,
      createdAt,
      updatedAt: createdAt,
      receipt: {
        reference: `FB-${String(id).padStart(6, "0")}`,
        expectedResponse: "2 个工作日内",
        attachmentCount: linkedAttachments.length,
      },
    },
    "反馈提交成功",
  );
}

function getFeedbackAttachment(idOrToken: string, request: Request): Response {
  const token = decodeURIComponent(idOrToken);
  if (token === "mock-mobile") {
    return HttpResponse.text(mockFeedbackScreenshotSvg(), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": 'inline; filename="mock-mobile-screenshot.svg"',
        "Cache-Control": "private, max-age=300",
      },
    });
  }
  if (token === "mock-report") {
    return HttpResponse.text(
      "Scholay Mock 问题复现记录\n\n1. 打开移动端论文详情\n2. 切换到引用区块\n3. 快速返回后重新进入\n\n期望：滚动位置与展开状态保持一致。\n",
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="mock-report.txt"',
        },
      },
    );
  }

  const id = Number(token);
  const attachment = Number.isInteger(id)
    ? feedbackAttachments.get(id)
    : undefined;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!attachment || key !== attachment.uploadKey) {
    return apiNotFound("附件不存在");
  }
  const disposition = attachment.type === "image" ? "inline" : "attachment";
  return new HttpResponse(attachment.body, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      "Content-Disposition": `${disposition}; filename="feedback-${attachment.id}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

interface MockArticle {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  excerpt: string;
  readTime: string;
  date: string;
  updatedDate: string;
  author: { name: string; role: string; bio: string } | null;
  kind: ContentKind;
  sections: Array<JsonObject>;
}

const articleAuthor = {
  name: "Scholay 编辑部",
  role: "研究方法与产品团队",
  bio: "关注学术检索、科研工作流和可信 AI。",
};

const mockArticles: MockArticle[] = [
  {
    slug: "build-a-reproducible-literature-review",
    title: "如何建立可复现的文献综述工作流",
    category: "研究方法",
    tags: ["文献综述", "可复现研究", "检索策略"],
    excerpt: "把研究问题、检索式、筛选标准和证据表串成一条可复核的工作流。",
    readTime: "8 分钟",
    date: "2026-07-18",
    updatedDate: "2026-07-26",
    author: articleAuthor,
    kind: "blog",
    sections: [
      { type: "heading", text: "先定义研究问题与边界" },
      {
        type: "paragraph",
        text: "清晰的问题陈述会决定关键词、数据库范围、时间窗口与纳入标准，也是后续复核的起点。",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "记录概念与同义词",
          "为每个数据库保存检索式",
          "预先声明纳排标准",
          "保留筛选理由",
        ],
      },
      {
        type: "tip",
        title: "产品走查提示",
        text: "这是一段用于验证 Tip 卡片、长段落与有序列表排版的 Mock 正文。",
      },
    ],
  },
  {
    slug: "evaluate-ai-research-tools",
    title: "选择 AI 科研工具时，应评估哪些维度",
    category: "AI与学术",
    tags: ["AI 工具", "可信度", "数据治理"],
    excerpt:
      "不要只看生成效果，还要检查证据来源、隐私边界、可导出性与错误恢复。",
    readTime: "6 分钟",
    date: "2026-07-10",
    updatedDate: "2026-07-22",
    author: articleAuthor,
    kind: "blog",
    sections: [
      { type: "heading", text: "四个核心判断维度" },
      {
        type: "table",
        headers: ["维度", "检查问题"],
        rows: [
          ["来源", "结论能否回到论文、数据或原始网页？"],
          ["控制", "用户能否撤销、编辑和重新执行关键步骤？"],
          ["隐私", "上传材料如何存储、使用和删除？"],
          ["迁移", "结果能否以通用格式导出？"],
        ],
      },
    ],
  },
  {
    slug: "search-query-template",
    title: "系统综述检索式模板",
    category: "模板与清单",
    tags: ["检索式", "系统综述", "模板"],
    excerpt: "一个可直接改写的 PICO/概念组检索模板，附记录字段与复核清单。",
    readTime: "4 分钟",
    date: "2026-07-14",
    updatedDate: "2026-07-14",
    author: null,
    kind: "resources",
    sections: [
      { type: "heading", text: "检索式骨架" },
      {
        type: "paragraph",
        text: "(核心概念 A OR 同义词 A1) AND (核心概念 B OR 同义词 B1)，再按数据库语法补充字段限制。",
      },
      {
        type: "list",
        items: [
          "数据库与平台版本",
          "检索日期",
          "完整检索式",
          "结果数量",
          "去重规则",
        ],
      },
    ],
  },
  {
    slug: "paper-reading-checklist",
    title: "论文精读与批判性评价清单",
    category: "模板与清单",
    tags: ["论文阅读", "研究设计", "证据质量"],
    excerpt: "从研究问题、样本、方法、结果到外部有效性的完整检查项。",
    readTime: "5 分钟",
    date: "2026-07-06",
    updatedDate: "2026-07-20",
    author: null,
    kind: "resources",
    sections: [
      { type: "heading", text: "阅读顺序" },
      {
        type: "list",
        ordered: true,
        items: [
          "先看研究问题与结论",
          "检查方法能否支持结论",
          "核对结果量级",
          "识别限制与适用边界",
        ],
      },
    ],
  },
  {
    slug: "where-do-search-results-come-from",
    title: "论文搜索结果来自哪些数据源？",
    category: "搜索与数据",
    tags: ["Semantic Scholar", "OpenAlex", "PubMed"],
    excerpt: "了解不同学术数据源的覆盖范围、更新节奏和字段差异。",
    readTime: "3 分钟",
    date: "2026-07-20",
    updatedDate: "2026-07-20",
    author: articleAuthor,
    kind: "qa",
    sections: [
      {
        type: "faq",
        faq: [
          {
            q: "为什么同一论文在不同来源的引用数不同？",
            a: "各平台收录范围与去重规则不同。",
          },
          { q: "缺少摘要怎么办？", a: "部分来源会通过批量详情接口补全摘要。" },
        ],
      },
    ],
  },
  {
    slug: "how-to-report-a-data-error",
    title: "发现论文或期刊数据错误，如何反馈？",
    category: "账号与支持",
    tags: ["反馈", "数据质量"],
    excerpt: "提交可定位的 URL、错误字段和可信来源，可以显著提升处理效率。",
    readTime: "2 分钟",
    date: "2026-07-08",
    updatedDate: "2026-07-08",
    author: articleAuthor,
    kind: "qa",
    sections: [
      {
        type: "paragraph",
        text: "请在反馈中附上页面地址、错误字段、期望值和可验证来源；涉及个人信息时不要上传敏感材料。",
      },
    ],
  },
];

function articleList(kind: string): Response {
  if (!isContentKind(kind)) {
    return HttpResponse.json(
      { error: "unknown content kind" },
      { status: 404 },
    );
  }
  const items = mockArticles
    .filter((article) => article.kind === kind)
    .sort((a, b) => b.updatedDate.localeCompare(a.updatedDate))
    .map(({ kind: _kind, sections: _sections, ...card }) => card);
  return HttpResponse.json({ items });
}

function articleDetail(kind: string, slug: string): Response {
  if (!isContentKind(kind)) {
    return HttpResponse.json(
      { error: "unknown content kind" },
      { status: 404 },
    );
  }
  const article = mockArticles.find(
    (item) => item.kind === kind && item.slug === decodeURIComponent(slug),
  );
  return article
    ? HttpResponse.json(article)
    : HttpResponse.json({ error: "article not found" }, { status: 404 });
}

function isContentKind(value: string): value is ContentKind {
  return value === "blog" || value === "resources" || value === "qa";
}

function supportContact(): Response {
  return apiSuccess({
    support_email: "support@scholay.mock",
    business_email: "hello@scholay.mock",
    contact_note:
      "工作日 09:30–18:30 通常会在 2 小时内回复；当前为纯前端 Mock 联系方式。",
    wecom_qr: mockQrDataUrl("企业微信"),
    feishu_qr: mockQrDataUrl("飞书"),
  });
}

function systemConfig(): Response {
  return apiSuccess({
    id: 1,
    require_email_verification: false,
    enable_turnstile: false,
    turnstile_site_key: "",
    github_client_id: "mock-github-client-id",
    // Mock 下不加载 Google Identity Services 外部脚本，避免纯前端环境产生网络请求。
    google_client_id: "",
    discourse_site_url: "https://community.example.com",
    apple_enabled: true,
    microsoft_enabled: true,
    orcid_enabled: true,
    wechat_enabled: true,
    google_analytics_id: "",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: MOCK_NOW,
  });
}

function promoConfig(): Response {
  return apiSuccess({
    enabled: true,
    title: "产品设计预览 · Mock 会员权益",
    subtitle: "扫码联系顾问，领取 14 天 Pro 体验",
    benefits: "无限文献收藏\nAI 论文翻译\n多维分析模板\n跨端研究工作区",
    button_text: "查看体验权益",
    wechat_qr: mockQrDataUrl("体验顾问"),
  });
}

function codeSnippets(): Response {
  return apiSuccess({
    head: [
      {
        position: "head",
        code_content:
          '<meta name="scholay-mock-snippet" content="runtime-code-snippets-enabled">',
        priority: 10,
      },
    ],
    body_start: [],
    body_end: [
      {
        position: "body_end",
        code_content:
          "<script>window.__SCHOLAY_MOCK_SNIPPETS_LOADED__ = true;<\\/script>",
        priority: 100,
      },
    ],
  });
}

// ─── Crossref ───────────────────────────────────────────────────────────────

function crossrefResponse(request: Request): Response {
  const url = new URL(request.url);
  const raw = url.pathname.replace(/^\/works\//, "");
  const doi = decodeURIComponent(raw || "10.48550/arXiv.1706.03762");
  const paper =
    mockPapers.find(
      (item) => lower(item.externalIds?.DOI) === doi.toLocaleLowerCase(),
    ) ??
    mockPapers.find((item) => item.paperId === "paper-attention") ??
    mockPapers[0];
  const authors = paper?.authors ?? [];
  return HttpResponse.json({
    status: "ok",
    "message-type": "work",
    "message-version": "1.0.0",
    message: {
      DOI: doi,
      title: [paper?.title ?? "Mock scholarly work"],
      author: authors.map((author) => {
        const parts = (author.name ?? "Mock Author").trim().split(/\s+/);
        return {
          given: parts.slice(0, -1).join(" ") || parts[0],
          family: parts.at(-1),
          affiliation: (author.affiliations ?? []).map((name) => ({ name })),
        };
      }),
      "container-title": [paper?.venue ?? "Scholay Mock Journal"],
      "short-container-title": [paper?.venue ?? "SMJ"],
      volume: paper?.journal?.volume ?? "12",
      page: paper?.journal?.pages ?? "101-118",
      issued: { "date-parts": [[paper?.year ?? 2024, 6, 15]] },
      published: { "date-parts": [[paper?.year ?? 2024, 6, 15]] },
      publisher: "Scholay Mock Publishing",
      type: "journal-article",
      URL: `https://doi.org/${doi}`,
      abstract: paper?.abstract,
      "is-referenced-by-count": paper?.citationCount ?? 0,
      reference: Array.from(
        { length: Math.min(5, paper?.referenceCount ?? 3) },
        (_, index) => ({
          key: `ref-${index + 1}`,
          DOI: mockPapers[index]?.externalIds?.DOI,
          "article-title": mockPapers[index]?.title,
          year: String(mockPapers[index]?.year ?? 2020),
        }),
      ),
    },
  });
}

/**
 * Crossref 不在 `/api/v1` 下。主 worker 若只拦项目 API，可把本数组一并注册：
 * `setupWorker(...handlers, ...publicExternalMockHandlers)`。
 */
export const publicExternalMockHandlers = [
  http.get("https://api.crossref.org/works/:doi", ({ request }) =>
    crossrefResponse(request),
  ),
];

// ─── 总入口 ─────────────────────────────────────────────────────────────────

/**
 * 处理免登录内容域。`path` 约定已移除 `/api/v1`，函数仍会容错完整 API path。
 * 未匹配时返回 `undefined`，交给其它 mock domain 或 MSW passthrough。
 */
export async function handlePublicMock(
  request: Request,
  path: string,
): Promise<Response | undefined> {
  const requestUrl = new URL(request.url);
  if (
    requestUrl.hostname === "api.crossref.org" &&
    requestUrl.pathname.startsWith("/works/")
  ) {
    return crossrefResponse(request);
  }

  const route = routePath(path, request);
  const method = request.method.toUpperCase();

  if (method === "POST" && route === "/public/papers/search") {
    return handlePaperSearch(request);
  }
  if (method === "POST" && route === "/public/papers/batch") {
    return handlePaperBatch(request);
  }
  if (method === "GET" && route === "/public/search/suggestions") {
    return searchSuggestions(request);
  }
  if (method === "POST" && route === "/public/translate/paper/stream") {
    return translationSse(request);
  }

  const referencesMatch = route.match(
    /^\/public\/papers\/(.+)\/(references|citations)$/,
  );
  if (method === "GET" && referencesMatch?.[1]) {
    return paperReferences(referencesMatch[1], request);
  }
  const paperMatch = route.match(/^\/public\/papers\/(.+)$/);
  if (method === "GET" && paperMatch?.[1]) {
    return paperDetail(paperMatch[1]);
  }

  const authorPapersMatch = route.match(
    /^\/public\/author-detail\/(.+)\/papers$/,
  );
  if (method === "GET" && authorPapersMatch?.[1]) {
    return authorPapers(authorPapersMatch[1], request);
  }
  const authorMatch = route.match(/^\/public\/author-detail\/(.+)$/);
  if (method === "GET" && authorMatch?.[1]) {
    return authorDetail(authorMatch[1]);
  }

  if (method === "POST" && route === "/public/journals/list")
    return journalList(request);
  if (method === "POST" && route === "/public/journals/search")
    return journalSearch(request);
  if (method === "POST" && route === "/public/journals/get")
    return journalGet(request);
  if (method === "POST" && route === "/public/journals/stats")
    return journalStats();
  if (method === "POST" && route === "/public/journals/suggest") {
    return journalSuggest(request);
  }
  if (
    method === "POST" &&
    (route === "/public/journals/byNames" ||
      route === "/public/journals/bynames")
  ) {
    return journalsByNames(request);
  }

  if (method === "GET" && route === "/public/oa/resolve")
    return resolveOpenAccess(request);

  if (method === "GET" && route === "/news") return newsList(request);
  if (method === "GET" && route === "/news/trending")
    return newsTrending(request);
  const newsMatch = route.match(/^\/news\/detail\/(.+)$/);
  if (method === "GET" && newsMatch?.[1]) return newsDetail(newsMatch[1]);

  if (method === "GET" && route === "/public/tools") return toolsList(request);
  if (method === "GET" && route === "/public/tools/categories")
    return toolsCategories();
  const toolMatch = route.match(/^\/public\/tools\/detail\/(.+)$/);
  if (method === "GET" && toolMatch?.[1]) return toolDetail(toolMatch[1]);
  const toolLogoMatch = route.match(/^\/public\/tools\/logo\/(.+)$/);
  if (method === "GET" && toolLogoMatch?.[1]) {
    return HttpResponse.text(
      toolLogoSvg(decodeURIComponent(toolLogoMatch[1])),
      {
        headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
      },
    );
  }

  if (method === "GET" && route === "/public/skills")
    return skillsMarket(request);
  const authenticatedMarketSkillMatch = route.match(
    /^\/user\/skills\/market\/([^/]+)$/,
  );
  if (method === "GET" && authenticatedMarketSkillMatch?.[1]) {
    return publicSkill(authenticatedMarketSkillMatch[1], request);
  }
  if (method === "GET" && route === "/skills/install.md") {
    return HttpResponse.text(
      "# Scholay Mock Skills\n\n从市场页下载技能包并解压到 agent 的 skills 目录。",
      { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
    );
  }
  if (method === "GET" && route === "/skills/marketplace.json") {
    return HttpResponse.json({
      name: "scholay-mock-marketplace",
      owner: { name: "Scholay Mock" },
      plugins: mockSkills.map((skill) => ({
        name: skill.slug,
        description: skill.tagline,
        source: `./${skill.slug}`,
      })),
    });
  }
  const skillDownloadMatch = route.match(/^\/skills\/([^/]+)\/download$/);
  if (method === "GET" && skillDownloadMatch?.[1]) {
    return downloadSkill(skillDownloadMatch[1]);
  }
  const skillMdMatch = route.match(/^\/skills\/([^/]+)\/SKILL\.md$/i);
  if (method === "GET" && skillMdMatch?.[1])
    return publicSkillMd(skillMdMatch[1]);
  const skillMatch = route.match(/^\/skills\/([^/]+)$/);
  if (method === "GET" && skillMatch?.[1])
    return publicSkill(skillMatch[1], request);

  if (method === "POST" && route === "/public/feedback/upload") {
    return uploadFeedbackAttachments(request);
  }
  if (method === "POST" && route === "/public/feedback") {
    return createFeedback(request);
  }
  const feedbackAttachmentMatch = route.match(
    /^\/public\/feedback\/attachment\/([^/]+)$/,
  );
  if (method === "GET" && feedbackAttachmentMatch?.[1]) {
    return getFeedbackAttachment(feedbackAttachmentMatch[1], request);
  }

  const articleDetailMatch = route.match(/^\/content\/([^/]+)\/([^/]+)$/);
  if (method === "GET" && articleDetailMatch?.[1] && articleDetailMatch[2]) {
    return articleDetail(articleDetailMatch[1], articleDetailMatch[2]);
  }
  const articleListMatch = route.match(/^\/content\/([^/]+)$/);
  if (method === "GET" && articleListMatch?.[1])
    return articleList(articleListMatch[1]);

  if (
    method === "GET" &&
    (route === "/config/support-contact" ||
      route === "/public/config/support-contact")
  ) {
    return supportContact();
  }
  if (
    method === "GET" &&
    (route === "/config/system" || route === "/public/config/system")
  ) {
    return systemConfig();
  }
  if (
    method === "GET" &&
    (route === "/config/promo" || route === "/public/config/promo")
  ) {
    return promoConfig();
  }
  if (
    method === "GET" &&
    (route === "/config/code-snippets" ||
      route === "/public/config/code-snippets")
  ) {
    return codeSnippets();
  }
  if (method === "GET" && route === "/public/umami-config") {
    return apiSuccess({
      website_id: "00000000-0000-4000-8000-000000000001",
      script_url: "/umami-embed/script.js",
    });
  }

  return undefined;
}

function checksum(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) | 0;
  }
  return result;
}

function splitString(value: string, size: number): string[] {
  const output: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    output.push(value.slice(index, index + size));
  }
  return output;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function createMockUploadKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `mock-upload-${nextFeedbackAttachmentId}-${Date.now().toString(36)}`;
}

function inferFeedbackMimeType(filename: string): string {
  const extension = filename.split(".").at(-1)?.toLocaleLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    zip: "application/zip",
  };
  return (extension && mimeTypes[extension]) || "application/octet-stream";
}

function mockFeedbackScreenshotSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="520" viewBox="0 0 780 520">
  <rect width="780" height="520" rx="24" fill="#edf2ef"/>
  <rect x="28" y="28" width="724" height="464" rx="18" fill="#fff" stroke="#d9e1dc"/>
  <rect x="28" y="28" width="724" height="58" rx="18" fill="#173c2c"/>
  <circle cx="58" cy="57" r="8" fill="#ef4444"/><circle cx="84" cy="57" r="8" fill="#f59e0b"/><circle cx="110" cy="57" r="8" fill="#84cc16"/>
  <text x="390" y="64" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="#fff">Scholay Mock · 移动端问题截图</text>
  <rect x="62" y="118" width="210" height="330" rx="20" fill="#f7f9f8" stroke="#bdc9c2"/>
  <rect x="86" y="148" width="160" height="20" rx="8" fill="#173c2c" opacity=".9"/>
  <rect x="86" y="184" width="132" height="10" rx="5" fill="#9caaa2"/>
  <rect x="86" y="208" width="160" height="10" rx="5" fill="#d4ddd7"/>
  <rect x="86" y="230" width="148" height="10" rx="5" fill="#d4ddd7"/>
  <rect x="86" y="270" width="160" height="116" rx="12" fill="#fff" stroke="#e2e8e4"/>
  <path d="M106 348l34-35 25 22 31-43 30 56z" fill="#86aa98"/>
  <rect x="318" y="126" width="382" height="46" rx="12" fill="#fff4f2" stroke="#ef6a5b"/>
  <text x="340" y="155" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="#b9382d">复现：引用区块返回后状态被重置</text>
  <text x="320" y="214" font-family="system-ui,sans-serif" font-size="15" fill="#263c31">设备</text><text x="442" y="214" font-family="system-ui,sans-serif" font-size="15" fill="#64746b">iPhone 15 · Safari</text>
  <text x="320" y="254" font-family="system-ui,sans-serif" font-size="15" fill="#263c31">操作</text><text x="442" y="254" font-family="system-ui,sans-serif" font-size="15" fill="#64746b">展开引用 → 返回 → 再进入</text>
  <text x="320" y="294" font-family="system-ui,sans-serif" font-size="15" fill="#263c31">期望</text><text x="442" y="294" font-family="system-ui,sans-serif" font-size="15" fill="#64746b">保留滚动位置与展开状态</text>
  <rect x="318" y="334" width="382" height="96" rx="12" fill="#f5f8f6"/>
  <text x="340" y="366" font-family="system-ui,sans-serif" font-size="14" fill="#52645a">这是公开附件端点的内置演示图，</text>
  <text x="340" y="392" font-family="system-ui,sans-serif" font-size="14" fill="#52645a">也用于验证后台附件预览和图片灯箱。</text>
</svg>`;
}

function mockQrDataUrl(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" rx="20" fill="#fff"/>
  <rect x="16" y="16" width="208" height="208" rx="12" fill="#f4f6f5" stroke="#173c2c" stroke-width="8"/>
  <path d="M38 38h54v54H38zm110 0h54v54h-54zM38 148h54v54H38zm78-34h24v24h-24zm34 0h20v20h-20zm-34 44h20v44h-20zm40-2h46v46h-46z" fill="#173c2c"/>
  <text x="120" y="126" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#173c2c">${escapeXml(label)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function toolLogoSvg(slug: string): string {
  const initials = slug
    .split(/[-_]/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <rect width="160" height="160" rx="36" fill="#173c2c"/>
  <circle cx="118" cy="42" r="25" fill="#d9f99d" opacity=".9"/>
  <text x="80" y="94" text-anchor="middle" font-family="system-ui,sans-serif" font-size="44" font-weight="700" fill="#fff">${escapeXml(initials)}</text>
</svg>`;
}
