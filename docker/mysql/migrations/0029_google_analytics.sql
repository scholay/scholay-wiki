-- ============================================================================
-- 0029 Google Analytics(GA4)接入
--   system_configs 增加 google_analytics_id —— GA4 衡量 ID(形如 G-XXXXXXXXXX)。
--   非机密(本就嵌进页面),由 admin 在「系统设置」填;前端 index.html 据此动态加载 gtag.js。
--   空 = 不接入(前端不注入脚本)。
-- ============================================================================

CALL add_column_if_not_exists('system_configs', 'google_analytics_id', "varchar(40) NOT NULL DEFAULT '' COMMENT 'GA4 衡量 ID(G-XXXX);空=不接入'");
