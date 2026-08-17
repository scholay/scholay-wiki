import type { WikiNavCategoryMeta } from "../../types";
import { accountSettingsNode } from "./other/account-settings";
import { helpContentSharingNode } from "./other/help-content-sharing";
import { researchCapabilitiesNode } from "./other/research-capabilities";
import { toolsCommunityNode } from "./other/tools-community";
import { mobileNode } from "./other/mobile";
import { administrationNode } from "./other/administration";
import { platformNode } from "./other/platform";
import { historyNode } from "./other/history";

export const otherNavCategory: WikiNavCategoryMeta = {
  slug: "other",
  title: "其他",
  shortTitle: "其他",
  description:
    "收纳不属于主任务框架，但仍需保留和核对的账户、移动、运营、技术与历史内容。",
  children: [
    accountSettingsNode,
    helpContentSharingNode,
    researchCapabilitiesNode,
    toolsCommunityNode,
    mobileNode,
    administrationNode,
    platformNode,
    historyNode,
  ],
};
