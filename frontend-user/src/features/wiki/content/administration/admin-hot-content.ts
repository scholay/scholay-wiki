import type { WikiArticle } from "../../types";

export const AdminHotContentArticle: WikiArticle = {
  slug: "admin-hot-content",
  title: "热门内容运营",
  summary: "按搜索和曝光点击指标观察热门论文、期刊并执行数据保留清理。",
  category: "administration",
  kind: "page",
  status: "current",
  audience: ["运营人员", "管理员"],
  aliases: ["热门论文", "热门期刊", "热度清理"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/HotContentPage.tsx",
    "frontend-user/src/features/admin/api/hot-content.ts",
    "backend/internal/hotcontent/model.go",
    "backend/internal/hotcontent/repository.go",
    "backend/internal/hotcontent/service.go",
  ],
  related: ["academic-search", "admin-site-analytics"],
  sections: [
    {
      id: "signals",
      title: "热度信号",
      markdown: `进入热门内容页，可以在热搜词、热门论文和热门期刊之间切换，并按时间范围比较搜索、曝光和点击；下图展示的是已有热度数据时的列表状态。

论文与期刊检索热度使用 search_count；论文另统计 impression_count、click_count 和 seo_view_count。历史 view_count 字段可能仍存在，但当前已不再更新，不能当作实时浏览量。`,
      embeds: [{ id: "admin-hot-content" }],
    },
    {
      id: "retention",
      title: "保留与清理",
      markdown: `打开清理设置，可以调整热词和热门论文的保留天数、最大记录量，并查看自动清理时间；下图展示的是策略已载入、可以编辑的状态。保存或手动清理前应确认影响范围。

查询时间窗最多 180 天；保留天数可设为 1–3650 天，最大记录量为 100 到 1000 万。系统每天 04:30 自动清理，config.manage 也可手动触发；analytics.view 只能读取。`,
      embeds: [
        {
          id: "admin-hot-cleanup-config",
          caption: "热门记录的保留数量与自动清理策略",
        },
      ],
    },
  ],
};
