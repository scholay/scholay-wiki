-- ============================================================================
-- 0047 · agent_turns / agent_billing_ledger 索引
-- 注: agent_turn_events 的 PK/uk/idx 已随 0046 建表内联(分区表唯一键须含分区列,
--     不能事后 add_index_if_not_exists 再补)。本文件只补非分区表索引。
-- 幂等:CALL add_index_if_not_exists(见 0000_utils.sql)。
-- ============================================================================

-- exactly-once 幂等(同会话同 client_turn_id 只一行)。BeginTurn 必须给真 UUID,绝不留 ''。
CALL add_index_if_not_exists('agent_turns', 'uk_session_client_turn', '`agent_session_id`, `client_turn_id`', TRUE);
-- per-session 轮号单调唯一(回放/分页排序键)。
CALL add_index_if_not_exists('agent_turns', 'uk_session_seq',         '`agent_session_id`, `seq`',            TRUE);
-- 在途轮定位(P1: WHERE agent_session_id=? AND status='running')。
CALL add_index_if_not_exists('agent_turns', 'idx_session_status',     '`agent_session_id`, `status`',         FALSE);
-- P3 reconciler 扫过期租约(P0/P1 不启用该扫描)。
CALL add_index_if_not_exists('agent_turns', 'idx_status_lease',       '`status`, `lease_until`',              FALSE);
-- admin 监控/审计按用户时间窗。
CALL add_index_if_not_exists('agent_turns', 'idx_user_created',       '`user_id`, `created_at`',              FALSE);

-- 计费对账报告(SUM by user / session)。
CALL add_index_if_not_exists('agent_billing_ledger', 'idx_user_recorded',    '`user_id`, `recorded_at`',          FALSE);
CALL add_index_if_not_exists('agent_billing_ledger', 'idx_session_recorded', '`agent_session_id`, `recorded_at`', FALSE);
