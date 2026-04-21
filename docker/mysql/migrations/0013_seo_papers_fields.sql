-- ============================================================================
-- 0013: SEO 论文索引库
-- 独立于 hot_papers（热度榜，有清理策略），seo_papers 是永不删除的 SEO 主数据。
-- 写入来源：
--   1) quality_tier=1 —— 用户点击论文详情页（高质量）
--   2) quality_tier=2 —— 搜索结果曝光（seeded，覆盖长尾）
-- URL 形态统一为 /paper/{slug}，slug 首次入库后永久冻结以保持 SEO 稳定性。
-- ============================================================================

CREATE TABLE IF NOT EXISTS seo_papers (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    paper_id        VARCHAR(64) NOT NULL COMMENT 'minicod paperId (含 source 前缀如 olx:W123)',
    slug            VARCHAR(200) NOT NULL COMMENT 'URL 友好 slug，首次入库后冻结',
    doi             VARCHAR(255) DEFAULT NULL,
    title           VARCHAR(1024) NOT NULL,
    abstract        TEXT,
    authors_json    JSON COMMENT '[{name,authorId}, ...]',
    year            INT DEFAULT NULL,
    venue           VARCHAR(500) DEFAULT NULL,
    citation_count  INT NOT NULL DEFAULT 0,
    fields_of_study JSON,
    source          VARCHAR(32) DEFAULT NULL COMMENT 'stc / olx / ...',

    -- SEO 调度字段
    sitemap_page    INT NOT NULL DEFAULT 0 COMMENT '预计算的分页号 (FLOOR((id-1)/50000)+1)',
    status          TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=hidden, 2=dead',
    quality_tier    TINYINT NOT NULL DEFAULT 2 COMMENT '1=detail-click(高), 2=search-seeded(低)',
    priority        DECIMAL(2,1) NOT NULL DEFAULT 0.5 COMMENT 'sitemap <priority>',

    -- 时间戳
    first_seen_at   DATETIME NOT NULL,
    last_seen_at    DATETIME NOT NULL COMMENT '最后一次被用户曝光/点击的时间',
    view_count      INT NOT NULL DEFAULT 0 COMMENT '详情页浏览累计数，用于 tier 升级判定',

    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'sitemap <lastmod> 的数据源',

    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SEO 论文索引库 (永久保留，不做 TTL 清理)';
