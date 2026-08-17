import type { WikiNavNode } from "../../../types";
import { primary } from "../targets";

export const mobileNode: WikiNavNode = {
  id: "other-mobile",
  title: "移动端与小程序",
  children: [
    {
      id: "other-mobile-web",
      title: "移动 Web",
      target: primary("mobile-web"),
    },
    {
      id: "other-wechat-mini-program",
      title: "微信小程序",
      target: primary("wechat-mini-program"),
    },
    {
      id: "other-device-routing",
      title: "桌面与移动页面分流",
      target: primary("device-routing"),
    },
    {
      id: "other-mini-program-runtime",
      title: "小程序页面、端间差异与内容安全",
      target: primary("mini-program-runtime-and-parity"),
    },
  ],
};
