/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Services 统一导出
 */

// 导出 API 客户端
export { api, publicApi, isInAuthWhitelist } from './apiClient';

// 从原 api.js 导出所有 API 模块（保持向后兼容）
export {
  userAPI,
  conversationAPI,
  scholarAPI,
  publicScholarAPI,
  analysisDimensionAPI,
  configAPI,
  peerReviewAPI,
} from './api';

// 默认导出主 API 客户端
export { default } from './api';

