-- ============================================================================
-- 0126: 期刊全量主动化 —— 索引 (对应 0125 扩列)
--
-- 查询面:
--   publish_state         — sitemap/发布闸门/状态计数 (30 万行后必须走索引)
--   value_tier            — 发布按 tier 升序取行
--   jcr_category(64)      — 同学科推荐 fallback (前缀 64: utf8mb4 767B 限制内, 类目名区分度足够)
--   fqb_major_category    — 同学科推荐主路径 + 中科院大类枢纽页
--   country               — /journals/country/{cc} 枢纽页
--   ingest_batch          — 批次历史聚合 + 整批回滚
--   uk_issn_l             — 摄取 upsert 的跨行去重键 (唯一可空; 冲突行在应用层预检跳过)
-- ============================================================================

CALL add_index_if_not_exists('seo_journals', 'idx_seo_journals_publish_state', '`publish_state`', FALSE);
CALL add_index_if_not_exists('seo_journals', 'idx_seo_journals_value_tier', '`value_tier`', FALSE);
CALL add_index_if_not_exists('seo_journals', 'idx_seo_journals_jcr_category', '`jcr_category`(64)', FALSE);
CALL add_index_if_not_exists('seo_journals', 'idx_seo_journals_fqb_major', '`fqb_major_category`', FALSE);
CALL add_index_if_not_exists('seo_journals', 'idx_seo_journals_country', '`country`', FALSE);
CALL add_index_if_not_exists('seo_journals', 'idx_seo_journals_ingest_batch', '`ingest_batch`', FALSE);
CALL add_index_if_not_exists('seo_journals', 'uk_seo_journals_issn_l', '`issn_l`', TRUE);
