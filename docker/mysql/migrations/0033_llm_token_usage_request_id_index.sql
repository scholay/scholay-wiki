-- ============================================================================
-- 0033_llm_token_usage_request_id_index.sql — 按 request_id(=agent sessionID / 关联键)
-- 反查 token 用量的索引。
--
-- 背景(C7 精确 token 归属):agent per-call 回调此前把 request_id 落空,无法把一行用量关联
-- 回具体 session/turn。现 internal_handler.go 把 agent sessionID 写进 request_id 后,admin
-- 看板/排障要支持「按 session 反查这次会话的 token 与调用次数」,需走索引而非全表扫。
--
-- 复合 (request_id, created_at):覆盖「单 session + 时间窗」的 GROUP BY / 排序。
-- 幂等:用 0000_utils 的 add_index_if_not_exists(已存在则跳过),可重复重放。
-- 绝不 DROP / 不动表结构。
-- ============================================================================

CALL add_index_if_not_exists('llm_token_usage', 'idx_request_created', '`request_id`, `created_at`', FALSE);
