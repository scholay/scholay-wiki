-- ============================================================================
-- 0108 退款单据的索引
-- ============================================================================

-- 🔴 refund_no 唯一 —— 这是**幂等的全部依据**。
-- 管理员双击「确认退款」、或前端重试一次请求,靠这个唯一键把第二次写入挡在 DB 层;
-- 没有它就是退两次钱(且权益被回收两次)。退款号由后端按 order_no + 序号生成。
CALL add_index_if_not_exists('order_refunds', 'uk_refund_no', '`refund_no`', TRUE);

-- 按订单查退款明细(详情抽屉 / 累计校验的兜底核对)
CALL add_index_if_not_exists('order_refunds', 'idx_order_no', '`order_no`', FALSE);

-- 按用户查(用户详情抽屉的财务区块)
CALL add_index_if_not_exists('order_refunds', 'idx_user_id', '`user_id`', FALSE);

-- 按时间倒序列出最近退款(管理台退款记录页 / 对账导出)
CALL add_index_if_not_exists('order_refunds', 'idx_created_at', '`created_at`', FALSE);

-- 营收看板要按窗口求和退款额(净额口径 = 毛额 - 退款额)
CALL add_index_if_not_exists('order_refunds', 'idx_status_created', '`status`,`created_at`', FALSE);

-- orders.refund_status 上的筛选(管理台「已退款」筛选项)
CALL add_index_if_not_exists('orders', 'idx_refund_status', '`refund_status`', FALSE);

-- ⚠️ 刻意**不加** order_refunds → orders 的外键。
-- orders 上挂着 `ON DELETE CASCADE` 到 users(见 0001_baseline),用户注销会连带删掉订单;
-- 若退款单也级联删除,财务侧就没有任何留档了 —— 退款记录必须比订单活得久。
-- 代价是 order_no 可能指向一条已不存在的订单,读取侧用 LEFT JOIN 容忍。
