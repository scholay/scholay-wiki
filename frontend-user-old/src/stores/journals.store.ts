/**
 * ============================================================================
 * Journals Store —— 按 venue 名缓存期刊分区/IF 元数据
 * ----------------------------------------------------------------------------
 * 场景：搜索结果一页 N 张论文卡，每张卡需要展示真实的 Q 分区/影响因子。
 * 单查代价高，所以一次性把这一页的 venue 去重后丢给 /journals/byNames
 * 批量接口，结果以"规范化 venue 名"为 key 落本地缓存，所有卡片直接读。
 *
 * 规范化：toLowerCase + 去掉 (xx)、《》、首尾空白，避免 "Nature " / "nature" 命中失败。
 * ============================================================================
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { journalAPI } from '../services/scholar.api';

export interface JournalLite {
  id?: number | string;
  canonical_name?: string;
  jcr_quartile?: string;          // Q1 | Q2 | Q3 | Q4
  fqb_quartile?: string;          // 中科院分区
  scimago_best_quartile?: string; // SCImago 分区
  ccf_rank?: string;              // A | B | C
  jcr_impact_factor?: number;     // IF (有时叫 impact_factor)
  impact_factor?: number;
  jcr_if?: number;
  is_oa?: number | string;
  publisher?: string;
  country?: string;
  issn_l?: string;
  [k: string]: any;
}

const FIELDS = [
  'id',
  'canonical_name',
  'jcr_quartile',
  'fqb_quartile',
  'scimago_best_quartile',
  'ccf_rank',
  'jcr_impact_factor',
  'impact_factor',
  'is_oa',
  'publisher',
  'country',
  'issn_l',
].join(',');

/** 规范化 venue 名作为缓存键 */
export const normalizeVenue = (name?: string): string => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[《》"'"'\[\]()（）]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

interface JournalsState {
  /** normalized venue name → journal record（null 表示查过但没命中） */
  byVenue: Record<string, JournalLite | null>;
  /** 正在飞行的请求（去重） */
  inflight: Set<string>;

  getByVenue: (venue: string) => JournalLite | null | undefined;
  /** 批量补全：传一组 venue 名，未缓存的会并入一次请求 */
  fetchVenues: (venues: string[]) => Promise<void>;
  reset: () => void;
}

export const useJournalsStore = create<JournalsState>((set, get) => ({
  byVenue: {},
  inflight: new Set(),

  getByVenue: (venue) => {
    const k = normalizeVenue(venue);
    if (!k) return null;
    return get().byVenue[k];
  },

  fetchVenues: async (venues) => {
    const need: string[] = [];
    const needNormalized = new Set<string>();
    const { byVenue, inflight } = get();
    for (const raw of venues) {
      if (!raw) continue;
      const k = normalizeVenue(raw);
      if (!k) continue;
      if (k in byVenue) continue;
      if (inflight.has(k)) continue;
      needNormalized.add(k);
      // 上游精确匹配按原始名，传去重前的形态
      if (!need.includes(raw)) need.push(raw);
    }
    if (need.length === 0) return;

    // 标记 inflight
    set((s) => {
      const next = new Set(s.inflight);
      needNormalized.forEach((k) => next.add(k));
      return { inflight: next };
    });

    try {
      // 上游限制 names CSV，长度有上限，截 50 个一批就够（一页搜索结果不会超）。
      const namesCSV = need.slice(0, 50).map((n) => n.trim()).join(',');
      const res = await journalAPI.byNames(namesCSV, FIELDS);
      const code = res?.data?.code;
      const data = res?.data?.data;

      // 上游真实 shape：
      //   { code:0, data: { results: { "Nature": { unified: {...} }, ... },
      //                     total, matchedCount, unmatched: [...] } }
      // 兼容旧 shape：数组 / data.items / data.data 仍然能解析。
      const collected: Array<{ requestedName: string; journal: JournalLite }> = [];
      if (code === 0) {
        if (data?.results && typeof data.results === 'object' && !Array.isArray(data.results)) {
          for (const [requestedName, val] of Object.entries(data.results as Record<string, any>)) {
            const journal: JournalLite | undefined = val?.unified || val;
            if (journal && typeof journal === 'object') {
              collected.push({ requestedName, journal });
            }
          }
        } else {
          let items: JournalLite[] = [];
          if (Array.isArray(data)) items = data;
          else if (Array.isArray(data?.items)) items = data.items;
          else if (Array.isArray(data?.data)) items = data.data;
          for (const j of items) {
            collected.push({ requestedName: j.canonical_name || '', journal: j });
          }
        }
      }

      // 把命中的写入；
      //   - 用请求时的 name 做主 key（保证 STC venue → journal 反查命中）
      //   - 同时把 canonical_name 也写一份，便于其它地方按官方名命中
      // 未命中的（仅在 needNormalized 中、collected 没覆盖到）写 null。
      set((s) => {
        const next = { ...s.byVenue };
        const matched = new Set<string>();
        for (const { requestedName, journal } of collected) {
          const k1 = normalizeVenue(requestedName);
          const k2 = normalizeVenue(journal.canonical_name);
          if (k1) { next[k1] = journal; matched.add(k1); }
          if (k2 && k2 !== k1) next[k2] = journal;
        }
        needNormalized.forEach((k) => {
          if (!matched.has(k)) next[k] = null;
        });
        const newInflight = new Set(s.inflight);
        needNormalized.forEach((k) => newInflight.delete(k));
        return { byVenue: next, inflight: newInflight };
      });
    } catch {
      set((s) => {
        const newInflight = new Set(s.inflight);
        needNormalized.forEach((k) => newInflight.delete(k));
        // 失败时不写 null，留给下次重试
        return { inflight: newInflight };
      });
    }
  },

  reset: () => set({ byVenue: {}, inflight: new Set() }),
}));

export const useJournals = () =>
  useJournalsStore(
    useShallow((s) => ({
      byVenue: s.byVenue,
      getByVenue: s.getByVenue,
      fetchVenues: s.fetchVenues,
    })),
  );
