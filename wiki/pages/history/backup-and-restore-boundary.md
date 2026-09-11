---
title: 备份、恢复与故障证据边界
slug: backup-and-restore-boundary
summary: 现有备份脚本能导出部分核心数据，但缺少一致快照、自动恢复演练和完整日志覆盖。
category: history
status: compatibility
updated: 2026-09-11T12:10:00+08:00
canonical: https://www.scholay.com/wiki/backup-and-restore-boundary
scholay_topics: ["[[wiki/topics/history/数据备份与恢复依据|数据备份与恢复依据]]"]
scholay_related: []
---

# 备份、恢复与故障证据边界

## 当前备份覆盖

backup-all 导出 MySQL，并归档 data/agent、data/agent-sessions 和 MinIO。当前可恢复会话依赖 MySQL durable journal，相关文件分布在 agent-sessions 和对象存储中。

## 缺失

| 缺失项 | 说明 |
| --- | --- |
| 一致性快照 | MySQL、MinIO 和文件目录不在同一时间点 |
| 覆盖范围 | 缺少 Umami、redis-persist、Redis AOF 的明确备份 |
| 安全与验证 | 无校验和、加密、异地副本、PITR、保留验证 |
| 自动演练 | 无定期自动恢复演练 |
| 部署检查 | deploy 不检查最近一次备份是否成功 |

## 恢复文档

RESTORE.md 仍引用旧 Agent JSONL 目录，无法完整描述当前 durable journal 架构。恢复顺序需要重新定义 MySQL、对象存储、redis-persist、Agent 工作区和服务配置的一致点。

## 故障证据

export-logs 仍引用已移除的 frontend_admin，遗漏多个服务。日志导出应从 Compose 动态枚举服务，同时保存版本、容器状态和迁移结果。
