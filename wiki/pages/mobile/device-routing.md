---
title: 桌面与移动页面分流
slug: device-routing
summary: 根据设备能力在桌面工作区、移动工作区和响应式详情页之间选择入口。
category: mobile
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/device-routing
scholay_topics: ["[[wiki/topics/mobile/设备分流与移动网页|设备分流与移动网页]]"]
scholay_related: ["[[wiki/pages/getting-started/product-map|全站功能]]", "[[wiki/pages/mobile/mobile-web|移动 Web]]", "[[wiki/pages/mobile/wechat-mini-program|微信小程序]]"]
---

# 桌面与移动页面分流

## 分流方式

Scholay 的移动端不是只给同一棵页面树加断点。手机设备访问有移动对等页的桌面路径时，会进入 `/m/*`；桌面设备访问移动路径时，会回到桌面对等页。查询参数和文献集文件夹等深链信息会尽量保留。

## 仍使用同一路径的页面

论文、作者、期刊、PDF、公开内容和分享等需要稳定链接的页面保持原路径，通过响应式渲染适配窄屏。暂时没有移动工作区的纯桌面能力会引导用户回到移动首页或提示使用电脑。
