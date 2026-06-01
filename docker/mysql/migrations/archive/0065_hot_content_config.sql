-- ============================================================================
-- 0065 热门内容清理策略配置 —— 把硬编码的保留天数 / 最大记录数 搬到 DB 单行表,
-- admin 后台可配置, 改了立刻生效 (cleanup 任务每天 04:30 跑时读取这张表)。
--
-- 默认值跟下线前的硬编码常量一致, 不改动现有行为:
--   retention_days = 180  (HotContentRetentionDays)
--   max_records    = 100000 (HotContentMaxRecords)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `hot_content_config` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '单行表, 永远只有 id=1 这一行',
  `retention_days` INT UNSIGNED NOT NULL DEFAULT 180
    COMMENT '热门内容保留天数; last_*_at 早于此天数的行会被定时任务删除',
  `max_records` INT UNSIGNED NOT NULL DEFAULT 100000
    COMMENT '单表最大记录数; 超出时按 last_*_at 最旧顺序继续删到此值',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='热门内容清理策略配置(单行表 id=1)';

-- 种子默认行(只在首次创建时插, 不覆盖已有配置)
INSERT IGNORE INTO `hot_content_config` (`id`, `retention_days`, `max_records`)
VALUES (1, 180, 100000);
