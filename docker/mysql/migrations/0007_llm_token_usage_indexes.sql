-- ============================================================================
-- 0007_llm_token_usage_indexes.sql — llm_token_usage 维度筛选索引
--
-- 0006 建表时只内联了 (user_id,created_at) / (feature,created_at) / (created_at) /
-- (source) 四个索引。admin token 用量看板还要按 model / provider / account / source
-- + 时间范围 筛选 & 聚合, 这里补齐这些维度的 (dim, created_at) 复合索引, 让带日期窗口的
-- GROUP BY / WHERE 走索引而不是全表扫。
--
-- 幂等: 用 0000_utils 的 add_index_if_not_exists 存储过程 (索引已存在则跳过), 可重复重放。
-- ============================================================================

CALL add_index_if_not_exists('llm_token_usage', 'idx_model_created',    '`model`, `created_at`',      FALSE);
CALL add_index_if_not_exists('llm_token_usage', 'idx_provider_created', '`provider`, `created_at`',   FALSE);
CALL add_index_if_not_exists('llm_token_usage', 'idx_account_created',  '`account_id`, `created_at`', FALSE);
CALL add_index_if_not_exists('llm_token_usage', 'idx_source_created',   '`source`, `created_at`',     FALSE);
