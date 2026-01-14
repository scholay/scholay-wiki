/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import EntcoinIcon from '../components/EntcoinIcon';
import GoldIcon from '../components/GoldIcon';
import './CurrencyBatchManagement.css';

const CurrencyBatchManagement = () => {
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [filters, setFilters] = useState({
    status: '',
    currencyType: '',
  });

  // 发放详情弹窗状态
  const [detailModal, setDetailModal] = useState({ show: false, batch: null });
  const [distributions, setDistributions] = useState([]);
  const [distributionsPagination, setDistributionsPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [distributionsLoading, setDistributionsLoading] = useState(false);

  useEffect(() => {
    loadBatches();
  }, [pagination.page, filters]);

  const loadBatches = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getCurrencyBatches(
        pagination.page,
        pagination.pageSize,
        filters.status,
        filters.currencyType
      );
      if (response.data.code === 0 && response.data.data) {
        setBatches(response.data.data.list || []);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total || 0,
        }));
      }
    } catch (err) {
      showToast('加载批次列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleCancelBatch = async (batchId) => {
    if (!window.confirm('确定要取消此批次吗？只能取消待执行状态的批次。')) {
      return;
    }

    try {
      const response = await adminAPI.cancelCurrencyBatch(batchId);
      if (response.data.code === 0) {
        showToast('批次已取消', 'success');
        loadBatches();
      } else {
        showToast(response.data.message || '取消失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '取消批次失败', 'error');
    }
  };

  const handleViewDetail = async (batch) => {
    setDetailModal({ show: true, batch });
    setDistributionsPagination({ page: 1, pageSize: 20, total: 0 });
    await loadDistributions(batch.id, 1);
  };

  const loadDistributions = async (batchId, page) => {
    setDistributionsLoading(true);
    try {
      const response = await adminAPI.getCurrencyBatchDistributions(batchId, page, 20);
      if (response.data.code === 0 && response.data.data) {
        setDistributions(response.data.data.list || []);
        setDistributionsPagination(prev => ({
          ...prev,
          page: page,
          total: response.data.data.total || 0,
        }));
      }
    } catch (err) {
      showToast('加载发放明细失败', 'error');
    } finally {
      setDistributionsLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setDetailModal({ show: false, batch: null });
    setDistributions([]);
  };

  const handleDistributionsPageChange = (newPage) => {
    if (detailModal.batch) {
      loadDistributions(detailModal.batch.id, newPage);
    }
  };

  // 格式化状态
  const renderStatus = (status) => {
    const statusMap = {
      pending: { label: '待执行', className: 'cb-status-pending' },
      processing: { label: '执行中', className: 'cb-status-processing' },
      completed: { label: '已完成', className: 'cb-status-completed' },
      failed: { label: '失败', className: 'cb-status-failed' },
      cancelled: { label: '已取消', className: 'cb-status-cancelled' },
    };
    const info = statusMap[status] || { label: status, className: '' };
    return <span className={`cb-status-badge ${info.className}`}>{info.label}</span>;
  };

  // 格式化货币类型
  const renderCurrencyType = (type, amount) => {
    if (type === 'gold') {
      return (
        <span className="cb-currency-item cb-currency-gold">
          <GoldIcon size="sm" /> {amount} 经费
        </span>
      );
    }
    return (
      <span className="cb-currency-item cb-currency-diamond">
        <EntcoinIcon size="sm" /> {amount} 恩特币
      </span>
    );
  };

  // 格式化目标类型
  const renderTargetType = (type) => {
    const targetMap = {
      all: '全部用户',
      members: '会员用户',
      non_members: '非会员用户',
      specific: '指定用户',
    };
    return targetMap[type] || type;
  };

  // 格式化时间
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  const totalPages = Math.ceil(pagination.total / pagination.pageSize);
  const distributionsTotalPages = Math.ceil(distributionsPagination.total / distributionsPagination.pageSize);

  return (
    <div className="cb-container">
      <div className="page-header">
        <h1>货币发放记录</h1>
        <p>查看和管理批量货币发放任务</p>
      </div>

      {/* 筛选栏 */}
      <div className="cb-filters">
        <div className="cb-filter-group">
          <label>状态</label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="cb-filter-select"
          >
            <option value="">全部状态</option>
            <option value="pending">待执行</option>
            <option value="processing">执行中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>
        <div className="cb-filter-group">
          <label>货币类型</label>
          <select
            value={filters.currencyType}
            onChange={(e) => handleFilterChange('currencyType', e.target.value)}
            className="cb-filter-select"
          >
            <option value="">全部类型</option>
            <option value="gold">经费</option>
            <option value="diamond">恩特币</option>
          </select>
        </div>
        <button className="cb-refresh-btn" onClick={loadBatches}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          刷新
        </button>
      </div>

      {/* 批次列表 */}
      <div className="cb-table-container">
        {loading ? (
          <div className="loading-container">
            <span className="spinner"></span>
            <p>加载中...</p>
          </div>
        ) : (
          <>
            <table className="cb-table">
              <thead>
                <tr>
                  <th>批次号</th>
                  <th>发放类型</th>
                  <th>目标范围</th>
                  <th>标题</th>
                  <th>发放统计</th>
                  <th>状态</th>
                  <th>创建人</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.length > 0 ? (
                  batches.map(batch => (
                    <tr key={batch.id}>
                      <td>
                        <span className="cb-batch-no">{batch.batch_no}</span>
                      </td>
                      <td>{renderCurrencyType(batch.currency_type, batch.amount)}</td>
                      <td>
                        <span className="cb-target-type">{renderTargetType(batch.target_type)}</span>
                      </td>
                      <td>
                        <div className="cb-title-cell">
                          <span className="cb-title">{batch.title}</span>
                          {batch.description && (
                            <span className="cb-description">{batch.description}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="cb-stats-cell">
                          <span className="cb-stat-total">总计: {batch.total_count}</span>
                          <span className="cb-stat-success">成功: {batch.success_count}</span>
                          {batch.failed_count > 0 && (
                            <span className="cb-stat-failed">失败: {batch.failed_count}</span>
                          )}
                        </div>
                      </td>
                      <td>{renderStatus(batch.status)}</td>
                      <td>
                        <span className="cb-creator">{batch.created_by_name || '-'}</span>
                      </td>
                      <td>
                        <span className="cb-date">{formatDate(batch.created_at)}</span>
                      </td>
                      <td>
                        <div className="cb-action-buttons">
                          <button
                            className="cb-action-btn cb-view-btn"
                            onClick={() => handleViewDetail(batch)}
                            title="查看详情"
                          >
                            详情
                          </button>
                          {batch.status === 'pending' && (
                            <button
                              className="cb-action-btn cb-cancel-btn"
                              onClick={() => handleCancelBatch(batch.id)}
                              title="取消批次"
                            >
                              取消
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" className="no-data">暂无发放记录</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                >
                  上一页
                </button>
                <span className="pagination-info">
                  第 {pagination.page} / {totalPages} 页 (共 {pagination.total} 条)
                </span>
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === totalPages}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 发放详情弹窗 */}
      {detailModal.show && detailModal.batch && (
        <div className="modal-overlay" onClick={handleCloseDetail}>
          <div className="modal-content cb-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>发放详情 - {detailModal.batch.batch_no}</h3>
              <button className="modal-close-btn" onClick={handleCloseDetail}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {/* 批次信息 */}
              <div className="cb-detail-info">
                <div className="cb-detail-row">
                  <span className="cb-detail-label">发放类型:</span>
                  <span>{renderCurrencyType(detailModal.batch.currency_type, detailModal.batch.amount)}</span>
                </div>
                <div className="cb-detail-row">
                  <span className="cb-detail-label">目标范围:</span>
                  <span>{renderTargetType(detailModal.batch.target_type)}</span>
                </div>
                <div className="cb-detail-row">
                  <span className="cb-detail-label">状态:</span>
                  {renderStatus(detailModal.batch.status)}
                </div>
                <div className="cb-detail-row">
                  <span className="cb-detail-label">发放统计:</span>
                  <span>
                    总计 {detailModal.batch.total_count} 人，
                    成功 {detailModal.batch.success_count} 人
                    {detailModal.batch.failed_count > 0 && `，失败 ${detailModal.batch.failed_count} 人`}
                  </span>
                </div>
                {detailModal.batch.remark && (
                  <div className="cb-detail-row">
                    <span className="cb-detail-label">备注:</span>
                    <span>{detailModal.batch.remark}</span>
                  </div>
                )}
              </div>

              {/* 发放明细列表 */}
              <div className="cb-distributions">
                <h4>发放明细</h4>
                {distributionsLoading ? (
                  <div className="loading-container">
                    <span className="spinner"></span>
                    <p>加载中...</p>
                  </div>
                ) : (
                  <>
                    <table className="cb-dist-table">
                      <thead>
                        <tr>
                          <th>用户ID</th>
                          <th>发放数量</th>
                          <th>状态</th>
                          <th>交易号</th>
                          <th>失败原因</th>
                          <th>发放时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {distributions.length > 0 ? (
                          distributions.map((dist, index) => (
                            <tr key={dist.id || index}>
                              <td>#{dist.user_id}</td>
                              <td>{renderCurrencyType(dist.currency_type, dist.amount)}</td>
                              <td>{renderStatus(dist.status)}</td>
                              <td>
                                <span className="cb-tx-no">{dist.transaction_no || '-'}</span>
                              </td>
                              <td>
                                {dist.error_msg && (
                                  <span className="cb-error-msg">{dist.error_msg}</span>
                                )}
                                {!dist.error_msg && '-'}
                              </td>
                              <td>{formatDate(dist.updated_at)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="no-data">暂无发放明细</td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* 明细分页 */}
                    {distributionsTotalPages > 1 && (
                      <div className="pagination cb-dist-pagination">
                        <button
                          className="pagination-btn"
                          onClick={() => handleDistributionsPageChange(distributionsPagination.page - 1)}
                          disabled={distributionsPagination.page === 1}
                        >
                          上一页
                        </button>
                        <span className="pagination-info">
                          第 {distributionsPagination.page} / {distributionsTotalPages} 页
                        </span>
                        <button
                          className="pagination-btn"
                          onClick={() => handleDistributionsPageChange(distributionsPagination.page + 1)}
                          disabled={distributionsPagination.page === distributionsTotalPages}
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel-btn" onClick={handleCloseDetail}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrencyBatchManagement;
