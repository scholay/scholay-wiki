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
import './DistributedCoupons.css';

const DistributedCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // Filters
  const [filters, setFilters] = useState({
    templateId: '',
    status: '',
    userEmail: ''
  });

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await adminAPI.getCouponTemplates(1, 100);
      if (response.data.code === 0) {
        setTemplates(response.data.data.templates || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  }, []);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getDistributedCoupons(
        page,
        pageSize,
        filters.templateId,
        filters.status,
        filters.userEmail
      );

      if (response.data.code === 0) {
        setCoupons(response.data.data.coupons || []);
        setTotal(response.data.data.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch distributed coupons:', error);
      showToast('获取折扣券列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters.templateId, filters.status, filters.userEmail]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
    setPage(1); // Reset to first page when filters change
  };

  const handleResetFilters = () => {
    setFilters({
      templateId: '',
      status: '',
      userEmail: ''
    });
    setPage(1);
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      unused: { text: '未使用', className: 'status-unused' },
      reserved: { text: '已预留', className: 'status-reserved' },
      used: { text: '已使用', className: 'status-used' },
      expired: { text: '已过期', className: 'status-expired' }
    };
    const config = statusMap[status] || { text: status, className: '' };
    return <span className={`status-badge ${config.className}`}>{config.text}</span>;
  };

  const getDiscountDisplay = (template) => {
    if (!template) return '-';

    if (template.type === 'percentage') {
      return `${template.discount_value}%`;
    } else if (template.type === 'fixed') {
      return `¥${template.discount_value}`;
    } else if (template.type === 'price_off') {
      return `满减¥${template.discount_value}`;
    }
    return '-';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="distributed-coupons-container">
      <div className="page-header">
        <h1>已发放折扣券列表</h1>
        <p className="page-description">查看和管理所有已发放给用户的折扣券</p>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label>折扣券模板</label>
          <select
            value={filters.templateId}
            onChange={(e) => handleFilterChange('templateId', e.target.value)}
          >
            <option value="">全部模板</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.code})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>状态</label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="unused">未使用</option>
            <option value="reserved">已预留</option>
            <option value="used">已使用</option>
            <option value="expired">已过期</option>
          </select>
        </div>

        <div className="filter-group">
          <label>用户邮箱</label>
          <input
            type="text"
            placeholder="输入用户邮箱搜索"
            value={filters.userEmail}
            onChange={(e) => handleFilterChange('userEmail', e.target.value)}
          />
        </div>

        <button className="btn-reset" onClick={handleResetFilters}>
          重置筛选
        </button>
      </div>

      {/* Statistics */}
      <div className="statistics-bar">
        <div className="stat-item">
          <span className="stat-label">总计:</span>
          <span className="stat-value">{total}</span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      ) : coupons.length === 0 ? (
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2"/>
            <path d="M12 8v4M12 16h.01" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p>暂无折扣券数据</p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="coupons-table">
              <thead>
                <tr>
                  <th>折扣券代码</th>
                  <th>模板名称</th>
                  <th>折扣力度</th>
                  <th>用户ID</th>
                  <th>状态</th>
                  <th>发放时间</th>
                  <th>有效期至</th>
                  <th>使用时间</th>
                  <th>使用订单</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td className="coupon-code">{coupon.coupon_code}</td>
                    <td>{coupon.template?.name || '-'}</td>
                    <td className="discount-value">{getDiscountDisplay(coupon.template)}</td>
                    <td>{coupon.user_id}</td>
                    <td>{getStatusBadge(coupon.status)}</td>
                    <td>{formatDate(coupon.created_at)}</td>
                    <td>{formatDate(coupon.valid_until)}</td>
                    <td>{formatDate(coupon.used_at)}</td>
                    <td>{coupon.used_order_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn-page"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                上一页
              </button>
              <span className="page-info">
                第 {page} / {totalPages} 页，共 {total} 条
              </span>
              <button
                className="btn-page"
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DistributedCoupons;
