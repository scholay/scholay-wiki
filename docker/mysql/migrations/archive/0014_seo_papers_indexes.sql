-- ============================================================================
-- 0014: seo_papers 索引
-- 支撑三类查询：paperId 幂等 upsert、slug 路由反查、sitemap 分页遍历。
-- ============================================================================

-- paper_id 唯一索引：upsert (INSERT ... ON DUPLICATE KEY UPDATE) 依赖
CALL add_index_if_not_exists(
    'seo_papers',
    'uk_paper_id',
    '`paper_id`',
    TRUE
);

-- slug 唯一索引：/paper/{slug} 路由反查
CALL add_index_if_not_exists(
    'seo_papers',
    'uk_slug',
    '`slug`',
    TRUE
);

-- doi 索引：允许按 doi 反查（nullable，允许多个 NULL）
CALL add_index_if_not_exists(
    'seo_papers',
    'idx_doi',
    '`doi`',
    FALSE
);

-- sitemap 分页查询：WHERE status = 1 AND sitemap_page = ? ORDER BY id
-- 预计算 sitemap_page 以避免 OFFSET 扫描大表
CALL add_index_if_not_exists(
    'seo_papers',
    'idx_status_sitemap_page',
    '`status`, `sitemap_page`, `id`',
    FALSE
);

-- tier 升级扫描：WHERE quality_tier = 2 AND view_count >= ?
CALL add_index_if_not_exists(
    'seo_papers',
    'idx_tier_views',
    '`quality_tier`, `view_count`',
    FALSE
);

-- updated_at 索引：sitemap <lastmod> 聚合、增量诊断
CALL add_index_if_not_exists(
    'seo_papers',
    'idx_updated_at',
    '`updated_at`',
    FALSE
);
