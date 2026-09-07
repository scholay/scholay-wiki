---
title: 会员购买、升级与续费规则
slug: subscription-lifecycle
summary: 五种当前会员场景对应的合法购买组合、计价动作与到期日变化。
category: membership
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/subscription-lifecycle
scholay_topics: ["[[wiki/topics/membership/会员权益与订阅周期|会员权益与订阅周期]]"]
scholay_related: ["[[wiki/pages/membership/membership|会员体系]]", "[[wiki/pages/membership/wallet-payg|经费钱包与按量付费]]", "[[wiki/pages/membership/payment-orders|支付与订单]]"]
---

# 会员购买、升级与续费规则

## 合法选项矩阵

- Free：可新购 Pro 或 Max，并选择开放的月付/年付。
- Pro 月付：可升 Max 月付或 Max 年付，也可续 Pro 月付/年付。
- Pro 年付：可升 Max，但升级按年费基准补差；只能续 Pro 年付。
- Max 月付：已无更高档，可续 Max 月付/年付。
- Max 年付：只能续 Max 年付。

降级不属于购买流程，后端会拒绝。年费会员也不能通过一次月付续费把周期改回月度。

## 四种计价动作

**new** 是首次购买完整周期；**renew** 在现有到期日后叠加一个自然月或自然年；**upgrade** 对剩余有效期补档位差价、到期日不变、不得改变当前周期且最低收费 1 分；**switch** 供月费会员升档并转年付，收目标档整年价，在原到期日后叠加一年。自然月和自然年使用 no-overflow 算术，月末会钳到目标月的最后一天。

## 报价与支付

选择套餐后，结算页会列出当前会员、目标档位、计费周期、到期日变化、支付方式和本次应付金额。确认这些信息后再付款；下图展示的是 Pro 月付升级 Max 时按剩余天数补差的示例，图中金额不是你的实时报价。

升级补差是一次性金额，不是新的月价或年价；付款时还会再次核对生成报价时的升级基准。每位用户同一时间只保留一笔有效的待支付订阅单；超过 2 小时的个人待支付单会在新建订单时清理，系统还会按默认 24 小时做全局清理。若其他操作已延长到期日，原先等待支付的升级单会失效，需要重新报价。

> 界面示意:升级补差与最终报价
