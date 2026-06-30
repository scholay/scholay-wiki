-- 模型路由 方案A:会话级「锁定 tier」(per-conversation 快/深 显式选 + 首轮决策后锁定)。
-- A1 per-feature 默认 tier 走代码(FeatureSpec.DefaultTier),不入库;
-- A3 用户显式选的 tier 持久化到这里,重连后 hub 据此重发 set_runtime_config(stickiness)。
-- 空 = 用 feature 默认 tier(A1)。值域:main|haiku|sonnet|opus(对应 agent_config 槽位)。
-- 幂等 + utf8mb4。

CALL add_column_if_not_exists('agent_sessions', 'pinned_tier', "VARCHAR(16) NOT NULL DEFAULT ''");
