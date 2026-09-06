---
title: 优惠券系统（遗留）
slug: coupon-system-legacy
summary: 数据库基线仍保留优惠券表和订单字段，但现行产品没有发券、领券、核销或抵扣链路。
category: history
status: historical
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/coupon-system-legacy
---

# 优惠券系统（遗留）

## 当前状态

当前后端没有注册 coupon handler、service 或路由，订单报价与履约也不会读取 coupon_id。数据库基线虽然保留 coupon_templates、coupon_batches、user_coupons、coupon_usage_logs 和订单关联字段，但这些只是搁置结构，不能据此宣传“优惠券可用”。

## 与其他活动区分

兑换码会直接发会员或经费，邀请活动按归因发奖励，Promo 只展示营销二维码；三者都不是优惠券。若未来重启优惠券，需要重新建立用户入口、资格、计价、核销、退款反冲和审计规则。
