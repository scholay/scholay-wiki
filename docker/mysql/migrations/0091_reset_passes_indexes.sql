-- ============================================================================
-- 0091: credit_reset_passes 索引
--
-- 查询形态只有两种,索引照着建:
--   ① 读余量/挑扣减批次: WHERE user_id=? AND count_remaining>0 AND starts_at<=? AND expires_at>?
--      ORDER BY expires_at  → (user_id, expires_at) 覆盖过滤 + 排序;
--   ② 0092 迁移的幂等判重: WHERE source=? AND ref=?  → (source, ref)。
--      **不设唯一索引**:同一 ref 未来可能合法地出现多行(如按批补偿),唯一约束会把
--      「重放保护」和「业务规则」绑死。幂等由 0092 的 NOT EXISTS 保证。
--      (本仓库有过 0014 重建唯一索引撞上后续多会话数据的发布事故,唯一索引一律先想清楚。)
-- 幂等:add_index_if_not_exists。
-- ============================================================================

CALL add_index_if_not_exists('credit_reset_passes', 'idx_reset_passes_user_expires', '`user_id`,`expires_at`', FALSE);
CALL add_index_if_not_exists('credit_reset_passes', 'idx_reset_passes_source_ref', '`source`,`ref`', FALSE);
