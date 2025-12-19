/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AnalysisCellText - 分析结果文本组件
 * 检测是否被截断，只有截断时才显示 hover 气泡
 */

import React, { useState, useEffect, useRef, memo } from 'react';

const AnalysisCellText = memo(({ text }) => {
  const textRef = useRef(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const checkTruncation = () => {
      const el = textRef.current;
      if (el) {
        // 检查是否被截断：scrollHeight > clientHeight 或 scrollWidth > clientWidth
        const truncated = el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
        setIsTruncated(truncated);
      }
    };
    
    checkTruncation();
    // 延迟再检查一次，确保渲染完成
    const timer = setTimeout(checkTruncation, 100);
    window.addEventListener('resize', checkTruncation);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkTruncation);
    };
  }, [text]);

  return (
    <div className="analysis-cell-text-wrapper">
      <p 
        ref={textRef}
        className={`analysis-cell-text ${isTruncated ? 'truncated' : ''}`}
        onMouseEnter={() => isTruncated && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {text}
      </p>
      {isTruncated && showTooltip && (
        <div className="analysis-cell-tooltip">
          {text}
        </div>
      )}
    </div>
  );
});

AnalysisCellText.displayName = 'AnalysisCellText';

export default AnalysisCellText;

