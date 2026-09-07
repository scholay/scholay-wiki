---
title: 智能搜索
slug: smart-search
summary: 以自然语言与 Agent 会话驱动的学术检索，返回解释、论文清单和来源证据。
category: research-ai
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/smart-search
scholay_topics: ["[[wiki/topics/research-ai/智能检索与证据核验|智能检索与证据核验]]"]
scholay_related: ["[[wiki/pages/discovery/academic-search|论文检索]]", "[[wiki/pages/discovery/paper|论文]]", "[[wiki/pages/membership/ai-usage-quota|AI 周期额度]]"]
---

# 智能搜索

## 与传统搜索的区别

在智能搜索输入框中直接写下完整的研究问题，例如研究对象、方法和时间范围，再发送即可；下图展示的是等待输入时的状态。智能搜索会围绕问题规划检索、整理来源并给出说明，传统搜索则更适合明确检索词和筛选条件。

两种方式都能找到论文，但智能搜索还会保留这一轮对话中的查询过程和来源线索。

- [把研究需求写成可执行的第一问](https://www.scholay.com/wiki/smart-literature-search-guide#frame-the-question) — 按学科复制提问模板，明确对象、时间、结果类型与证据边界。

> 界面示意:智能搜索 · 输入栏

## 会话与连接

发送问题后，页面会在同一会话中逐步形成回答。下图展示已经得到回答和论文组的结果态；折叠的“思考过程”用于查看本轮过程摘要，论文可逐篇选择或一键暂存。底部会话条用于切换历史任务或开启不继承旧上下文的新对话。

连接短暂中断时，页面会另行提示并尝试恢复，你不需要重新复制已经送达的问题。实时连接使用一次性的短期凭据，不会把长期登录信息直接放进连接地址。

> 界面示意:智能搜索 · 回答、论文组与会话条

- [推理过程和任务状态怎样读](https://www.scholay.com/wiki/marketing-pages-and-implementation-boundaries#agent-status) — 区分可展开的过程摘要、工具执行、任务进度与最终回答。

## 论文与证据

搜索回答可以附带结构化论文清单和证据引用。论文卡仍连接到标准论文实体，用户应打开详情或全文验证回答中的事实，而不是只引用对话文字。
