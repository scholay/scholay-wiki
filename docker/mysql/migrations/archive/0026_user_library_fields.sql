-- ============================================================================
-- 0026: 文献集 v1 —— 单"默认收藏夹"模型
--
-- 一个用户一个默认收藏夹，没有多文件夹概念。后续如要支持多文件夹/标签/
-- PDF/笔记，再以独立迭代补表（user_library_collections / _tags / _notes ...）。
--
-- 关键设计：
--   - (user_id, source, source_paper_id) 三元组唯一 —— 同一篇论文在 stc 和
--     olx 两个源都存在时各自独立保存，因为两个源的 paperId 体系不同，UI
--     上要让用户分别可见。
--   - 论文原始元信息（标题/作者/期刊/年份/摘要/PDF…）冗余存到本行，外部
--     源接口不可用时本地仍能展示。完整 JSON 落 raw_json 兜底。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `user_library_papers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户',
  `source` VARCHAR(16) NOT NULL COMMENT '搜索源：stc=精选 / olx=全域',
  `source_paper_id` VARCHAR(128) NOT NULL COMMENT '该源下论文唯一 ID',
  `title` VARCHAR(1024) NOT NULL DEFAULT '' COMMENT '论文标题（冗余）',
  `authors_json` JSON DEFAULT NULL COMMENT '作者数组：[{name, authorId?}]',
  `year` SMALLINT UNSIGNED DEFAULT NULL COMMENT '发表年份',
  `venue` VARCHAR(512) NOT NULL DEFAULT '' COMMENT '期刊/会议名（冗余）',
  `doi` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'DOI（冗余）',
  `abstract` MEDIUMTEXT COMMENT '摘要（冗余）',
  `pdf_url` VARCHAR(1024) NOT NULL DEFAULT '' COMMENT 'openAccessPdf.url（冗余）',
  `publication_types_json` JSON DEFAULT NULL COMMENT '类型数组：["JournalArticle","Preprint"...]',
  `citation_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '引用次数（冗余，仅展示用）',
  `raw_json` JSON DEFAULT NULL COMMENT '原始论文对象兜底',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入收藏的时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户文献集（单默认收藏夹 v1）';
