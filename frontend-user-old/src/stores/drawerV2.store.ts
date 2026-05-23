/**
 * ============================================================================
 * DrawerV2 Store —— 全局抽屉式侧栏
 * ----------------------------------------------------------------------------
 * 触发：顶栏左上角的 ☰ 汉堡按钮 → toggle()
 *
 * 抽屉宽度 240px，从左侧滑入，右侧带半透明遮罩。
 * 顶部固定一个 "功能切换器"（home / search / library / review / latex ...）
 * 中间内容根据 activeFeature 不同而不同。
 *
 * activeFeature 默认根据当前路由推断（routeToFeature 在 AppDrawer 内部完成），
 * 用户也可在抽屉里点击切换器手动切换 → 触发路由跳转。
 * ============================================================================
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export type DrawerFeature =
  | 'home'        // 首页 · 总览菜单
  | 'search'      // 搜索 · 收藏 + 筛选
  | 'library'     // 文献集 · 文件夹树
  | 'review'      // 智能审稿
  | 'latex'       // Prism LaTeX 编辑器
  | 'submit'      // 投稿
  | 'features'    // 功能大全 · 黄页
  | 'settings';   // 设置

interface DrawerV2State {
  isOpen: boolean;
  activeFeature: DrawerFeature;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setFeature: (feature: DrawerFeature) => void;
}

// localStorage 持久化：记住"上次抽屉是否展开"，刷新后保持
const LS_KEY = 'drawerv2.isOpen';
const initialIsOpen: boolean = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
})();

export const useDrawerV2Store = create<DrawerV2State>((set) => ({
  isOpen: initialIsOpen,
  activeFeature: 'home',
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setFeature: (feature) => set({ activeFeature: feature }),
}));

// 持久化 isOpen
useDrawerV2Store.subscribe((state) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, state.isOpen ? '1' : '0');
  } catch {
    /* swallow quota errors */
  }
});

// ESC 关闭抽屉
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && useDrawerV2Store.getState().isOpen) {
      useDrawerV2Store.getState().close();
    }
  });
}

// 抽屉是"挤入式"（push）而不是悬浮：通过 CSS 变量告诉页面让出空间。
// --drawerv2-w 由各页面读取后给 main/footer 等加 padding-left。
const DRAWER_WIDTH = '240px';
const syncDrawerWidthVar = (open: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(
    '--drawerv2-w',
    open ? DRAWER_WIDTH : '0px',
  );
};
// 初次加载：根据持久化状态写一次 CSS 变量
syncDrawerWidthVar(initialIsOpen);
useDrawerV2Store.subscribe((state) => syncDrawerWidthVar(state.isOpen));

export const useDrawerV2 = () =>
  useDrawerV2Store(
    useShallow((s) => ({
      isOpen: s.isOpen,
      activeFeature: s.activeFeature,
      open: s.open,
      close: s.close,
      toggle: s.toggle,
      setFeature: s.setFeature,
    })),
  );
