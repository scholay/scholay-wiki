/**
 * 弹窗状态管理 Hook
 * 从 useAISearch.js 拆分
 */
import { useState } from 'react';

export const useModalState = () => {
  // 授权弹窗
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 余额不足弹窗
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceError, setBalanceError] = useState(null);
  const [balanceErrorFeature, setBalanceErrorFeature] = useState('');

  // 引用弹窗
  const [citePaper, setCitePaper] = useState(null);

  return {
    // 状态
    showAuthModal,
    showBalanceModal,
    balanceError,
    balanceErrorFeature,
    citePaper,

    // Setter
    setShowAuthModal,
    setShowBalanceModal,
    setBalanceError,
    setBalanceErrorFeature,
    setCitePaper,
  };
};

export default useModalState;
