-- ============================================================================
-- 0040: SEO 期刊索引库
-- 与 seo_papers / seo_authors 同构: 永久保留, 承载 /journal/{id}/{slug} 路由 + sitemap-journals-{N}.xml
-- 写入来源:
--   1) quality_tier=1 —— 用户点击期刊详情页 (高质量, view_count + 1)
--   2) quality_tier=2 —— 期刊出现在搜索结果 (seeded, 覆盖长尾)
-- URL 形态 /journal/{id}/{slug}: id 是 BIGINT 主键, slug 来自 canonical_name (首次入库后冻结)
-- ============================================================================

CREATE TABLE IF NOT EXISTS seo_journals (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    journal_id          BIGINT NOT NULL COMMENT '上游 journal id (minicod /jnl)',
    slug                VARCHAR(220) NOT NULL DEFAULT '' COMMENT 'URL 友好 slug, 来自 canonical_name, 首次入库后冻结',
    canonical_name      VARCHAR(500) NOT NULL,
    publisher           VARCHAR(500) DEFAULT NULL,
    issns_json          JSON COMMENT 'ISSN 数组 ["0028-0836","1476-4687"]',
    country             VARCHAR(64)  DEFAULT NULL,
    type                VARCHAR(64)  DEFAULT NULL COMMENT '期刊类型: journal / book series / ...',
    is_oa               TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否开放获取',
    jcr_impact_factor   DECIMAL(8,3) DEFAULT NULL,
    jcr_quartile        VARCHAR(8)   DEFAULT NULL COMMENT 'Q1 / Q2 / Q3 / Q4',
    openalex_h_index    INT          DEFAULT NULL,

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
  COMMENT='SEO 期刊索引库 (永久保留, 不做 TTL 清理)';
