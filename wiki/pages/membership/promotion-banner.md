---
title: 站内推广活动
slug: promotion-banner
summary: 由后台启停的站内推广文案与二维码入口，关闭时不向用户泄露活动内容。
category: membership
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/promotion-banner
scholay_topics: ["[[wiki/topics/membership/活动与兑换权益|活动与兑换权益]]"]
scholay_related: ["[[wiki/pages/membership/membership|会员体系]]"]
---

# 站内推广活动

## 配置

活动开启时，用户会在首页或额度不足场景看到带标题、福利说明、微信二维码和关闭按钮的推广弹窗；下图展示的是配置已经生效的一种代表状态。运营人员在后台控制启用状态、文案和二维码。

公开摘要 API 不直接返回大体积二维码数据，客户端会通过带内容版本的独立 URL 读取图片；替换图片后地址随版本变化，避免继续显示旧缓存。

> 界面示意:限时会员活动弹窗

## 关闭状态

活动关闭时，公开接口只返回未启用状态，不返回二维码或内部文案；客户端也不应保留旧活动入口。推广活动与邀请奖励是两个独立配置域。Promo 目前只有展示和跳转，没有领取接口、资格判定或权益入账逻辑，扫码或点击本身不会给账户发会员或经费。
