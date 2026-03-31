/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * ErrorBoundary - 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，记录错误并显示备用 UI
 */

import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // 自定义的降级 UI
      const { fallback, showDetails = false } = this.props;
      
      if (fallback) {
        return fallback;
      }

      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <div style={styles.iconWrapper}>
              <svg 
                width="64" 
                height="64" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="#ef4444" 
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            
            <h2 style={styles.title}>页面出现了问题</h2>
            <p style={styles.message}>
              抱歉，页面遇到了一些问题。请尝试刷新页面或返回首页。
            </p>
            
            <div style={styles.buttonGroup}>
              <button 
                onClick={this.handleRetry}
                style={styles.primaryButton}
              >
                重试
              </button>
              <button 
                onClick={this.handleGoHome}
                style={styles.secondaryButton}
              >
                返回首页
              </button>
            </div>

            {showDetails && this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>查看错误详情</summary>
                <pre style={styles.errorText}>
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    padding: '40px 20px',
    backgroundColor: 'var(--background, #0a0a0a)',
  },
  content: {
    textAlign: 'center',
    maxWidth: '480px',
  },
  iconWrapper: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    color: 'var(--text-primary, #fff)',
    marginBottom: '12px',
  },
  message: {
    fontSize: '16px',
    color: 'var(--text-secondary, #9ca3af)',
    marginBottom: '32px',
    lineHeight: '1.5',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  primaryButton: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#fff',
    backgroundColor: '#10b981',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  secondaryButton: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-primary, #fff)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border, #333)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  details: {
    marginTop: '32px',
    textAlign: 'left',
  },
  summary: {
    cursor: 'pointer',
    color: 'var(--text-secondary, #9ca3af)',
    fontSize: '14px',
  },
  errorText: {
    marginTop: '12px',
    padding: '16px',
    backgroundColor: 'var(--background-secondary, #1a1a1a)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#ef4444',
    overflow: 'auto',
    maxHeight: '200px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};

const pageErrorFallback = (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '50vh',
    padding: '40px 20px',
    textAlign: 'center',
    color: 'var(--text-secondary, #9ca3af)',
  }}>
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary, #6b7280)" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6 }}>
      该模块加载出现问题
    </p>
    <button
      onClick={() => window.location.reload()}
      style={{
        marginTop: 16,
        padding: '8px 20px',
        fontSize: 14,
        color: '#fff',
        backgroundColor: 'var(--primary-solid, #10a37f)',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      刷新页面
    </button>
  </div>
);

export const PageErrorBoundary = ({ children }) => (
  <ErrorBoundary fallback={pageErrorFallback}>
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;

