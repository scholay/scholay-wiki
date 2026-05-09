-- ============================================================================
-- 0023: seo_authors 索引
-- 镜像 seo_papers 的索引策略：upsert 唯一键、slug 反查、sitemap 分页遍历。
-- ============================================================================

-- author_id 唯一索引：upsert (INSERT ... ON DUPLICATE KEY UPDATE) 依赖
CALL add_index_if_not_exists(
    'seo_authors',
    'uk_author_id',
    '`author_id`',
    TRUE
);

-- slug 唯一索引：/author/{slug} 路由反查
CALL add_index_if_not_exists(
    'seo_authors',
    'uk_slug',
    '`slug`',
    TRUE
);

-- sitemap 分页查询：WHERE status = 1 AND sitemap_page = ? ORDER BY id
CALL add_index_if_not_exists(
    'seo_authors',
    'idx_status_sitemap_page',
    '`status`, `sitemap_page`, `id`',
    FALSE
);

-- updated_at 索引：sitemap <lastmod> 聚合
CALL add_index_if_not_exists(
    'seo_authors',
    'idx_updated_at',
    '`updated_at`',
    FALSE
);
