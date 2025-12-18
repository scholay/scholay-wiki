/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { publicScholarAPI, analysisDimensionAPI } from '../services/api';
import { useAuth } from '../utils/AuthContext';
import { trackPaperDimension } from '../utils/usageTracker';
import './DimensionAnalysisPanel.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./AuthModal'));

// 分析结果缓存 - 使用 paperId_dimensionKey 作为 key
const analysisCache = new Map();

const DimensionAnalysisPanel = ({ 
  selectedPaper
}) => {
  const { isAuthenticated } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDimension, setSelectedDimension] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 加载分析维度
  const loadDimensions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let response;
      if (isAuthenticated) {
        response = await analysisDimensionAPI.getDimensions();
      } else {
        response = await publicScholarAPI.getSystemDimensions();
      }

      if (response.data.code === 0 && response.data.data) {
        const dims = response.data.data.dimensions || [];
        setDimensions(dims);
      }
    } catch (err) {
      console.error('Failed to load dimensions:', err);
      setError('加载分析维度失败');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadDimensions();
  }, [loadDimensions]);

  // 当选中论文或维度变化时，执行分析
  useEffect(() => {
    if (selectedPaper && selectedDimension) {
      analyzeSelectedPaper();
    } else {
      setAnalysisResult(null);
      setAnalysisError(null);
    }
  }, [selectedPaper?.paperId, selectedDimension?.dimensionKey]);

  // 分析选中的论文
  const analyzeSelectedPaper = async () => {
    if (!selectedPaper || !selectedDimension) return;
    if (!selectedPaper.abstract) {
      setAnalysisError('该论文没有摘要，无法进行分析');
      return;
    }

    const cacheKey = `${selectedPaper.paperId}_${selectedDimension.dimensionKey}`;
    
    // 检查缓存
    if (analysisCache.has(cacheKey)) {
      setAnalysisResult(analysisCache.get(cacheKey));
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      // 记录使用统计
      trackPaperDimension(selectedPaper.paperId);

      // 调用分析 API
      const response = isAuthenticated
        ? await analysisDimensionAPI.analyzePaper(selectedPaper.paperId, selectedPaper.title, selectedPaper.abstract)
        : await publicScholarAPI.analyzePaper(selectedPaper.paperId, selectedPaper.title, selectedPaper.abstract);

      if (response.data.code === 0 && response.data.data) {
        const result = response.data.data;
        // 存入缓存
        analysisCache.set(cacheKey, result);
        setAnalysisResult(result);
      } else {
        setAnalysisError(response.data.message || '分析失败');
      }
    } catch (error) {
      console.error('Failed to analyze paper:', error);
      if (error.response?.status === 402 || error.response?.data?.code === 4020) {
        setAnalysisError('经费不足，请充值后重试');
      } else {
        setAnalysisError('分析失败，请稍后重试');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // 选择维度
  const handleDimensionClick = (dimension) => {
    if (selectedDimension?.dimensionKey === dimension.dimensionKey) {
      // 取消选择
      setSelectedDimension(null);
    } else {
      setSelectedDimension(dimension);
    }
  };

  // 登录成功回调
  const handleLoginSuccess = () => {
    setShowAuthModal(false);
    window.location.reload();
  };

  // 获取当前维度的分析结果
  const getCurrentDimensionResult = () => {
    if (!analysisResult || !selectedDimension) return null;
    return analysisResult[selectedDimension.dimensionKey];
  };

  // 渲染空状态（未选中论文）
  const renderEmptyState = () => (
    <div className="dap-empty-state">
      <div className="dap-empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12h6M9 16h6M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
      </div>
      <h3 className="dap-empty-title">选择论文进行分析</h3>
      <p className="dap-empty-description">
        点击左侧论文列表中的任意论文，然后选择分析维度查看 AI 分析结果
      </p>
    </div>
  );

  // 渲染维度列表
  const renderDimensionList = () => (
    <div className="dap-dimension-list">
      <h3 className="dap-section-title">分析维度</h3>
      <div className="dap-dimensions">
        {dimensions.map((dim) => (
          <button
            key={dim.dimensionKey}
            className={`dap-dimension-btn ${selectedDimension?.dimensionKey === dim.dimensionKey ? 'active' : ''}`}
            onClick={() => handleDimensionClick(dim)}
            title={dim.description}
          >
            <span className="dap-dimension-name">{dim.name}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // 渲染分析结果
  const renderAnalysisResult = () => {
    if (!selectedPaper) return null;

    const result = getCurrentDimensionResult();

    return (
      <div className="dap-analysis-section">
        {/* 选中论文信息 */}
        <div className="dap-paper-info">
          <h4 className="dap-paper-title">{selectedPaper.title}</h4>
          {selectedPaper.authors && selectedPaper.authors.length > 0 && (
            <p className="dap-paper-authors">
              {selectedPaper.authors.slice(0, 3).map(a => a.name).join(', ')}
              {selectedPaper.authors.length > 3 && ` 等${selectedPaper.authors.length}人`}
            </p>
          )}
        </div>

        {/* 分析结果 */}
        {selectedDimension && (
          <div className="dap-result-section">
            <h4 className="dap-result-title">
              {selectedDimension.name}
              {analyzing && <span className="dap-analyzing-badge">分析中...</span>}
            </h4>
            
            {analyzing && (
              <div className="dap-analyzing">
                <div className="dap-analyzing-spinner"></div>
                <span>AI 正在分析论文...</span>
              </div>
            )}

            {analysisError && (
              <div className="dap-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{analysisError}</span>
              </div>
            )}

            {!analyzing && !analysisError && result && (
              <div className="dap-result-content">
                <p className="dap-result-text">{result}</p>
              </div>
            )}

            {!analyzing && !analysisError && !result && !selectedPaper.abstract && (
              <div className="dap-no-abstract">
                <span>该论文没有摘要，无法进行分析</span>
              </div>
            )}
          </div>
        )}

        {!selectedDimension && (
          <div className="dap-select-dimension-hint">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            <span>请选择上方的分析维度</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dap-container">
      <div className="dap-content">
        {/* 加载状态 */}
        {loading && (
          <div className="dap-loading">
            <div className="dap-loading-spinner"></div>
            <span>加载中...</span>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="dap-error-state">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
            <button className="dap-retry-btn" onClick={loadDimensions}>重试</button>
          </div>
        )}

        {/* 正常内容 */}
        {!loading && !error && (
          <>
            {/* 维度列表 */}
            {renderDimensionList()}

            {/* 分隔线 */}
            <div className="dap-divider"></div>

            {/* 分析结果或空状态 */}
            {selectedPaper ? renderAnalysisResult() : renderEmptyState()}
          </>
        )}
      </div>

      {/* 登录弹窗 */}
      {showAuthModal && (
        <Suspense fallback={<div>Loading...</div>}>
          <AuthModal 
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={handleLoginSuccess}
          />
        </Suspense>
      )}
    </div>
  );
};

export default DimensionAnalysisPanel;

