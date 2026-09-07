---
title: 社区技能
slug: community-skills
summary: 用户创建、发布、安装和管理的 SKILL.md 能力，可按需注入 Claw 会话。
category: knowledge
status: current
updated: 2026-09-06T17:43:47+08:00
canonical: https://www.scholay.com/wiki/community-skills
scholay_topics: ["[[wiki/topics/knowledge/工具与社区技能|工具与社区技能]]"]
scholay_related: ["[[wiki/pages/research-ai/claw|Scholay智能助手]]", "[[wiki/pages/knowledge/feature-tools|功能广场]]", "[[wiki/pages/knowledge/academic-intelligence-interface-guide|学术情报界面导览]]"]
---

# 社区技能

## 技能生命周期

在功能广场的“社区技能”中，你可以浏览详情并安装公开技能；如果你是作者，还可以创建版本、提交发布并在“我的技能”中查看状态。下方三张图依次展示浏览与安装、提交发布和版本管理。

技能可设为私有、仅链接可见或公开；公开提交后需要审核。第三张图的背景列表同时显示审核中、已通过、草稿，以及公开/私有状态；前景弹窗修改基本信息可即时生效，上传新内容则会让已公开版本重新审核。只有“公开、已通过、启用中”的版本会出现在市场并允许安装，草稿、待审核、被拒绝、被标记、被停用或已删除的版本不会公开分发。

> 界面示意:社区 Skill

> 界面示意:社区技能 · 上传与发布

> 界面示意:社区 Skill · 列表与编辑公开版本

## 会话加载

创建智能助手会话时，系统会把你已启用的技能作为本次对话的做事指南。Free 账户最多持有 10 个技能，付费账户最多 50 个；每个技能最多保留 20 个版本，每个会话最多启用 5 个。

技能可以说明步骤和输出要求，但不能改变账户权限，也不能要求助手执行原本无权执行的操作。

- [Skill 在智能助手中怎样加载](https://www.scholay.com/wiki/claw#skills) — 了解会话里的技能、工具与账户权限分别承担什么角色。

## 信任与举报

公开技能可能包含不准确或不安全的步骤。作者不能举报自己的技能；同一用户对同一技能只能保留一份举报，举报不会自动下架内容，而是进入管理员审查。执行器仍需用权限、工作目录和工具策略限制实际动作。安装表示允许会话参考该技能，不代表 Scholay 对内容背书。

> **提示** Skill 是任务指南，不是工具授权，也不是安全证明。安装前检查作者、版本、外链和权限诱导；执行时仍以工具与沙箱策略为准。

- [工具、沙箱与出站网络边界](https://www.scholay.com/wiki/agent-tool-and-sandbox-boundary) — 进一步了解 Skill 无法绕过的执行权限、工作目录与网络限制。

### 使用社区技能的下一步

1. [在智能助手中启用 Skill](https://www.scholay.com/wiki/claw#skills) — 把经过核对的技能加入会话，并继续用明确的任务说明约束输出。
2. [核对执行权限](https://www.scholay.com/wiki/agent-tool-and-sandbox-boundary) — 在处理文件、外部请求或敏感任务前，确认真实工具边界。
