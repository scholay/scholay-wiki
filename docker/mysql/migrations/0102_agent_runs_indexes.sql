-- ============================================================================
-- 0102 · agent_runs 索引(2026-08 科研内核 Phase 1)。
-- 幂等:CALL add_index_if_not_exists(见 0000_utils.sql)。
--
-- 🔴 刻意**不建**任何 UNIQUE 索引。
--    本仓库在 0.0.66 发布事故上栽过一次:老迁移重建 uk_owner 撞上了后来产生的多会话数据
--    ([[migration-replay-uniq-trap]])。Run 的并发约束("全局活跃 ≤N、per-user ≤1")
--    是**调度期判据**,不是数据完整性约束 —— 用唯一索引去表达它,
--    会在「用户取消后立刻重开」「Run 失败后重试」这类完全合法的时序上炸,
--    而且是插入期硬失败、无法降级。判据放在 engine 的认领逻辑里,那里能优雅地"不认领"。
-- ============================================================================

-- 调度器扫「还能推进的 Run」:status 在前(基数低、区分度高),user_id 在后供 per-user 闸复用。
CALL add_index_if_not_exists('agent_runs', 'idx_status_user',   '`status`, `user_id`',        FALSE);
-- 用户维度列表(我的 Run):按用户取,最近优先。
CALL add_index_if_not_exists('agent_runs', 'idx_user_created',  '`user_id`, `created_at`',    FALSE);
-- 会话反查:一个 agent 会话上有没有在跑的 Run(前端进会话时要显示进度卡)。
CALL add_index_if_not_exists('agent_runs', 'idx_session',       '`agent_session_id`',         FALSE);
