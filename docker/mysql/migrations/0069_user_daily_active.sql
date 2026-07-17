-- ============================================================================
-- 0069 user_daily_active —— 每日活跃台账(重做「活跃用户」口径)
--
--   背景:原「每日活跃 / MAU」只数 usage_events(仅 9 个埋点功能有数据)→ 漏掉所有
--   非埋点的真实使用。改用一张 append-only 台账:一行 = 某用户某本地日有过任意鉴权请求
--   (「打开即活跃」),由 internal/user RecordActivity(每个登录后请求都会调、已异步 + Redis
--   节流)落行。这样任何登录后的真实请求都计入,不再漏,且可重建历史每日序列。
--
--   读取口径(见 internal/user/metrics.go):
--     · COUNT(DISTINCT user_id) 按天/窗口去重;JOIN users 排除 admin/super_admin;
--     · active_date > DATE(users.created_at) —— 注册当天不算当天活跃(保证活跃真实性)。
--
--   时区:active_date 由 Go 侧 time.Now() 的本地(北京)日写入,不用 CURDATE() 以免 MySQL
--   会话时区歧义(见 time-handling-no-utc 约定)。
--
--   回填:用 usage_events(有历史)播种,保证上线首日折线不空。注意——回填只有埋点历史,
--   故历史天仍是 engaged 口径,上线后新数据才是完整「打开即活跃」,存在一个可接受的接续点。
--
--   幂等:CREATE TABLE IF NOT EXISTS + INSERT IGNORE(PK 天然去重)。永不 DROP。中文 utf8mb4。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `user_daily_active` (
  `user_id`     BIGINT UNSIGNED NOT NULL                              COMMENT '活跃用户',
  `active_date` DATE            NOT NULL                              COMMENT '本地(北京)活跃日;Go 侧 time.Now() 本地日写入',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP    COMMENT '首次记录该(用户,日)的时刻',
  PRIMARY KEY (`user_id`, `active_date`),
  KEY `idx_uda_date` (`active_date`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='每日活跃台账:一行=某用户某本地日有过鉴权请求;COUNT(DISTINCT user_id) 去重出 DAU/MAU';

-- 历史回填(幂等,bounded 365d):用埋点事件播种,保证上线首日折线不空。
--   ⚠️ run-migrations.sh 每次启动无条件重放所有文件,故加 `NOT EXISTS(...)` 守卫:台账一旦有行
--   就整条短路(MySQL 先算这个 uncorrelated 子查询 → Impossible WHERE → 不扫 usage_events),
--   避免每次部署都对一年的事件重跑 GROUP BY 聚合(纯浪费:首轮之后 RecordActivity 已实时落行,
--   回填零净增)。首装(台账空)才真正播种;之后由实时链路接管。
INSERT IGNORE INTO `user_daily_active` (`user_id`, `active_date`, `created_at`)
SELECT ue.user_id, DATE(ue.created_at) AS active_date, MIN(ue.created_at) AS created_at
FROM `usage_events` ue
WHERE ue.user_id IS NOT NULL
  AND ue.created_at >= (NOW() - INTERVAL 365 DAY)
  AND NOT EXISTS (SELECT 1 FROM `user_daily_active`)
GROUP BY ue.user_id, DATE(ue.created_at);
