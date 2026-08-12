import type { RouteObject } from "react-router-dom";

export const wikiRoutes: RouteObject[] = [
  {
    path: "wiki",
    lazy: () =>
      import("./components/WikiLayout").then((m) => ({
        Component: m.WikiLayout,
      })),
    children: [
      {
        index: true,
        lazy: () =>
          import("./pages/WikiHomePage").then((m) => ({
            Component: m.WikiHomePage,
          })),
      },
      {
        path: "all",
        lazy: () =>
          import("./pages/WikiAllPage").then((m) => ({
            Component: m.WikiAllPage,
          })),
      },
      {
        path: "sources",
        lazy: () =>
          import("./pages/WikiSourcesPage").then((m) => ({
            Component: m.WikiSourcesPage,
          })),
      },
      {
        path: "coverage",
        lazy: () =>
          import("./pages/WikiCoveragePage").then((m) => ({
            Component: m.WikiCoveragePage,
          })),
      },
      {
        path: "category/:categorySlug",
        lazy: () =>
          import("./pages/WikiCategoryPage").then((m) => ({
            Component: m.WikiCategoryPage,
          })),
      },
      {
        path: ":articleSlug",
        lazy: () =>
          import("./pages/WikiArticlePage").then((m) => ({
            Component: m.WikiArticlePage,
          })),
      },
    ],
  },
];
