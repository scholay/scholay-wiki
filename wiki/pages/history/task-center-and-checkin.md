---
title: 任务中心与签到
slug: task-center-and-checkin
summary: 界面仍有预告，但运行时代码和数据库已不提供的历史活动体系——不能当作已上线功能。
category: history
status: historical
updated: 2026-09-11T12:10:00+08:00
canonical: https://www.scholay.com/wiki/task-center-and-checkin
scholay_topics: ["[[wiki/topics/history/历史运营与兼容组件|历史运营与兼容组件]]"]
scholay_related: ["[[wiki/pages/membership/membership|会员体系]]", "[[wiki/pages/membership/wallet-payg|经费钱包与按量付费]]", "[[wiki/pages/history/legacy-components|已下线与兼容组件]]"]
---

# 任务中心与签到

## 当前状态

会员页面把任务中心标为"即将上线"，没有可执行签到按钮或业务处理器。旧的签到表、连续签到统计和历史奖励配置已从运行表结构下线。

## 保留痕迹

| 痕迹 | 说明 |
| --- | --- |
| 经费来源常量 `task` | 仍保留，但无使用它的处理流程 |
| feature_configs 中 user_checkin = enabled | 仍保留，但无对应路由或签到表 |

孤立字段不能证明任务中心已上线。"未来"只来自界面预告，不是已确认路线图。

若重新启动，仍需重新定义迁移、服务和前端入口。
