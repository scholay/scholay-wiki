/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * WelcomeCheckinModal - 注册欢迎 + 签到合并弹窗
 * 
 * 新用户注册后同时展示注册赠送经费和每日签到奖励
 * 通过标签切换展示不同信息
 */

import React, { useState, useCallback, memo, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Gift, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import GoldIcon from './GoldIcon';
import './styles/WelcomeCheckinModal.css';

/**
 * 合并弹窗组件
 * @param {boolean} isOpen - 是否显示弹窗
 * @param {function} onClose - 关闭回调
 * @param {number} welcomeGiftAmount - 注册赠送的经费金额（可选，为0或null时不显示欢迎标签）
 * @param {object} checkinResult - 签到结果（可选，为null时不显示签到标签）
 * @param {array} checkinHistory - 签到历史日期数组
 * @param {array} checkinDetails - 签到详情（包含经费）
 * @param {array} futureRewards - 未来签到预计奖励
 */
const WelcomeCheckinModal = memo(({ 
  isOpen, 
  onClose, 
  welcomeGiftAmount = 0,
  checkinResult = null,
  checkinHistory = [],
  checkinDetails = [],
  futureRewards = []
}) => {
  const navigate = useNavigate();
  const [isClosing, setIsClosing] = useState(false);
  
  // 确定有哪些页面
  const hasWelcome = welcomeGiftAmount > 0;
  const hasCheckin = checkinResult !== null;
  
  // 构建页面列表（注册礼包在首位）
  const pages = useMemo(() => {
    const list = [];
    if (hasWelcome) list.push('welcome');
    if (hasCheckin) list.push('checkin');
    return list;
  }, [hasWelcome, hasCheckin]);
  
  // 当前页面索引（默认显示第一页，即注册礼包）
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // 切换到上一页
  const goToPrev = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : pages.length - 1));
  }, [pages.length]);
  
  // 切换到下一页
  const goToNext = useCallback(() => {
    setCurrentIndex(prev => (prev < pages.length - 1 ? prev + 1 : 0));
  }, [pages.length]);
  
  // 当前显示的页面类型
  const currentPage = pages[currentIndex];

  // 获取本周的日历数据（周日到周六）
  const weekData = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 6=周六
    
    // 计算本周周日的日期
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
      
      // 获取已签到日期的经费数量
      const goldReward = checkinDetailMap[dateStr] || 0;
      
      // 获取未来日期的预计经费
      const futureReward = futureRewardMap[dateStr];
      const expectedGold = futureReward?.expected_gold || 10;
      const isMilestone = futureReward?.is_milestone || false;
      
      days.push({ 
        day, isToday, isCheckedIn, isPast, isFuture, dateStr,
        goldReward, expectedGold, isMilestone, weekDay: i
      });
    }
    return { days };
  }, [checkinHistory, checkinDetails, futureRewards]);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      if (onClose) onClose();
    }, 200);
  }, [onClose]);

  const handleHelpClick = useCallback((e) => {
    e.stopPropagation();
    handleClose();
    // 延迟导航，等待弹窗关闭动画完成
    setTimeout(() => {
      navigate('/pricing');
    }, 250);
  }, [handleClose, navigate]);

  if (!isOpen) return null;

  // 如果既没有欢迎内容也没有签到内容，不显示弹窗
  if (!hasWelcome && !hasCheckin) return null;

  return ReactDOM.createPortal(
    <div 
      className={`welcome-checkin-overlay ${isClosing ? 'closing' : ''}`}
    >
      {/* 左右箭头 - 放在弹窗外面，只有多个页面时才显示 */}
      {pages.length > 1 && (
        <>
          <button className="carousel-arrow carousel-arrow-left" onClick={goToPrev}>
            <ChevronLeft size={24} />
          </button>
          <button className="carousel-arrow carousel-arrow-right" onClick={goToNext}>
            <ChevronRight size={24} />
          </button>
        </>
      )}
      
      <div 
        className={`welcome-checkin-modal ${isClosing ? 'closing' : ''}`}
      >
        {/* 欢迎内容 */}
        {currentPage === 'welcome' && hasWelcome && (
          <div className="tab-content welcome-content">
            {/* 礼物图标 */}
            <div className="welcome-checkin-icon welcome-icon-style">
              <Gift size={36} />
            </div>

            {/* 欢迎标题 */}
            <h2 className="welcome-checkin-title">欢迎您的加入！</h2>

            {/* 经费金额展示 */}
            <div className="welcome-checkin-gift">
              <div className="welcome-checkin-gift-amount">
                <GoldIcon size="xl" />
                <span className="amount-value">{welcomeGiftAmount}</span>
                <span className="amount-unit">经费</span>
              </div>
              <p className="welcome-checkin-gift-text">已到账，请查收</p>
            </div>

            {/* 帮助链接 */}
            <button 
              className="welcome-checkin-help-btn"
              onClick={handleHelpClick}
            >
              <HelpCircle size={16} />
              <span>什么是经费？</span>
            </button>
          </div>
        )}

        {/* 签到内容 */}
        {currentPage === 'checkin' && hasCheckin && (
          <div className="tab-content checkin-content">
            {/* 礼物图标 */}
            <div className="welcome-checkin-icon checkin-icon-style">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M20 12V22H4V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 7H2V12H22V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 22V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 7H7.5C6.83696 7 6.20107 6.73661 5.73223 6.26777C5.26339 5.79893 5 5.16304 5 4.5C5 3.83696 5.26339 3.20107 5.73223 2.73223C6.20107 2.26339 6.83696 2 7.5 2C11 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 7H16.5C17.163 7 17.7989 6.73661 18.2678 6.26777C18.7366 5.79893 19 5.16304 19 4.5C19 3.83696 18.7366 3.20107 18.2678 2.73223C17.7989 2.26339 17.163 2 16.5 2C13 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            
            {/* 标题 - 根据是否连续签到显示不同文案 */}
            <h3 className="welcome-checkin-title checkin-title">
              {checkinResult.consecutive_days > 1 
                ? '每日连续上线奖励到账' 
                : '每日上线奖励到账'}
            </h3>
            
            {/* 日期 */}
            <p className="checkin-date">
              {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
            
            {/* 奖励展示 */}
            <div className="checkin-reward">
              <GoldIcon size="lg" />
              <span className="checkin-reward-amount">+{checkinResult.gold_reward || 10}</span>
            </div>
            
            {/* 本周签到日历 */}
            <div className="checkin-week-view">
              <div className="checkin-week-header">
                {weekDays.map(d => <span key={d}>{d}</span>)}
              </div>
              <div className="checkin-week-days">
                {weekData.days.map((item, i) => (
                  <div 
                    key={i} 
                    className={`checkin-week-day ${item.isToday ? 'today' : ''} ${item.isCheckedIn ? 'checked' : ''} ${item.isFuture ? 'future' : ''} ${item.isPast && !item.isCheckedIn ? 'past-missed' : ''} ${item.isMilestone ? 'milestone' : ''}`}
                  >
                    <span className="day-num">{item.day}</span>
                    {/* 已签到显示经费 */}
                    {item.isCheckedIn && item.goldReward > 0 && (
                      <span className="gold-reward checked-gold">+{item.goldReward}</span>
                    )}
                    {/* 今天未签到显示预计经费 */}
                    {item.isToday && !item.isCheckedIn && (
                      <span className={`gold-reward today-gold ${item.isMilestone ? 'milestone-gold' : ''}`}>
                        +{item.expectedGold}
                      </span>
                    )}
                    {/* 未来日期显示预计经费 */}
                    {item.isFuture && !item.isToday && (
                      <span className={`gold-reward future-gold ${item.isMilestone ? 'milestone-gold' : ''}`}>
                        +{item.expectedGold}
                      </span>
                    )}
                    {/* 过去未签到显示错过 */}
                    {item.isPast && !item.isCheckedIn && (
                      <span className="gold-reward past-gold">+10</span>
                    )}
                    {/* 签到勾选标记 */}
                    {item.isCheckedIn && (
                      <div className="check-mark">
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 底部小圆点指示器 - 只有多个页面时才显示 */}
        {pages.length > 1 && (
          <div className="carousel-dots">
            {pages.map((_, index) => (
              <button
                key={index}
                className={`carousel-dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>
        )}

        {/* 确认按钮 */}
        <button 
          className="welcome-checkin-confirm-btn"
          onClick={handleClose}
        >
          {pages.length > 1 ? '知道了' : (hasWelcome ? '开始使用' : '知道了')}
        </button>
      </div>
    </div>,
    document.body
  );
});

WelcomeCheckinModal.displayName = 'WelcomeCheckinModal';

export default WelcomeCheckinModal;

