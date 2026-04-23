-- ============================================================================
-- 0016: peer_review_anon_trials 索引
-- device_id 唯一：一台设备一条记录（试用 upsert 依赖）
-- ip_ua_hash 普通索引：兜底识别的 OR 查询
-- claimed_by_user_id 普通索引：用户查自己认领过的试用
-- task_id 普通索引：任务反查试用记录
-- ============================================================================

CALL add_index_if_not_exists(
    'peer_review_anon_trials',
    'uk_device_id',
    '`device_id`',
    TRUE
);

CALL add_index_if_not_exists(
    'peer_review_anon_trials',
    'idx_ip_ua_hash',
    '`ip_ua_hash`',
    FALSE
);

CALL add_index_if_not_exists(
    'peer_review_anon_trials',
    'idx_claimed_by_user_id',
    '`claimed_by_user_id`',
    FALSE
);

CALL add_index_if_not_exists(
    'peer_review_anon_trials',
    'idx_task_id',
    '`task_id`',
    FALSE
);
