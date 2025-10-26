import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { adminAPI } from '../services/api';
import './UserStatisticsChart.css';

const OnlineUserChart = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('day'); // day, week, month, year

  const timeRangeMap = {
    day: { hours: 24, label: '今日' },
    week: { hours: 168, label: '周' }, // 7 * 24
    month: { hours: 720, label: '月' }, // 30 * 24
    year: { hours: 8760, label: '年' } // 365 * 24
  };

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const hours = timeRangeMap[timeRange].hours;
      const response = await adminAPI.getOnlineUserChart(hours);
      if (response.data.code === 0) {
        const snapshots = response.data.data.snapshots || [];
        // Format timestamp for display based on time range
        const formattedData = snapshots.map(item => {
          const date = new Date(item.timestamp);
          let timeStr;
          if (timeRange === 'day') {
            timeStr = date.toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit'
            });
          } else {
            timeStr = date.toLocaleDateString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit'
            });
          }
          return {
            ...item,
            time: timeStr
          };
        });
        setData(formattedData);
      }
    } catch (error) {
      console.error('Failed to fetch online user data:', error);
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
            dataKey="time"
            stroke="#666"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke="#666"
            tick={{ fontSize: 12 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: '8px'
            }}
            labelFormatter={(label) => `时间: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="online_count"
            stroke="#ff7300"
            strokeWidth={2}
            name="在线用户数"
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default OnlineUserChart;
