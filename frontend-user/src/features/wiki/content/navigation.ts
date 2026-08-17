import type { WikiNavCategoryMeta } from "../types";
import { overviewNavCategory } from "./navigation/overview";
import { scenariosNavCategory } from "./navigation/scenarios";
import { assistantNavCategory } from "./navigation/assistant";
import { literatureSearchNavCategory } from "./navigation/literature-search";
import { journalSearchNavCategory } from "./navigation/journal-search";
import { writingNavCategory } from "./navigation/writing";
import { reviewNavCategory } from "./navigation/review";
import { intelligenceNavCategory } from "./navigation/intelligence";
import { resourcesNavCategory } from "./navigation/resources";
import { limitsNavCategory } from "./navigation/limits";
import { subscriptionNavCategory } from "./navigation/subscription";
import { referralsNavCategory } from "./navigation/referrals";
import { loginNavCategory } from "./navigation/login";
import { roadmapNavCategory } from "./navigation/roadmap";
import { termsNavCategory } from "./navigation/terms";
import { otherNavCategory } from "./navigation/other";

/**
 * 读者导航严格采用 `scholay-wiki.xmind` 的 15 个一级栏目顺序，并追加
 * “其他”承接不能自然进入用户任务框架的现有词条。旧 WikiCategory 仍负责
 * 内容权限；这里仅负责读者看到的信息架构。
 */
export const WIKI_NAV_CATEGORIES: WikiNavCategoryMeta[] = [
  overviewNavCategory,
  scenariosNavCategory,
  assistantNavCategory,
  literatureSearchNavCategory,
  journalSearchNavCategory,
  writingNavCategory,
  reviewNavCategory,
  intelligenceNavCategory,
  resourcesNavCategory,
  limitsNavCategory,
  subscriptionNavCategory,
  referralsNavCategory,
  loginNavCategory,
  roadmapNavCategory,
  termsNavCategory,
  otherNavCategory,
];
