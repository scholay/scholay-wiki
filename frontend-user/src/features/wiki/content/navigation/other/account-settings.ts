import type { WikiNavNode } from "../../../types";
import { primary } from "../targets";

export const accountSettingsNode: WikiNavNode = {
  id: "other-account-settings",
  title: "账户与个人设置",
  children: [
    {
      id: "other-profile-settings",
      title: "个人资料设置",
      target: primary("profile-settings"),
    },
    {
      id: "other-account-security",
      title: "密码、邮箱与手机号安全设置",
      target: primary("account-security-settings"),
    },
    {
      id: "other-notifications",
      title: "站内通知中心",
      target: primary("notification-center"),
    },
  ],
};
