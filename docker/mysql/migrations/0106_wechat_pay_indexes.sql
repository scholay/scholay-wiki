-- ============================================================================
-- 0106: 微信支付配置索引
-- ============================================================================
--
-- 回调验签时需要按应答头 Wechatpay-Serial 反查候选配置(配置轮换期间新旧回调并存),
-- 建一个非唯一索引。
--
-- ⚠️ 刻意**不建唯一索引**:同一个微信支付公钥ID 完全可能出现在多份配置行上
--    (例如同一商户号换了 AppID、或保留一份历史配置用于验证旧回调)。
--    唯一索引会在迁移重放时撞上存量数据直接炸掉容器启动 —— 0.0.66 发布事故就是
--    这么来的(见 0102 的说明与 migration-replay-uniq-trap)。

CALL add_index_if_not_exists('wechat_pay_configs', 'idx_wechat_pay_pubkey_id', '`wechatpay_public_key_id`', FALSE);

-- 「取当前生效配置」是热路径(每次下单/回调都要读),按 (is_active, id) 覆盖排序。
CALL add_index_if_not_exists('wechat_pay_configs', 'idx_wechat_pay_active_id', '`is_active`,`id`', FALSE);
