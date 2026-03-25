/**
 * SidebarContext — 桥接到 Zustand sidebarStore
 *
 * 此文件保留向后兼容性，所有逻辑已迁移到：
 *   - shared/stores/sidebarStore.ts (Zustand 状态管理)
 *   - app/bridges/SidebarBridge.tsx (Context 桥接层)
 *
 * 页面仍可使用 import { useSidebar } from '../contexts/SidebarContext'
 */

export { SidebarBridgeProvider as SidebarProvider, useSidebar } from '../app/bridges/SidebarBridge';
