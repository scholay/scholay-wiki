---
title: AI 额度阻断与恢复
slug: quota-block-and-recovery
summary: AI 消息因额度不足未发送时，保留输入并通过重置、经费续用或升级恢复原任务。
category: membership
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/quota-block-and-recovery
scholay_topics: ["[[wiki/topics/membership/额度消耗与恢复|额度消耗与恢复]]"]
scholay_related: ["[[wiki/pages/membership/ai-usage-quota|AI 周期额度]]", "[[wiki/pages/membership/wallet-payg|经费钱包与按量付费]]", "[[wiki/pages/research-ai/claw-stream-tool-states|智能助手延迟、发送失败]]"]
---

# AI 额度阻断与恢复

## 被拦消息不会假装已发送

额度不足时，本轮消息会明确显示为“未发送/额度不足”，输入文字、文库引用和已经保存的附件仍留在当前会话中。下图只展示全局系统通知的一种样式；Claw、智能搜索和 Prism 的输入区恢复条，以及矩阵、翻译、审稿等操作的弹窗，不在此图中。

> 界面示意:额度状态 · 全局系统通知（单一状态）

- [为什么这轮任务会被额度门禁拦下](https://www.scholay.com/wiki/ai-usage-quota#accounting) — 了解所有 AI 功能共享的成本额度、恢复周期和真实成本记账方式。

## 恢复方式

点击额度提示后，可以选择使用 1 次重置、开启“用经费继续”或升级会员；下图只展示恢复入口，点击“立即恢复”后的二次确认不在图中。重置会立即恢复满额并重新开始周期；经费续用只支付超出周期额度的部分，之后可在账户资产中关闭。

只有仍有重置次数或经费时，对应按钮才可用；没有可用资产时可以进入会员升级。

> 界面示意:额度耗尽与恢复

> **提示** 先确认原消息仍标记为未发送，再选择恢复方式。重置会立即开始新周期；“用经费继续”只在你明确开启后按超额部分结算。

- [“用经费继续”怎样结算](https://www.scholay.com/wiki/wallet-payg#autopay) — 了解开关不会预扣、在途回合怎样记账，以及为什么低余额可能出现小额负数。

## 恢复原任务

重置额度或开启经费续用成功后，页面会刷新额度，并允许你重新发送刚才被拦下的消息；也可以选择忽略它。关闭提示本身不会恢复额度，也不会把未发送的消息改成已发送。

### 恢复后继续

重新发送前确认额度或经费状态，之后再核对实际流水。

1. [查看当前额度与恢复时间](https://www.scholay.com/wiki/ai-usage-quota#amounts) — 以账户资产页的当前百分比和恢复时间判断是否已经恢复。
2. [核对科研经费余额与流水](https://www.scholay.com/wiki/wallet-payg#balance) — 在开启按量续用后区分周期额度与经费变化，检查实际结算记录。
