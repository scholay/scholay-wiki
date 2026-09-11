---
title: 已下线与兼容组件
slug: legacy-components
summary: 旧 README 和兼容路径的现行状态——Wiki 以当前路由和代码为准，旧文档只作历史解释。
category: history
status: compatibility
updated: 2026-09-11T12:10:00+08:00
canonical: https://www.scholay.com/wiki/legacy-components
scholay_topics: ["[[wiki/topics/history/历史运营与兼容组件|历史运营与兼容组件]]"]
scholay_related: ["[[wiki/pages/history/task-center-and-checkin|任务中心与签到]]"]
---

# 已下线与兼容组件

## 旧文档不能覆盖代码

根 README 仍描述 React 18、独立后台前端、旧端口和旧迁移方式，已经过时。Wiki 以当前路由、Compose、模块和迁移为准，旧资料只作历史解释。

## 兼容路径

旧 URL 通过前端重定向或 Nginx 规则指向现行页面。兼容路径存在不表示旧页面仍维护。

## 遗留数据

| 状态 | 对象 |
| --- | --- |
| 已搁置 | 旧 subscription_plans、payment_transactions、旧邀请表、credit_temp_lots、usage_logs、admin_audit_logs、message_templates 等 |
| 仍活跃 | orders、支付回调、退款、现行 invite |

统一 admin_audit_logs 写入链已移除，不能宣称所有高风险后台动作都有同一份审计。archive 中称活跃对象已移除的说法已过时。
