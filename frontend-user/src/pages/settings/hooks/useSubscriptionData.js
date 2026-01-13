/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 订阅/资产管理相关状态和数据获取 Hook
 */

import { useState, useCallback } from 'react';
import api, { orderAPI, walletAPI, fundAPI } from '../../../services/api';
import { useToast } from '../../../components/ToastContainer';
import logger from '../../../utils/logger';

const useSubscriptionData = () => {
  const { showSuccess, showError } = useToast();

  // Subscription state
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  // Billing history state
  const [billingHistory, setBillingHistory] = useState([]);
  const [billingPage, setBillingPage] = useState(1);
  const [billingTotal, setBillingTotal] = useState(0);
  const [billingLoading, setBillingLoading] = useState(false);

  // Wallet state
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState('all');
  const [transactionBizFilter, setTransactionBizFilter] = useState('all');
  const [transactionDateRange, setTransactionDateRange] = useState({ start: '', end: '' });
  const [transactionStats, setTransactionStats] = useState({ totalIncome: 0, totalExpense: 0 });

  // Exchange state
  const [exchangeRate, setExchangeRate] = useState(100);
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [rechargeInfo, setRechargeInfo] = useState(null);

  // Fund state
  const [currentFund, setCurrentFund] = useState(null);
  const [fundLoading, setFundLoading] = useState(true);

  // Biz display infos
  const [bizDisplayInfos, setBizDisplayInfos] = useState({});

  // Fetch functions
  const fetchSubscriptionData = useCallback(async () => {
    try {
      setSubscriptionLoading(true);
      const subResponse = await api.get('/user/subscription/my');
      if (subResponse.data.code === 0) {
        setCurrentSubscription(subResponse.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch subscription data:', error);
    } finally {
      setSubscriptionLoading(false);
    }
  }, []);

  const fetchBillingHistory = useCallback(async (page = 1) => {
    try {
      setBillingLoading(true);
      const response = await orderAPI.getBillingHistory(page, 10);
      if (response.data.code === 0) {
        setBillingHistory(response.data.data.orders || []);
        setBillingTotal(response.data.data.total || 0);
        setBillingPage(page);
      }
    } catch (error) {
      logger.error('Failed to fetch billing history:', error);
      showError('获取历史账单失败');
    } finally {
      setBillingLoading(false);
    }
  }, [showError]);

  const fetchWalletData = useCallback(async () => {
    try {
      setWalletLoading(true);
      const response = await walletAPI.getWallet();
      if (response.data.code === 0) {
        setWallet(response.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch wallet:', error);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const fetchCurrentFund = useCallback(async () => {
    try {
      setFundLoading(true);
      const response = await fundAPI.getCurrentFund();
      if (response.data?.code === 0 && response.data?.data) {
        setCurrentFund(response.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch current fund:', error);
    } finally {
      setFundLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (page = 1, filters = {}) => {
    try {
      setTransactionLoading(true);
      const currencyType = filters.currencyType ?? transactionFilter;
      const bizType = filters.bizType ?? transactionBizFilter;
      const dateRange = filters.dateRange ?? transactionDateRange;

      const params = { page, pageSize: 10 };
      if (currencyType !== 'all') {
        params.currencyType = currencyType;
      }
      if (bizType !== 'all') {
        params.bizType = bizType;
      }
      if (dateRange.start) {
        params.startTime = dateRange.start + ' 00:00:00';
      }
      if (dateRange.end) {
        params.endTime = dateRange.end + ' 23:59:59';
      }

      const response = await walletAPI.getTransactions(params);
      if (response.data.code === 0) {
        const txList = response.data.data.transactions || [];
        setTransactions(txList);
        setTransactionTotal(response.data.data.total || 0);
        setTransactionPage(page);

        // 计算统计数据
        let totalIncome = 0;
        let totalExpense = 0;
        txList.forEach(tx => {
          if (tx.amount >= 0) {
            totalIncome += tx.amount;
          } else {
            totalExpense += Math.abs(tx.amount);
          }
        });
        setTransactionStats({ totalIncome, totalExpense });
      }
    } catch (error) {
      logger.error('Failed to fetch transactions:', error);
    } finally {
      setTransactionLoading(false);
    }
  }, [transactionFilter, transactionBizFilter, transactionDateRange]);

  const fetchExchangeInfo = useCallback(async () => {
    try {
      const [exchangeRes, rechargeRes] = await Promise.all([
        walletAPI.getExchangeInfo(),
        walletAPI.getRechargeInfo()
      ]);
      if (exchangeRes.data.code === 0) {
        setExchangeRate(exchangeRes.data.data.diamond_to_gold_rate || 100);
      }
      if (rechargeRes.data.code === 0) {
        setRechargeInfo(rechargeRes.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch exchange info:', error);
    }
  }, []);

  const fetchBizDisplayInfos = useCallback(async () => {
    try {
      const response = await walletAPI.getBizDisplayInfos();
      if (response.data.code === 0) {
        setBizDisplayInfos(response.data.data || {});
      }
    } catch (error) {
      logger.error('Failed to fetch biz display infos:', error);
    }
  }, []);

  const handleExchange = useCallback(async () => {
    const amount = parseInt(exchangeAmount, 10);
    if (!amount || amount <= 0) {
      showError('请输入有效的兑换数量');
      return;
    }
    if (amount > (wallet?.diamond || 0)) {
      showError('恩特币余额不足');
      return;
    }

    try {
      setExchangeLoading(true);
      const response = await walletAPI.exchangeDiamondToGold(amount);
      if (response.data.code === 0) {
        const { gold_received, current_gold, current_diamond } = response.data.data;
        setWallet(prev => ({
          ...prev,
          gold: current_gold,
          diamond: current_diamond
        }));
        showSuccess(`兑换成功！获得 ${gold_received} 经费`);
        setShowExchangeModal(false);
        setExchangeAmount('');
        fetchTransactions(1);
      } else {
        showError(response.data.message || '兑换失败');
      }
    } catch (error) {
      logger.error('Exchange failed:', error);
      showError(error.response?.data?.message || '兑换失败，请稍后重试');
    } finally {
      setExchangeLoading(false);
    }
  }, [exchangeAmount, wallet?.diamond, showError, showSuccess, fetchTransactions]);

  // Load all subscription related data
  const loadAllData = useCallback(() => {
    fetchSubscriptionData();
    fetchBillingHistory(1);
    fetchWalletData();
    fetchTransactions(1);
    fetchExchangeInfo();
    fetchBizDisplayInfos();
    fetchCurrentFund();
  }, [fetchSubscriptionData, fetchBillingHistory, fetchWalletData, fetchTransactions, fetchExchangeInfo, fetchBizDisplayInfos, fetchCurrentFund]);

  return {
    // Subscription
    currentSubscription,
    subscriptionLoading,
    fetchSubscriptionData,

    // Billing
    billingHistory,
    billingPage,
    billingTotal,
    billingLoading,
    fetchBillingHistory,

    // Wallet
    wallet,
    walletLoading,
    fetchWalletData,

    // Transactions
    transactions,
    transactionPage,
    transactionTotal,
    transactionLoading,
    transactionFilter,
    transactionBizFilter,
    transactionDateRange,
    transactionStats,
    setTransactionFilter,
    setTransactionBizFilter,
    setTransactionDateRange,
    fetchTransactions,

    // Exchange
    exchangeRate,
    exchangeAmount,
    exchangeLoading,
    showExchangeModal,
    rechargeInfo,
    setExchangeAmount,
    setShowExchangeModal,
    handleExchange,

    // Fund
    currentFund,
    fundLoading,

    // Biz display
    bizDisplayInfos,

    // Combined loader
    loadAllData,
  };
};

export default useSubscriptionData;
