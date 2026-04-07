-- ============================================================================
-- 0011: API 使用统计字段
-- 为 third_party_accounts 添加详细的 API 调用统计字段
-- 支持计算成功率、平均耗时、标准差等统计指标
-- ============================================================================

-- 总请求次数（含重试）
CALL add_column_if_not_exists('third_party_accounts', 'total_requests', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
-- 成功次数
CALL add_column_if_not_exists('third_party_accounts', 'success_count', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
-- 失败次数
CALL add_column_if_not_exists('third_party_accounts', 'fail_count', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
-- 成功请求的总耗时（毫秒）—— 用于计算均值
CALL add_column_if_not_exists('third_party_accounts', 'total_latency_ms', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
-- 成功请求的耗时平方和（毫秒²）—— 用于计算方差: Var = E[X²] - E[X]²
CALL add_column_if_not_exists('third_party_accounts', 'total_latency_sq_ms', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
-- 最大单次耗时（毫秒）
CALL add_column_if_not_exists('third_party_accounts', 'max_latency_ms', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
-- 慢请求次数（>1000ms）
CALL add_column_if_not_exists('third_party_accounts', 'slow_count', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
-- 慢请求总耗时（毫秒）
CALL add_column_if_not_exists('third_party_accounts', 'slow_total_latency_ms', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
