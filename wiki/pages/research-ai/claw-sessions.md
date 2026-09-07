---
title: Claw 会话与历史
slug: claw-sessions
summary: 创建、切换、重命名和删除自己的 Claw 会话，并在长历史中分批加载较早轮次。
category: research-ai
status: current
updated: 2026-09-06T17:41:52+08:00
canonical: https://www.scholay.com/wiki/claw-sessions
scholay_topics: ["[[wiki/topics/research-ai/Claw 上下文与任务执行|Claw 上下文与任务执行]]"]
scholay_related: ["[[wiki/pages/research-ai/claw|Scholay智能助手]]", "[[wiki/pages/research-ai/claw-attachments-and-references|智能助手附件、文库引用与 Skill]]", "[[wiki/pages/research-ai/claw-stream-tool-states|智能助手延迟、发送失败]]"]
---

# Claw 会话与历史

## 会话入口

打开 Claw 时会进入新对话或恢复当前入口；从会话历史选择一条记录后，会打开对应对话。列表按最近访问时间组织，并且只显示当前账户拥有的会话。

## 管理动作

在桌面端从对话区顶部打开会话历史，或在手机端拉出会话抽屉，就可以新建、切换、重命名和删除对话；下图展示桌面历史列表。标题不能为空，删除前会再次确认；删除当前会话后会切到剩余会话，没有其他记录时回到新对话。

每个会话会保存自己的模型选择，刷新页面或换设备后仍以该会话已经保存的选择为准。

> 界面示意:Claw · 会话历史

## 长历史加载

打开很长的会话时，页面会先载入最近 100 轮；点击“加载更早”，每次再增加 100 轮。为了保持滚动流畅，页面先显示最近 60 轮，再分批展开。
