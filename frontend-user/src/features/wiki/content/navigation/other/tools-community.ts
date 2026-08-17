import type { WikiNavNode } from "../../../types";
import { primary } from "../targets";

export const toolsCommunityNode: WikiNavNode = {
  id: "other-tools-community",
  title: "scholay广场与社区",
  children: [
    {
      id: "other-scholay-plaza",
      title: "scholay广场",
      target: primary("scholay-plaza"),
    },
    {
      id: "other-feature-tools",
      title: "学术工具目录",
      target: primary("feature-tools"),
    },
    {
      id: "other-academic-prompts",
      title: "学术prompts",
      target: primary("academic-prompts"),
    },
  ],
};
