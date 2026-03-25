/**
 * ThemeContext — 桥接到 Zustand themeStore
 *
 * 此文件保留向后兼容性，所有逻辑已迁移到：
 *   - shared/stores/themeStore.ts (Zustand 状态管理)
 *   - app/bridges/ThemeBridge.tsx (Context 桥接层)
 *
 * 页面仍可使用 import { useTheme } from '../contexts/ThemeContext'
 */

export { ThemeBridgeProvider as ThemeProvider, useTheme } from '../app/bridges/ThemeBridge';
