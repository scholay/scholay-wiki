-- ============================================================================
-- 0104: user_quota_windows 索引
--
-- idx_anchor 只服务 cleanup 的保留期清扫(按 anchor_at 批量删旧窗口)。
-- 「取某用户当前窗口」不需要额外索引 —— 主键 (user_id, anchor_at) 逆序取一行即可:
--     WHERE user_id=? ORDER BY anchor_at DESC LIMIT 1
-- ============================================================================

CALL add_index_if_not_exists('user_quota_windows', 'idx_quota_window_anchor', '`anchor_at`', FALSE);

-- ── 外键 ON DELETE CASCADE ──────────────────────────────────────────────────
--
-- 🔴 不是洁癖,是防一条**永久假警报**。用户是**硬删**的(user/repository.go 的
-- `tx.Delete(&User{}, userID)`),没有外键的话注销账号会留下孤儿窗口行;而漂移对账任务
-- (cleanup,每 15 分钟)会把「DB 说在飞、Redis 无锚」当成事故一直报下去 —— 报的是一个
-- 已经不存在的用户。一条恒亮的告警等于没有告警,而这条告警守的恰恰是「MySQL 兜底副本
-- 没写进去」这件只在 Redis 丢数据那天才致命的事,不能让它被孤儿行淹掉。
-- 本仓库同类表(user_auth_providers / user_sessions / …)都是这个约定。
--
-- ⚠️ 加外键前必须先清孤儿:MySQL 对存量违反约束的行会直接让 ADD CONSTRAINT 失败,
-- 而本迁移每次启动都重放 —— 一次失败就是每次启动都失败。DELETE 本身幂等。
DELETE w FROM user_quota_windows w
  LEFT JOIN users u ON u.id = w.user_id
  WHERE u.id IS NULL;

CALL add_foreign_key_if_not_exists('user_quota_windows', 'fk_quota_window_user',
  'FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE');
