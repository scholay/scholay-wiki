/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

/**
 * 从审稿报告内容中提取 JSON 数据
 * 处理 markdown 代码块包裹和各种边界情况
 */
export const parseReviewJSON = (content) => {
  if (!content || typeof content !== 'string') return null;
  
  try {
    let text = content.trim();
    
    // 移除 markdown 代码块标记
    if (text.startsWith('```json')) {
      text = text.slice(7);
    } else if (text.startsWith('```')) {
      text = text.slice(3);
    }
    if (text.endsWith('```')) {
      text = text.slice(0, -3);
    }
    text = text.trim();
    
    // 找到 JSON 对象边界
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonStr = text.slice(startIdx, endIdx + 1);
      return JSON.parse(jsonStr);
    }
    
    return null;
  } catch (e) {
    console.warn('Failed to parse review JSON:', e);
    return null;
  }
};

/**
 * 获取推荐意见的样式类名
 */
export const getRecommendationClass = (recommendation) => {
  if (!recommendation) return '';
  const lower = recommendation.toLowerCase().replace(/\s+/g, '-');
  if (lower.includes('accept') && !lower.includes('revision')) return 'accept';
  if (lower.includes('minor')) return 'minor-revision';
  if (lower.includes('major')) return 'major-revision';
  if (lower.includes('reject')) return 'reject';
  return lower;
};

/**
 * 获取置信度标签
 */
export const getConfidenceLabel = (confidence) => {
  if (!confidence) return null;
  const lower = confidence.toLowerCase();
  if (lower.includes('high') || lower.includes('高')) return { label: '高置信度', level: 'high' };
  if (lower.includes('medium') || lower.includes('中')) return { label: '中置信度', level: 'medium' };
  if (lower.includes('low') || lower.includes('低')) return { label: '低置信度', level: 'low' };
  return { label: confidence, level: 'medium' };
};
