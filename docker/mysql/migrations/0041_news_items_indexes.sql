-- ============================================================================
-- 0041 情报主表 news_items 索引
--   uk_news_slug      详情页查 + 防重(上游保证 slug 唯一)
--   idx_news_published_at   实时流 ORDER BY published_at DESC
--   idx_news_heat_external  热榜 ORDER BY heat_external DESC
--   idx_news_featured_heat  首页/榜单「头条优先 + 热度」组合取数
--   idx_news_section        分区筛选
--   idx_news_upstream_updated  sitemap lastmod / freshness
-- 幂等:CALL add_index_if_not_exists(见 0000_utils.sql)。
-- ============================================================================

CALL add_index_if_not_exists('news_items', 'uk_news_slug', '`slug`', TRUE);
CALL add_index_if_not_exists('news_items', 'idx_news_published_at', '`published_at`', FALSE);
CALL add_index_if_not_exists('news_items', 'idx_news_heat_external', '`heat_external`', FALSE);
CALL add_index_if_not_exists('news_items', 'idx_news_featured_heat', '`is_featured`, `heat_external`', FALSE);
CALL add_index_if_not_exists('news_items', 'idx_news_section', '`section`', FALSE);
CALL add_index_if_not_exists('news_items', 'idx_news_upstream_updated', '`upstream_updated_at`', FALSE);
