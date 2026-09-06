---
title: 已下线与兼容组件
slug: legacy-components
summary: 理解旧 README、兼容重定向、归档迁移和仍保留字段时需要遵守的现行状态边界。
category: history
status: compatibility
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/legacy-components
---

# 已下线与兼容组件

## 旧文档不能覆盖代码

根 README 仍描述 React 18、独立后台前端、旧端口和旧迁移方式，这些内容已经过时。Wiki 以当前路由、Compose、模块和迁移为准，并只把旧资料当作历史解释。

## 兼容路径

旧 URL 通过前端重定向或 Nginx 规则指向现行页面。兼容路径存在不表示旧页面仍然维护；词条会把主 URL 与兼容别名分开。

## 遗留数据

明确的搁置对象包括旧 subscription_plans/user_subscriptions、payment_transactions、旧邀请表、credit_temp_lots、usage_logs/config、admin_audit_logs、message_templates、peer_review_skills、prism_chat_messages 和多数 feature_configs。统一 admin_audit_logs 写入链已经移除，不能宣称所有高风险后台动作都有同一份数据库审计。相反，orders、支付回调、退款和现行 invite 都仍活跃；archive 中称它们已移除的说法已经过时。
