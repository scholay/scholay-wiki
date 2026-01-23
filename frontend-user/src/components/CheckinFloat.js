/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { checkinAPI } from '../services/api';
import { useAuth } from '../utils/AuthContext';
import { trackCheckin } from '../utils/usageTracker';
import GoldIcon from './GoldIcon';
import logger from '../utils/logger';
import './CheckinFloat.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./AuthModal'));

const CheckinFloat = () => {
  const { isAuthenticated, user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false); // 登录弹窗状态
  const [hasCheckedIn, setHasCheckedIn] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showFloatBall, setShowFloatBall] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState(null);
  const [checkinHistory, setCheckinHistory] = useState([]);
  const [checkinDetails, setCheckinDetails] = useState([]); // 签到详情（包含经费）
  const [futureRewards, setFutureRewards] = useState([]); // 未来签到预计奖励
  const [modalType, setModalType] = useState('auto'); // 'auto' | 'float'
  const floatBallRef = useRef(null);
  const [floatBallPos, setFloatBallPos] = useState({ x: 0, y: 0 });

  // 获取本周的日历数据（周日到周六）- 用于自动签到弹窗
  const weekData = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);

    // 创建签到详情的映射表
    const checkinDetailMap = {};
    checkinDetails.forEach(detail => {
      checkinDetailMap[detail.date] = detail.gold_reward;
    });
    
    // 创建未来奖励的映射表
    const futureRewardMap = {};
    futureRewards.forEach(reward => {
      futureRewardMap[reward.date] = reward;
    });

    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const day = date.getDate();
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isCheckedIn = checkinHistory.includes(dateStr);
      const isPast = date < today && !isToday;
      const isFuture = date > today;
      
      const goldReward = checkinDetailMap[dateStr] || 0;
      const futureReward = futureRewardMap[dateStr];
      const expectedGold = futureReward?.expected_gold || 10;
      const isMilestone = futureReward?.is_milestone || false;
      
      days.push({ 
        day, isToday, isCheckedIn, isPast, isFuture, dateStr,
        goldReward, expectedGold, isMilestone
      });
    }
    return { days };
  }, [checkinHistory, checkinDetails, futureRewards]);

  // 获取当前月份的日历数据 - 用于悬浮球点击的完整弹窗
  const calendarData = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    // 创建签到详情的映射表
    const checkinDetailMap = {};
    checkinDetails.forEach(detail => {
      checkinDetailMap[detail.date] = detail.gold_reward;
    });
    
    // 创建未来奖励的映射表
    const futureRewardMap = {};
    futureRewards.forEach(reward => {
      futureRewardMap[reward.date] = reward;
    });

    const days = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ day: null });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = day === today.getDate();
      const isCheckedIn = checkinHistory.includes(dateStr);
      const isPast = day < today.getDate();
      const isFuture = day > today.getDate();
      
      // 获取已签到日期的经费数量
      const goldReward = checkinDetailMap[dateStr] || 0;
      
      // 获取未来日期的预计经费
      const futureReward = futureRewardMap[dateStr];
      const expectedGold = futureReward?.expected_gold || 0;
      const isMilestone = futureReward?.is_milestone || false;
      const milestoneMessage = futureReward?.milestone_message || '';
      const isAfterUpgrade = futureReward?.is_after_upgrade || false;
      const baseUpgradeMsg = futureReward?.base_upgrade_msg || '';
      
      days.push({ 
        day, isToday, isCheckedIn, isPast, isFuture, dateStr,
        goldReward, expectedGold, isMilestone, milestoneMessage, isAfterUpgrade, baseUpgradeMsg
      });
    }
    return { year, month, days, monthName: today.toLocaleDateString('zh-CN', { month: 'long' }) };
  }, [checkinHistory, checkinDetails, futureRewards]);

  // 获取用户专属的存储 key
  const getStorageKey = useCallback((baseKey) => {
    const userId = user?.id || 'guest';
    return `${baseKey}_${userId}`;
  }, [user?.id]);

  const checkFirstVisitToday = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const firstVisitKey = getStorageKey('checkin_first_visit_today');
    const modalShownKey = getStorageKey('checkin_modal_shown_today');
    
    const lastVisit = sessionStorage.getItem(firstVisitKey);
    const modalShown = sessionStorage.getItem(modalShownKey);
    logger.log('[CheckinFloat] checkFirstVisitToday:', { today, lastVisit, modalShown, userId: user?.id });
    
    if (lastVisit !== today) {
      sessionStorage.setItem(firstVisitKey, today);
      sessionStorage.removeItem(modalShownKey);
      logger.log('[CheckinFloat] New day for user, should show modal');
      return true;
    }
    const shouldShow = modalShown !== 'true';
    logger.log('[CheckinFloat] Same day, shouldShow:', shouldShow);
    return shouldShow;
  }, [getStorageKey, user?.id]);


  // 使用 ref 来存储最新的签到数据，避免依赖循环
  const checkinDataRef = useRef({ checkinHistory: [], checkinDetails: [], futureRewards: [] });
  
  // 同步更新 ref
  useEffect(() => {
    checkinDataRef.current = { checkinHistory, checkinDetails, futureRewards };
  }, [checkinHistory, checkinDetails, futureRewards]);

  // 自动签到（用于自动弹窗时直接签到）
  const autoCheckin = useCallback(async () => {
    try {
      const response = await checkinAPI.checkin();
      if (response.data.code === 0) {
        trackCheckin();
        const result = response.data.data;
        const today = new Date().toISOString().split('T')[0];
        
        // 检查是否有待显示的欢迎弹窗
        const pendingWelcomeModal = localStorage.getItem('pending_welcome_modal');
        if (pendingWelcomeModal) {
          // 有欢迎弹窗，保存签到数据并触发合并弹窗显示
          const currentData = checkinDataRef.current;
          localStorage.setItem('pending_checkin_result', JSON.stringify({
            ...result,
            checkinHistory: [...currentData.checkinHistory, today],
            checkinDetails: [...currentData.checkinDetails, { date: today, gold_reward: result.gold_reward || 10 }],
            futureRewards: currentData.futureRewards,
            timestamp: Date.now()
          }));
          // 更新状态但不显示弹窗
          setHasCheckedIn(true);
          setShowFloatBall(false);
          // 触发合并弹窗事件
          window.dispatchEvent(new CustomEvent('show:welcome_checkin_modal'));
        } else {
          // 没有欢迎弹窗，正常显示签到结果
          setCheckinResult(result);
          setHasCheckedIn(true);
          setCheckinHistory(prev => [...prev, today]);
          setCheckinDetails(prev => [...prev, { date: today, gold_reward: result.gold_reward || 10 }]);
        }
      }
    } catch (error) {
      logger.error('自动签到失败:', error);
    }
  }, []); // 移除依赖，使用 ref 获取最新数据

  const fetchCheckinStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await checkinAPI.getStatus();
      if (response.data.code === 0) {
        const status = response.data.data;
        setCheckinStatus(status);
        setHasCheckedIn(status.has_checked_in);

        // 获取当月签到历史（包含统计数据）
        const today = new Date();
        const historyResponse = await checkinAPI.getHistory(today.getFullYear(), today.getMonth() + 1);
        if (historyResponse.data.code === 0) {
          const historyData = historyResponse.data.data;
          setCheckinHistory(historyData.checkin_dates || []);
          setCheckinDetails(historyData.checkin_details || []);
          setFutureRewards(historyData.future_rewards || []);
          // 更新统计数据（从历史API获取最新的）
          if (historyData.consecutive_days !== undefined || historyData.total_days !== undefined) {
            setCheckinStatus(prev => ({
              ...prev,
              consecutive_days: historyData.consecutive_days || prev?.consecutive_days || 0,
              total_checkins: historyData.total_days || prev?.total_checkins || 0
            }));
          }
        }

        logger.log('[CheckinFloat] Status:', { has_checked_in: status.has_checked_in });
        if (!status.has_checked_in) {
          setShowFloatBall(true);
          const shouldShowModal = checkFirstVisitToday();
          logger.log('[CheckinFloat] Should show modal:', shouldShowModal);
          if (shouldShowModal) {
            // 检查是否有待显示的欢迎弹窗（新用户注册后）
            const pendingWelcomeModal = localStorage.getItem('pending_welcome_modal');
            const hasWelcomeModal = !!pendingWelcomeModal;
            
            if (hasWelcomeModal) {
              // 有欢迎弹窗，不显示 CheckinFloat 的弹窗
              // 直接执行签到，然后触发合并弹窗
              logger.log('[CheckinFloat] Has welcome modal, will trigger combined modal');
              setTimeout(async () => {
                // 使用用户专属的 key
                const modalShownKey = getStorageKey('checkin_modal_shown_today');
                sessionStorage.setItem(modalShownKey, 'true');
                // 执行签到并触发合并弹窗
                await autoCheckin();
              }, 500);
            } else {
              // 没有欢迎弹窗，显示 CheckinFloat 自己的签到弹窗
              const delay = 1000;
              logger.log('[CheckinFloat] Will show auto checkin modal in', delay, 'ms');
              setTimeout(async () => {
                logger.log('[CheckinFloat] Showing modal and auto checkin');
                setModalType('auto');
                setShowModal(true);
                // 使用用户专属的 key
                const modalShownKey = getStorageKey('checkin_modal_shown_today');
                sessionStorage.setItem(modalShownKey, 'true');
                // 自动执行签到
                await autoCheckin();
              }, delay);
            }
          }
        } else {
          logger.log('[CheckinFloat] Already checked in today');
          setShowFloatBall(false);
        }
      }
    } catch (error) {
      logger.error('获取签到状态失败:', error);
    }
  }, [isAuthenticated, checkFirstVisitToday, autoCheckin, getStorageKey]);

  const handleCheckin = async () => {
    if (loading || hasCheckedIn) return;
    setLoading(true);
    try {
      const response = await checkinAPI.checkin();
      if (response.data.code === 0) {
        trackCheckin(); // 记录签到统计
        const result = response.data.data;
        setCheckinResult(result);
        setHasCheckedIn(true);
        const today = new Date().toISOString().split('T')[0];
        setCheckinHistory(prev => [...prev, today]);
        setTimeout(() => {
          setShowModal(false);
          setShowFloatBall(false);
        }, 2500);
      } else {
        setCheckinResult(response.data.data);
        setHasCheckedIn(true);
      }
    } catch (error) {
      logger.error('签到失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setCheckinResult(null);
  };

  const handleFloatClick = () => {
    // 未登录时弹出登录弹窗
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    
    if (!hasCheckedIn && floatBallRef.current) {
      const rect = floatBallRef.current.getBoundingClientRect();
      // 记录悬浮球的位置（右下角）
      setFloatBallPos({ 
        x: rect.right, 
        y: rect.bottom,
        ballX: rect.left + rect.width / 2,
        ballY: rect.top + rect.height / 2
      });
      setModalType('float');
      setShowModal(true);
    }
  };

  // 使用 ref 存储 fetchCheckinStatus，避免 useEffect 依赖变化导致重复执行
  const fetchCheckinStatusRef = useRef(fetchCheckinStatus);
  fetchCheckinStatusRef.current = fetchCheckinStatus;

  // 记录当前日期，用于检测日期变化
  const currentDateRef = useRef(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCheckinStatusRef.current();
    } else {
      // 未登录时也显示悬浮球，引导用户登录
      setShowFloatBall(true);
      setShowModal(false);
      setHasCheckedIn(false); // 设为 false 以显示悬浮球
    }
  }, [isAuthenticated]); // 只依赖 isAuthenticated

  // 检测日期变化（跨越24点时自动触发签到检查）
  useEffect(() => {
    if (!isAuthenticated) return;

    // 每分钟检查一次日期是否变化
    const checkDateChange = () => {
      const today = new Date().toISOString().split('T')[0];
      if (today !== currentDateRef.current) {
        logger.log('[CheckinFloat] Date changed from', currentDateRef.current, 'to', today);
        currentDateRef.current = today;
        // 日期变化，重新检查签到状态
        fetchCheckinStatusRef.current();
      }
    };

    const intervalId = setInterval(checkDateChange, 60000); // 每60秒检查一次

    return () => clearInterval(intervalId);
  }, [isAuthenticated]);

  // 未登录时只显示悬浮球，已登录且已签到时不显示
  if (isAuthenticated && hasCheckedIn && !showModal) {
    return null;
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <>
      {/* 悬浮球 - 礼物风格 */}
      {showFloatBall && !hasCheckedIn && (
        <div className="checkin-float-ball-glass" ref={floatBallRef} onClick={handleFloatClick}>
          <div className="checkin-float-sparkle"></div>
          <div className="checkin-float-content">
            <svg className="checkin-float-icon" viewBox="0 0 24 24" fill="none">
              <path d="M20 12V22H4V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 7H2V12H22V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 22V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 7H7.5C6.83696 7 6.20107 6.73661 5.73223 6.26777C5.26339 5.79893 5 5.16304 5 4.5C5 3.83696 5.26339 3.20107 5.73223 2.73223C6.20107 2.26339 6.83696 2 7.5 2C11 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 7H16.5C17.163 7 17.7989 6.73661 18.2678 6.26777C18.7366 5.79893 19 5.16304 19 4.5C19 3.83696 18.7366 3.20107 18.2678 2.73223C17.7989 2.26339 17.163 2 16.5 2C13 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="checkin-float-label">签到</div>
          </div>
        </div>
      )}

      {/* 弹窗 */}
      {showModal && (
        <div 
          className={`checkin-overlay ${modalType === 'float' ? 'from-float' : ''}`} 
          onClick={handleCloseModal}
        >
          {modalType === 'auto' ? (
            /* 自动弹窗 - 签到成功展示 */
            <div className="checkin-auto-modal" onClick={e => e.stopPropagation()}>
              {/* 右上角经费说明链接 */}
              <a href="/pricing" className="checkin-auto-help">经费能干什么？</a>
              
              {/* 礼物图标 */}
              <div className="checkin-auto-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M20 12V22H4V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 7H2V12H22V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 22V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 7H7.5C6.83696 7 6.20107 6.73661 5.73223 6.26777C5.26339 5.79893 5 5.16304 5 4.5C5 3.83696 5.26339 3.20107 5.73223 2.73223C6.20107 2.26339 6.83696 2 7.5 2C11 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 7H16.5C17.163 7 17.7989 6.73661 18.2678 6.26777C18.7366 5.79893 19 5.16304 19 4.5C19 3.83696 18.7366 3.20107 18.2678 2.73223C17.7989 2.26339 17.163 2 16.5 2C13 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              
              {/* 标题 - 根据是否连续签到显示不同文案 */}
              <h3 className="checkin-auto-title">
                {checkinResult ? (
                  checkinResult.consecutive_days > 1 
                    ? '每日连续上线奖励到账' 
                    : '每日上线奖励到账'
                ) : '正在领取奖励...'}
              </h3>
              
              {/* 日期 */}
              <p className="checkin-auto-date">
                {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
              </p>
              
              {/* 奖励展示 */}
              {checkinResult && (
                <div className="checkin-auto-reward">
                  <GoldIcon size="lg" />
                  <span className="checkin-auto-reward-amount">+{checkinResult.gold_reward || 10}</span>
                </div>
              )}

              {/* 断签提醒 - 当连续天数为1且之前有签到记录时显示 */}
              {checkinResult && checkinResult.consecutive_days === 1 && checkinResult.total_checkins > 1 && (
                <div className="checkin-streak-broken">
                  <div className="streak-broken-icon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="12" cy="16" r="1" fill="currentColor"/>
                    </svg>
                  </div>
                  <p className="streak-broken-text">连续签到已中断，重新开始累计</p>
                </div>
              )}

              {/* 连续签到奖励提醒 - 显示下一个里程碑 */}
              {checkinResult && checkinResult.consecutive_days >= 1 && (
                <div className="checkin-milestone-hint">
                  {checkinResult.consecutive_days < 3 && (
                    <p className="milestone-hint-text">
                      <span className="hint-highlight">连续签到3天</span>
                      <span className="hint-arrow">可额外获得</span>
                      <span className="hint-reward">+50经费</span>
                    </p>
                  )}
                  {checkinResult.consecutive_days >= 3 && checkinResult.consecutive_days < 7 && (
                    <p className="milestone-hint-text">
                      <span className="hint-highlight">连续签到7天</span>
                      <span className="hint-arrow">可额外获得</span>
                      <span className="hint-reward">+150经费</span>
                    </p>
                  )}
                  {checkinResult.consecutive_days >= 7 && checkinResult.consecutive_days < 15 && (
                    <p className="milestone-hint-text">
                      <span className="hint-highlight">连续签到15天</span>
                      <span className="hint-arrow">可额外获得</span>
                      <span className="hint-reward">+350经费</span>
                    </p>
                  )}
                  {checkinResult.consecutive_days >= 15 && (
                    <p className="milestone-hint-text milestone-achieved">
                      <span className="hint-highlight">已达成15天连续签到</span>
                      <span className="hint-arrow">每日可获得</span>
                      <span className="hint-reward">+30经费</span>
                    </p>
                  )}
                </div>
              )}
              
              {/* 本周签到日历 */}
              <div className="cf-week-view">
                <div className="cf-week-header">
                  {weekDays.map(d => <span key={d}>{d}</span>)}
                </div>
                <div className="cf-week-days">
                  {weekData.days.map((item, i) => (
                    <div 
                      key={i} 
                      className={`cf-week-day ${item.isToday ? 'today' : ''} ${item.isCheckedIn ? 'checked' : ''} ${item.isFuture ? 'future' : ''} ${item.isPast && !item.isCheckedIn ? 'past-missed' : ''} ${item.isMilestone ? 'milestone' : ''}`}
                    >
                      <span className="cf-day-num">{item.day}</span>
                      {/* 已签到显示经费 */}
                      {item.isCheckedIn && item.goldReward > 0 && (
                        <span className="cf-gold checked">+{item.goldReward}</span>
                      )}
                      {/* 今天未签到显示预计经费 */}
                      {item.isToday && !item.isCheckedIn && (
                        <span className={`cf-gold today ${item.isMilestone ? 'milestone' : ''}`}>
                          +{item.expectedGold}
                        </span>
                      )}
                      {/* 未来日期显示预计经费 */}
                      {item.isFuture && !item.isToday && (
                        <span className={`cf-gold future ${item.isMilestone ? 'milestone' : ''}`}>
                          +{item.expectedGold}
                        </span>
                      )}
                      {/* 过去未签到显示错过 */}
                      {item.isPast && !item.isCheckedIn && (
                        <span className="cf-gold past">+10</span>
                      )}
                      {/* 签到勾选标记 */}
                      {item.isCheckedIn && (
                        <div className="cf-check-mark">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 关闭按钮 */}
              <button className="checkin-auto-close-btn" onClick={handleCloseModal}>
                知道了
              </button>
            </div>
          ) : (
            /* 悬浮球点击 - 从悬浮球位置展开 */
            <div 
              className="checkin-full-modal" 
              onClick={e => e.stopPropagation()}
              style={{
                '--origin-x': `${floatBallPos.ballX}px`,
                '--origin-y': `${floatBallPos.ballY}px`
              }}
            >
              <button className="checkin-modal-close" onClick={handleCloseModal}>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>

              {!checkinResult ? (
                <>
                  <div className="checkin-full-header">
                    <h2>每日签到</h2>
                    <p>{calendarData.year}年{calendarData.monthName}</p>
                  </div>

                  <div className="checkin-calendar">
                    <div className="checkin-calendar-week">
                      {weekDays.map(d => <span key={d}>{d}</span>)}
                    </div>
                    <div className="checkin-calendar-days">
                      {calendarData.days.map((item, i) => (
                        <div 
                          key={i} 
                          className={`checkin-day ${!item.day ? 'empty' : ''} ${item.isToday ? 'today' : ''} ${item.isCheckedIn ? 'checked' : ''} ${item.isFuture ? 'future' : ''} ${item.isMilestone ? 'milestone' : ''} ${item.isAfterUpgrade ? 'after-upgrade' : ''}`}
                          title={item.isMilestone ? item.milestoneMessage : (item.isAfterUpgrade ? item.baseUpgradeMsg : '')}
                        >
                          {item.day && (
                            <>
                              <span className="day-num">{item.day}</span>
                              {/* 已签到日期显示获得的经费 */}
                              {item.isCheckedIn && item.goldReward > 0 && (
                                <span className="gold-reward checked-gold">+{item.goldReward}</span>
                              )}
                              {/* 今天未签到显示预计经费 */}
                              {item.isToday && !item.isCheckedIn && item.expectedGold > 0 && (
                                <span className={`gold-reward today-gold ${item.isMilestone ? 'milestone-gold' : ''} ${item.isAfterUpgrade ? 'after-upgrade-gold' : ''}`}>
                                  +{item.expectedGold}
                                </span>
                              )}
                              {/* 未来日期显示预计经费 */}
                              {item.isFuture && !item.isToday && item.expectedGold > 0 && (
                                <span className={`gold-reward future-gold ${item.isMilestone ? 'milestone-gold' : ''} ${item.isAfterUpgrade ? 'after-upgrade-gold' : ''}`}>
                                  +{item.expectedGold}
                                </span>
                              )}
                              {item.isCheckedIn && (
                                <div className="check-mark">
                                  <svg viewBox="0 0 24 24" fill="none">
                                    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="checkin-stats">
                    <div className="checkin-stat">
                      <span className="num">{checkinStatus?.consecutive_days || 0}</span>
                      <span className="label">连续签到</span>
                    </div>
                    <div className="checkin-stat">
                      <span className="num">{checkinStatus?.total_checkins || 0}</span>
                      <span className="label">累计签到</span>
                    </div>
                  </div>

                  <button 
                    className={`checkin-full-btn ${loading ? 'loading' : ''}`}
                    onClick={handleCheckin}
                    disabled={loading}
                  >
                    {loading ? '领取中...' : '立即领取'}
                  </button>
                </>
              ) : (
                <div className="checkin-full-success">
                  <div className="success-icon-wrap">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div className="success-rings">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                  <h2>签到成功！</h2>
                  <div className="success-stats">
                    <div><span>{checkinResult.consecutive_days}</span>连续</div>
                    <div><span>{checkinResult.total_checkins}</span>累计</div>
                  </div>
                  <p className="success-tip">明天继续加油 ✨</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 登录注册弹窗 - 未登录时点击悬浮球触发 */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={() => {
              setShowAuthModal(false);
              // 登录成功后会自动触发 fetchCheckinStatus
            }}
          />
        </Suspense>
      )}
    </>
  );
};

export default CheckinFloat;
