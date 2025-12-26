/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * CheckinCalendarView - 统一的签到日历视图组件
 * 
 * 支持多种展示模式：
 * - week: 本周视图（7天）
 * - month: 本月视图（整月日历）
 * - full: 完整视图（可切换月份）
 */

import React, { useMemo } from 'react';
import './CheckinCalendarView.css';

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 签到日历视图组件
 * @param {string} mode - 展示模式: 'week' | 'month' | 'full'
 * @param {array} checkinHistory - 签到历史日期数组 ['2025-01-01', ...]
 * @param {array} checkinDetails - 签到详情 [{date: '2025-01-01', gold_reward: 10}, ...]
 * @param {array} futureRewards - 未来奖励 [{date: '2025-01-02', expected_gold: 10, is_milestone: false}, ...]
 * @param {number} year - 显示的年份（仅 month/full 模式需要）
 * @param {number} month - 显示的月份（仅 month/full 模式需要，1-12）
 * @param {function} onMonthChange - 月份切换回调（仅 full 模式需要）
 * @param {boolean} showHeader - 是否显示星期标题，默认 true
 * @param {string} size - 尺寸: 'sm' | 'md' | 'lg'，默认 'md'
 */
const CheckinCalendarView = ({
  mode = 'week',
  checkinHistory = [],
  checkinDetails = [],
  futureRewards = [],
  year,
  month,
  onMonthChange,
  showHeader = true,
  size = 'md'
}) => {
  // 创建签到详情的映射表
  const checkinDetailMap = useMemo(() => {
    const map = {};
    checkinDetails.forEach(detail => {
      map[detail.date] = detail.gold_reward;
    });
    return map;
  }, [checkinDetails]);

  // 创建未来奖励的映射表
  const futureRewardMap = useMemo(() => {
    const map = {};
    futureRewards.forEach(reward => {
      map[reward.date] = reward;
    });
    return map;
  }, [futureRewards]);

  // 获取本周数据
  const weekData = useMemo(() => {
    if (mode !== 'week') return null;
    
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    
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
        day,
        dateStr,
        isToday,
        isCheckedIn,
        isPast,
        isFuture,
        goldReward,
        expectedGold,
        isMilestone,
        weekDay: i
      });
    }
    return { days };
  }, [mode, checkinHistory, checkinDetailMap, futureRewardMap]);

  // 获取月份数据
  const monthData = useMemo(() => {
    if (mode === 'week') return null;
    
    const today = new Date();
    const displayYear = year || today.getFullYear();
    const displayMonth = (month || today.getMonth() + 1) - 1; // 转为0-based
    
    const firstDay = new Date(displayYear, displayMonth, 1);
    const lastDay = new Date(displayYear, displayMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const isCurrentMonth = displayYear === today.getFullYear() && displayMonth === today.getMonth();
    
    const days = [];
    // 填充月初空白
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ day: null });
    }
    
    // 填充日期
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = isCurrentMonth && day === today.getDate();
      const isFuture = isCurrentMonth ? day > today.getDate() : (displayYear > today.getFullYear() || (displayYear === today.getFullYear() && displayMonth > today.getMonth()));
      const isPast = isCurrentMonth ? day < today.getDate() : (displayYear < today.getFullYear() || (displayYear === today.getFullYear() && displayMonth < today.getMonth()));
      const isCheckedIn = checkinHistory.includes(dateStr);
      
      const goldReward = checkinDetailMap[dateStr] || 0;
      const futureReward = futureRewardMap[dateStr];
      const expectedGold = futureReward?.expected_gold || 0;
      const isMilestone = futureReward?.is_milestone || false;
      const isAfterUpgrade = futureReward?.is_after_upgrade || false;
      
      days.push({
        day,
        dateStr,
        isToday,
        isCheckedIn,
        isPast,
        isFuture,
        goldReward,
        expectedGold,
        isMilestone,
        isAfterUpgrade
      });
    }
    
    return {
      year: displayYear,
      month: displayMonth + 1,
      days
    };
  }, [mode, year, month, checkinHistory, checkinDetailMap, futureRewardMap]);

  // 渲染日期格子
  const renderDay = (item, index) => {
    if (!item.day) {
      return <div key={index} className="ccv-day empty" />;
    }

    return (
      <div
        key={index}
        className={`ccv-day ${item.isToday ? 'today' : ''} ${item.isCheckedIn ? 'checked' : ''} ${item.isFuture ? 'future' : ''} ${item.isPast && !item.isCheckedIn ? 'past-missed' : ''} ${item.isMilestone ? 'milestone' : ''}`}
      >
        <span className="ccv-day-num">{item.day}</span>
        
        {/* 已签到显示经费 */}
        {item.isCheckedIn && item.goldReward > 0 && (
          <span className="ccv-gold checked">+{item.goldReward}</span>
        )}
        
        {/* 今天未签到显示预计经费 */}
        {item.isToday && !item.isCheckedIn && (
          <span className={`ccv-gold today ${item.isMilestone ? 'milestone' : ''}`}>
            +{item.expectedGold}
          </span>
        )}
        
        {/* 未来日期显示预计经费 */}
        {item.isFuture && !item.isToday && item.expectedGold > 0 && (
          <span className={`ccv-gold future ${item.isMilestone ? 'milestone' : ''}`}>
            +{item.expectedGold}
          </span>
        )}
        
        {/* 过去未签到显示错过 */}
        {item.isPast && !item.isCheckedIn && (
          <span className="ccv-gold past">+10</span>
        )}
        
        {/* 签到勾选标记 */}
        {item.isCheckedIn && (
          <div className="ccv-check">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>
    );
  };

  const data = mode === 'week' ? weekData : monthData;
  if (!data) return null;

  return (
    <div className={`ccv-container ccv-${mode} ccv-${size}`}>
      {/* 星期标题 */}
      {showHeader && (
        <div className="ccv-header">
          {weekDays.map(d => <span key={d}>{d}</span>)}
        </div>
      )}
      
      {/* 日期格子 */}
      <div className="ccv-days">
        {data.days.map((item, i) => renderDay(item, i))}
      </div>
    </div>
  );
};

export default CheckinCalendarView;

