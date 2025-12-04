/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { checkinAPI } from '../services/api';
import './CheckinCalendar.css';

const CheckinCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [checkinDates, setCheckinDates] = useState([]);
  const [stats, setStats] = useState({ consecutiveDays: 0, totalDays: 0 });
  const [loading, setLoading] = useState(true);
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  // 获取签到历史
  const fetchCheckinHistory = useCallback(async (year, month) => {
    try {
      setLoading(true);
      const response = await checkinAPI.getHistory(year, month);
      if (response.data.code === 0) {
        const data = response.data.data;
        setCheckinDates(data.checkin_dates || []);
        // 使用后端返回的统计数据
        setStats({
          consecutiveDays: data.consecutive_days || 0,
          totalDays: data.total_days || 0
        });
        
        // 检查今天是否签到
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        setHasCheckedInToday(data.checkin_dates?.includes(todayStr) || false);
      }
    } catch (error) {
      console.error('获取签到历史失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 当月份变化时获取数据
  useEffect(() => {
    fetchCheckinHistory(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate, fetchCheckinHistory]);

  // 切换月份
  const changeMonth = (delta) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    
    // 不能超过当前月份
    const now = new Date();
    if (newDate > now && newDate.getMonth() > now.getMonth()) {
      return;
    }
    
    setCurrentDate(newDate);
  };

  // 签到
  const handleCheckin = async () => {
    if (hasCheckedInToday || checkingIn) return;
    
    try {
      setCheckingIn(true);
      const response = await checkinAPI.checkin();
      if (response.data.code === 0) {
        setHasCheckedInToday(true);
        // 重新获取当月数据
        fetchCheckinHistory(currentDate.getFullYear(), currentDate.getMonth() + 1);
      }
    } catch (error) {
      console.error('签到失败:', error);
    } finally {
      setCheckingIn(false);
    }
  };

  // 生成日历数据
  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    
    const days = [];
    
    // 填充月初空白
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ day: null });
    }
    
    // 填充日期
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = isCurrentMonth && day === today.getDate();
      const isFuture = isCurrentMonth ? day > today.getDate() : year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());
      const isCheckedIn = checkinDates.includes(dateStr);
      
      days.push({
        day,
        dateStr,
        isToday,
        isFuture,
        isCheckedIn
      });
    }
    
    return {
      year,
      month: month + 1,
      days
    };
  }, [currentDate, checkinDates]);

  // 判断是否可以切换到下个月
  const canGoNext = useMemo(() => {
    const now = new Date();
    return currentDate.getFullYear() < now.getFullYear() || 
           (currentDate.getFullYear() === now.getFullYear() && currentDate.getMonth() < now.getMonth());
  }, [currentDate]);

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="checkin-calendar-card">
      <div className="checkin-calendar-header">
        <div className="checkin-calendar-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>签到日历</span>
        </div>
        <div className="checkin-stats-mini">
          <div className="stat-item">
            <span className="stat-value">{stats.consecutiveDays}</span>
            <span className="stat-label">连续</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-value">{stats.totalDays}</span>
            <span className="stat-label">累计</span>
          </div>
        </div>
      </div>

      <div className="checkin-calendar-nav">
        <button 
          className="nav-btn" 
          onClick={() => changeMonth(-1)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="nav-title">{calendarData.year}年{monthNames[calendarData.month - 1]}</span>
        <button 
          className={`nav-btn ${!canGoNext ? 'disabled' : ''}`}
          onClick={() => changeMonth(1)}
          disabled={!canGoNext}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      <div className="checkin-calendar-body">
        {loading ? (
          <div className="calendar-loading">
            <div className="loading-spinner"></div>
          </div>
        ) : (
          <>
            <div className="calendar-weekdays">
              {weekDays.map((day, i) => (
                <div key={i} className="weekday">{day}</div>
              ))}
            </div>
            <div className="calendar-days">
              {calendarData.days.map((item, i) => (
                <div 
                  key={i} 
                  className={`calendar-day ${!item.day ? 'empty' : ''} ${item.isToday ? 'today' : ''} ${item.isCheckedIn ? 'checked' : ''} ${item.isFuture ? 'future' : ''}`}
                >
                  {item.day && (
                    <>
                      <span className="day-number">{item.day}</span>
                      {item.isCheckedIn && (
                        <div className="check-indicator">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 今日签到按钮 */}
      <div className="checkin-calendar-footer">
        <button 
          className={`checkin-btn ${hasCheckedInToday ? 'checked' : ''}`}
          onClick={handleCheckin}
          disabled={hasCheckedInToday || checkingIn}
        >
          {checkingIn ? (
            <span className="btn-loading">签到中...</span>
          ) : hasCheckedInToday ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 12L11 14L15 10"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
              <span>今日已签到</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8v8M8 12h8"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
              <span>立即签到</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CheckinCalendar;

