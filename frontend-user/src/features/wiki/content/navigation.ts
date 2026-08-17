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
 * 读者导航的 15 个任务栏目按当前产品阅读顺序聚合，并追加“其他”承接不能
 * 自然进入用户任务框架的现有词条。旧 WikiCategory 仍负责内容权限；这里是
 * 读者目录结构与顺序的唯一真源。
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
