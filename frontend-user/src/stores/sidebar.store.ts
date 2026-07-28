import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LucideIcon } from 'lucide-react';

/**
 * 全局 sidebar 状态 —— 同时驱动:
 *   1. TopNav 折叠态的 Rail chip(`rail` 字段)
 *   2. AppShell 左侧展开的完整面板(每个 feature 自己渲染,store 只管开关)
 *   3. ☰ 按钮的 toggle 状态(`expanded`,持久化到 localStorage)
 *   4. 点击 Rail chip 后"对应 sidebar section 闪一下高亮边框"(flashedSection)
 *
 * 用法:
 *   - feature 页面调用 `useRegisterSidebarRail([...])` 注入快捷入口
 *   - feature 页面用 `<SidebarLayout sidebar={<MySidebar />}>...</SidebarLayout>` 包裹自身
 *   - sidebar 里的 `<SidebarSection id="filters">` 用 id 接收 flash 信号
 */
export interface RailItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /**
   * 点击该 chip 时,会让 sidebar 中拥有同 id 的 <SidebarSection> 闪烁高亮一次。
   * 若 sidebar 内不存在对应 section,只单纯展开 sidebar(无视觉副作用)。
   */
  sectionId?: string;
}

interface SidebarState {
  /**
   * 用户意图:☰ 当前态。
   *
   * 持久化策略(产品要求):
   *   - 默认 false(首次访问/清缓存后关闭)
   *   - 任意来源(☰ / Rail chip 点击 / Cmd+B)打开后立刻写盘
   *   - 浏览器级别记忆,刷新/关浏览器后仍保持
   *   - 直到用户手动关闭才会切回 false 并写盘
   *
   * 实现:zustand `persist` middleware,partialize 只存 expanded
   *      (rail/hasPanel/flashedSection 是运行时态,不持久化)
   */
  expanded: boolean;
  /** TopNav 折叠态的 chip 列表(当前 feature 提供) */
  rail: RailItem[];
  /** 当前路由是否有 sidebar 可展开(由 SidebarLayout mount 时 set) */
  hasPanel: boolean;
  /** 当前要"闪一下"的 section id;短暂为非空,约 1800ms 后自动归 null */
  flashedSection: string | null;

  toggle: () => void;
  setExpanded: (v: boolean) => void;
  setRail: (items: RailItem[]) => void;
  setHasPanel: (v: boolean) => void;
  /** 触发某 section 闪烁高亮(自动 1800ms 后清空,无需调用方手动 reset) */
  flashSection: (id: string) => void;
}

export const useSidebar = create<SidebarState>()(
  persist(
    (set, get) => ({
      expanded: false,
      rail: [],
      hasPanel: false,
      flashedSection: null,
      toggle: () => set((s) => ({ expanded: !s.expanded })),
      setExpanded: (v) => set({ expanded: v }),
      setRail: (items) => set({ rail: items }),
      setHasPanel: (v) => set({ hasPanel: v }),
      flashSection: (id) => {
        set({ flashedSection: id });
        // 直接 setTimeout,无需 React 上下文(zustand 在 hook 外也能 set)
        // 1800ms 后清回 null —— 与 SidebarSection 的 CSS 动画时长对齐
        setTimeout(() => {
          if (get().flashedSection === id) set({ flashedSection: null });
        }, 1800);
      },
    }),
    {
      name: 'scholay.sidebar',
      partialize: (s) => ({ expanded: s.expanded }), // 只持久化用户意图,其余是运行时
    }
  )
);

/**
 * 在 feature 页面顶层调用,声明本页 sidebar 折叠态的 chip 列表。
 * 卸载时自动清空。
 *
 * 示例:
 *   useRegisterSidebarRail([
 *     { id: 'all', label: '我的文件夹', icon: Folder, sectionId: 'library' },
 *     { id: 'filters', label: '筛选器', icon: Filter, sectionId: 'filters' },
 *   ]);
 */
export function useRegisterSidebarRail(items: RailItem[]) {
  useEffect(() => {
    useSidebar.getState().setRail(items);
    return () => useSidebar.getState().setRail([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items.map((i) => i.id + (i.sectionId ?? '')))]);
}
