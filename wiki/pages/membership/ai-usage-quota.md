---
title: AI 周期额度
slug: ai-usage-quota
summary: 所有 AI 功能共享的成本额度，以首次真实消耗为锚点按周期自动恢复。
category: membership
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/ai-usage-quota
scholay_topics: ["[[wiki/topics/membership/额度消耗与恢复|额度消耗与恢复]]"]
scholay_related: ["[[wiki/pages/membership/membership|会员体系]]", "[[wiki/pages/membership/wallet-payg|经费钱包与按量付费]]", "[[wiki/pages/research-ai/smart-search|智能搜索]]", "[[wiki/pages/research-ai/claw|Scholay智能助手]]", "[[wiki/pages/research-ai/peer-review|智能审稿]]", "[[wiki/pages/research-ai/prism|Scholay Prism]]"]
---

# AI 周期额度

## 周期如何开始

用户第一次发生真实 AI 消耗时才建立周期锚点。默认周期为 7 天；到期后读取时按满额处理，下一次真实消耗再开启新周期。因此从未使用或周期已经结束的账户会显示满额，而不是从登录或购买时开始倒计时。

## 当前默认额度

进入账户资产页，你会看到当前会员、剩余额度百分比、距离恢复的时间、经费余额和可用重置次数；额度条表示“还剩多少”，不是“已经用了多少”。下图中的数值只是界面示例。当前默认值为 Free 每周期 300 算力点，Pro 为 6,000 点，Max 为 30,000 点。

实际额度可以调整，页面以百分比和周期时间呈现；某档上限设为负数时表示不限额。收费开启时，Free 基准额度和周期天数不能为零。

> 界面示意:账户资产

> **提示** 额度上限和周期可能调整。判断当前还能否使用、何时恢复时，以账户资产页当时显示的剩余百分比和恢复时间为准，不把示例数值当作长期承诺。

- [怎样读懂剩余额度与进度状态](https://www.scholay.com/wiki/marketing-pages-and-implementation-boundaries#agent-status) — 区分剩余百分比、恢复时间、任务进度和停止状态，避免把进度条当作完成证据。

## 消耗与恢复

在会员总览中，你可以查看额度条、恢复时间、近期流水和用量日历；下图展示的是有剩余额度和账户流水时的代表状态。额度按模型的实际成本计算，不按消息条数计算。

周期到期会自然恢复；实际升档，以及满足最短授予时长的兑换码或管理员赠送，会按各自规则恢复额度，并非任何权益变化都会重置。手动重置只能在额度耗尽后使用最早到期的重置次数，经费不能直接换成一次重置。系统无法可靠确认额度时，会暂时拒绝重置以避免重复扣除次数。

> 界面示意:账户资产 · 近期流水与用量

- [额度耗尽后有哪些恢复方式](https://www.scholay.com/wiki/quota-block-and-recovery#recovery-actions) — 了解一次重置、用经费继续和升级会员各自何时可用，以及被拦消息怎样保留。

## 并发请求边界

额度门禁只发生在每个 AI 回合开始前，模型结束后才按真实成本记账；单轮或多个并发回合都可能跨过 100%，系统不会在生成中途硬切断。最终成本仍会记录，因此额度不是严格的并发事务上限，用户不应依靠并发请求规避额度。

> **提示** 不要用并发请求测试或绕过额度。门禁只判断回合开始时的状态，最终仍会按各回合真实成本记账。

### 额度不足时

先保留当前任务，再根据已有资产选择恢复方式。

1. [恢复被拦下的 AI 任务](https://www.scholay.com/wiki/quota-block-and-recovery#blocked-message) — 确认消息是否真正发送，再选择重置、经费续用或升级会员。
2. [了解“用经费继续”](https://www.scholay.com/wiki/wallet-payg#autopay) — 核对开关、实际成本结算与经费流水，再决定是否按量续用。
