-- ============================================================================
-- 0012: 热点查询补充复合索引
-- 针对实际代码中观察到的高频查询路径，补充覆盖度更高的复合索引。
-- 全部使用 add_index_if_not_exists 保证幂等。
-- ============================================================================

-- peer_review_tasks 列表查询：WHERE user_id = ? AND status = ? ORDER BY created_at DESC
-- 现有 idx_user_status / idx_user_created 仅能命中其中一个分支，新增三列复合索引消除二次回表排序。
CALL add_index_if_not_exists(
    'peer_review_tasks',
    'idx_user_status_created',
    '`user_id`, `status`, `created_at` DESC',
    FALSE
);

-- usage_logs 用户活动时间线查询：WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC
-- 单列 idx_user_id 在大表下扫描成本高；新增 (user_id, created_at) 复合索引覆盖时间范围过滤。
CALL add_index_if_not_exists(
    'usage_logs',
    'idx_user_created',
    '`user_id`, `created_at` DESC',
    FALSE
);

-- usage_logs 功能分析查询：WHERE feature_code = ? AND action = ? AND created_at >= ?
-- 与现有 idx_feature_created 互补：当 action 出现在 WHERE 中时此索引选择性更好。
CALL add_index_if_not_exists(
    'usage_logs',
    'idx_feature_action_created',
    '`feature_code`, `action`, `created_at`',
    FALSE
);

-- messages 调度查询：WHERE status = ? AND send_at <= NOW() ORDER BY send_at
-- 现有 idx_status / idx_send_at 单列索引无法在调度 worker 中有效复用。
CALL add_index_if_not_exists(
    'messages',
    'idx_status_send_at',
    '`status`, `send_at`',
    FALSE
);

-- payment_transactions 回调查询：WHERE transaction_no = ? — 频次高，需要回查订单
-- 现有 idx_transaction_no 已存在但非唯一；增加 (transaction_no, order_id) 复合便于覆盖查询。
CALL add_index_if_not_exists(
    'payment_transactions',
    'idx_txn_no_order',
    '`transaction_no`, `order_id`',
    FALSE
);

-- conversations 用户会话筛选：WHERE user_id = ? AND conversation_type = ? ORDER BY updated_at DESC
-- 已有 idx_user_type_updated，仅作存在性检查（保持显式声明）
CALL add_index_if_not_exists(
    'conversations',
    'idx_user_type_updated',
    '`user_id`, `conversation_type`, `updated_at` DESC',
    FALSE
);

-- user_coupons 可用券查询：WHERE user_id = ? AND status = ? AND valid_until >= NOW()
-- 现有 idx_user_status / idx_valid_time 各覆盖一段；新增 (user_id, status, valid_until) 命中过滤+过期判断。
CALL add_index_if_not_exists(
    'user_coupons',
    'idx_user_status_valid',
    '`user_id`, `status`, `valid_until`',
    FALSE
);
