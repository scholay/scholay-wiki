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
  description: "账户设置、帮助、移动端，以及管理后台、平台和历史词条。",
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
