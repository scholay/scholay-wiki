-- ============================================================================
-- 0022: SEO 作者索引库
-- 与 seo_papers 同构：永久保留，承载 /author/{slug} 路由 + sitemap-authors-{N}.xml
-- 写入来源：
--   1) quality_tier=1 —— 用户点击作者详情页（高质量）
--   2) quality_tier=2 —— 搜索结果中作者出现（seeded，覆盖长尾）
-- URL 形态统一为 /author/{slug}，slug 首次入库后永久冻结。
-- ============================================================================

CREATE TABLE IF NOT EXISTS seo_authors (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    author_id       VARCHAR(64) NOT NULL COMMENT '上游 authorId (Semantic Scholar / OpenAlex)',
    slug            VARCHAR(200) NOT NULL COMMENT 'URL 友好 slug，首次入库后冻结',
    name            VARCHAR(500) NOT NULL,
    affiliations    JSON COMMENT '机构数组 ["MIT","Google Brain"]',
    homepage        VARCHAR(500) DEFAULT NULL,
    paper_count     INT NOT NULL DEFAULT 0,
    citation_count  INT NOT NULL DEFAULT 0,
    h_index         INT DEFAULT NULL,
    source          VARCHAR(32) DEFAULT NULL COMMENT 'stc / olx / ...',

    -- SEO 调度字段
    sitemap_page    INT NOT NULL DEFAULT 0 COMMENT '预计算分页号 (FLOOR((id-1)/50000)+1)',
    status          TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=hidden, 2=dead',
    quality_tier    TINYINT NOT NULL DEFAULT 2 COMMENT '1=detail-click(高), 2=search-seeded(低)',
    priority        DECIMAL(2,1) NOT NULL DEFAULT 0.5 COMMENT 'sitemap <priority>',

    -- 时间戳
    first_seen_at   DATETIME NOT NULL,
    last_seen_at    DATETIME NOT NULL,
    view_count      INT NOT NULL DEFAULT 0,

    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'sitemap <lastmod> 数据源',

    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SEO 作者索引库 (永久保留，不做 TTL 清理)';
