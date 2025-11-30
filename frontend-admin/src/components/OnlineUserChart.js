import React, { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { adminAPI } from '../services/api';
import './UserStatisticsChart.css';

const OnlineUserChart = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  
  // 时间范围和粒度
  const [startTime, setStartTime] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() - 24);
    return formatDateTimeLocal(date);
  });
  const [endTime, setEndTime] = useState(() => {
    const date = new Date();
    return formatDateTimeLocal(date);
  });
  const [granularity, setGranularity] = useState('5min');

  // 格式化日期为 datetime-local 输入格式
  function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  // 格式化日期为 API 格式
  function formatDateTimeAPI(dateTimeLocal) {
    return dateTimeLocal.replace('T', ' ');
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        start_time: formatDateTimeAPI(startTime),
        end_time: formatDateTimeAPI(endTime),
        granularity: granularity
      };
      const response = await adminAPI.getOnlineUserChart(params);
      if (response.data.code === 0) {
        setData(response.data.data.snapshots || []);
      }
    } catch (error) {
      console.error('Failed to fetch online user data:', error);
    } finally {
      setLoading(false);
    }
  }, [startTime, endTime, granularity]);

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSearch = () => {
    fetchData();
    setShowFilter(false);
  };

  const handleCancel = () => {
    setShowFilter(false);
  };

  // 快捷时间选择
  const setQuickRange = (type) => {
    const now = new Date();
    let start = new Date();
    let gran = '5min';

    switch (type) {
      case 'hour':
        start.setHours(start.getHours() - 1);
        gran = '5min';
        break;
      case 'today':
        start.setHours(0, 0, 0, 0);
        gran = '5min';
        break;
      case 'day':
        start.setHours(start.getHours() - 24);
        gran = '5min';
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        gran = 'hour';
        break;
      case 'month':
        start.setDate(start.getDate() - 30);
        gran = 'hour';
        break;
      default:
        break;
    }

    setStartTime(formatDateTimeLocal(start));
    setEndTime(formatDateTimeLocal(now));
    setGranularity(gran);
  };

  const granularityOptions = [
    { value: '5min', label: '5分钟' },
    { value: 'hour', label: '小时' },
  ];

  const quickRangeOptions = [
    { value: 'hour', label: '近1小时' },
    { value: 'today', label: '今日' },
    { value: 'day', label: '近24小时' },
    { value: 'week', label: '近7天' },
    { value: 'month', label: '近30天' },
  ];

  return (
    <div className="chart-wrapper">
      {/* 搜索条件按钮 */}
      <div className="chart-toolbar">
        <button 
          className="filter-trigger-btn"
          onClick={() => setShowFilter(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          搜索条件
        </button>
        <div className="current-range">
          {startTime.replace('T', ' ').slice(0, 16)} ~ {endTime.replace('T', ' ').slice(0, 16)}
          <span className="granularity-tag">{granularityOptions.find(g => g.value === granularity)?.label}</span>
        </div>
      </div>

      {/* 搜索条件弹窗 */}
      {showFilter && (
        <div className="filter-modal-overlay" onClick={handleCancel}>
          <div className="filter-modal" onClick={e => e.stopPropagation()}>
            <div className="filter-modal-header">
              <h4>搜索条件</h4>
              <button className="filter-modal-close" onClick={handleCancel}>×</button>
            </div>
            <div className="filter-modal-body">
              {/* 快捷选择 */}
              <div className="filter-section">
                <label>快捷选择</label>
                <div className="quick-range-btns">
                  {quickRangeOptions.map(opt => (
                    <button
                      key={opt.value}
                      className="quick-range-btn"
                      onClick={() => setQuickRange(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-section">
                <label>起始时间</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="filter-input"
                  step="1"
                />
              </div>

              <div className="filter-section">
                <label>结束时间</label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="filter-input"
                  step="1"
                />
              </div>

              <div className="filter-section">
                <label>时间粒度</label>
                <select
                  value={granularity}
                  onChange={e => setGranularity(e.target.value)}
                  className="filter-select"
                >
                  {granularityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="filter-modal-footer">
              <button className="filter-btn filter-btn-cancel" onClick={handleCancel}>取消</button>
              <button className="filter-btn filter-btn-confirm" onClick={handleSearch}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 图表区域 */}
      {loading ? (
        <div className="chart-loading">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="chart-no-data">
          <p>暂无数据</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#999"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#e0e0e0' }}
              interval="preserveStartEnd"
              angle={data.length > 20 ? -45 : 0}
              textAnchor={data.length > 20 ? "end" : "middle"}
              height={data.length > 20 ? 60 : 30}
            />
            <YAxis
              stroke="#999"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={35}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff'
              }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(value) => [value, '在线用户']}
              labelFormatter={(label, payload) => {
                if (payload && payload[0]) {
                  return payload[0].payload.time || label;
                }
                return label;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="online_count"
              stroke="#ff7300"
              strokeWidth={2}
              name="在线用户数"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default OnlineUserChart;
