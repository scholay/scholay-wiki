---
title: AI 额度阻断与恢复
slug: quota-block-and-recovery
summary: AI 消息因额度不足未发送时——保留输入，通过重置、经费续用或升级恢复原任务。
category: membership
status: current
updated: 2026-09-11T12:10:00+08:00
canonical: https://www.scholay.com/wiki/quota-block-and-recovery
scholay_topics: ["[[wiki/topics/membership/额度消耗与恢复|额度消耗与恢复]]"]
scholay_related: ["[[wiki/pages/membership/ai-usage-quota|AI 周期额度]]", "[[wiki/pages/membership/wallet-payg|经费钱包与按量付费]]"]
---

# AI 额度阻断与恢复

## 被拦消息不会假装已发送

额度不足时，本轮消息明确显示为"未发送/额度不足"。输入文字、文库引用和已保存的附件仍留在当前会话中。

> 界面示意:额度状态 · 全局系统通知（单一状态）

- [额度怎样计算](ai-usage-quota.md) — 所有 AI 功能共享的成本额度和恢复周期。

## 恢复方式

> 界面示意:额度耗尽与恢复

| 方式 | 说明 | 条件 |
| --- | --- | --- |
| 使用 1 次重置 | 立即恢复满额并重新开始周期 | 有剩余重置次数 |
| 用经费继续 | 只支付超出周期额度的部分 | 有经费余额 |
| 升级会员 | 提高额度上限 | 有更高档位可选 |

没有可用资产时对应按钮不可用，可以进入会员升级。

先确认原消息仍标记为未发送，再选择恢复方式。

## 恢复后

重置或开启经费续用成功后，页面刷新额度，允许重新发送被拦下的消息，也可以选择忽略。关闭提示不会恢复额度，也不会把未发送的消息改成已发送。

- [经费续用怎样结算](wallet-payg.md) — 开关、实际成本结算和经费流水。
