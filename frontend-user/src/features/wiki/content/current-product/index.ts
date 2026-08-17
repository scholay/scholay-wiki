import type { WikiArticle } from "../../types";
import { SiteNavigationArticle } from "./site-navigation";
import { MyResourcesArticle } from "./my-resources";
import { ManuscriptCollectionArticle } from "./manuscript-collection";
import { ScholayPlazaArticle } from "./scholay-plaza";
import { DatasetsSearchArticle } from "./datasets-search";
import { AcademicPromptsArticle } from "./academic-prompts";

/**
 * mock2 产品现行信息架构。纯前端 mock 能力必须保持 experimental，
 * 不能因为路由可达就写成后端已经交付。
 */
export const currentProductArticles: WikiArticle[] = [
  SiteNavigationArticle,
  MyResourcesArticle,
  ManuscriptCollectionArticle,
  ScholayPlazaArticle,
  DatasetsSearchArticle,
  AcademicPromptsArticle,
];
