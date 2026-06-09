-- ============================================================================
-- 0017_drop_usage_quotas.sql — 删除旧「每功能使用次数」配额表
--
-- usage_quotas(normal_search_count / advanced_search_*_count / ai_chat_*_count
-- 按 user_id+quota_date 计数)是旧订阅系统按功能次数限额的遗留表, 早已 stranded
-- (无代码读写, 仅删用户时清理 —— 该清理也已一并移除)。
--
-- 新会员体系改为「统一每日 token 额度 + 经费钱包」(internal/vip / billing_config),
-- 不再按功能计次, 此表彻底无用。按用户明确要求删除。
--
-- 例外说明:本仓库迁移惯例为 never DROP;此处是按用户指令清理废弃表, 用
-- DROP TABLE IF EXISTS 保证幂等可重放。表内仅为历史脏数据, 无业务消费。
-- ============================================================================

DROP TABLE IF EXISTS `usage_quotas`;
