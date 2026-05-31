-- ============================================================================
-- 0074: 主审决议加"概要"字段
--
-- 主审决议的「摘要回答」拆成 概要(强) + 详细(可折叠):
--   ruling_summary_md   一句话概要 (强)        ← 本次新增
--   ruling_paragraph_md 详细论述 (弱, 可折叠)   ← 0062 已有
--
-- 审稿人综合意见每一条 (reviewer_responses_json) 的 summary 是 JSON blob 内的字段,
-- 无需加列 (见 output.go ReviewerResponse.Summary)。
-- ============================================================================

CALL add_column_if_not_exists('peer_review_reports', 'ruling_summary_md',
  'MEDIUMTEXT NULL COMMENT "主审决议一句话概要 (强); ruling_paragraph_md 是详细论述 (chief only)"');
