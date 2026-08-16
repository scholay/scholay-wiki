import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 我的资源侧栏文件夹元数据(四集共用):
 *   - aliases:改名覆盖(默认文献集 / mock 集没有 PATCH 时落这里)
 *   - pinned:置顶顺序,key = `${section}:${id}`
 */
interface LibraryFolderMetaState {
  aliases: Record<string, string>;
  setAlias: (key: string, name: string) => void;
  pinned: string[];
  togglePin: (key: string) => void;
}

export function libraryFolderMetaKey(
  section: string,
  folderId: string,
): string {
  return `${section}:${folderId}`;
}

export const useLibraryFolderMeta = create<LibraryFolderMetaState>()(
  persist(
    (set) => ({
      aliases: {},
      setAlias: (key, name) =>
        set((s) => {
          const trimmed = name.trim();
          if (!trimmed) {
            const next = { ...s.aliases };
            delete next[key];
            return { aliases: next };
          }
          return { aliases: { ...s.aliases, [key]: trimmed } };
        }),
      pinned: [],
      togglePin: (key) =>
        set((s) => {
          const on = s.pinned.includes(key);
          return {
            pinned: on
              ? s.pinned.filter((x) => x !== key)
              : [key, ...s.pinned],
          };
        }),
    }),
    {
      name: 'scholay.library-folder-meta',
      partialize: (s) => ({ aliases: s.aliases, pinned: s.pinned }),
    },
  ),
);

export function sortLibraryFolders<T extends { metaKey: string }>(
  rows: T[],
  pinned: string[],
): T[] {
  if (pinned.length === 0) return rows;
  const byKey = new Map(rows.map((r) => [r.metaKey, r]));
  const seen = new Set<string>();
  const next: T[] = [];
  for (const key of pinned) {
    const row = byKey.get(key);
    if (!row) continue;
    next.push(row);
    seen.add(key);
  }
  for (const row of rows) {
    if (!seen.has(row.metaKey)) next.push(row);
  }
  return next;
}
