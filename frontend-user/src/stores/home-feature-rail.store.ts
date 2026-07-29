import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MENUS, type Menu } from '@/app/menus';

const ALL_IDS = MENUS.map((m) => m.id);

interface HomeFeatureRailState {
  /** 钉在轨上的 menu.id(顺序仅作初始/同频兜底,展示按 clicks 排) */
  pinnedIds: string[];
  /** 本地自定义显示名 */
  aliases: Record<string, string>;
  /** 本机点击计数 */
  clicks: Record<string, number>;
  pin: (id: string) => void;
  unpin: (id: string) => void;
  rename: (id: string, label: string) => void;
  recordClick: (id: string) => void;
  /** 恢复全量 MENUS + 清空别名与点击 */
  reset: () => void;
}

export const useHomeFeatureRail = create<HomeFeatureRailState>()(
  persist(
    (set, get) => ({
      pinnedIds: [...ALL_IDS],
      aliases: {},
      clicks: {},
      pin: (id) => {
        if (!MENUS.some((m) => m.id === id)) return;
        set((s) => {
          if (s.pinnedIds.includes(id)) return s;
          return { pinnedIds: [...s.pinnedIds, id] };
        });
      },
      unpin: (id) => {
        set((s) => {
          if (s.pinnedIds.length <= 1) return s;
          if (!s.pinnedIds.includes(id)) return s;
          const { [id]: _a, ...aliases } = s.aliases;
          return {
            pinnedIds: s.pinnedIds.filter((x) => x !== id),
            aliases,
          };
        });
      },
      rename: (id, label) => {
        const trimmed = label.trim();
        set((s) => {
          if (!s.pinnedIds.includes(id)) return s;
          const next = { ...s.aliases };
          const catalog = MENUS.find((m) => m.id === id)?.label;
          if (!trimmed || trimmed === catalog) delete next[id];
          else next[id] = trimmed.slice(0, 16);
          return { aliases: next };
        });
      },
      recordClick: (id) => {
        if (!get().pinnedIds.includes(id)) return;
        set((s) => ({
          clicks: { ...s.clicks, [id]: (s.clicks[id] ?? 0) + 1 },
        }));
      },
      reset: () =>
        set({
          pinnedIds: [...ALL_IDS],
          aliases: {},
          clicks: {},
        }),
    }),
    { name: 'scholay.home-feature-rail' },
  ),
);

const MENU_ORDER = new Map(MENUS.map((m, i) => [m.id, i]));

/** 钉选 ∩ 仍存在的 MENUS,按 clicks 降序,同频按 catalogs 顺序 */
export function selectRailMenus(state: {
  pinnedIds: string[];
  clicks: Record<string, number>;
}): Menu[] {
  const byId = new Map(MENUS.map((m) => [m.id, m]));
  return state.pinnedIds
    .map((id) => byId.get(id))
    .filter((m): m is Menu => !!m)
    .sort((a, b) => {
      const ca = state.clicks[a.id] ?? 0;
      const cb = state.clicks[b.id] ?? 0;
      if (cb !== ca) return cb - ca;
      return (MENU_ORDER.get(a.id) ?? 0) - (MENU_ORDER.get(b.id) ?? 0);
    });
}

export function railDisplayLabel(
  menu: Menu,
  aliases: Record<string, string>,
): string {
  return aliases[menu.id]?.trim() || menu.label;
}
