/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * apiClient - Re-exports from the single source of truth (api.js).
 * Previously this file had its own duplicate axios instances and interceptors.
 * Now consolidated to avoid drift between two interceptor configurations.
 */

import api, { publicApi, isInAuthWhitelist } from './api';

export { api, publicApi, isInAuthWhitelist };
export default api;

