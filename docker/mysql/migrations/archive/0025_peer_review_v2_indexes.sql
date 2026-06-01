-- ============================================================================
-- 0025: peer_review v2 索引
--
-- pr2_conversations:
--   uk_pr2_remote_conversation_id —— 远端 id 唯一,防并发重复落库
--   idx_pr2_user_id              —— 登录用户列表
--   idx_pr2_anon_token           —— 匿名列表 / 认领
--   idx_pr2_device_id            —— 调试用
--   idx_pr2_client_request_id    —— 本地幂等查找
--   idx_pr2_status               —— 列表过滤 archived
--
-- pr2_anon_trials:
--   uk_pr2_trial_device_day —— 同设备同天唯一(限制 1 次/天)
--   idx_pr2_trial_ip_ua    —— IP+UA 兜底识别
--   idx_pr2_trial_claimed  —— 登录后批量认领
-- ============================================================================

CALL add_index_if_not_exists('pr2_conversations', 'uk_pr2_remote_conversation_id', '`remote_conversation_id`', TRUE);
CALL add_index_if_not_exists('pr2_conversations', 'idx_pr2_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('pr2_conversations', 'idx_pr2_anon_token', '`anon_token`', FALSE);
CALL add_index_if_not_exists('pr2_conversations', 'idx_pr2_device_id', '`device_id`', FALSE);
CALL add_index_if_not_exists('pr2_conversations', 'idx_pr2_client_request_id', '`client_request_id`', FALSE);
CALL add_index_if_not_exists('pr2_conversations', 'idx_pr2_status', '`status`', FALSE);

CALL add_index_if_not_exists('pr2_anon_trials', 'uk_pr2_trial_device_day', '`device_id`, `trial_day`', TRUE);
CALL add_index_if_not_exists('pr2_anon_trials', 'idx_pr2_trial_ip_ua', '`ip_ua_hash`, `trial_day`', FALSE);
CALL add_index_if_not_exists('pr2_anon_trials', 'idx_pr2_trial_claimed', '`claimed_by_user_id`', FALSE);
