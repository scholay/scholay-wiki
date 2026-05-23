/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import { createContext, useContext } from 'react';

export interface SettingsContextValue {
  isVerified: boolean;
  verifyEpoch: number;
  onRequestVerify: () => void;
}

// 系统设置页共享上下文
// - isVerified: 是否已通过密码验证
// - verifyEpoch: 验证状态变化计数器，子 Tab 监听该值变化以重新加载数据
// - onRequestVerify: 打开密码验证弹窗
const SettingsContext = createContext<SettingsContextValue>({
  isVerified: false,
  verifyEpoch: 0,
  onRequestVerify: () => {},
});

export const SettingsProvider = SettingsContext.Provider;

export const useSettingsContext = (): SettingsContextValue =>
  useContext(SettingsContext);

export default SettingsContext;
