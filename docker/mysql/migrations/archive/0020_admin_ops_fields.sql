-- ============================================================================
-- 0020: 管理者运营增强 — 用户冻结 / 公告 / 维护模式
--
-- 1. users 加冻结元数据 + 管理员备注
--    status 字段已支持 1=active / 0=inactive / 2=suspended,
--    这里加 frozen_at / frozen_reason / admin_notes 提供完整上下文。
--
-- 2. announcements 全站公告/Banner/弹窗
--    支持定时上下线 + 多类型(banner/popup/maintenance_note)。
--
-- 3. system_configs 加 maintenance_mode 字段
--    一键开启维护模式,普通用户拒绝访问,管理员可正常登录。
--
-- 全部幂等
-- ============================================================================

-- 1. users 加字段
CALL add_column_if_not_exists('users', 'frozen_at',
  "DATETIME DEFAULT NULL COMMENT '冻结时间 (status=2 时填写)' AFTER `status`");
CALL add_column_if_not_exists('users', 'frozen_reason',
  "VARCHAR(255) DEFAULT '' COMMENT '冻结原因(管理员可见)' AFTER `frozen_at`");
CALL add_column_if_not_exists('users', 'admin_notes',
  "TEXT COMMENT '管理员对该用户的备注(用户不可见,团队协作用)' AFTER `frozen_reason`");

-- 2. announcements 公告表
CREATE TABLE IF NOT EXISTS `announcements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(20) NOT NULL DEFAULT 'banner' COMMENT 'banner=顶部条 / popup=弹窗 / maintenance_note=维护通知',
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL COMMENT '内容,支持 Markdown',
  `link_url` VARCHAR(500) DEFAULT '' COMMENT '可选跳转链接',
  `link_text` VARCHAR(50) DEFAULT '' COMMENT '链接文字',
  `severity` VARCHAR(20) NOT NULL DEFAULT 'info' COMMENT 'info / warning / danger / success',
  `target_audience` VARCHAR(20) NOT NULL DEFAULT 'all' COMMENT 'all=所有人 / logged_in=登录用户 / paid=付费用户',
  `dismissable` TINYINT NOT NULL DEFAULT 1 COMMENT '用户能否关闭 (1=能,0=强制显示)',
  `starts_at` DATETIME COMMENT '开始展示时间(NULL=立即)',
  `ends_at` DATETIME COMMENT '结束时间(NULL=不自动下线)',
  `is_active` TINYINT NOT NULL DEFAULT 1 COMMENT '管理员手动开关,1=启用',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '同时多条时,priority 大的先显示',
  `created_by` BIGINT UNSIGNED COMMENT '创建人 user.id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='全站公告 / Banner / 弹窗';

CALL add_index_if_not_exists('announcements', 'idx_active_time', '`is_active`, `starts_at`, `ends_at`', FALSE);
CALL add_index_if_not_exists('announcements', 'idx_type', '`type`', FALSE);

-- 3. system_configs 加维护模式字段(若不存在)
CALL add_column_if_not_exists('system_configs', 'maintenance_mode',
  "TINYINT NOT NULL DEFAULT 0 COMMENT '1=维护模式开启(普通用户拒绝访问)'");
CALL add_column_if_not_exists('system_configs', 'maintenance_message',
  "VARCHAR(500) DEFAULT '系统维护中,请稍后访问' COMMENT '维护模式展示文案'");
