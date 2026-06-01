-- ============================================================================
-- 0060: peer_review_skills 索引
--
-- 查询模式:
--   1) seed 幂等: WHERE slug = ?
--   2) skill picker: WHERE persona = ? AND enabled = 1
--   3) admin 列表: WHERE discipline = ? AND enabled = ?
-- ============================================================================

CALL add_index_if_not_exists('peer_review_skills', 'uk_prs_slug', 'slug', TRUE);
CALL add_index_if_not_exists('peer_review_skills', 'idx_prs_persona_enabled', 'persona, enabled', FALSE);
CALL add_index_if_not_exists('peer_review_skills', 'idx_prs_discipline', 'discipline, enabled', FALSE);
