/**
 * AuthContext — 桥接到 Zustand authStore
 *
 * 此文件保留向后兼容性，所有逻辑已迁移到：
 *   - shared/stores/authStore.ts (Zustand 状态管理)
 *   - app/bridges/AuthBridge.tsx (Context 桥接层)
 *
 * 页面仍可使用 import { useAuth } from '../utils/AuthContext'
 */

export { AuthBridgeProvider as AuthProvider, useAuth } from '../app/bridges/AuthBridge';
