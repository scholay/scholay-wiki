-- ============================================================================
-- 0041: seo_journals 索引
-- 镜像 seo_papers / seo_authors 的索引策略
-- 不同点: slug 不是 UNIQUE (同 canonical_name 不同 id 也可能相同),id 才是身份
-- ============================================================================

-- journal_id 唯一索引: upsert (INSERT ... ON DUPLICATE KEY UPDATE) 依赖
CALL add_index_if_not_exists(
    'seo_journals',
    'uk_journal_id',
    '`journal_id`',
    TRUE
);

-- slug 普通索引: /journal/{id}/{slug} 校验 + (将来) legacy slug 反查
CALL add_index_if_not_exists(
    'seo_journals',
    'idx_slug',
    '`slug`',
    FALSE
);

-- sitemap 分页查询: WHERE status = 1 AND sitemap_page = ? ORDER BY id
CALL add_index_if_not_exists(
    'seo_journals',
    'idx_status_sitemap_page',
    '`status`, `sitemap_page`, `id`',
    FALSE
);

-- updated_at 索引: sitemap <lastmod> 聚合
CALL add_index_if_not_exists(
    'seo_journals',
    'idx_updated_at',
    '`updated_at`',
    FALSE
);
