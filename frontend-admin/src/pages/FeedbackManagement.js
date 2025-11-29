import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import './FeedbackManagement.css';

const STATUS_MAP = {
  pending: { label: '待处理', color: '#f59e0b' },
  processed: { label: '已处理', color: '#3b82f6' },
  replied: { label: '已回复', color: '#22c55e' },
  closed: { label: '已关闭', color: '#6b7280' },
};

// 获取完整的文件URL（处理相对路径）
const getFullUrl = (url) => {
  if (!url) return '';
  // 如果已经是完整URL，直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // 相对路径，使用当前域名
  return url;
};

const FeedbackManagement = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);
  const [previewImage, setPreviewImage] = useState(null); // 图片预览状态

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getFeedbacks({
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters,
      });
      if (response.data.code === 0) {
        setFeedbacks(response.data.data.list || []);
        setPagination(prev => ({ ...prev, total: response.data.data.total }));
      }
    } catch (error) {
      showToast('获取反馈列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, filters]);

  const fetchStats = async () => {
    try {
      const response = await adminAPI.getFeedbackStats();
      if (response.data.code === 0) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    try {
      const response = await adminAPI.updateFeedbackStatus(id, newStatus);
      if (response.data.code === 0) {
        showToast('状态更新成功', 'success');
        fetchFeedbacks();
        fetchStats();
      } else {
        showToast(response.data.message || '更新失败', 'error');
      }
    } catch (error) {
      showToast('更新失败', 'error');
    }
  };

  const handleReply = async () => {
    if (!replyContent.trim()) {
      showToast('请输入回复内容', 'error');
      return;
    }
    setReplying(true);
    try {
      const response = await adminAPI.replyFeedback(selectedFeedback.id, replyContent);
      if (response.data.code === 0) {
        showToast('回复成功，邮件已发送', 'success');
        setShowReplyModal(false);
        setReplyContent('');
        setSelectedFeedback(null);
        fetchFeedbacks();
        fetchStats();
      } else {
        showToast(response.data.message || '回复失败', 'error');
      }
    } catch (error) {
      showToast('回复失败', 'error');
    } finally {
      setReplying(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条反馈吗？')) return;
    try {
      const response = await adminAPI.deleteFeedback(id);
      if (response.data.code === 0) {
        showToast('删除成功', 'success');
        fetchFeedbacks();
        fetchStats();
      } else {
        showToast(response.data.message || '删除失败', 'error');
      }
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  const openDetailModal = (feedback) => {
    setSelectedFeedback(feedback);
    setShowDetailModal(true);
  };

  const openReplyModal = (feedback) => {
    setSelectedFeedback(feedback);
    setReplyContent('');
    setShowReplyModal(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const parseAttachments = (attachmentsStr) => {
    if (!attachmentsStr) return [];
    try {
      return JSON.parse(attachmentsStr);
    } catch {
      return [];
    }
  };

  return (
    <div className="feedback-management">
      <div className="page-header">
        <h1>反馈管理</h1>
        <p>管理用户提交的意见反馈</p>
      </div>

      {stats && (
        <div className="stats-cards">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">总反馈</div>
          </div>
          <div className="stat-card pending">
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-label">待处理</div>
          </div>
          <div className="stat-card processed">
            <div className="stat-value">{stats.processed}</div>
            <div className="stat-label">已处理</div>
          </div>
          <div className="stat-card replied">
            <div className="stat-value">{stats.replied}</div>
            <div className="stat-label">已回复</div>
          </div>
        </div>
      )}

      <div className="filters-bar">
        <select
          value={filters.status}
          onChange={(e) => {
            setFilters(prev => ({ ...prev, status: e.target.value }));
            setPagination(prev => ({ ...prev, page: 1 }));
          }}
        >
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="processed">已处理</option>
          <option value="replied">已回复</option>
          <option value="closed">已关闭</option>
        </select>
        <input
          type="text"
          placeholder="搜索邮箱或内容..."
          value={filters.keyword}
          onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPagination(prev => ({ ...prev, page: 1 }));
              fetchFeedbacks();
            }
          }}
        />
        <button onClick={() => { setPagination(prev => ({ ...prev, page: 1 })); fetchFeedbacks(); }}>
          搜索
        </button>
      </div>

      <div className="feedback-table-wrapper">
        <table className="feedback-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>邮箱</th>
              <th>内容摘要</th>
              <th>用户</th>
              <th>IP</th>
              <th>状态</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="loading-cell">加载中...</td></tr>
            ) : feedbacks.length === 0 ? (
              <tr><td colSpan="8" className="empty-cell">暂无反馈</td></tr>
            ) : (
              feedbacks.map((feedback) => (
                <tr key={feedback.id}>
                  <td>{feedback.id}</td>
                  <td>{feedback.email}</td>
                  <td className="content-cell" title={feedback.content}>
                    {feedback.content?.substring(0, 50)}{feedback.content?.length > 50 ? '...' : ''}
                  </td>
                  <td>{feedback.username || '匿名'}</td>
                  <td>{feedback.ip || '-'}</td>
                  <td>
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: STATUS_MAP[feedback.status]?.color }}
                    >
                      {STATUS_MAP[feedback.status]?.label}
                    </span>
                  </td>
                  <td>{formatDate(feedback.createdAt)}</td>
                  <td className="actions-cell">
                    <button className="btn-action view" onClick={() => openDetailModal(feedback)}>
                      查看
                    </button>
                    {feedback.status !== 'replied' && feedback.status !== 'closed' && (
                      <button className="btn-action reply" onClick={() => openReplyModal(feedback)}>
                        回复
                      </button>
                    )}
                    <button className="btn-action delete" onClick={() => handleDelete(feedback.id)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button
          disabled={pagination.page <= 1}
          onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
        >
          上一页
        </button>
        <span>第 {pagination.page} 页 / 共 {Math.ceil(pagination.total / pagination.pageSize)} 页</span>
        <button
          disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
          onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
        >
          下一页
        </button>
      </div>

      {/* 侧边抽屉 - 反馈详情 */}
      <div className={`drawer-overlay ${showDetailModal ? 'visible' : ''}`} onClick={() => setShowDetailModal(false)} />
      <div className={`drawer detail-drawer ${showDetailModal ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3>反馈详情</h3>
          <button className="close-btn" onClick={() => setShowDetailModal(false)}>×</button>
        </div>
        {selectedFeedback && (
          <div className="drawer-body">
            <div className="detail-section">
              <h4>基本信息</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>反馈ID</label>
                  <span>#{selectedFeedback.id}</span>
                </div>
                <div className="detail-item">
                  <label>邮箱</label>
                  <span>{selectedFeedback.email}</span>
                </div>
                <div className="detail-item">
                  <label>用户</label>
                  <span>{selectedFeedback.username || '匿名用户'}</span>
                </div>
                <div className="detail-item">
                  <label>IP地址</label>
                  <span>{selectedFeedback.ip || '-'} {selectedFeedback.ipLocation && <span className="ip-location">({selectedFeedback.ipLocation})</span>}</span>
                </div>
                <div className="detail-item">
                  <label>提交时间</label>
                  <span>{formatDate(selectedFeedback.createdAt)}</span>
                </div>
                <div className="detail-item">
                  <label>状态</label>
                  <select
                    value={selectedFeedback.status}
                    onChange={(e) => {
                      handleStatusChange(selectedFeedback.id, e.target.value);
                      setSelectedFeedback(prev => ({ ...prev, status: e.target.value }));
                    }}
                    className="status-select"
                  >
                    <option value="pending">待处理</option>
                    <option value="processed">已处理</option>
                    <option value="replied">已回复</option>
                    <option value="closed">已关闭</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h4>反馈内容</h4>
              <div className="content-box large">{selectedFeedback.content}</div>
            </div>

            {parseAttachments(selectedFeedback.attachments).length > 0 && (
              <div className="detail-section">
                <h4>附件 ({parseAttachments(selectedFeedback.attachments).length})</h4>
                {/* 图片预览区域 */}
                {parseAttachments(selectedFeedback.attachments).filter(att => att.type === 'image').length > 0 && (
                  <div className="attachment-images-preview">
                    {parseAttachments(selectedFeedback.attachments)
                      .filter(att => att.type === 'image')
                      .map((att, idx) => (
                        <div 
                          key={idx} 
                          className="preview-image-item"
                          onClick={() => setPreviewImage(getFullUrl(att.url))}
                        >
                          <img src={getFullUrl(att.url)} alt={att.name} />
                          <div className="preview-image-overlay">
                            <span>点击预览</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {/* 文件下载区域 */}
                {parseAttachments(selectedFeedback.attachments).filter(att => att.type === 'file').length > 0 && (
                  <div className="attachment-files-list">
                    {parseAttachments(selectedFeedback.attachments)
                      .filter(att => att.type === 'file')
                      .map((att, idx) => (
                        <a 
                          key={idx} 
                          href={getFullUrl(att.url)} 
                          download={att.name}
                          className="file-download-item"
                        >
                          <span className="file-icon">📄</span>
                          <span className="file-info">
                            <span className="file-name">{att.name}</span>
                            {att.size && <span className="file-size">{(att.size / 1024).toFixed(1)} KB</span>}
                          </span>
                          <span className="download-icon">⬇️</span>
                        </a>
                      ))}
                  </div>
                )}
              </div>
            )}

            {selectedFeedback.replyContent && (
              <div className="detail-section">
                <h4>回复记录</h4>
                <div className="content-box reply-box large">{selectedFeedback.replyContent}</div>
                <div className="reply-meta">
                  <span>回复人: {selectedFeedback.repliedBy}</span>
                  <span>回复时间: {formatDate(selectedFeedback.repliedAt)}</span>
                </div>
              </div>
            )}

            <div className="drawer-actions">
              {selectedFeedback.status !== 'replied' && selectedFeedback.status !== 'closed' && (
                <button className="btn-primary" onClick={() => { setShowDetailModal(false); openReplyModal(selectedFeedback); }}>
                  回复此反馈
                </button>
              )}
              <button className="btn-danger" onClick={() => { handleDelete(selectedFeedback.id); setShowDetailModal(false); }}>
                删除反馈
              </button>
            </div>
          </div>
        )}
      </div>

      {showReplyModal && selectedFeedback && (
        <div className="modal-overlay" onClick={() => setShowReplyModal(false)}>
          <div className="modal reply-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>回复反馈</h3>
              <button className="close-btn" onClick={() => setShowReplyModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="reply-info">
                <p><strong>发送至:</strong> {selectedFeedback.email}</p>
                <p><strong>原反馈:</strong> {selectedFeedback.content?.substring(0, 100)}...</p>
              </div>
              <textarea
                placeholder="请输入回复内容..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={6}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowReplyModal(false)}>取消</button>
              <button className="btn-submit" onClick={handleReply} disabled={replying}>
                {replying ? '发送中...' : '发送回复'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div className="image-preview-overlay" onClick={() => setPreviewImage(null)}>
          <div className="image-preview-container">
            <button className="preview-close-btn" onClick={() => setPreviewImage(null)}>×</button>
            <img src={previewImage} alt="预览" onClick={(e) => e.stopPropagation()} />
            <div className="preview-actions">
              <a href={previewImage} download className="preview-download-btn" onClick={(e) => e.stopPropagation()}>
                下载图片
              </a>
              <a href={previewImage} target="_blank" rel="noopener noreferrer" className="preview-open-btn" onClick={(e) => e.stopPropagation()}>
                新窗口打开
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackManagement;
