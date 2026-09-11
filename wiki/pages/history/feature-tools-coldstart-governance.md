---
title: 功能广场冷启动包与下载治理
slug: feature-tools-coldstart-governance
summary: 201 条冷启动记录用于批量导入工具目录——但大量网盘下载和破解条目使其不能未经复核直接发布。
category: history
status: compatibility
updated: 2026-09-11T12:10:00+08:00
canonical: https://www.scholay.com/wiki/feature-tools-coldstart-governance
scholay_topics: ["[[wiki/topics/history/设计依据与历史内容|设计依据与历史内容]]"]
scholay_related: ["[[wiki/pages/knowledge/feature-tools|功能广场]]", "[[wiki/pages/policies/service-policies|服务政策与 AI 使用边界]]"]
---

# 功能广场冷启动包与下载治理

## 当前包统计

| 指标 | 数量 |
| --- | --- |
| 记录数 | 201 条，全部 published |
| featured | 0 |
| needs_review | 54 |
| 缺 official_url | 35 |
| 含百度网盘链接 | 193（download 128 + both 65） |

价格模型：free 99、paid 58、freemium 26、trial 17、edu 1。存在 MATLAB 和 ClustalX 重复。

## 用途

导入器按 slug 幂等 upsert，适合迁移和冷启动。不是持续更新的权威工具源。仓库没有 README 所述的 feature-tools-coldstart.zip。

## 破解下载问题

slug `chemcad52cracked` 发布 ChemCAD 5.2 百度网盘破解下载，needs_review 仍为 false。该条目以及其他来源不明的非授权镜像在发布前必须下架或转为待审。

## 应建立的发布门禁

每个下载至少需要：权利来源、许可证、文件哈希、恶意软件扫描、最后验证时间和下架机制。needs_review 必须成为服务端发布门禁。
