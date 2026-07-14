-- ============================================================================
-- 0064: 7 天周期额度(模型目录化 P4,方案 docs/research/model-catalog-2026-07/REPORT.md §6)
-- ----------------------------------------------------------------------------
-- 额度窗口从「自然日(跨 0 点满血)」改为「首次使用开锚的 7 天周期」(owner 拍板):
--   · 第一条消耗开表(Redis quota:anchor:<uid>),7 天内累计与上限比较,到期满血,
--     下次使用重新开锚 —— Redis 结构无 SQL 面,本迁移只加配置旋钮。
--   · free_window_tokens = 7 天窗口基准额度(取代 free_daily_tokens 的判定职责);
--     幂等哨兵用 DEFAULT 0 + WHERE=0 回填(评审修订:不能用「日×7」当哨兵值 ——
--     200000×7=1400000 恰好撞默认值,重放会覆写管理员改过的生效值)。
--   · free_daily_tokens 列保留不删(回滚兜底),代码不再读。
--   · window_days 旋钮预留(默认 7);base_price_per_m = P3 加权计费的倍率换算锚点(先落列)。
-- 幂等:add_column_if_not_exists + WHERE=0 单次回填;never DROP。
-- ============================================================================

CALL add_column_if_not_exists('billing_config', 'free_window_tokens', 'BIGINT NOT NULL DEFAULT 0');
CALL add_column_if_not_exists('billing_config', 'window_days',        'INT NOT NULL DEFAULT 7');
CALL add_column_if_not_exists('billing_config', 'base_price_per_m',   'DECIMAL(12,4) NOT NULL DEFAULT 0');

UPDATE `billing_config` SET `free_window_tokens` = `free_daily_tokens` * 7 WHERE `free_window_tokens` = 0;
