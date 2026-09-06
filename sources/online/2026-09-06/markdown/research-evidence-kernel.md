---
title: 研究证据内核与声明核验
slug: research-evidence-kernel
summary: 在模型回答前预取文献、建立只读证据账本并要求显式退出，但跨主题路由和声明核验仍属于实验性保障层。
category: research-ai
status: experimental
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/research-evidence-kernel
---

# 研究证据内核与声明核验

## 证据回合流程

确定性路由器把纯检索表面或文献意图送入 evidence phase。Executor 在第一次模型调用前向 Minicod 做预取，默认 semantic source、limit 5、超时 8 秒；失败不阻断回合。成功结果进入只读账本并获得 E1、E2 等 ID，模型通过 EvidenceGet 读取元数据、全文或片段，最后必须调用 SubmitAnswer 或 DeclareInsufficient 退出。

## 它能保证什么

账本可以让引用对象和工具证据可追踪，也能阻止 evidence phase 仅用普通文本悄悄结束；它不能证明来源本身正确、覆盖完整或支持模型的每一句推断。用户仍应打开原论文核对论点、研究设计和数据。

## 实验性限制

账本一旦非空，后续回合当前会进入 ledger_grounded chat，而不会可靠判断用户是否切换了研究主题，旧证据可能污染新问题。claims honesty audit 默认开启但只观察和记录，不会触发纠错回合或阻断回答。由于这两个限制，证据内核已经在现行路径运行，但其“事实保障层”状态仍标为 experimental。
