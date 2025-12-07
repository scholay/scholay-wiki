/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useMemo } from 'react';
import './ReviewRadarChart.css';

// 评分维度配置
const DIMENSIONS = [
  { key: 'originality', label: '原创性', labelEn: 'Originality' },
  { key: 'methodology', label: '方法论', labelEn: 'Methodology' },
  { key: 'clarity', label: '清晰度', labelEn: 'Clarity' },
  { key: 'significance', label: '重要性', labelEn: 'Significance' },
  { key: 'reproducibility', label: '可复现', labelEn: 'Reproducibility' },
];

// 从文本中智能提取评分 (0-100)
const extractScoreFromText = (text) => {
  if (!text || typeof text !== 'string') return 50; // 默认中等分数
  
  const lowerText = text.toLowerCase();
  
  // 高分关键词
  const highKeywords = [
    'excellent', 'outstanding', 'exceptional', 'superior', 'remarkable',
    '优秀', '出色', '卓越', '非常好', '极好', '突出', '显著', '很强', '高度'
  ];
  
  // 中高分关键词
  const mediumHighKeywords = [
    'good', 'solid', 'well', 'clear', 'strong', 'sufficient',
    '好', '良好', '较好', '清晰', '充分', '合理', '恰当'
  ];
  
  // 中等关键词
  const mediumKeywords = [
    'adequate', 'acceptable', 'moderate', 'average', 'reasonable',
    '一般', '中等', '适当', '可以', '基本'
  ];
  
  // 低分关键词
  const lowKeywords = [
    'weak', 'poor', 'insufficient', 'lacking', 'limited', 'unclear', 'missing',
    '不足', '欠缺', '薄弱', '不清', '缺乏', '有限', '不够', '较弱', '差'
  ];
  
  // 计算各类关键词出现次数
  let highCount = 0, mediumHighCount = 0, mediumCount = 0, lowCount = 0;
  
  highKeywords.forEach(kw => {
    if (lowerText.includes(kw)) highCount++;
  });
  mediumHighKeywords.forEach(kw => {
    if (lowerText.includes(kw)) mediumHighCount++;
  });
  mediumKeywords.forEach(kw => {
    if (lowerText.includes(kw)) mediumCount++;
  });
  lowKeywords.forEach(kw => {
    if (lowerText.includes(kw)) lowCount++;
  });
  
  // 根据关键词权重计算分数
  const totalWeight = highCount * 3 + mediumHighCount * 2 + mediumCount * 1 - lowCount * 2;
  
  if (totalWeight >= 3) return 85;
  if (totalWeight >= 2) return 75;
  if (totalWeight >= 1) return 65;
  if (totalWeight >= 0) return 55;
  if (totalWeight >= -1) return 45;
  return 35;
};

// 从 extended_review_items 提取各维度评分
const extractScores = (extendedItems, dimensionScores) => {
  // 如果有后端提供的评分，直接使用
  if (dimensionScores) {
    try {
      const scores = typeof dimensionScores === 'string' 
        ? JSON.parse(dimensionScores) 
        : dimensionScores;
      
      if (scores.originality || scores.methodology || scores.clarity || scores.significance) {
        return {
          originality: scores.originality || 50,
          methodology: scores.methodology || 50,
          clarity: scores.clarity || 50,
          significance: scores.significance || 50,
          reproducibility: scores.reproducibility || 50,
        };
      }
    } catch (e) {
      // 解析失败，继续使用文本提取
    }
  }
  
  // 从文本中提取评分
  if (!extendedItems) {
    return {
      originality: 50,
      methodology: 50,
      clarity: 50,
      significance: 50,
      reproducibility: 50,
    };
  }
  
  return {
    originality: extractScoreFromText(extendedItems.novelty_evaluation),
    methodology: extractScoreFromText(extendedItems.technical_soundness),
    clarity: extractScoreFromText(extendedItems.clarity_and_presentation),
    significance: extractScoreFromText(extendedItems.impact_and_significance),
    reproducibility: extractScoreFromText(
      typeof extendedItems.reproducibility === 'object'
        ? `${extendedItems.reproducibility.data_availability || ''} ${extendedItems.reproducibility.code_availability || ''}`
        : extendedItems.reproducibility || ''
    ),
  };
};

// 生成雷达图路径
const generateRadarPath = (scores, centerX, centerY, radius) => {
  const points = DIMENSIONS.map((dim, index) => {
    const angle = (Math.PI * 2 * index) / DIMENSIONS.length - Math.PI / 2;
    const value = scores[dim.key] / 100;
    const x = centerX + radius * value * Math.cos(angle);
    const y = centerY + radius * value * Math.sin(angle);
    return `${x},${y}`;
  });
  return `M ${points.join(' L ')} Z`;
};

// 生成网格线路径
const generateGridPath = (level, centerX, centerY, radius) => {
  const points = DIMENSIONS.map((_, index) => {
    const angle = (Math.PI * 2 * index) / DIMENSIONS.length - Math.PI / 2;
    const x = centerX + radius * level * Math.cos(angle);
    const y = centerY + radius * level * Math.sin(angle);
    return `${x},${y}`;
  });
  return `M ${points.join(' L ')} Z`;
};

export default function ReviewRadarChart({ extendedItems, dimensionScores, compact = false }) {
  const scores = useMemo(
    () => extractScores(extendedItems, dimensionScores),
    [extendedItems, dimensionScores]
  );
  
  const size = compact ? 180 : 240;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = (size / 2) - (compact ? 30 : 40);
  
  // 计算平均分
  const avgScore = Math.round(
    Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
  );
  
  // 获取评分等级
  const getScoreLevel = (score) => {
    if (score >= 75) return 'high';
    if (score >= 55) return 'medium';
    return 'low';
  };

  return (
    <div className={`review-radar ${compact ? 'review-radar-compact' : ''}`}>
      <div className="review-radar-chart">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* 背景网格 */}
          <g className="radar-grid">
            {[0.25, 0.5, 0.75, 1].map((level, idx) => (
              <path
                key={idx}
                d={generateGridPath(level, centerX, centerY, radius)}
                className="radar-grid-line"
              />
            ))}
            {/* 轴线 */}
            {DIMENSIONS.map((_, index) => {
              const angle = (Math.PI * 2 * index) / DIMENSIONS.length - Math.PI / 2;
              const x = centerX + radius * Math.cos(angle);
              const y = centerY + radius * Math.sin(angle);
              return (
                <line
                  key={index}
                  x1={centerX}
                  y1={centerY}
                  x2={x}
                  y2={y}
                  className="radar-axis"
                />
              );
            })}
          </g>
          
          {/* 数据区域 */}
          <path
            d={generateRadarPath(scores, centerX, centerY, radius)}
            className={`radar-area radar-area-${getScoreLevel(avgScore)}`}
          />
          
          {/* 数据点 */}
          {DIMENSIONS.map((dim, index) => {
            const angle = (Math.PI * 2 * index) / DIMENSIONS.length - Math.PI / 2;
            const value = scores[dim.key] / 100;
            const x = centerX + radius * value * Math.cos(angle);
            const y = centerY + radius * value * Math.sin(angle);
            return (
              <circle
                key={dim.key}
                cx={x}
                cy={y}
                r={compact ? 3 : 4}
                className={`radar-point radar-point-${getScoreLevel(scores[dim.key])}`}
              />
            );
          })}
          
          {/* 标签 */}
          {DIMENSIONS.map((dim, index) => {
            const angle = (Math.PI * 2 * index) / DIMENSIONS.length - Math.PI / 2;
            const labelRadius = radius + (compact ? 18 : 25);
            const x = centerX + labelRadius * Math.cos(angle);
            const y = centerY + labelRadius * Math.sin(angle);
            
            // 根据位置调整文字锚点
            let textAnchor = 'middle';
            if (Math.cos(angle) > 0.3) textAnchor = 'start';
            else if (Math.cos(angle) < -0.3) textAnchor = 'end';
            
            return (
              <text
                key={dim.key}
                x={x}
                y={y}
                textAnchor={textAnchor}
                className="radar-label"
                dominantBaseline="middle"
              >
                {dim.label}
              </text>
            );
          })}
        </svg>
      </div>
      
      {/* 分数列表 */}
      {!compact && (
        <div className="review-radar-scores">
          {DIMENSIONS.map((dim) => (
            <div key={dim.key} className="radar-score-item">
              <span className="radar-score-label">{dim.label}</span>
              <div className="radar-score-bar">
                <div 
                  className={`radar-score-fill radar-score-${getScoreLevel(scores[dim.key])}`}
                  style={{ width: `${scores[dim.key]}%` }}
                />
              </div>
              <span className={`radar-score-value radar-score-${getScoreLevel(scores[dim.key])}`}>
                {scores[dim.key]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 导出工具函数供其他组件使用
export { extractScores, extractScoreFromText, DIMENSIONS };


