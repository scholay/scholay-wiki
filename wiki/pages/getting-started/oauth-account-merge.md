---
title: OAuth 邮箱冲突与账号合并
slug: oauth-account-merge
summary: 第三方邮箱命中已有 Scholay 账户时，需要你验证目标账户后决定合并或新建独立账户。
category: getting-started
status: current
updated: 2026-09-11T11:30:00+08:00
canonical: https://www.scholay.com/wiki/oauth-account-merge
scholay_topics: ["[[wiki/topics/getting-started/绑定与账号合并|绑定与账号合并]]"]
scholay_related: ["[[wiki/pages/getting-started/oauth-wechat-login|OAuth 与微信扫码登录]]", "[[wiki/pages/getting-started/account-connections|第三方账号连接与解绑]]", "[[wiki/pages/getting-started/account|Scholay 账户]]"]
---

# OAuth 邮箱冲突与账号合并

## 为什么不会自动合并

第三方登录使用的邮箱与现有 Scholay 账户相同时，系统不会只凭邮箱相同就自动绑定。它会先发放一份仅用于本次确认的一次性凭据，让你自己决定。这样可以避免他人仅控制第三方身份便接管你的已有账户。

## 两种选择

> 界面示意:邮箱冲突后的安全合并选择

确认页面会列出第三方平台、第三方邮箱和已有 Scholay 账户：

| 选择 | 操作 | 结果 |
| --- | --- | --- |
| 合并账户 | 先登录已有 Scholay 账户证明本人身份 | 第三方方式绑定到已有账户 |
| 创建独立账户 | 直接创建 | 新账户可能暂时没有邮箱，只能先用该第三方方式登录 |

选择"创建独立账户"后，可以到安全设置中添加其他登录方式。

## 取消不会绑定

点击取消不会把第三方身份绑定到旧账户。为了验证已有账户而进行的这次登录，也不会被当成一次新的邀请注册。
