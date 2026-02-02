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

  // 检测是否为"未提及"或"解析失败"等特殊状态
  const isNotMentioned = text === '未提及' || text === '未提及。';
  const isParseFailed = text === '解析失败';
  const isEmptyOrDash = !text || text === '-' || text.trim() === '';

  useEffect(() => {
    // 特殊状态不需要检测截断
    if (isNotMentioned || isParseFailed || isEmptyOrDash) {
      setIsTruncated(false);
      return;
    }

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
  }, [text, isNotMentioned, isParseFailed, isEmptyOrDash]);

  // 特殊状态：解析失败
  if (isParseFailed) {
    return (
      <span 
        className="analysis-cell-parse-failed"
        title="AI分析时JSON解析失败，可能是响应格式异常"
      >
        解析失败
      </span>
    );
  }

  // 特殊状态：未提及
  if (isNotMentioned) {
    return (
      <span 
        className="analysis-cell-not-mentioned"
        title="论文摘要中未提供此维度的相关信息"
      >
        未提及
      </span>
    );
  }

  // 特殊状态：空值
  if (isEmptyOrDash) {
    return (
      <span 
        className="analysis-cell-empty"
        title="该维度暂无分析结果"
      >
        -
      </span>
    );
  }

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

