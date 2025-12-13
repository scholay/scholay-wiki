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
import './CheckinFloat.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./AuthModal'));

const FIRST_VISIT_KEY = 'checkin_first_visit_today';
const CHECKIN_MODAL_SHOWN_KEY = 'checkin_modal_shown_today';

const CheckinFloat = () => {
  const { isAuthenticated } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false); // 登录弹窗状态
  const [hasCheckedIn, setHasCheckedIn] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showFloatBall, setShowFloatBall] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState(null);
  const [checkinHistory, setCheckinHistory] = useState([]);
  const [modalType, setModalType] = useState('auto'); // 'auto' | 'float'
  const floatBallRef = useRef(null);
  const [floatBallPos, setFloatBallPos] = useState({ x: 0, y: 0 });

  // 获取当前月份的日历数据
  const calendarData = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

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
      days.push({ day, isToday, isCheckedIn, isPast, isFuture, dateStr });
    }
    return { year, month, days, monthName: today.toLocaleDateString('zh-CN', { month: 'long' }) };
  }, [checkinHistory]);

  const checkFirstVisitToday = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastVisit = sessionStorage.getItem(FIRST_VISIT_KEY);
    const modalShown = sessionStorage.getItem(CHECKIN_MODAL_SHOWN_KEY);
    if (lastVisit !== today) {
      sessionStorage.setItem(FIRST_VISIT_KEY, today);
      sessionStorage.removeItem(CHECKIN_MODAL_SHOWN_KEY);
      return true;
    }
    return modalShown !== 'true';
  }, []);

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
          // 更新统计数据（从历史API获取最新的）
          if (historyData.consecutive_days !== undefined || historyData.total_days !== undefined) {
            setCheckinStatus(prev => ({
              ...prev,
              consecutive_days: historyData.consecutive_days || prev?.consecutive_days || 0,
              total_checkins: historyData.total_days || prev?.total_checkins || 0
            }));
          }
        }

        if (!status.has_checked_in) {
          setShowFloatBall(true);
          if (checkFirstVisitToday()) {
            setTimeout(() => {
              setModalType('auto');
              setShowModal(true);
              sessionStorage.setItem(CHECKIN_MODAL_SHOWN_KEY, 'true');
            }, 1000);
          }
        } else {
          setShowFloatBall(false);
        }
      }
    } catch (error) {
      console.error('获取签到状态失败:', error);
    }
  }, [isAuthenticated, checkFirstVisitToday]);

  const handleCheckin = async () => {
    if (loading || hasCheckedIn) return;
    setLoading(true);
    try {
      const response = await checkinAPI.checkin();
      if (response.data.code === 0) {
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
      console.error('签到失败:', error);
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

  useEffect(() => {
    if (isAuthenticated) {
      fetchCheckinStatus();
    } else {
      // 未登录时也显示悬浮球，引导用户登录
      setShowFloatBall(true);
      setShowModal(false);
      setHasCheckedIn(false); // 设为 false 以显示悬浮球
    }
  }, [isAuthenticated, fetchCheckinStatus]);

  // 未登录时只显示悬浮球，已登录且已签到时不显示
  if (isAuthenticated && hasCheckedIn && !showModal) {
    return null;
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const todayDate = new Date().getDate();

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
            /* 自动弹窗 - 简洁版 */
            <div className="checkin-simple-modal" onClick={e => e.stopPropagation()}>
              {!checkinResult ? (
                <>
                  <div className="checkin-simple-header">
                    <div className="checkin-simple-icon">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M20 12V22H4V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M22 7H2V12H22V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 22V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 7H7.5C6.83696 7 6.20107 6.73661 5.73223 6.26777C5.26339 5.79893 5 5.16304 5 4.5C5 3.83696 5.26339 3.20107 5.73223 2.73223C6.20107 2.26339 6.83696 2 7.5 2C11 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 7H16.5C17.163 7 17.7989 6.73661 18.2678 6.26777C18.7366 5.79893 19 5.16304 19 4.5C19 3.83696 18.7366 3.20107 18.2678 2.73223C17.7989 2.26339 17.163 2 16.5 2C13 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <h3>领取今日礼物</h3>
                    <p>{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p>
                  </div>
                  <button 
                    className={`checkin-simple-btn ${loading ? 'loading' : ''}`}
                    onClick={handleCheckin}
                    disabled={loading}
                  >
                    {loading ? '领取中...' : '立即领取'}
                  </button>
                  <button className="checkin-simple-skip" onClick={handleCloseModal}>
                    稍后再说
                  </button>
                </>
              ) : (
                <div className="checkin-simple-success">
                  <div className="checkin-success-check">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3>领取成功</h3>
                  <p>已连续签到 {checkinResult.consecutive_days} 天</p>
                </div>
              )}
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
                          className={`checkin-day ${!item.day ? 'empty' : ''} ${item.isToday ? 'today' : ''} ${item.isCheckedIn ? 'checked' : ''} ${item.isFuture ? 'future' : ''}`}
                        >
                          {item.day && (
                            <>
                              <span>{item.day}</span>
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
