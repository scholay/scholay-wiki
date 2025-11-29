import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import './TableViewGuide.css';

// 模拟的分析数据
const mockData = [
  {
    title: 'Big Data Analytics in Healthcare Systems',
    authors: 'Zhang L., Wang H.',
    year: 2024,
    citations: 128,
    analysis: {
      studyType: '系统综述',
      technologies: 'Hadoop, Spark',
      useCases: '疾病预测、患者分层',
      keyFindings: '诊断准确率提升35%',
    }
  },
  {
    title: 'Machine Learning for Climate Prediction',
    authors: 'Smith J., Brown K.',
    year: 2023,
    citations: 89,
    analysis: {
      studyType: '实证研究',
      technologies: 'TensorFlow, PyTorch',
      useCases: '气候预测、异常检测',
      keyFindings: '预测精度达92%',
    }
  },
  {
    title: 'Real-time Stream Processing in IoT',
    authors: 'Chen Y., Li X.',
    year: 2024,
    citations: 56,
    analysis: {
      studyType: '技术综述',
      technologies: 'Kafka, Flink',
      useCases: '实时监控、智能制造',
      keyFindings: '延迟降至毫秒级',
    }
  },
];

const TableViewGuide = ({ onClose, onTryIt, onDismiss, targetRef }) => {
  const [visible, setVisible] = useState(false);
  const [typingRow, setTypingRow] = useState(-1);
  const [arrowPosition, setArrowPosition] = useState({ top: 0, left: 0 });
  const [modalPosition, setModalPosition] = useState({ top: 'auto', right: 'auto', transform: 'translateY(-50%)' });

  useEffect(() => {
    // 计算箭头位置和弹窗位置（弹窗在按钮左侧，箭头从弹窗指向按钮）
    const calculatePositions = () => {
    if (targetRef?.current) {
      const rect = targetRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // 按钮中心点的垂直位置
        const buttonCenterY = rect.top + rect.height / 2;
        // 按钮左边缘
        const buttonLeft = rect.left;
        
        // 箭头+线的总宽度 (线60px + 箭头10px)
        const arrowTotalWidth = 70;
        // 弹窗和箭头之间的间距
        const gapToArrow = 8;
        
        // 弹窗右边缘位置 = 按钮左边 - 箭头宽度 - 间距
        const modalRightX = buttonLeft - arrowTotalWidth - gapToArrow;
        
        // 弹窗垂直位置 - 与按钮中心对齐，但确保不超出视口
        const modalHeight = 480;
        let modalCenterY = buttonCenterY;
        const minY = modalHeight / 2 + 20;
        const maxY = viewportHeight - modalHeight / 2 - 20;
        modalCenterY = Math.max(minY, Math.min(maxY, modalCenterY));
        
        // 箭头位置 - 箭头尖端靠近按钮
      setArrowPosition({
          top: buttonCenterY,
          left: buttonLeft - 8, // 箭头尖端距离按钮8px
        });
        
        // 弹窗位置 - 使用 right 定位，弹窗右边缘到视口右边的距离
        const modalRightFromViewport = viewportWidth - modalRightX;
        setModalPosition({
          top: `${modalCenterY}px`,
          right: `${modalRightFromViewport}px`,
          transform: 'translateY(-50%)', // 只垂直居中
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
      setTypingRow(row);
      row++;
      if (row >= mockData.length) {
        clearInterval(timer);
      }
    }, 600);

    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', calculatePositions);
    };
  }, [targetRef]);

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
      onTryIt();
    }, 200);
  };

  // 计算高亮区域（表格按钮）
  const [highlightRect, setHighlightRect] = useState(null);
  
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

  return (
    <div className={`tvg-overlay ${visible ? 'tvg-visible' : ''}`}>
      {/* 遮罩层 - 使用 clip-path 留出高亮区域，点击蒙层关闭但下次还会显示 */}
      <div 
        className="tvg-mask"
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
          className={`tvg-highlight ${visible ? 'tvg-highlight-show' : ''}`}
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
        />
      )}
      
      {/* 指向表格按钮的箭头 - 水平方向，从左向右指 */}
      {arrowPosition.left > 0 && (
        <div 
          className={`tvg-pointer ${visible ? 'tvg-pointer-show' : ''}`}
          style={{ 
            top: arrowPosition.top, 
            left: arrowPosition.left,
            transform: 'translate(-100%, -50%)', // 箭头尖端对齐到 left 位置
          }}
        >
          <div className="tvg-pointer-line" />
          <div className="tvg-pointer-arrow" />
        </div>
      )}
      
      <div 
        className="tvg-modal" 
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: modalPosition.top,
          right: modalPosition.right,
          left: 'auto',
          transform: modalPosition.transform,
        }}
      >
        {/* 关闭按钮 - 点击后下次还会显示 */}
        <button className="tvg-close-btn" onClick={handleDismiss}>
          <X size={18} />
        </button>

        {/* 头部 */}
        <div className="tvg-header">
          <div className="tvg-badge">新功能</div>
          <h3>AI 智能表格分析</h3>
          <p>自动提取论文关键信息，多维度对比研究成果</p>
        </div>

        {/* 模拟表格预览 */}
        <div className="tvg-preview">
          <div className="tvg-table-container">
            <table className="tvg-table">
              <thead>
                <tr>
                  <th className="tvg-th-paper">论文</th>
                  <th>研究类型</th>
                  <th>技术/平台</th>
                  <th>使用场景</th>
                  <th>关键发现</th>
                </tr>
              </thead>
              <tbody>
                {mockData.map((paper, index) => (
                  <tr 
                    key={index} 
                    className={`tvg-row ${index <= typingRow ? 'tvg-row-show' : ''}`}
                  >
                    <td className="tvg-td-paper">
                      <div className="tvg-paper-title">{paper.title}</div>
                      <div className="tvg-paper-meta">
                        {paper.authors} · {paper.year} · {paper.citations}引用
                      </div>
                    </td>
                    <td>
                      <span className={`tvg-cell ${index <= typingRow ? 'tvg-cell-show' : ''}`}>
                        {paper.analysis.studyType}
                      </span>
                    </td>
                    <td>
                      <span className={`tvg-cell ${index <= typingRow ? 'tvg-cell-show' : ''}`}>
                        {paper.analysis.technologies}
                      </span>
                    </td>
                    <td>
                      <span className={`tvg-cell ${index <= typingRow ? 'tvg-cell-show' : ''}`}>
                        {paper.analysis.useCases}
                      </span>
                    </td>
                    <td>
                      <span className={`tvg-cell ${index <= typingRow ? 'tvg-cell-show' : ''}`}>
                        {paper.analysis.keyFindings}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* 渐变遮罩 */}
          <div className="tvg-preview-fade" />
        </div>

        {/* 功能亮点 */}
        <div className="tvg-features">
          <div className="tvg-feature">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>AI 自动分析</span>
          </div>
          <div className="tvg-feature">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>多维度对比</span>
          </div>
          <div className="tvg-feature">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>自定义维度</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="tvg-actions">
          <button className="tvg-btn-skip" onClick={handleClose}>
            稍后再说
          </button>
          <button className="tvg-btn-try" onClick={handleTryIt}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            立即体验
          </button>
        </div>
      </div>
    </div>
  );
};

export default TableViewGuide;
