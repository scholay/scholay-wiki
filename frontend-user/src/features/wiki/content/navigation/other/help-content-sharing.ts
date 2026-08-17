import type { WikiNavNode } from "../../../types";
import { primary } from "../targets";

export const helpContentSharingNode: WikiNavNode = {
  id: "other-help-content-sharing",
  title: "帮助、内容与分享",
  children: [
    {
      id: "other-feedback-support",
      title: "反馈与支持",
      target: primary("feedback-and-support"),
    },
    {
      id: "other-help-qa",
      title: "帮助中心与学术问答",
      target: primary("help-center-and-qa"),
    },
    {
      id: "other-resource-blog",
      title: "学术资源中心与产品博客",
      target: primary("resource-and-blog-center"),
    },
    {
      id: "other-share-cards",
      title: "分享卡片、短链与海报",
      target: primary("share-cards-and-posters"),
    },
  ],
};
