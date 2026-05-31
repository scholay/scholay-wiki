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

## 管理员审计日志（原 `internal/admin/audit*.go`）

> 废弃时间：2026-05-28
> 整套审计追踪逻辑下线 —— 后端 audit.go / audit_handler.go 与 10 处
> `admin.LogAdminAction(...)` 调用、admin 路由 `/admin/audit-logs`、前端
> `AuditLogsPage` 与 nav 入口都已删除。运维侧需要时改看 docker logs 的 slog 记录。

| 表名 | 说明 |
|------|------|
| `admin_audit_logs` | 管理员写操作审计流水(admin_user_id / action / resource_type / details JSON / IP / UA) |

## 消息模板系统（原 `internal/message/` 模板部分）

> 废弃时间：2026-05-28
> 站内信 `messages` / `user_messages` 仍在使用,只移除了"模板"这一层 ——
> 历史上 RenderTemplate / SendFromTemplate 无任何外部消费方,前端只有一个 admin
> 增删改页面,业务流从未真正接进来。Go model / repo / service / handler /
> admin 路由 / 前端 MessageTemplatesPage 与 nav 入口 都已删除。

| 表名 | 说明 |
|------|------|
| `message_templates` | 消息模板(code/name/title/content/variables/category/is_active) |

## AI 审稿 skill 表 (原 `internal/peerreview/SkillRepository`)

> 废弃时间：2026-05-28
> 智能审稿的 reviewer prompt 管理从 `peer_review_skills` 表迁移到通用
> `feature_prompts` 表 (feature_key='peerreview', persona ∈ {alpha,beta,gamma,chief})。
> 旧表 20 行数据已通过 `0068_feature_prompts_defaults.sql` 完整迁移过来,
> ID 区间 1-20 与新表自动对齐 (新表当时是空, auto_increment 从 1 开始),
> 历史 peer_review_reports.reviewer_skill_id 仍能命中, 不破坏现有数据。
>
> Go 代码 `SkillRepository` / `Skill` / `PickSkillsForSubmission` 已全部删除;
> 取代品是 `internal/promptregistry/` 包 + `agentbridge.PersonaRandomPicker`,
> 同算法 (学科匹配 + 加权随机 + fallback 链) 复用 + 通用化, 任何 feature 都能用。
> 旧表本身保留作回滚兜底。

| 表名 | 说明 |
|------|------|
| `peer_review_skills` | 智能审稿 reviewer prompt 库 (alpha/beta/gamma/chief 4 persona, 含学科适配) |

---

## 注意事项

1. **迁移文件不要删除**：`0001_initial_fields.sql` ~ `0004_iterative_fields.sql` 中包含这些表的建表语句，
   必须保留以确保新环境部署时 schema-sync 正常运行。
2. **不要在这些表上建新索引或加字段**，除非计划重新启用对应功能。
3. **支付宝支付模块** (`internal/payment/`) 的代码仍保留，但因订单系统已移除，
   支付回调不再触发业务逻辑。如需重新启用支付，需同时恢复订单模块。
4. 相关的 Go model 定义已随模块目录一起删除，如需查看原始表结构，
   请参考迁移文件 `0001_initial_fields.sql`。
