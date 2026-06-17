-- ============================================================================
-- 0031: orders 加 (status, payment_time) 复合索引
-- ----------------------------------------------------------------------------
-- 后台主看板营收统计 RevenueToday/7d/30d 与营收趋势图(admin/dashboard_service.go)按
--   WHERE status = 'paid' AND payment_time >= ? AND payment_time < ?
--   GROUP BY DATE_FORMAT(payment_time, '%Y-%m-%d')
-- 查询, 但 orders 只有 idx_status_created(status, created_at) 和 idx_created_at(created_at),
-- payment_time 上没有任何索引 → 范围条件与按 payment_time 的分组都用不上索引, 只能在 status='paid'
-- 行上做行过滤 + filesort。paid 订单永不删除(无清理路径), 该扫描集随平台寿命无限增长。
--
-- (status, payment_time): equality 列(status)领先 + range/分组列(payment_time)收尾, 让范围裁剪
-- 与有序扫描都能走索引。性能审计 composite-index-order。幂等。
-- ============================================================================

CALL add_index_if_not_exists('orders', 'idx_status_payment_time', '`status`,`payment_time`', FALSE);
