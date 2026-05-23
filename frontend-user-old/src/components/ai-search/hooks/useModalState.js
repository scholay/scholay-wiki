/**
 * 弹窗状态管理 Hook
 * 从 useAISearch.js 拆分
 */
import { useState } from 'react';

export const useModalState = () => {
  // 授权弹窗
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 引用弹窗
  const [citePaper, setCitePaper] = useState(null);

  return {
    // 状态
    showAuthModal,
    citePaper,

    // Setter
    setShowAuthModal,
    setCitePaper,
  };
};

export default useModalState;
