-- ============================================================================
-- 0121: 工具页 SEO 必须经过显式编辑审核
--
-- `published` 只表示产品内可见，不能等价为“适合被搜索引擎收录”。历史批量导入
-- 页面默认全部不进入 sitemap；管理员核对原创内容、来源和官网后逐条批准。
-- 迁移故意不自动回填，避免再次把数万条模板化页面批量提交给 Google/Bing。
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_0121_feature_tools_seo_review;
DELIMITER //
CREATE PROCEDURE migrate_0121_feature_tools_seo_review()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'feature_tools'
       AND COLUMN_NAME = 'seo_indexable'
  ) THEN
    ALTER TABLE `feature_tools`
      ADD COLUMN `seo_indexable` TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '经人工审核后允许进入 sitemap / index' AFTER `status`;
  END IF;

  -- 公开详情 API 保留了历史 `/tools/{numeric-id}` 路由，因此纯数字 slug
  -- 会让 SSR（按 slug）与 React API（按 id）在同一 URL 渲染两个不同工具。
  -- 这些历史页原本就不可作为稳定 canonical；在审核列启用前一次性换成
  -- 与主键绑定、高概率无冲突的非数字 slug。
  UPDATE `feature_tools`
     SET `slug` = CONCAT('tool-', `id`, '-', LEFT(SHA2(CONCAT('legacy-numeric:', `id`), 256), 12))
   WHERE `slug` REGEXP '^[0-9]+$';

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'feature_tools'
       AND COLUMN_NAME = 'seo_reviewed_at'
  ) THEN
    ALTER TABLE `feature_tools`
      ADD COLUMN `seo_reviewed_at` DATETIME DEFAULT NULL
        COMMENT '最近一次 SEO 审核时间' AFTER `seo_indexable`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'feature_tools'
       AND COLUMN_NAME = 'seo_reviewed_by'
  ) THEN
    ALTER TABLE `feature_tools`
      ADD COLUMN `seo_reviewed_by` BIGINT UNSIGNED DEFAULT NULL
        COMMENT '最近一次 SEO 审核管理员' AFTER `seo_reviewed_at`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'feature_tools'
       AND INDEX_NAME = 'idx_status_seo_id'
  ) THEN
    ALTER TABLE `feature_tools`
      ADD KEY `idx_status_seo_id` (`status`, `seo_indexable`, `id`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'feature_tools'
       AND CONSTRAINT_NAME = 'chk_feature_tools_seo_reviewer'
       AND CONSTRAINT_TYPE = 'CHECK'
  ) THEN
    ALTER TABLE `feature_tools`
      ADD CONSTRAINT `chk_feature_tools_seo_reviewer`
      CHECK (`seo_indexable` = 0 OR (`seo_reviewed_at` IS NOT NULL AND `seo_reviewed_by` IS NOT NULL));
  END IF;
END //
DELIMITER ;

CALL migrate_0121_feature_tools_seo_review();
DROP PROCEDURE IF EXISTS migrate_0121_feature_tools_seo_review;
