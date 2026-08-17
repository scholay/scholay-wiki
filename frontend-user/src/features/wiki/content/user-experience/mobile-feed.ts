import type { WikiArticle } from "../../types";

export const MobileFeedArticle: WikiArticle = {
  slug: "mobile-feed",
  title: "移动 Feed：论文、期刊与情报",
  summary:
    "在移动 Web 中上下滑动浏览论文、期刊和 scholay 情报，横滑切换频道并下拉刷新。",
  category: "mobile",
  kind: "page",
  status: "current",
  audience: ["手机用户", "移动端研究者"],
  aliases: ["刷论文", "刷期刊", "刷情报", "移动信息流"],
  sourcePaths: [
    "frontend-user/src/features/mobile/pages/FeedPage.tsx",
    "frontend-user/src/features/mobile/pages/JournalFeedPage.tsx",
    "frontend-user/src/features/mobile/components/JournalFeedCard.tsx",
    "frontend-user/src/features/mobile/pages/NewsPage.tsx",
    "frontend-user/src/features/mobile/components/VerticalSwipeFeed.tsx",
    "frontend-user/src/features/mobile/api/feed.ts",
    "frontend-user/src/features/mobile/api/journal-feed.ts",
  ],
  related: [
    "mobile-web",
    "paper-favorites",
    "research-news",
    "citation-dialog",
  ],
  sections: [
    {
      id: "navigation",
      title: "三条信息流",
      markdown: `移动 Feed 分为论文、期刊和情报三个频道。三者都采用纵向一屏一卡，并会提前加载接下来的内容；横向滑动可以在三个频道之间切换，不会干扰上下浏览。加载、继续加载、错误、空内容和下拉刷新使用一致的提示；只有期刊频道额外显示可点击的“下一刊”预览条。`,
    },
    {
      id: "papers-journals",
      title: "论文与期刊的种子",
      markdown: `在论文或期刊频道上下滑动，每次会继续加载 10 条；下拉刷新会换一组推荐。下方三张图分别展示论文卡、期刊卡，以及信息流加载失败后可以重试的状态。

论文会在 Graph、Discovery、Medicine 和不同主题之间轮换，并偏向较新的内容；期刊大致按影响因子排序，同时变化起始位置。两条信息流最多各浏览 60 页，连续 4 个空页后停止；前 3 页和当前位置会保存在本机，返回同一组推荐时可以接着看。`,
      embeds: [
        { id: "mobile-feed" },
        { id: "mobile-journal-feed" },
        { id: "mobile-feed-states" },
      ],
    },
    {
      id: "news-actions",
      title: "情报与卡片动作",
      markdown: `切到“情报”后，可以在“实时”和“热榜”之间切换，每批加载 8 条；下图展示的是移动端 scholay 情报卡。下拉刷新会更新当前查询，但不会保存随机推荐组或阅读位置。

论文卡可以查看作者标识与引用、分享，并在登录后收藏或取消收藏；卡片本身暂时不能打开论文详情。期刊卡目前只有收藏占位和分享，也不能打开标准期刊详情。收藏图标会先即时变化，最终以文献集是否保存成功为准。`,
      embeds: [{ id: "mobile-academic-intel" }],
    },
  ],
};
