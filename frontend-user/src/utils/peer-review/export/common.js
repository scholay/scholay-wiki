/**
 * 导出工具 - 公共模块
 */

// 品牌信息
export const BRAND = {
  name: 'Scholay',
  slogan: '科研者的瑞士军刀',
  disclaimer: '免责声明：本报告由AI生成，建议仅供参考，不构成最终学术评价意见。',
  watermark: 'scholay.com',
  website: 'scholar.ai',
};

// 审稿人名称映射
export const REVIEWER_NAMES = {
  1: { name: '审稿人 Alpha', short: 'α', label: 'Alpha' },
  2: { name: '审稿人 Beta', short: 'β', label: 'Beta' },
  3: { name: '审稿人 Gamma', short: 'γ', label: 'Gamma' },
};

// 获取审稿人信息
export const getReviewerInfo = (reviewerIndex) => {
  return REVIEWER_NAMES[reviewerIndex] || {
    name: `审稿人 ${reviewerIndex}`,
    short: String(reviewerIndex),
    label: String(reviewerIndex)
  };
};

// 获取推荐意见的中文名称
export const getRecommendationText = (recommendation) => {
  if (!recommendation) return '待定';
  const lower = recommendation.toLowerCase();
  if (lower.includes('accept')) return '接受';
  if (lower.includes('minor')) return '小修';
  if (lower.includes('major')) return '大修';
  if (lower.includes('reject')) return '拒稿';
  return recommendation;
};

// 格式化日期
export const formatDate = (dateStr) => {
  if (!dateStr) return new Date().toLocaleDateString('zh-CN');
  return new Date(dateStr).toLocaleDateString('zh-CN');
};

// 格式化可复现性内容（处理对象格式）
export const formatReproducibility = (reproducibility) => {
  if (!reproducibility) return '';
  if (typeof reproducibility === 'string') return reproducibility;

  const parts = [];
  if (reproducibility.data_availability) {
    parts.push(`数据可用性：${reproducibility.data_availability}`);
  }
  if (reproducibility.code_availability) {
    parts.push(`代码可用性：${reproducibility.code_availability}`);
  }
  return parts.join('\n');
};

// 格式化扩展评审项内容
export const formatExtendedItem = (item) => {
  if (!item) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    // 特殊处理可复现性
    if (item.data_availability || item.code_availability) {
      return formatReproducibility(item);
    }
    // 其他对象类型
    return Object.entries(item)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }
  return String(item);
};

// 解析单个审稿人的报告
export const parseReviewerReport = (content) => {
  if (!content) return null;
  try {
    // 尝试提取 JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    // 直接解析
    if (content.trim().startsWith('{')) {
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn('Failed to parse reviewer report:', e);
  }
  return null;
};
