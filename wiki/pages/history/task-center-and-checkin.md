---
title: 任务中心与签到
slug: task-center-and-checkin
summary: 界面中仍有预告，但现行运行时代码和数据库已不提供的历史活动体系。
category: history
status: historical
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/task-center-and-checkin
---

# 任务中心与签到

## 当前状态

会员页面把任务中心标为“即将上线”，没有可执行签到按钮或现行业务处理器。旧的签到表、连续签到统计和历史奖励配置位于归档迁移，并已从当前运行表结构下线。

## 保留痕迹

经费模型仍保留 `task` 来源常量，数据库基线的 feature_configs 也仍把 user_checkin 标为 enabled，但当前没有使用这些值的处理流程、路由或签到表。孤立字段不能证明任务中心已经上线；这里的“未来”只来自界面预告，不是已确认路线图。若重新启动该功能，仍需重新定义迁移、服务和前端入口。
