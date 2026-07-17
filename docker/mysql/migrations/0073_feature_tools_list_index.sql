-- ============================================================================
-- 0073 · feature_tools 列表默认排序复合索引(性能审计 #11)。
--   背景:feature_tools 是当前最大表(实测 ~55MB / 1 万行),公开列表 GET /api/v1/tools 默认查询
--   `WHERE status='published' ... ORDER BY sort_weight DESC, created_at DESC LIMIT 24`(repository.go:129)。
--   既有索引 idx_status / idx_status_cat / ft_name / ft_content 都覆盖不到这条排序 → 每请求全表扫 + filesort。
--   加 (status, sort_weight DESC, created_at DESC) 复合索引,让默认排序路径直接走索引序(WHERE 等值 + ORDER 同序),
--   免 filesort。MySQL 8.0 支持降序索引列(docker-compose 是 mysql:8.0)。
--   注:仅覆盖默认 sort_by=created_at 路径;用户传 sort_by=view_count/name 等仍 filesort(非默认,可接受)。
--   有全文搜索词时走 FULLTEXT + 相关度排序,不吃此索引(也不需要)。
-- 幂等:add_index_if_not_exists(不存在才建)。ANALYZE 刷统计让优化器认新索引(每次重放无害)。永不 DROP。
-- ============================================================================
CALL add_index_if_not_exists('feature_tools', 'idx_status_sort_created', '`status`, `sort_weight` DESC, `created_at` DESC', FALSE);
ANALYZE TABLE feature_tools;
