-- ============================================================================
-- 0028: 检索工作区 · 暂存区 (Staging Areas) v1
--
-- 模型：每个用户最多 5 个"暂存区"（类比浏览器标签页），每个暂存区下挂最多
-- 100 篇论文。暂存区是用户在做矩阵分析 / 横向对比时的「工作组」。
--
-- 关键设计：
--   - user_staging_areas        ：组本身（名字、排序位置、用户）
--   - user_staging_area_papers  ：组里的论文（按源 + sourceId 去重）
--   - 同一篇论文在同一暂存区里幂等加入；不同暂存区之间互不影响
--   - 论文元数据冗余落库 —— 与 user_library_papers 一致的兜底策略，外部
--     源不可达时本地仍能完整渲染
--   - position 字段允许前端排序持久化（无论拖拽 tab 还是拖拽 paper）
--
-- 与 user_library_papers 的区别：
--   library 是"长期收藏夹"，staging 是"短期工作组"。语义、上限、TTL 都不同，
--   因此独立两张表，不复用同一张。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `user_staging_areas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户',
  `name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '暂存区名称（用户可改）',
  `position` INT NOT NULL DEFAULT 0 COMMENT 'tab 排序，越小越靠前',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='检索工作区·暂存区（每用户上限5）';

CREATE TABLE IF NOT EXISTS `user_staging_area_papers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `area_id` BIGINT UNSIGNED NOT NULL COMMENT '所属暂存区',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '冗余：所属用户（便于按用户聚合 / 权限校验）',
  `source` VARCHAR(16) NOT NULL COMMENT '搜索源：stc / olx / pmd',
  `source_paper_id` VARCHAR(128) NOT NULL COMMENT '该源下论文唯一 ID',
  `title` VARCHAR(1024) NOT NULL DEFAULT '' COMMENT '论文标题（冗余）',
  `authors_json` JSON DEFAULT NULL COMMENT '作者数组：[{name, authorId?}]',
  `year` SMALLINT UNSIGNED DEFAULT NULL COMMENT '发表年份',
  `venue` VARCHAR(512) NOT NULL DEFAULT '' COMMENT '期刊/会议名（冗余）',
  `doi` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'DOI（冗余）',
  `abstract` MEDIUMTEXT COMMENT '摘要（冗余）',
  `pdf_url` VARCHAR(1024) NOT NULL DEFAULT '' COMMENT 'openAccessPdf.url（冗余）',
  `citation_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '引用次数（冗余）',
  `is_open_access` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否开放获取',
  `raw_json` JSON DEFAULT NULL COMMENT '原始论文对象兜底',
  `position` INT NOT NULL DEFAULT 0 COMMENT '论文在暂存区内的排序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='检索工作区·暂存区论文（每区上限100）';
