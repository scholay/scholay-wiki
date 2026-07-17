-- ============================================================================
-- 0075 user_wallets.refill_pending_at —— 升级满血「待兑现」标记(R6 持久化补偿)
--
--   背景:升级/续费到付费档后要「免费满血 + 7 天周期从付款后首次使用重开」(R6),实现是
--   DEL Redis 窗口锚点(vip.ResetBaselineOnUpgrade)。删锚是 Redis 写,若恰逢 Redis 抖动/不可用
--   会失败;对**同档续费**(ceiling 不变)一旦失败,已耗尽用户付了钱却不满血,要卡到旧窗口自然
--   到期(最多整个周期)。故先在 DB 落此标记,删锚成功即清;失败则由 vip.ReconcilePendingRefills
--   (cleanup 周期任务)在 Redis 恢复后补删锚并清标记。NULL = 无待办。
--
--   幂等:add_column_if_not_exists;永不 DROP。
-- ============================================================================

CALL add_column_if_not_exists('user_wallets', 'refill_pending_at', 'DATETIME NULL DEFAULT NULL');
