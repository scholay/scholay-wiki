-- ============================================================================
-- 0016_billing_orders.sql — 复活 orders 表用于「充值/订阅」(P2/P3)
--
-- orders 表是 0001 baseline 里的历史 stranded 表(无代码消费)。本次接上 orderService:
--   - recharge 订单:支付成功 → 入账永久经费(credits_granted)
--   - subscription 订单:支付成功 → 开通会员 + 赠送临时经费
-- 补两列:credits_granted(到账经费数)、transaction_no(网关流水号, 便于支持排查)。
-- 幂等靠 order_no 唯一 + status='paid' 短路(回调会重试)。
--
-- 幂等:add_column_if_not_exists。never DROP。
-- ============================================================================

CALL add_column_if_not_exists('orders', 'credits_granted', "int NOT NULL DEFAULT 0 COMMENT '到账经费数(recharge=充值经费 / subscription=赠送经费)'");
CALL add_column_if_not_exists('orders', 'transaction_no', "varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '支付网关流水号(回调回填)'");
