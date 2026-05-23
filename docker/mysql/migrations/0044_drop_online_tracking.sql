-- ============================================================================
-- 0044: 下线"在线用户/访客/会话"统计 (与早期 user_sessions/snapshots 互逆)
--
-- 背景:
--   早期为 admin 看板提供 DAU/WAU/MAU、在线人数、付费漏斗,自己写了三张表:
--     user_sessions        — 每次登录写一行,定期 ping 刷新 last_activity
--     user_statistics      — 每日聚合 (新增/总数/峰值在线)
--     online_user_snapshots— 每 5 分钟快照在线/访客数
--   维护成本不小 (CASCADE 外键、cleanup 定时任务、JWT session 校验中间件、
--   WebSocket Hub 写库回调...),最终决定移交给 umami (前端 SDK 直接埋点)。
--
--   ENFORCE_SINGLE_SESSION 这个产品开关 (新登录踢旧设备) 一起下线 —— 它
--   的实现依赖 user_sessions 表,改用 JWT 自身签名 + TTL 兜底。
--
-- 删除内容:
--   user_sessions           — 会话登录记录
--   user_statistics         — 每日聚合
--   online_user_snapshots   — 在线快照
--
-- 幂等: DROP TABLE IF EXISTS,重放安全。
--
-- 注意: 表之间没有跨表外键(只有指向 users 的 CASCADE),所以删除顺序无关。
-- ============================================================================

DROP TABLE IF EXISTS `online_user_snapshots`;
DROP TABLE IF EXISTS `user_statistics`;
DROP TABLE IF EXISTS `user_sessions`;
