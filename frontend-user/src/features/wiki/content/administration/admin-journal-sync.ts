import type { WikiArticle } from "../../types";

export const AdminJournalSyncArticle: WikiArticle = {
  slug: "admin-journal-sync",
  title: "期刊同步与发布",
  summary: "把上游期刊数据分批暂存、筛选并发布到站内 SEO 数据面的任务流程。",
  category: "administration",
  kind: "architecture",
  status: "current",
  audience: ["内容运营", "管理员", "开发者"],
  aliases: ["Journal Sync", "期刊导入", "期刊发布"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/JournalSyncPage.tsx",
    "frontend-user/src/features/admin/api/journal-sync.ts",
    "backend/internal/seoingest/model.go",
    "backend/internal/seoingest/service.go",
    "backend/internal/seo/repository_journal_ingest.go",
  ],
  related: ["authors-and-journals", "admin-tool-operations"],
  sections: [
    {
      id: "states",
      title: "同步状态机",
      markdown: `在期刊同步页可以开始新任务，并对当前任务执行暂停、继续或取消；页面会显示抓取、暂存和发布进度。下图展示的是已有活跃任务和历史记录时的代表状态。

状态为 running、paused、done、failed 或 cancelled，同一时间只能有一个 running 或 paused 任务。活跃时页面每 5 秒刷新，空闲时每 30 秒刷新；取消只停止后续抓取，已暂存数据仍会保留。`,
      embeds: [{ id: "admin-journal-sync" }],
    },
    {
      id: "publication",
      title: "暂存不等于公开",
      markdown: `数据按上游读取 → staged 暂存 → 档位资格筛选 → published 发布推进，不会在拉取后立即公开。发布可按档位和数量执行，单次上限 50000，并按批次事务写入；成功后再更新 sitemap 和提交队列，某一批失败会回滚该批。`,
    },
  ],
};
