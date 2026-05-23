import { useEffect, useState } from 'react';
import { http, toApiError } from '@/shared/lib/http';

/**
 * 期刊元数据补全 —— 论文 venue 只有期刊名(字符串),
 * 真正的 JCR 分区 / 影响因子 / CCF / 中科院分区 要走 `POST /public/journals/byNames` 拿。
 *
 * 设计:
 *   - 一页搜索结果一次性批量请求(去 venue 串拼成逗号分隔)
 *   - 模块级 cache(进程内永久)+ in-flight Promise dedup
 *   - useJournalEnrichments(names) — 用 useEffect 触发 fetch,fetch 完 setState
 *   - 命中过的不会再请求;并发同名只发一次
 *   - "查过但上游无此期刊" 也写入 cache(value=null),避免反复请求
 */

export interface JournalEnrichment {
  /** 上游 journal id —— 用来跳详情页 `/browser/j/:id` */
  id: number;
  canonical_name: string;
  /** JCR 分区:Q1 / Q2 / Q3 / Q4 */
  jcr_quartile?: string;
  /** JCR 影响因子(上游返回字符串如 "48.5",已 parseFloat) */
  jcr_impact_factor?: number;
  /** 中科院大类分区:"1" / "2" / "3" / "4"(从 "1 [1/118]" 中抽出) */
  fqb_quartile?: string;
  /** 中科院 TOP 期刊标记 */
  fqb_top?: boolean;
  /** CCF 等级:A / B / C */
  ccf_rank?: string;
  /** OpenAlex H-index */
  openalex_h_index?: number;
  /** 是否开放获取期刊 */
  is_oa?: boolean;
  /** 国际期刊预警名单(中科院) */
  gjqk_warning?: boolean;
}

/** 上游 byNames 单条原始结构(只声明用到的字段) */
interface RawJournal {
  id?: number;
  canonical_name?: string;
  jcr_quartile?: string | null;
  jcr_impact_factor?: string | number | null;
  fqb_major_quartile?: string | null;
  fqb_top?: string | boolean | null;
  ccf_rank?: string | null;
  openalex_h_index?: number | null;
  openalex_is_oa?: number | boolean | null;
  doaj_is_in_doaj?: number | boolean | null;
  gjqk_year?: number | null;
  gjqk_warning_level?: string | null;
}

/** 模块级 cache: key 是 trim 后的 venue 原文,value 为 enrichment 或 null(查过但无) */
const cache = new Map<string, JournalEnrichment | null>();
/** 同名并发去重:一次 fetch 在飞,后到的 caller await 同一个 promise */
const inflight = new Map<string, Promise<void>>();

/**
 * 实测上游 `POST /v1/jnl/byNames` 响应:
 * ```
 * {
 *   "results": {
 *     "Nature":  { "unified": { canonical_name, jcr_quartile, jcr_impact_factor, fqb_major_quartile, ... } },
 *     "Science": { "unified": { ... } }
 *   }
 * }
 * ```
 * key 是请求时传的原始 name(精确匹配),value.unified 是统一字段集合。
 */
function unwrapJournals(raw: unknown): Array<{ name: string; data: RawJournal }> {
  if (!raw || typeof raw !== 'object') return [];
  const results = (raw as Record<string, unknown>).results;
  if (!results || typeof results !== 'object') return [];

  const out: Array<{ name: string; data: RawJournal }> = [];
  for (const [name, val] of Object.entries(results as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const unified = (val as Record<string, unknown>).unified;
    if (unified && typeof unified === 'object') {
      out.push({ name, data: unified as RawJournal });
    }
  }
  return out;
}

/**
 * 上游字段 → 前端 enrichment 转换:
 *   - jcr_impact_factor 字符串 "48.5" → parseFloat
 *   - fqb_major_quartile "1 [1/118]" → 抽首位数字 "1"
 *   - openalex_is_oa 0/1 → boolean
 *   - gjqk_warning_level 非 null/空 → 视为预警
 */
function toEnrichment(raw: RawJournal, name: string): JournalEnrichment | null {
  // 没 id 就没法跳详情,而且没 id 通常意味着上游也没真匹配 — 直接当 miss
  if (typeof raw.id !== 'number' || raw.id <= 0) return null;

  const ifNum = parseNumberLoose(raw.jcr_impact_factor);
  const fqbStr = String(raw.fqb_major_quartile ?? '').trim();
  const fqbMatch = fqbStr.match(/^([1-4])/);

  return {
    id: raw.id,
    canonical_name: raw.canonical_name ?? name,
    jcr_quartile: raw.jcr_quartile?.toString().toUpperCase() || undefined,
    jcr_impact_factor: ifNum,
    fqb_quartile: fqbMatch ? fqbMatch[1] : undefined,
    fqb_top: raw.fqb_top === true || raw.fqb_top === '是' || raw.fqb_top === '1',
    ccf_rank: raw.ccf_rank ? raw.ccf_rank.toString().toUpperCase() : undefined,
    openalex_h_index:
      typeof raw.openalex_h_index === 'number' && raw.openalex_h_index > 0
        ? raw.openalex_h_index
        : undefined,
    is_oa:
      raw.openalex_is_oa === 1 ||
      raw.openalex_is_oa === true ||
      raw.doaj_is_in_doaj === 1 ||
      raw.doaj_is_in_doaj === true,
    gjqk_warning: isRecentWarning(raw),
  };
}

/**
 * 中科院国际期刊预警的 *recent* 判定 —— 上游会保留历史快照(如 IEEE Access 的
 * `gjqk_year: 2020`),但中科院预警名单每年更新,2020 上榜不代表 2026 还在。
 * 只在最近 2 年内被列入才显示预警 chip,避免误伤已经"摘帽"的期刊。
 */
function isRecentWarning(raw: RawJournal): boolean {
  const lvl = raw.gjqk_warning_level?.toString().trim();
  if (!lvl) return false;
  const year = typeof raw.gjqk_year === 'number' ? raw.gjqk_year : 0;
  if (year <= 0) return false;
  const currentYear = new Date().getFullYear();
  return year >= currentYear - 1;
}

function parseNumberLoose(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.trim());
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return undefined;
}

async function fetchAndCache(names: string[]): Promise<void> {
  if (names.length === 0) return;
  try {
    const { data } = await http.post<{ data: unknown }>(
      '/public/journals/byNames',
      { names: names.join(',') }
    );
    const items = unwrapJournals(data.data);
    // 上游 results map 的 key 是请求时传的原始 name(精确匹配)
    const byOriginal = new Map<string, JournalEnrichment>();
    for (const { name, data: rawJ } of items) {
      const e = toEnrichment(rawJ, name);
      if (e) byOriginal.set(name, e);
    }
    // 命中的写入 cache;未命中的写入 null(标记"查过没有",避免下次重请求)
    for (const n of names) {
      cache.set(n, byOriginal.get(n) ?? null);
    }
  } catch (err) {
    // 失败不写 null,允许下次重试
    throw toApiError(err);
  }
}

/**
 * 给一组 venue 名拿对应 enrichment(已缓存的直接返回,缺的批量请求)。
 * 返回 Record<name, enrichment | null>;null 表示"上游无此期刊"。
 */
export function useJournalEnrichments(
  names: string[]
): Record<string, JournalEnrichment | null> {
  const [enrichments, setEnrichments] = useState<
    Record<string, JournalEnrichment | null>
  >(() => readCacheFor(names));

  // names join 作为依赖键(数组引用变 ≠ 内容变)
  const depKey = names.join('|');

  useEffect(() => {
    // 先把已缓存的写到本地 state(立刻渲染已有的)
    setEnrichments(readCacheFor(names));

    // 算缺失 + 去掉 in-flight 重复
    const missing = names.filter((n) => n && !cache.has(n));
    if (missing.length === 0) return;

    const toFetch = missing.filter((n) => !inflight.has(n));

    let cancelled = false;
    const waitFor: Promise<void>[] = [];
    for (const n of missing) {
      const p = inflight.get(n);
      if (p) waitFor.push(p);
    }

    if (toFetch.length > 0) {
      const p = fetchAndCache(toFetch).finally(() => {
        for (const n of toFetch) inflight.delete(n);
      });
      for (const n of toFetch) inflight.set(n, p);
      waitFor.push(p);
    }

    Promise.allSettled(waitFor).then(() => {
      if (!cancelled) setEnrichments(readCacheFor(names));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return enrichments;
}

function readCacheFor(
  names: string[]
): Record<string, JournalEnrichment | null> {
  const out: Record<string, JournalEnrichment | null> = {};
  for (const n of names) {
    if (n && cache.has(n)) out[n] = cache.get(n)!;
  }
  return out;
}
