---
title: 优惠券系统（遗留）
slug: coupon-system-legacy
summary: 【已关闭】优惠券的发券、领券、核销或抵扣链路目前已由达人推广活动取代。
category: history
status: historical
updated: 2026-09-11T12:10:00+08:00
canonical: https://www.scholay.com/wiki/coupon-system-legacy
scholay_topics: ["[[wiki/topics/history/历史运营与兼容组件|历史运营与兼容组件]]"]
scholay_related: ["[[wiki/pages/membership/payment-orders|支付与订单]]", "[[wiki/pages/membership/gift-codes|兑换码与礼品权益]]", "[[wiki/pages/history/legacy-components|已下线与兼容组件]]"]
---

# 优惠券系统（遗留）

## 当前状态

后端没有注册 coupon handler、service 或路由。订单报价与履约不会读取 coupon_id。数据库保留的 coupon_templates、coupon_batches、user_coupons 等只是搁置结构。

## 与其他活动的区别

| 活动 | 方式 |
| --- | --- |
| 兑换码 | 直接发会员或经费 |
| 邀请活动（全民推广 / 达人计划） | 按归因发奖励或现金返利 |
| 推广弹窗 | 只展示营销二维码 |

三者都不是优惠券。当前的运营激励已转向[邀请与返利](../membership/invitation-rebate-guide.md)（含达人计划），不再依赖优惠券抵扣。若未来重启优惠券，需要重新建立用户入口、资格、计价、核销、退款反冲和审计规则。
