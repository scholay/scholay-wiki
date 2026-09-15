---
title: 经费钱包与按量付费
slug: wallet-payg
summary: 充值或活动获得的科研经费——在周期额度用完后按实际消耗继续使用 AI。
category: membership
status: current
updated: 2026-09-11T12:10:00+08:00
canonical: https://www.scholay.com/wiki/wallet-payg
scholay_topics: ["[[wiki/topics/membership/费用与支付|费用与支付]]"]
scholay_related: ["[[wiki/pages/membership/ai-usage-quota|AI 周期额度]]", "[[wiki/pages/membership/membership|会员体系]]", "[[wiki/pages/membership/payment-orders|支付与订单]]", "[[wiki/pages/membership/invite-campaign|邀请有礼]]", "[[wiki/pages/research-ai/ai-models-and-runtime-config|选模型、思考深度和大约能用多少次]]"]
---

# 经费钱包与按量付费

## 科研经费是什么

科研经费是你通过充值、兑换码或活动奖励获得的余额，长期保留，不会过期。它和每周期自动恢复的 AI 额度是两套不同的权益。

> 界面示意:账户资产

账户资产页会把经费余额和周期额度分开显示。"用经费继续"开关开启后，周期额度用完时会自动从经费中扣除超出部分的费用。

## 充值

> 界面示意:经费充值与订单确认

| 项目 | 默认值 |
| --- | --- |
| 兑换率 | ¥1 → 100 经费 → 300 算力点 |
| 最低充值 | ¥10 |

兑换率和最低金额可能调整，以充值页面显示为准。

## "用经费继续"怎样工作

- 默认关闭，需要你手动开启。
- 开启后，当周期额度用完时，只对超出部分从经费中扣费，不会把整次对话重复收费。
- 开启不会预先扣钱，也不会降低 AI 回答质量。
- 可以随时在账户资产页关闭。

开启前建议先确认经费余额。每次 AI 任务结束后实际费用才写入流水。

- [额度耗尽了怎么办](quota-block-and-recovery.md) — 从被拦下的任务开启经费续用。
- [查看充值订单](payment-orders.md) — 订单和支付记录。
- [每 1,000 经费大约能用多少次](../research-ai/ai-models-and-runtime-config.md#purchasing-power) — 按模型档位估算经费购买力，不是固定可调用次数。
