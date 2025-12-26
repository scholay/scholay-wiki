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
import { Gift, HelpCircle, Calendar } from 'lucide-react';
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
  
  // 确定有哪些标签页
  const hasWelcome = welcomeGiftAmount > 0;
  const hasCheckin = checkinResult !== null;
  
  // 默认显示第一个可用的标签（欢迎优先）
  const [activeTab, setActiveTab] = useState(hasWelcome ? 'welcome' : 'checkin');

  // 获取当前月份的日历数据
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
      onClick={handleClose}
    >
      <div 
        className={`welcome-checkin-modal ${isClosing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标签切换 - 只有同时有两种内容时才显示 */}
        {hasWelcome && hasCheckin && (
          <div className="welcome-checkin-tabs">
            <button 
              className={`tab-btn ${activeTab === 'welcome' ? 'active' : ''}`}
              onClick={() => setActiveTab('welcome')}
            >
              <Gift size={16} />
              <span>注册礼包</span>
            </button>
            <button 
              className={`tab-btn ${activeTab === 'checkin' ? 'active' : ''}`}
              onClick={() => setActiveTab('checkin')}
            >
              <Calendar size={16} />
              <span>每日签到</span>
            </button>
          </div>
        )}

        {/* 欢迎内容 */}
        {activeTab === 'welcome' && hasWelcome && (
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
        {activeTab === 'checkin' && hasCheckin && (
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
            
            {/* 签到日历 */}
            <div className="checkin-calendar-mini">
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
          </div>
        )}

        {/* 确认按钮 */}
        <button 
          className="welcome-checkin-confirm-btn"
          onClick={handleClose}
        >
          {hasWelcome && hasCheckin ? '知道了' : (hasWelcome ? '开始使用' : '知道了')}
        </button>
      </div>
    </div>,
    document.body
  );
});

WelcomeCheckinModal.displayName = 'WelcomeCheckinModal';

export default WelcomeCheckinModal;

