-- ============================================================================
-- 0057_seo_enrich_fields.sql
-- SEO 完整性回填字段:
--   - seo_papers.enriched_at   : 上游(minicod)元数据回填「尝试」时间戳。NULL=从未回填过。
--                                回填 worker 扫「无 abstract 且 enriched_at IS NULL」的行,
--                                拉一次上游后无论是否拿到 abstract 都写 enriched_at,避免重复拉、
--                                把 minicod 配额打爆。
--   - seo_authors.enriched_at  : 同上,作者维度。
--   - seo_authors.top_works    : 作者代表作 JSON 数组(H3),原始 HTML/JSON-LD 里给出实质内容,
--                                把「只有人名」的薄作者页变成可排名/可被 AI 引用。
-- 幂等:add_column_if_not_exists / add_index_if_not_exists(见 0000_utils.sql)。
-- ============================================================================

CALL add_column_if_not_exists('seo_papers',  'enriched_at', 'DATETIME NULL DEFAULT NULL COMMENT ''上游元数据回填尝试时间;NULL=未回填过''');
CALL add_column_if_not_exists('seo_authors', 'enriched_at', 'DATETIME NULL DEFAULT NULL COMMENT ''上游元数据回填尝试时间;NULL=未回填过''');
CALL add_column_if_not_exists('seo_authors', 'top_works',   'JSON NULL COMMENT ''代表作 JSON 数组 [{title,year,venue,paperId,source,citationCount}]''');

-- 回填 worker 的扫描谓词是 (status, enriched_at, id):这个复合索引让「未回填」的行随处理推进而快速收敛。
CALL add_index_if_not_exists('seo_papers',  'idx_seo_papers_enrich_scan',  'status, enriched_at, id', FALSE);
CALL add_index_if_not_exists('seo_authors', 'idx_seo_authors_enrich_scan', 'status, enriched_at, id', FALSE);
