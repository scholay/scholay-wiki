-- ============================================================================
-- 0064 热门内容统计重构
-- ----------------------------------------------------------------------------
-- 1) hot_search_keywords: 区分搜索类型(文献 / 期刊) —— 同一关键词在不同类型下
--    独立计数。唯一键从 keyword_hash 改为 (keyword_hash, search_type)。
-- 2) hot_papers: 把单一 view_count 拆成三个维度的计数器:
--      impression_count  曝光量(出现在搜索结果集中)
--      click_count       点击量(从搜索结果点开详情)
--      seo_view_count    SEO 直访量(经 /paper/:slug 直接访问详情, 不含搜索点击)
--    旧 view_count 列保留(兼容/回滚兜底), 新逻辑不再写它。
--
-- 全部走 0000_utils.sql 的幂等存储过程, 可重复重放。
-- ============================================================================

-- ─── hot_search_keywords ───────────────────────────────────────────────────
CALL add_column_if_not_exists('hot_search_keywords', 'search_type',
    "VARCHAR(16) NOT NULL DEFAULT 'paper' COMMENT '搜索类型: paper(文献) / journal(期刊)'");

-- 唯一键改造: 先去掉只按 keyword_hash 的旧唯一键, 再建 (keyword_hash, search_type) 复合唯一键。
-- 顺序无所谓 —— add 是 IF NOT EXISTS, drop 是 IF EXISTS, 重放安全。
CALL add_index_if_not_exists('hot_search_keywords', 'uk_keyword_hash_type',
    'keyword_hash, search_type', TRUE);
CALL drop_index_if_exists('hot_search_keywords', 'uk_keyword_hash');

-- ─── hot_papers ─────────────────────────────────────────────────────────────
CALL add_column_if_not_exists('hot_papers', 'impression_count',
    "BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '曝光量: 出现在搜索结果集中的次数'");
CALL add_column_if_not_exists('hot_papers', 'click_count',
    "BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点击量: 从搜索结果点开详情的次数'");
CALL add_column_if_not_exists('hot_papers', 'seo_view_count',
    "BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'SEO 直访量: 经 /paper/:slug 直接访问详情(不含搜索点击)'");

-- 排序索引: 曝光 / 点击 各一条降序索引, 供 admin 热门榜按维度排序。
CALL add_index_if_not_exists('hot_papers', 'idx_impression_count', 'impression_count DESC', FALSE);
CALL add_index_if_not_exists('hot_papers', 'idx_click_count', 'click_count DESC', FALSE);
