import React, { useState, useEffect } from 'react';
import './FloatingGuide.css';

const FloatingGuide = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [activeDemo, setActiveDemo] = useState(0); // 0 for search, 1 for analysis

  // 移除自动显示逻辑，只通过手动触发
  useEffect(() => {
    // 组件加载时不自动显示
    // 只能通过调用 window.openFloatingGuide() 来显示
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    // 等待动画完成后隐藏
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
    }, 400);
  };

  // 手动打开引导（从外部调用）
  const openGuide = () => {
    setIsVisible(true);
    setIsClosing(false);
  };

  // 将openGuide方法暴露给window对象，以便其他组件调用
  useEffect(() => {
    window.openFloatingGuide = openGuide;
    return () => {
      delete window.openFloatingGuide;
    };
  }, []);

  if (!isVisible) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div 
        className={`floating-guide-backdrop ${isClosing ? 'closing' : ''}`}
        onClick={handleClose}
      />
      
      {/* 主引导窗口 - 新布局：左侧文字，右侧GIF */}
      <div className={`floating-guide-modal ${isClosing ? 'closing' : ''}`}>
        {/* 关闭按钮 */}
        <button 
          className="modal-close-btn" 
          onClick={handleClose}
          aria-label="关闭"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="modal-container">
          {/* 左侧：功能介绍 */}
          <div className="modal-left">
            <div className="modal-header">
              <div className="modal-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                  <path d="M2 17L12 22L22 17" />
                  <path d="M2 12L12 17L22 12" />
                </svg>
              </div>
              <div>
                <h2>探索 Scholay AI 学术搜索</h2>
                <p className="modal-subtitle">让科研更高效，让知识触手可及</p>
              </div>
            </div>

            {/* 功能选择标签 */}
            <div className="feature-tabs">
              <button 
                className={`feature-tab ${activeDemo === 0 ? 'active' : ''}`}
                onClick={() => setActiveDemo(0)}
              >
                <span className="tab-number">01</span>
                <div className="tab-content">
                  <h4>智能学术检索</h4>
                  <p>自然语言搜索，精准匹配</p>
                </div>
              </button>
              <button 
                className={`feature-tab ${activeDemo === 1 ? 'active' : ''}`}
                onClick={() => setActiveDemo(1)}
              >
                <span className="tab-number">02</span>
                <div className="tab-content">
                  <h4>深度智能分析</h4>
                  <p>AI驱动的论文解析</p>
                </div>
              </button>
            </div>

            {/* 功能详细说明 */}
            <div className="feature-details">
              {activeDemo === 0 ? (
                <>
                  <h3>智能学术检索功能</h3>
                  <ul className="feature-list">
                    <li>
                      <span className="list-icon">🔍</span>
                      <div>
                        <strong>自然语言理解</strong>
                        <p>使用日常语言描述您的研究需求，AI自动理解并转换为专业检索</p>
                      </div>
                    </li>
                    <li>
                      <span className="list-icon">🎯</span>
                      <div>
                        <strong>语义匹配技术</strong>
                        <p>基于深度学习的语义理解，找到真正相关的文献，而非简单关键词匹配</p>
                      </div>
                    </li>
                    <li>
                      <span className="list-icon">⚡</span>
                      <div>
                        <strong>实时检索结果</strong>
                        <p>毫秒级响应速度，覆盖千万级学术文献数据库</p>
                      </div>
                    </li>
                  </ul>
                </>
              ) : (
                <>
                  <h3>深度智能分析功能</h3>
                  <ul className="feature-list">
                    <li>
                      <span className="list-icon">📊</span>
                      <div>
                        <strong>自动摘要生成</strong>
                        <p>AI自动提取论文核心观点，生成结构化摘要，快速了解论文要点</p>
                      </div>
                    </li>
                    <li>
                      <span className="list-icon">🔗</span>
                      <div>
                        <strong>引用关系图谱</strong>
                        <p>可视化展示论文引用网络，发现研究脉络和学术影响力</p>
                      </div>
                    </li>
                    <li>
                      <span className="list-icon">💡</span>
                      <div>
                        <strong>研究趋势洞察</strong>
                        <p>分析领域研究热点和发展趋势，把握学术前沿动态</p>
                      </div>
                    </li>
                  </ul>
                </>
              )}
            </div>

            {/* CTA按钮 */}
            <div className="modal-actions">
              <a 
                href="/" 
                className="action-primary"
                onClick={(e) => {
                  e.preventDefault();
                  handleClose();
                  window.location.href = '/';
                }}
              >
                立即体验 Scholay
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </a>
            </div>
          </div>

          {/* 右侧：GIF展示 */}
          <div className="modal-right">
            <div className="gif-container">
              <img 
                src={activeDemo === 0 ? "/assets/academic-search.gif" : "/assets/smart-analysis.gif"}
                alt={activeDemo === 0 ? "学术检索演示" : "智能分析演示"}
                className="demo-gif"
              />
              <div className="gif-caption">
                {activeDemo === 0 ? "智能学术检索演示" : "深度智能分析演示"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default FloatingGuide;