import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { adminAPI } from '../services/api';
import './UserStatisticsChart.css';

const UserStatisticsChart = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('month'); // today, week, month, year

  const timeRangeMap = {
    today: { days: 1, label: '今日' },
    week: { days: 7, label: '周' },
    month: { days: 30, label: '月' },
    year: { days: 365, label: '年' }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const days = timeRangeMap[timeRange].days;
      const response = await adminAPI.getUserStatisticsChart(days);
      if (response.data.code === 0) {
        setData(response.data.data.statistics || []);
      }
    } catch (error) {
      console.error('Failed to fetch user statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeRangeChange = (range) => {
    setTimeRange(range);
  };

  if (loading) {
    return (
      <div className="chart-loading">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="chart-no-data">
        <p>暂无数据</p>
      </div>
    );
  }

  return (
    <div className="chart-wrapper">
      <div className="time-range-selector">
        {Object.keys(timeRangeMap).map((range) => (
          <button
            key={range}
            className={`time-range-btn ${timeRange === range ? 'active' : ''}`}
            onClick={() => handleTimeRangeChange(range)}
          >
            {timeRangeMap[range].label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="date"
            stroke="#666"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke="#666"
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: '8px'
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '14px' }}
          />
          <Line
            type="monotone"
            dataKey="new_users"
            stroke="#667eea"
            strokeWidth={2}
            name="新注册用户"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="total_users"
            stroke="#10b981"
            strokeWidth={2}
            name="总用户数"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default UserStatisticsChart;
