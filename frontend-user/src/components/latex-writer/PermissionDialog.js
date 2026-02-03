/**
 * PermissionDialog - 工具权限确认对话框
 * 当 AI Agent 需要执行敏感操作时，向用户请求确认
 */

import React, { useState, useCallback } from 'react';
import './PermissionDialog.css';

// 风险级别图标和颜色
const RISK_LEVELS = {
  low: {
    icon: '✓',
    color: '#52c41a',
    label: '低风险',
    description: '这是一个安全的操作'
  },
  medium: {
    icon: '⚠',
    color: '#faad14',
    label: '中风险',
    description: '此操作可能会消耗资源或访问外部服务'
  },
  high: {
    icon: '⚡',
    color: '#ff4d4f',
    label: '高风险',
    description: '此操作会修改文件或执行重要操作'
  }
};

// 记住选择的选项
const REMEMBER_OPTIONS = {
  once: { label: '仅本次', description: '只允许这一次执行' },
  session: { label: '本次会话', description: '本次对话期间始终允许' },
  always: { label: '始终允许', description: '以后都允许此工具' }
};

/**
 * 权限确认对话框组件
 */
const PermissionDialog = ({
  visible,
  request,
  onApprove,
  onDeny,
  onClose
}) => {
  const [rememberChoice, setRememberChoice] = useState('once');
  const [isProcessing, setIsProcessing] = useState(false);

  const riskInfo = RISK_LEVELS[request?.riskLevel || 'medium'];

  const handleApprove = useCallback(async () => {
    setIsProcessing(true);
    try {
      await onApprove({
        requestId: request.requestId,
        approved: true,
        scope: rememberChoice,
        rememberFor: rememberChoice
      });
    } finally {
      setIsProcessing(false);
    }
  }, [request, rememberChoice, onApprove]);

  const handleDeny = useCallback(async () => {
    setIsProcessing(true);
    try {
      await onDeny({
        requestId: request.requestId,
        approved: false,
        scope: 'once'
      });
    } finally {
      setIsProcessing(false);
    }
  }, [request, onDeny]);

  if (!visible || !request) {
    return null;
  }

  return (
    <div className="permission-dialog-overlay" onClick={onClose}>
      <div 
        className="permission-dialog" 
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-dialog-title"
      >
        {/* 头部 */}
        <div className="permission-dialog-header">
          <div 
            className="permission-dialog-icon"
            style={{ backgroundColor: riskInfo.color + '20', color: riskInfo.color }}
          >
            {riskInfo.icon}
          </div>
          <div className="permission-dialog-title-area">
            <h3 id="permission-dialog-title" className="permission-dialog-title">
              工具调用请求
            </h3>
            <span 
              className="permission-dialog-risk-badge"
              style={{ backgroundColor: riskInfo.color + '20', color: riskInfo.color }}
            >
              {riskInfo.label}
            </span>
          </div>
          <button 
            className="permission-dialog-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* 内容 */}
        <div className="permission-dialog-content">
          <div className="permission-dialog-tool-info">
            <div className="permission-dialog-tool-name">
              <span className="label">工具名称：</span>
              <span className="value">{request.toolName}</span>
            </div>
            <div className="permission-dialog-tool-desc">
              <span className="label">操作说明：</span>
              <span className="value">{request.description}</span>
            </div>
          </div>

          {/* 参数详情 */}
          {request.arguments && Object.keys(request.arguments).length > 0 && (
            <div className="permission-dialog-args">
              <h4>参数详情</h4>
              <div className="permission-dialog-args-list">
                {Object.entries(request.arguments).map(([key, value]) => (
                  <div key={key} className="permission-dialog-arg-item">
                    <span className="arg-key">{key}:</span>
                    <span className="arg-value">
                      {typeof value === 'object' 
                        ? JSON.stringify(value, null, 2) 
                        : String(value).substring(0, 200)}
                      {String(value).length > 200 && '...'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 风险说明 */}
          <div className="permission-dialog-risk-info">
            <span 
              className="permission-dialog-risk-icon"
              style={{ color: riskInfo.color }}
            >
              ℹ
            </span>
            <span>{riskInfo.description}</span>
          </div>

          {/* 记住选择 */}
          <div className="permission-dialog-remember">
            <h4>记住选择</h4>
            <div className="permission-dialog-remember-options">
              {Object.entries(REMEMBER_OPTIONS).map(([key, option]) => (
                <label 
                  key={key} 
                  className={`permission-dialog-remember-option ${rememberChoice === key ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="remember"
                    value={key}
                    checked={rememberChoice === key}
                    onChange={() => setRememberChoice(key)}
                  />
                  <div className="option-content">
                    <span className="option-label">{option.label}</span>
                    <span className="option-desc">{option.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="permission-dialog-footer">
          <button
            className="permission-dialog-btn permission-dialog-btn-deny"
            onClick={handleDeny}
            disabled={isProcessing}
          >
            拒绝
          </button>
          <button
            className="permission-dialog-btn permission-dialog-btn-approve"
            onClick={handleApprove}
            disabled={isProcessing}
          >
            {isProcessing ? '处理中...' : '允许执行'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionDialog;
