/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import './OrderManagement.css';

const OrderManagement = () => {
  const [loading, setLoading] = useState(false);
  const [statistics, setStatistics] = useState({
    today_amount: 0,
    today_count: 0,
    today_users: 0,
    week_amount: 0,
    week_count: 0,
    week_users: 0,
    month_amount: 0,
    month_count: 0,
    month_users: 0,
    total_amount: 0,
    total_count: 0,
    total_users: 0,
  });
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [filters, setFilters] = useState({
    planCode: '',
    userEmail: '',
  });

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      const response = await adminAPI.getOrderStatistics();
      if (response.data.code === 0 && response.data.data) {
        setStatistics(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load order statistics:', err);
      showToast('加载订单统计失败', 'error');
    }
  };

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getOrders(
        pagination.page,
        pagination.pageSize,
        filters.planCode,
        filters.userEmail
      );
      if (response.data.code === 0 && response.data.data) {
        setOrders(response.data.data.orders || []);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total || 0,
        }));
      }
    } catch (err) {
      showToast('加载订单列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, filters.planCode, filters.userEmail]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const formatCurrency = (amount) => {
    return `¥${amount.toFixed(2)}`;
  };

  const formatDateTime = (dateStr) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  // 渲染用户信息
  const renderUserInfo = (order) => {
    const userInfo = [];
    
    // 用户名（主要显示）
    if (order.username) {
      userInfo.push(<div key="username" className="user-info-username">{order.username}</div>);
    } else {
      userInfo.push(<div key="userid" className="user-info-username">用户 {order.user_id}</div>);
    }

    const details = [];
    if (order.phone) {
      details.push(
        <div key="phone" className="user-info-detail">
          <span className="info-label">手机:</span> {order.phone}
        </div>
      );
    }
    if (order.email) {
      details.push(
        <div key="email" className="user-info-detail">
          <span className="info-label">邮箱:</span> {order.email}
        </div>
      );
    }
    if (order.wechat_name) {
      details.push(
        <div key="wechat_name" className="user-info-detail">
          <span className="info-label">微信:</span> {order.wechat_name}
        </div>
      );
    }
    if (order.wechat_union_id) {
      details.push(
        <div key="wechat_union_id" className="user-info-detail">
          <span className="info-label">UnionID:</span> {order.wechat_union_id}
        </div>
      );
    }
    if (order.github_name) {
      details.push(
        <div key="github_name" className="user-info-detail">
          <span className="info-label">GitHub:</span> {order.github_name}
        </div>
      );
    }

    return (
      <div className="user-info-cell">
        {userInfo}
        {details.length > 0 && (
          <div className="user-info-details-wrapper">
            {details.map((detail, index) => (
              <React.Fragment key={index}>
                {index > 0 && <div className="user-info-divider"></div>}
                {detail}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="order-management">
      <h1 className="page-title">订单管理</h1>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card stat-card-today">
          <h3>今日</h3>
          <div className="stat-value">{formatCurrency(statistics.today_amount)}</div>
          <div className="stat-details">
            <span>{statistics.today_count} 笔订单</span>
            <span>{statistics.today_users} 位用户</span>
          </div>
        </div>

        <div className="stat-card stat-card-week">
          <h3>本周</h3>
          <div className="stat-value">{formatCurrency(statistics.week_amount)}</div>
          <div className="stat-details">
            <span>{statistics.week_count} 笔订单</span>
            <span>{statistics.week_users} 位用户</span>
          </div>
        </div>

        <div className="stat-card stat-card-month">
          <h3>本月</h3>
          <div className="stat-value">{formatCurrency(statistics.month_amount)}</div>
          <div className="stat-details">
            <span>{statistics.month_count} 笔订单</span>
            <span>{statistics.month_users} 位用户</span>
          </div>
        </div>

        <div className="stat-card stat-card-total">
          <h3>总计</h3>
          <div className="stat-value">{formatCurrency(statistics.total_amount)}</div>
          <div className="stat-details">
            <span>{statistics.total_count} 笔订单</span>
            <span>{statistics.total_users} 位用户</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label>套餐筛选</label>
          <select
            value={filters.planCode}
            onChange={(e) => handleFilterChange('planCode', e.target.value)}
          >
            <option value="">全部套餐</option>
            <option value="pro">Pro</option>
            <option value="max">Max</option>
          </select>
        </div>

        <div className="filter-group">
          <label>用户邮箱</label>
          <input
            type="text"
            placeholder="搜索用户邮箱"
            value={filters.userEmail}
            onChange={(e) => handleFilterChange('userEmail', e.target.value)}
          />
        </div>

        <button className="btn-reset" onClick={() => {
          setFilters({ planCode: '', userEmail: '' });
          setPagination(prev => ({ ...prev, page: 1 }));
        }}>
          重置筛选
        </button>
      </div>

      {/* Orders Table */}
      <div className="orders-section">
        <h2>订单列表</h2>

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>加载中...</p>
          </div>
        ) : orders.length > 0 ? (
          <>
            <div className="table-container">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>用户信息</th>
                    <th>套餐</th>
                    <th>金额</th>
                    <th>支付方式</th>
                    <th>支付时间</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="order-no">{order.order_no}</td>
                      <td className="user-info">{renderUserInfo(order)}</td>
                      <td>
                        <div className="plan-info">
                          <span className={`plan-badge plan-badge-${order.plan_code}`}>
                            {order.plan_name}
                          </span>
                          <span className="billing-cycle">
                            {order.billing_cycle === 'monthly' ? '月付' : '年付'}
                          </span>
                        </div>
                      </td>
                      <td className="amount">
                        <div className="amount-details">
                          {order.discount_amount > 0 ? (
                            <>
                              <span className="final-amount">{formatCurrency(order.final_amount)}</span>
                              <span className="original-amount">{formatCurrency(order.amount)}</span>
                              <span className="discount-badge">已优惠{formatCurrency(order.discount_amount)}</span>
                            </>
                          ) : (
                            <span className="final-amount">{formatCurrency(order.final_amount)}</span>
                          )}
                        </div>
                      </td>
                      <td className="payment-method">{order.payment_method || '-'}</td>
                      <td className="payment-time">
                        {order.payment_time ? formatDateTime(order.payment_time) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination">
              <button
                className="pagination-btn"
                disabled={pagination.page === 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                上一页
              </button>
              <span className="pagination-info">
                第 {pagination.page} 页，共 {Math.ceil(pagination.total / pagination.pageSize)} 页
              </span>
              <button
                className="pagination-btn"
                disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                下一页
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>暂无订单记录</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderManagement;
