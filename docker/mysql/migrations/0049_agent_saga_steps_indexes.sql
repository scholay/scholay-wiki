-- ============================================================================
-- 0049 · agent_saga_steps 索引(P5 消费)
-- 幂等:CALL add_index_if_not_exists(见 0000_utils.sql)。
-- ============================================================================

-- 每 (saga, step) 唯一 = exactly-one-row-per-round 硬守卫(取代应用层"已存在就跳")。
CALL add_index_if_not_exists('agent_saga_steps', 'uk_saga_step',     '`saga_id`, `step_key`',     TRUE);
-- 按 saga 取全步进度(resume / 流式投影 / status 派生)。
CALL add_index_if_not_exists('agent_saga_steps', 'idx_saga_status',  '`saga_id`, `status`',       FALSE);
-- reconciler 扫过期租约 + 待认领步。
CALL add_index_if_not_exists('agent_saga_steps', 'idx_status_lease', '`status`, `lease_until`',   FALSE);
