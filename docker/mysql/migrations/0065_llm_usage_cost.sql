-- ============================================================================
-- 0065: 账本加权/成本快照列(模型目录化 P3,方案 docs/research/model-catalog-2026-07/REPORT.md §5)
-- ----------------------------------------------------------------------------
-- weighted_tokens  本次调用扣了多少额度(= raw_total × 模型 billing_weight;0 = 旧数据/未定价)。
-- cost_micro_yuan  四类 token × 目录单价的精算成本快照(微元;1 元 = 1,000,000 微元)。
--                  快照落行 —— 目录调价不漂历史账;admin 看板 SUM 即得成本视图。
-- 幂等:add_column_if_not_exists;never DROP。
-- ============================================================================

CALL add_column_if_not_exists('llm_token_usage', 'weighted_tokens', 'BIGINT NOT NULL DEFAULT 0');
CALL add_column_if_not_exists('llm_token_usage', 'cost_micro_yuan', 'BIGINT NOT NULL DEFAULT 0');
