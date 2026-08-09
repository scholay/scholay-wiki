-- ============================================================================
-- 0120: 代码片段显式加载时机
--
-- head/body_start/body_end 是语义契约，默认必须尽快注入；只有管理员
-- 明确标记的广告/分析片段才允许延到 window load 后的空闲期。
-- 当前线上 google_adsense_script 已只读确认为 pagead 网络脚本，仅在
-- 首次加列时将它设为延迟；以后重放迁移绝不覆盖管理员选择。
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_0120_code_snippet_timing;
DELIMITER //
CREATE PROCEDURE migrate_0120_code_snippet_timing()
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'code_snippets'
       AND COLUMN_NAME = 'defer_until_idle'
  ) THEN
    ALTER TABLE `code_snippets`
      ADD COLUMN `defer_until_idle` TINYINT(1) NOT NULL DEFAULT 0
      COMMENT '是否在 window load 后空闲期注入'
      AFTER `pages`;

    UPDATE `code_snippets`
       SET `defer_until_idle` = 1
     WHERE `code_key` = 'google_adsense_script';
  END IF;
END //
DELIMITER ;

CALL migrate_0120_code_snippet_timing();
DROP PROCEDURE IF EXISTS migrate_0120_code_snippet_timing;
