---
title: 功能广场冷启动包与下载治理
slug: feature-tools-coldstart-governance
summary: 201 条兼容性冷启动记录用于批量导入工具目录，但大量网盘下载和明确 cracked 条目使其不能未经复核直接发布。
category: history
status: compatibility
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/feature-tools-coldstart-governance
---

# 功能广场冷启动包与下载治理

## 当前包的精确统计

feature-tools.json 有 201 条记录和 201 个同 slug 图片；201 条全部为 published，featured 为 0，54 条 needs_review，35 条缺 official_url，201 条 logo 字段为空。访问类型为 download 128、both 65、website 8；前两类共 193 条，全部含 pan.baidu.com。价格模型为 free 99、paid 58、freemium 26、trial 17、edu 1，并存在两个 MATLAB 和两个 ClustalX 展示名。

## 兼容性导入用途

导入器按 source_topic_id 或 slug 幂等 upsert，并把本地图片上传到 MinIO，所以空 logo 字段不代表缺本地图片。该目录适合迁移和冷启动，不是持续更新的权威工具源；仓库当前也没有 README 所称的 feature-tools-coldstart.zip，10k 或 5,000 条扩展包只有生成脚本而没有成品。

## P0：破解下载

slug **chemcad52cracked** 发布 ChemCAD 5.2 百度网盘破解下载，说明文本本身提及破解、法律和安全风险，但 data_quality.needs_review 仍为 false。该条目以及其他来源不明、非授权镜像在公开发布前必须下架或转为待审；“写了免责声明”不能替代软件授权和恶意文件检查。

## 应建立的发布门禁

每个下载至少需要权利来源、许可证、文件哈希、恶意软件扫描、最后验证时间和下架机制；needs_review 必须成为服务端发布门禁。导入器还应拒绝 cracked、keygen、破解器等高风险模式，持续检查失效链接、重复名、过旧版本和缺失官方 URL，并为图标记录来源与许可证。
