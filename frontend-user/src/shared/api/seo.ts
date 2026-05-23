// ============================================================================
// SEO expose helpers —— /api/v1/public/seo/expose
//
// 后端会用同一通道接 papers / authors / journals 三类种子, 内部做幂等 upsert + 5s 合并锁。
// 前端职责只有"开火":
//   - 详情打开 (tier=1) 用 exposeXxxDetail(seed) 单条 fire-and-forget
//   - 搜索曝光 (tier=2) 用 exposeXxxs(seeds) 批量, 上限由后端 SearchSeedBatchLimit 裁剪
// 都走 sendBeacon (失败回退 fetch + keepalive), 不阻塞主线程, 不阻断导航。
//
// 故意不放在 features/<x>/api —— SEO 跨域复用, paper / author / journal 三家共用。
// ============================================================================

import type { Author, Journal, Paper, PaperAuthor } from '@/shared/api/types';

// ─── 后端期望的 snake_case payload 结构 (mirrors seo.PaperSeed / AuthorSeed / JournalSeed) ───

export interface PaperSeedPayload {
  paper_id: string;
  title: string;
  abstract?: string;
  year?: number;
  venue?: string;
  doi?: string;
  authors?: Array<{ name: string; authorId?: string }>;
  fields_of_study?: string[];
  source?: string;
}

export interface AuthorSeedPayload {
  author_id: string;
  name: string;
  affiliations?: string[];
  homepage?: string;
  paper_count?: number;
  citation_count?: number;
  h_index?: number;
  source?: string;
}

export interface JournalSeedPayload {
  journal_id: number;
  canonical_name: string;
  publisher?: string;
  issns?: string[];
  country?: string;
  type?: string;
  is_oa?: boolean;
  jcr_impact_factor?: number;
  jcr_quartile?: string;
  openalex_h_index?: number;
}

const EXPOSE_URL = '/api/v1/public/seo/expose';

/**
 * 把 frontend Journal 对象映射为 seed payload(后端字段名是 snake_case)。
 * 上层不需要关心字段映射,统一在这一处。
 */
export function journalToSeed(j: Journal | undefined | null): JournalSeedPayload | null {
  if (!j || !j.id || !j.canonical_name) return null;
  const seed: JournalSeedPayload = {
    journal_id: j.id,
    canonical_name: j.canonical_name,
  };
  if (j.publisher) seed.publisher = j.publisher;
  if (j.issns && j.issns.length) seed.issns = j.issns;
  if (j.country) seed.country = j.country;
  if (j.type) seed.type = j.type;
  if (j.is_oa) seed.is_oa = true;
  if (typeof j.jcr_impact_factor === 'number' && j.jcr_impact_factor > 0) {
    seed.jcr_impact_factor = j.jcr_impact_factor;
  }
  if (j.jcr_quartile) seed.jcr_quartile = j.jcr_quartile;
  if (typeof j.openalex_h_index === 'number' && j.openalex_h_index > 0) {
    seed.openalex_h_index = j.openalex_h_index;
  }
  return seed;
}

/** 把 ExposeRequest 用 sendBeacon 投递,失败回退 fetch+keepalive(均 best-effort) */
function postExpose(body: object): void {
  const json = JSON.stringify(body);
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([json], { type: 'application/json' });
      if (navigator.sendBeacon(EXPOSE_URL, blob)) return;
    } catch {
      // fall through to fetch
    }
  }
  void fetch(EXPOSE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
    keepalive: true,
  }).catch(() => {
    // best-effort, 不打扰用户
  });
}

/** 详情点击 fire 一条 journal seed (tier=1 由后端 GetJournal 兜底, 这里是前端事件级补点) */
export function exposeJournalDetail(journal: Journal | undefined | null): void {
  const seed = journalToSeed(journal);
  if (!seed) return;
  postExpose({ journals: [seed] });
}

/** 搜索结果渲染 fire 一批 journal seeds (tier=2 长尾种子, 后端裁剪到 SearchSeedBatchLimit) */
export function exposeJournals(journals: Array<Journal | undefined | null>): void {
  const seeds: JournalSeedPayload[] = [];
  for (const j of journals) {
    const s = journalToSeed(j);
    if (s) seeds.push(s);
  }
  if (!seeds.length) return;
  postExpose({ journals: seeds });
}

// ────────────────────────── Paper ──────────────────────────

/**
 * 把 frontend Paper 对象映射为 seed payload。后端 source 是必填字段:
 *   - paper.source 已写 → 直接用
 *   - 缺失 → 按 paperId 前缀推断 (olx: → 'olx', 否则 'stc')
 * doi 从 externalIds.DOI 抽; authors 只截 name + authorId 两字段(后端只看这两个)。
 */
export function paperToSeed(p: Paper | undefined | null): PaperSeedPayload | null {
  if (!p || !p.paperId || !p.title) return null;
  const seed: PaperSeedPayload = {
    paper_id: p.paperId,
    title: p.title,
    source: p.source ?? inferPaperSource(p.paperId),
  };
  if (p.abstract) seed.abstract = p.abstract;
  if (typeof p.year === 'number' && p.year > 0) seed.year = p.year;
  if (p.venue) seed.venue = p.venue;
  if (p.externalIds && typeof p.externalIds === 'object') {
    const doi = (p.externalIds as Record<string, unknown>).DOI;
    if (typeof doi === 'string' && doi) seed.doi = doi;
  }
  if (p.authors && p.authors.length) {
    const authors: Array<{ name: string; authorId?: string }> = [];
    for (const a of p.authors) {
      if (a && a.name) {
        const entry: { name: string; authorId?: string } = { name: a.name };
        if (a.authorId) entry.authorId = a.authorId;
        authors.push(entry);
      }
    }
    if (authors.length) seed.authors = authors;
  }
  if (p.fieldsOfStudy && p.fieldsOfStudy.length) {
    seed.fields_of_study = p.fieldsOfStudy;
  }
  return seed;
}

/** 详情点击 fire 一条 paper seed (tier=1) */
export function exposePaperDetail(paper: Paper | undefined | null): void {
  const seed = paperToSeed(paper);
  if (!seed) return;
  postExpose({ papers: [seed] });
}

/** 搜索结果渲染 fire 一批 paper seeds (tier=2) */
export function exposePapers(papers: Array<Paper | undefined | null>): void {
  const seeds: PaperSeedPayload[] = [];
  for (const p of papers) {
    const s = paperToSeed(p);
    if (s) seeds.push(s);
  }
  if (!seeds.length) return;
  postExpose({ papers: seeds });
}

// ────────────────────────── Author ──────────────────────────

/**
 * 把 Author / PaperAuthor 映射为 seed。两个接口字段集略有差异 (PaperAuthor 没有
 * paperCount/hIndex), 这里用 union 兼容 —— 缺的就不写。
 */
export function authorToSeed(
  a: Author | PaperAuthor | undefined | null
): AuthorSeedPayload | null {
  if (!a || !a.authorId || !a.name) return null;
  const seed: AuthorSeedPayload = {
    author_id: a.authorId,
    name: a.name,
  };
  if (a.affiliations && a.affiliations.length) seed.affiliations = a.affiliations;
  // 下面字段只 Author 有, PaperAuthor 没有 —— 用 in 守卫静态消除
  if ('homepage' in a && a.homepage) seed.homepage = a.homepage;
  if ('paperCount' in a && typeof a.paperCount === 'number' && a.paperCount > 0) {
    seed.paper_count = a.paperCount;
  }
  if (
    'citationCount' in a &&
    typeof a.citationCount === 'number' &&
    a.citationCount > 0
  ) {
    seed.citation_count = a.citationCount;
  }
  if ('hIndex' in a && typeof a.hIndex === 'number' && a.hIndex > 0) {
    seed.h_index = a.hIndex;
  }
  if ('source' in a && a.source) seed.source = a.source;
  return seed;
}

/** 详情点击 fire 一条 author seed (tier=1, 后端 minicod.GetAuthor 也兜底) */
export function exposeAuthorDetail(author: Author | undefined | null): void {
  const seed = authorToSeed(author);
  if (!seed) return;
  postExpose({ authors: [seed] });
}

/** 搜索结果渲染 fire 一批 author seeds (tier=2) */
export function exposeAuthors(
  authors: Array<Author | PaperAuthor | undefined | null>
): void {
  const seeds: AuthorSeedPayload[] = [];
  const seen = new Set<string>();
  for (const a of authors) {
    const s = authorToSeed(a);
    if (!s) continue;
    if (seen.has(s.author_id)) continue; // 同批去重
    seen.add(s.author_id);
    seeds.push(s);
  }
  if (!seeds.length) return;
  postExpose({ authors: seeds });
}

/**
 * 从一批论文里抽出去重后的作者列表 —— SearcherColumn 拿到 papers 后用这个
 * 一次性把作者也喂进 SEO 通道 (mirror 旧前端 useSearchState 的合并曝光逻辑)。
 */
export function extractAuthorsFromPapers(
  papers: Array<Paper | undefined | null>
): PaperAuthor[] {
  const seen = new Set<string>();
  const out: PaperAuthor[] = [];
  for (const p of papers) {
    if (!p?.authors) continue;
    for (const a of p.authors) {
      if (!a?.authorId || !a.name) continue;
      if (seen.has(a.authorId)) continue;
      seen.add(a.authorId);
      out.push(a);
    }
  }
  return out;
}

// ─────────────── source 兜底推断 (与后端 seo.InferSource 行为一致) ───────────────
function inferPaperSource(paperId: string): string {
  if (paperId.startsWith('olx:')) return 'olx';
  return 'stc';
}
