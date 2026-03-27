# 废弃数据库表清单

> **重要提示**：以下表在代码层面已不再使用（对应的后端模块和前端页面已被移除），
> 但表结构和历史数据**保留在数据库中未做删除**。
>
> 如果后续需要清理，请在确认无数据恢复需求后，由 DBA 手动处理。
>
> 废弃时间：2026-03-27

---

## 经费 / 恩特币 / 钱包系统（原 `internal/currency/` 模块）

| 表名 | 说明 |
|------|------|
| `wallets` | 用户钱包，存储 gold（经费）和 diamond（恩特币）余额 |
| `currency_transactions` | 货币流水记录（充值、消费、兑换、赠送等） |
| `currency_configs` | 货币系统配置项（注册赠送、签到奖励、兑换比例等） |
| `currency_deduct_configs` | 各功能的扣费配置（按 biz_type 定义扣费金额和货币类型） |
| `currency_batches` | 批量发放经费/恩特币的记录 |

## 签到系统（原 `internal/checkin/` 模块）

| 表名 | 说明 |
|------|------|
| `user_checkins` | 用户每日签到记录 |
| `user_checkin_stats` | 用户签到统计（连续天数等） |

## 基金系统（原 `internal/fund/` 模块）

| 表名 | 说明 |
|------|------|
| `membership_funds` | 会员基金月度配置（含 diamond/gold 发放额度） |
| `membership_fund_distributions` | 基金发放记录 |

## 订阅系统（原 `internal/subscription/` 模块）

| 表名 | 说明 |
|------|------|
| `subscription_plans` | 订阅套餐定义（free/basic/pro/max 等） |
| `user_subscriptions` | 用户的订阅记录 |
| `usage_quotas` | 按日统计的功能用量配额 |

## 订单系统（原 `internal/order/` 模块）

| 表名 | 说明 |
|------|------|
| `orders` | 充值订单和订阅订单 |
| `payment_transactions` | 支付流水（支付宝/微信支付回调记录） |

## 优惠券系统（原 `internal/coupon/` 模块）

| 表名 | 说明 |
|------|------|
| `coupon_templates` | 可复用的优惠券模板定义 |
| `user_coupons` | 已发放给用户的优惠券实例 |
| `coupon_usage_logs` | 优惠券使用记录 |
| `coupon_batches` | 批量发放管理 |
| `user_invitations` | 用户邀请码 |
| `invitation_relationships` | 邀请人与被邀请人的关系 |

---

## 注意事项

1. **迁移文件不要删除**：`0001_initial_fields.sql` ~ `0004_iterative_fields.sql` 中包含这些表的建表语句，
   必须保留以确保新环境部署时 schema-sync 正常运行。
2. **不要在这些表上建新索引或加字段**，除非计划重新启用对应功能。
3. **支付宝支付模块** (`internal/payment/`) 的代码仍保留，但因订单系统已移除，
   支付回调不再触发业务逻辑。如需重新启用支付，需同时恢复订单模块。
4. 相关的 Go model 定义已随模块目录一起删除，如需查看原始表结构，
   请参考迁移文件 `0001_initial_fields.sql`。
