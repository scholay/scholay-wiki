-- ============================================================================
-- 0107 管理台退款：退款单据表 + orders 的累计已退列
--
-- 背景：在此之前系统内**没有任何退款链路**（payment/provider.go 的 Refund 接口零实现），
-- 真实退款只能去支付宝/微信商户后台手工点，而系统内订单仍是 paid、会员/经费不会回收，
-- 全靠人工补偿（admin 撤销会员 / 调账扣经费），且这些补偿动作与订单**没有任何关联**，
-- 事后无法回答「这笔单退了没有、退了多少、谁批的、权益收回来没有」。
--
-- 🔴 本方案刻意**不改 orders.status**（保持 'paid'），退款状态另立 refund_status 列。
--    三条硬理由（都是实测过的）：
--    1) 用户端 ListUserOrders 硬编码 `status='paid'`（vip/order.go）——改 status 会让这笔单
--       从用户自己的账单明细里**整行消失**，用户视角像是记录被删掉了，比显示「已退款」严重得多；
--    2) admin 营收 KPI 与每日趋势全部 `WHERE status='paid'`（vip/admin_orders.go）——改 status
--       会让**过去某一天**的营收柱子当场变矮且无任何解释，历史数字被追溯性改写；
--    3) fulfill 的可履约白名单只有 pending/expired，幂等短路只认 'paid'（vip/order.go）——
--       一笔 refunded 的单遇到延迟到达的网关回调会返回 error → NACK → 网关持续重推 24h。
--    营收看板改为「毛额 / 退款额 / 净额」三口径来体现退款，而不是把历史数字改小。
-- ============================================================================

-- 退款单据。一笔订单可以有多条（支持部分退款 / 一单多次退款）。
CREATE TABLE IF NOT EXISTS `order_refunds` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `refund_no`        VARCHAR(64)  NOT NULL COMMENT '系统退款单号(幂等键;重复提交同一个号视为同一笔)',
  `order_no`         VARCHAR(64)  NOT NULL COMMENT '被退的订单号(orders.order_no)',
  `user_id`          BIGINT UNSIGNED NOT NULL COMMENT '订单归属用户(冗余,便于按用户查退款)',

  `amount`           DECIMAL(10,2) NOT NULL COMMENT '本次退款金额(元)。累计不得超过订单 final_amount',
  `reason`           VARCHAR(255) NOT NULL DEFAULT '' COMMENT '退款原因(内部;不下发给用户端)',
  `channel`          VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '原支付渠道 alipay/wechat/test,取自订单 payment_method',
  `gateway_refund_no` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '商户后台那笔退款的单号(人工回填,用于对账)',

  -- 当前方案是「管理员先去商户后台退钱,回来在管理台标记」,所以落库即终态 done。
  -- 保留本列是为了将来接网关自动退款时能表达 pending/processing/failed,不必再改表。
  `status`           VARCHAR(16)  NOT NULL DEFAULT 'done' COMMENT 'done/pending/processing/failed',

  -- 权益回收结果 —— 必须落库,否则「钱退了但经费没收回来」这件事没人知道。
  `credits_expected` INT          NOT NULL DEFAULT 0 COMMENT '按退款比例应回收的经费',
  `credits_reclaimed` INT         NOT NULL DEFAULT 0 COMMENT '实际回收的经费(余额不足时小于应收)',
  `credits_shortfall` INT         NOT NULL DEFAULT 0 COMMENT '差额=应收-实收,由平台承担;>0 说明用户已消费',
  `membership_revoked` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否连带撤销了会员',

  -- 操作留痕。operator_name 冗余存一份:管理员改名/注销后仍要能回答「谁批的」。
  -- (admin_audit_logs 表虽然存在但零代码消费,不指望它。)
  `operator_id`      BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '操作管理员 users.id',
  `operator_name`    VARCHAR(128) NOT NULL DEFAULT '' COMMENT '操作时的管理员名字(冗余快照)',

  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单退款单据(管理台手工发起)';

-- orders 上的累计口径 —— 放在订单行上是为了让列表/详情不必对 order_refunds 做聚合子查询。
-- 真源仍是 order_refunds 的求和,这两列由退款事务在同一个事务里同步维护。
CALL add_column_if_not_exists('orders', 'refunded_amount',
  "DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '累计已退金额(元);由退款事务维护,真源是 order_refunds'");

-- '' = 未退款(绝大多数行) / partial = 部分退款 / full = 已退完。
-- 刻意不复用 status 列,理由见文件头。
CALL add_column_if_not_exists('orders', 'refund_status',
  "VARCHAR(16) NOT NULL DEFAULT '' COMMENT '退款状态: 空=未退, partial=部分退款, full=已全额退完'");
