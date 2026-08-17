import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const loginNavCategory: WikiNavCategoryMeta = {
  slug: "login",
  title: "登录方式",
  shortTitle: "登录",
  description: "使用手机、邮箱、微信或管理员启用的第三方账号登录 Scholay。",
  children: [
    {
      id: "login-overview",
      title: "登录方式总览",
      target: primary("login-methods-guide"),
    },
    {
      id: "login-scholay",
      title: "Scholay 登录",
      target: primary("account"),
      children: [
        {
          id: "login-phone",
          title: "手机号",
          target: primary("email-phone-authentication"),
        },
        {
          id: "login-wechat",
          title: "微信",
          target: jump("oauth-wechat-login"),
        },
      ],
    },
    {
      id: "login-third-party",
      title: "第三方授权登录",
      target: primary("oauth-wechat-login"),
      children: [
        {
          id: "login-ent-community",
          title: "恩特学术社区",
          target: jump("oauth-wechat-login", "providers"),
        },
        {
          id: "login-other-providers",
          title: "其他已启用提供方",
          target: jump("oauth-wechat-login", "providers"),
        },
      ],
    },
    {
      id: "login-email",
      title: "邮箱",
      target: jump("email-phone-authentication"),
    },
    {
      id: "login-account-merge",
      title: "第三方账号冲突与合并",
      target: primary("oauth-account-merge"),
    },
    {
      id: "login-account-connections",
      title: "第三方账号绑定与解绑",
      target: primary("account-connections"),
    },
  ],
};
