import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import './SimilarPapersGuide.css';

// 模拟的相似论文数据
const mockPapers = [
  {
    title: 'Deep Learning Applications in Medical Imaging',
    authors: 'Wang X., Chen Y.',
    year: 2024,
    citations: 156,
    similarity: '95%',
    topics: 'AI, Healthcare, Imaging'
  },
  {
    title: 'Neural Networks for Clinical Decision Support',
    authors: 'Smith J., Brown K.',
    year: 2023,
    citations: 89,
    similarity: '87%',
    topics: 'Neural Networks, Clinical'
  },
  {
    title: 'Big Data Analytics in Healthcare Systems',
    authors: 'Zhang L., Li M.',
    year: 2024,
    citations: 72,
    similarity: '82%',
    topics: 'Big Data, Healthcare'
  },
];

const SimilarPapersGuide = ({ onClose, onTryIt, onDismiss, targetRef }) => {
  const [visible, setVisible] = useState(false);
  const [showingRow, setShowingRow] = useState(-1);
  const [arrowPosition, setArrowPosition] = useState({ top: 0, left: 0 });
  const [highlightRect, setHighlightRect] = useState(null);
  const [modalPosition, setModalPosition] = useState({ top: 'auto', left: 'auto', transform: 'translateY(-50%)' });

  useEffect(() => {
    // 计算箭头位置和弹窗位置（弹窗在标签右侧，箭头从弹窗左侧水平指向标签）
    const calculatePositions = () => {
      if (targetRef?.current) {
        const rect = targetRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // 标签中心点位置
        const tabCenterY = rect.top + rect.height / 2;
        const tabRight = rect.right;
        
        // 箭头+线的总宽度
        const arrowTotalWidth = 70; // 60px line + 10px arrow
        const gapToArrow = 8;
        
        // 弹窗左边缘位置 = 标签右边 + 间距 + 箭头宽度
        const modalLeftX = tabRight + gapToArrow + arrowTotalWidth;
        
        // 弹窗垂直位置 - 与标签中心对齐
        let modalCenterY = tabCenterY;
        
        // 确保弹窗不超出顶部和底部
        const modalHeight = 500;
        const minY = modalHeight / 2 + 20;
        const maxY = viewportHeight - modalHeight / 2 - 20;
        modalCenterY = Math.max(minY, Math.min(maxY, modalCenterY));
        
        // 箭头位置 - 箭头尖端靠近标签右侧
        setArrowPosition({
          top: tabCenterY,
          left: tabRight + gapToArrow, // 箭头尖端距离标签8px
        });
        
        // 弹窗位置
        setModalPosition({
          top: `${modalCenterY}px`,
          left: `${modalLeftX}px`,
          transform: 'translateY(-50%)',
        });
      }
    };
    
    calculatePositions();
    
    // 监听窗口大小变化
    window.addEventListener('resize', calculatePositions);
    
    // 延迟显示动画
    setTimeout(() => setVisible(true), 100);
    
    // 逐行显示动画
    let row = 0;
    const timer = setInterval(() => {
      setShowingRow(row);
      row++;
      if (row >= mockPapers.length) {
        clearInterval(timer);
      }
    }, 500);
    
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', calculatePositions);
    };

    return () => clearInterval(timer);
  }, [targetRef]);

  // 计算高亮区域
  useEffect(() => {
    if (targetRef?.current && visible) {
      const rect = targetRef.current.getBoundingClientRect();
      setHighlightRect({
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
      });
    }
  }, [targetRef, visible]);

  // X 按钮 - 只关闭弹窗，下次还会显示
  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => {
      if (onDismiss) {
        onDismiss();
      } else {
        onClose();
      }
    }, 200);
  };

  // "稍后再说" 按钮 - 关闭并记住，下次不再显示
  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  // "立即体验" 按钮
  const handleTryIt = () => {
    setVisible(false);
    setTimeout(() => {
      onClose();
      if (onTryIt) onTryIt();
    }, 200);
  };

  return (
    <div className={`spg-overlay ${visible ? 'spg-visible' : ''}`}>
      {/* 遮罩层 - 点击蒙层关闭但下次还会显示 */}
      <div 
        className="spg-mask"
        onClick={handleDismiss}
        style={highlightRect ? {
          clipPath: `polygon(
            0% 0%, 
            0% 100%, 
            ${highlightRect.left}px 100%, 
            ${highlightRect.left}px ${highlightRect.top}px, 
            ${highlightRect.left + highlightRect.width}px ${highlightRect.top}px, 
            ${highlightRect.left + highlightRect.width}px ${highlightRect.top + highlightRect.height}px, 
            ${highlightRect.left}px ${highlightRect.top + highlightRect.height}px, 
            ${highlightRect.left}px 100%, 
            100% 100%, 
            100% 0%
          )`
        } : {}}
      />
      
      {/* 高亮边框 */}
      {highlightRect && (
        <div 
          className={`spg-highlight ${visible ? 'spg-highlight-show' : ''}`}
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
        />
      )}
      
      {/* 指向标签的箭头 - 水平方向，从右向左指 */}
      {arrowPosition.left > 0 && (
        <div 
          className={`spg-pointer ${visible ? 'spg-pointer-show' : ''}`}
          style={{ 
            top: arrowPosition.top, 
            left: arrowPosition.left,
            transform: 'translateY(-50%)', // 垂直居中
          }}
        >
          <div className="spg-pointer-arrow" />
          <div className="spg-pointer-line" />
        </div>
      )}
      
      <div 
        className="spg-modal" 
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: modalPosition.top,
          left: modalPosition.left,
          transform: modalPosition.transform,
        }}
      >
        {/* 关闭按钮 - 点击后下次还会显示 */}
        <button className="spg-close-btn" onClick={handleDismiss}>
          <X size={18} />
        </button>

        {/* 头部 */}
        <div className="spg-header">
          <div className="spg-badge">新功能</div>
          <h3>发现相似论文</h3>
          <p>基于当前论文的内容和引用关系，智能推荐相关研究文献</p>
        </div>

        {/* 模拟论文列表预览 */}
        <div className="spg-preview">
          <div className="spg-list-container">
            {mockPapers.map((paper, index) => (
              <div 
                key={index} 
                className={`spg-paper-item ${index <= showingRow ? 'spg-paper-show' : ''}`}
              >
                <div className="spg-paper-similarity">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
                  </svg>
                  <span>{paper.similarity}</span>
                </div>
                <div className="spg-paper-content">
                  <div className="spg-paper-title">{paper.title}</div>
                  <div className="spg-paper-meta">
                    {paper.authors} · {paper.year} · {paper.citations} citations
                  </div>
                  <div className="spg-paper-topics">{paper.topics}</div>
                </div>
              </div>
            ))}
          </div>
          
          {/* 渐变遮罩 */}
          <div className="spg-preview-fade" />
        </div>

        {/* 功能亮点 */}
        <div className="spg-features">
          <div className="spg-feature">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>智能推荐</span>
          </div>
          <div className="spg-feature">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>相似度排序</span>
          </div>
          <div className="spg-feature">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>快速拓展研究</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="spg-actions">
          <button className="spg-btn-skip" onClick={handleClose}>
            稍后再说
          </button>
          <button className="spg-btn-try" onClick={handleTryIt}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
            </svg>
            立即体验
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimilarPapersGuide;

