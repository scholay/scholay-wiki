/**
 * DOI → 题录元数据(经 Crossref REST 公共 API)。
 *
 * 为什么直连 Crossref 而不走 `shared/lib/http`:`http` 实例 baseURL 固定 `/api/v1`,
 * 只对接 Scholar 后端;Crossref 是开放、CORS 友好、免鉴权的第三方公共 API,客户端
 * 引用工具直连是业界惯例(EasyBib/Zotero 同理),无需在后端再造一层代理。
 * 返回 [[CitationPaper]],直接喂给 [[generateCitation]] 出 5 种格式。
 */

import type { CitationPaper } from '@/shared/lib/citation';

const CROSSREF_API = 'https://api.crossref.org/works';
// Crossref「礼貌池(polite pool)」联系邮箱 —— 提升配额与稳定性,非鉴权。
const CROSSREF_MAILTO = 'support@scholay.com';

/** 把各种写法(URL / doi: 前缀 / 裸 DOI)归一成裸 DOI。 */
export function normalizeDoi(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
}

/** 粗校验 DOI 形状(10.前缀 + 后缀)。 */
export function looksLikeDoi(input: string): boolean {
  return /^10\.\d{4,9}\/\S+$/.test(normalizeDoi(input));
}

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefMessage {
  title?: string[];
  author?: CrossrefAuthor[];
  'container-title'?: string[];
  'short-container-title'?: string[];
  volume?: string;
  page?: string;
  issued?: { 'date-parts'?: number[][] };
  DOI?: string;
}

function crossrefToCitationPaper(m: CrossrefMessage): CitationPaper {
  const authors = (m.author ?? [])
    .map((a) => ({
      name:
        a.name?.trim() ||
        [a.given, a.family].filter(Boolean).join(' ').trim(),
    }))
    .filter((a) => a.name);
  return {
    title: m.title?.[0],
    authors,
    year: m.issued?.['date-parts']?.[0]?.[0],
    venue: m['container-title']?.[0] || m['short-container-title']?.[0],
    journal: { volume: m.volume, pages: m.page },
  };
}

/** DOI → CitationPaper。失败抛出可读 Error(供 useMutation 透出给 UI)。 */
export async function fetchCrossrefByDoi(rawDoi: string): Promise<CitationPaper> {
  const doi = normalizeDoi(rawDoi);
  if (!looksLikeDoi(doi)) {
    throw new Error('DOI 格式不正确,应形如 10.xxxx/xxxxx');
  }
  const url = `${CROSSREF_API}/${encodeURIComponent(
    doi
  )}?mailto=${encodeURIComponent(CROSSREF_MAILTO)}`;

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('网络连接失败,请检查网络后重试');
  }
  if (resp.status === 404) {
    throw new Error('未找到该 DOI 对应的文献,请核对后重试');
  }
  if (!resp.ok) {
    throw new Error('解析失败,请稍后重试');
  }

  const json = (await resp.json()) as { message?: CrossrefMessage };
  if (!json.message) throw new Error('解析失败,返回数据为空');
  return crossrefToCitationPaper(json.message);
}
