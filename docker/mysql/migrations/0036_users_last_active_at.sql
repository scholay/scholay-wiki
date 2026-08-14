-- ============================================================================
-- 0036 · users.last_active_at —— 用户「最后活跃时间」(真实使用时间)。
--
-- 背景: last_login_at 只在「登录动作」触发(UpdateLastLoginWithIP), JWT 长 TTL 下
-- 用户保持登录态持续使用时它**永不更新**, 后台看到的「最后登录」不反映实际最后使用。
-- 新增 last_active_at:只由已鉴权 POST /user/activity 的显式真人交互事件更新;
-- 通用鉴权请求、轮询、WS 心跳/重连不计活跃。DB 原子条件限制为约每用户每分钟
-- 最多一次写入,且不允许时间倒退。last_login_at(+ last_login_ip)保留「最后一次登录事件」语义。
--
-- 口径切换边界:显式事件链路部署前,last_active_at 曾由「任意鉴权请求」写入,
-- 因此存量值可能含轮询/重连等被动流量。两种来源无法无损区分,故不清空、不伪造
-- 历史;切换后增量才是真人交互口径,用户下一次真实交互会覆盖旧值,整体随时间自然收敛。
--
-- 幂等: add_column_if_not_exists + add_index_if_not_exists。绝不 DROP。
-- ============================================================================

CALL add_column_if_not_exists('users', 'last_active_at', 'DATETIME NULL DEFAULT NULL');
CALL add_index_if_not_exists('users', 'idx_last_active_at', '`last_active_at`', FALSE);
