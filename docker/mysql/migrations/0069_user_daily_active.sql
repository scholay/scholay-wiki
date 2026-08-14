-- ============================================================================
-- 0069 user_daily_active —— 每日活跃台账(重做「活跃用户」口径)
--
--   背景:原「每日活跃 / MAU」只数 usage_events(仅 9 个埋点功能有数据)→ 漏掉所有
--   非埋点的真实使用。改用一张 append-only 台账:口径切换后的每一行 =
--   某用户某本地日产生过显式真人交互事件。由 internal/user RecordActivity 与
--   last_active_at 同源同步落行;
--   普通鉴权请求、轮询、WS 心跳/重连不计入,避免挂机伪造 DAU/MAU。
--
--   口径切换边界:该表是 append-only,显式事件链路部署前的存量行已包含旧的
--   「任意鉴权请求」口径,其中可能有轮询/重连等被动流量。存量行无法可靠分类,
--   因此刻意保留、不删表/清库;切换后增量才是「明确交互活跃」,历史窗口随时间滚动收敛。
--
--   读取口径(见 internal/user/metrics.go):
--     · COUNT(DISTINCT user_id) 按天/窗口去重;JOIN users 排除 admin/super_admin;
--     · active_date > DATE(users.created_at) —— 注册当天不算当天活跃(保证活跃真实性)。
--
--   时区:active_date 由 Go 侧 time.Now() 的本地(北京)日写入,不用 CURDATE() 以免 MySQL
--   会话时区歧义(见 time-handling-no-utc 约定)。
--
--   最初回填:用 usage_events(有历史)播种,保证首日折线不空。回填天是 engaged 口径;
--   回填后到本次切换前的实时行是 generic/passive 口径;切换后增量才是明确交互口径。
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
  COMMENT='每日活跃台账:切换前保留旧口径存量+切换后明确交互增量;COUNT(DISTINCT user_id) 去重';

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
