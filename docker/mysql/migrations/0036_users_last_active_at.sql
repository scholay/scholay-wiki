-- ============================================================================
-- 0036 · users.last_active_at —— 用户「最后活跃时间」(真实使用时间)。
--
-- 背景: last_login_at 只在「登录动作」触发(UpdateLastLoginWithIP), JWT 长 TTL 下
-- 用户保持登录态持续使用时它**永不更新**, 后台看到的「最后登录」不反映实际最后使用。
-- 新增 last_active_at: 每次通过鉴权的 user 请求异步节流更新(≤ 每用户每 5min 一次),
-- 反映真实最后使用时间。last_login_at(+ last_login_ip)保留作「最后一次登录事件」语义。
--
-- 幂等: add_column_if_not_exists + add_index_if_not_exists。绝不 DROP。
-- ============================================================================

CALL add_column_if_not_exists('users', 'last_active_at', 'DATETIME NULL DEFAULT NULL');
CALL add_index_if_not_exists('users', 'idx_last_active_at', '`last_active_at`', FALSE);
