-- ============================================================================
-- 0056: 下线 currency / wallet / membership-fund / checkin / legacy admin_users
--
-- 背景:
--   全后端审计 (前端为准反查) 发现 22 张表无 Go 代码引用。其中 11 张属于
--   "支付/订单/订阅/优惠券/邀请" 业务下游, 后续会重启支付流时复用, 全部保留:
--     orders, payment_transactions, subscription_plans, user_subscriptions,
--     usage_quotas, user_coupons, coupon_templates, coupon_batches,
--     coupon_usage_logs, user_invitations, invitation_relationships
--
--   剩下 11 张是"营销/积分/会员金" 历史功能, 已经长期 0 写入 + 0 读取,
--   产品方向上确认不会回来, 本次清掉:
--     - admin_users               legacy (migration 0007 已迁到 users + role='admin', 仅 1 行残留)
--     - agent_tool_permissions    实验性表, 从未启用
--     - currency_* (5 张)         自研站内货币 / 积分流水
--     - wallets                   钱包余额表 (与 currency 配套)
--     - membership_funds          会员基金主表
--     - membership_fund_distributions 基金分配明细
--     - user_checkins             连续签到记录
--     - user_checkin_stats        签到聚合
--
-- ⚠️ 销毁性操作: 上线前 mysqldump 备份。这些表实际 0~1 行(只 admin_users 有
-- 1 行 legacy admin), 数据丢失风险可以忽略, 但备份是规矩。
--
-- 配套代码改动 (本 PR 一起提):
--   - 没有 Go 包 import 这些表;不需要删代码
--
-- 幂等: DROP TABLE IF EXISTS, 重放安全。
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- legacy / 实验性
DROP TABLE IF EXISTS `admin_users`;
DROP TABLE IF EXISTS `agent_tool_permissions`;

-- currency / wallet
DROP TABLE IF EXISTS `currency_batch_distributions`;
DROP TABLE IF EXISTS `currency_batches`;
DROP TABLE IF EXISTS `currency_transactions`;
DROP TABLE IF EXISTS `currency_deduct_configs`;
DROP TABLE IF EXISTS `currency_configs`;
DROP TABLE IF EXISTS `wallets`;

-- membership fund
DROP TABLE IF EXISTS `membership_fund_distributions`;
DROP TABLE IF EXISTS `membership_funds`;

-- checkin
DROP TABLE IF EXISTS `user_checkin_stats`;
DROP TABLE IF EXISTS `user_checkins`;

SET FOREIGN_KEY_CHECKS = 1;
