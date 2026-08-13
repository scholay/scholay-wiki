import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WIKI_ARTICLE_BY_SLUG,
  WIKI_ARTICLES,
  WIKI_CATEGORIES,
  WIKI_NAV_CATEGORIES,
  WIKI_PRODUCT_MENUS,
  WIKI_START_PATHS,
  articleNavTrail,
  resolveWikiProductMenu,
  resolveWikiProductMenuFromNavCategory,
  visibleNavCategories,
  wikiSectionPlainText,
} from "../src/features/wiki/content";
import { WIKI_EMBED_REGISTRY } from "../src/features/wiki/embeds/registry";
import { WIKI_MOCK_SURFACE_BASELINE } from "../src/features/wiki/coverage";
import {
  ADMIN_MOCK_SURFACE_COVERAGE,
  MOBILE_MOCK_SURFACE_COVERAGE,
  MOCK_SURFACE_COVERAGE,
  MOCK_SURFACE_COVERAGE_EXPECTED_TOTALS,
  MOCK_SURFACE_COVERAGE_STATS,
  USER_MOCK_SURFACE_COVERAGE,
} from "../src/features/wiki/embeds/mock-surface-coverage";
import {
  WIKI_ARTICLE_INTRO_VISUALS,
  WIKI_CATEGORY_ICON_SRC,
  WIKI_EXTRA_FEATURE_ICON_SRC,
} from "../src/features/wiki/visuals/catalog";
import {
  WIKI_TERM_LINKS,
  linkWikiTerms,
} from "../src/features/wiki/content/wiki-term-links";
import type {
  WikiArticleTarget,
  WikiEmbedId,
  WikiEmbedRef,
  WikiNavNode,
  WikiNavTarget,
} from "../src/features/wiki/types";

const repoRoot = path.resolve(process.cwd(), "..");

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(target) : [target];
  });
}

function wikiCorpus(): string {
  return WIKI_ARTICLES.flatMap((article) => [
    article.slug,
    article.title,
    article.summary,
    article.category,
    article.kind,
    article.status,
    ...article.audience,
    ...(article.aliases ?? []),
    ...article.sourcePaths,
    ...article.sections.flatMap((section) => [
      section.id,
      section.title,
      section.markdown,
      ...(section.table
        ? [
            ...section.table.columns.map((column) => column.header),
            ...section.table.rows.flatMap((row) =>
              Object.values(row).flatMap((cell) => {
                if (typeof cell === "string") return [cell];
                if (Array.isArray(cell))
                  return cell.flatMap((item) => [item.label, item.href]);
                return [cell.label, cell.href];
              }),
            ),
          ]
        : []),
    ]),
  ])
    .join("\n")
    .toLocaleLowerCase("zh-CN");
}

function walkNav(nodes: WikiNavNode[]): WikiNavNode[] {
  return nodes.flatMap((node) => [node, ...walkNav(node.children ?? [])]);
}

function allEmbedRefs(): WikiEmbedRef[] {
  return WIKI_ARTICLES.flatMap((article) => [
    ...(article.headerEmbeds ?? []),
    ...article.sections.flatMap((section) => section.embeds ?? []),
  ]);
}

describe("Scholay Wiki 内容契约", () => {
  it("栏目图标与关键简介首图资产完整、尺寸稳定且遵守体积预算", () => {
    expect(Object.keys(WIKI_CATEGORY_ICON_SRC)).toHaveLength(16);
    expect(Object.keys(WIKI_EXTRA_FEATURE_ICON_SRC)).toEqual(["smart-search"]);
    expect(Object.keys(WIKI_ARTICLE_INTRO_VISUALS)).toEqual(["claw"]);

    for (const [slug, src] of Object.entries({
      ...WIKI_CATEGORY_ICON_SRC,
      ...WIKI_EXTRA_FEATURE_ICON_SRC,
    })) {
      const assetPath = path.join(repoRoot, "frontend-user/public", src);
      expect(existsSync(assetPath), `${slug}: ${src}`).toBe(true);
      const png = readFileSync(assetPath);
      expect(png.subarray(1, 4).toString(), slug).toBe("PNG");
      expect(png.readUInt32BE(16), slug).toBe(512);
      expect(png.readUInt32BE(20), slug).toBe(512);
      expect(statSync(assetPath).size, slug).toBeLessThan(24 * 1024);
    }

    for (const [slug, visual] of Object.entries(WIKI_ARTICLE_INTRO_VISUALS)) {
      const assetPath = path.join(repoRoot, "frontend-user/public", visual.src);
      expect(existsSync(assetPath), `${slug}: ${visual.src}`).toBe(true);
      expect(visual.alt.trim().length, slug).toBeGreaterThan(15);
      const png = readFileSync(assetPath);
      expect(png.subarray(1, 4).toString(), slug).toBe("PNG");
      expect(png.readUInt32BE(16), slug).toBe(1440);
      expect(png.readUInt32BE(20), slug).toBe(960);
      expect(statSync(assetPath).size, slug).toBeLessThan(450 * 1024);
    }
  });

  it("首页常用入口都继承一级栏目图标", () => {
    for (const pathEntry of WIKI_START_PATHS) {
      expect(WIKI_CATEGORY_ICON_SRC[pathEntry.categorySlug]).toBeDefined();
    }
  });

  it("智能搜索词条使用独立功能图标", () => {
    const articlePage = readFileSync(
      path.join(
        repoRoot,
        "frontend-user/src/features/wiki/pages/WikiArticlePage.tsx",
      ),
      "utf8",
    );
    expect(articlePage).toContain('article.slug === "smart-search"');
    expect(articlePage).toContain('? "smart-search"');
    expect(articlePage).toContain("<WikiFeatureIcon");
    expect(
      resolveWikiProductMenu("smart-search", "literature-search"),
    ).toBeUndefined();
  });

  it("词条页眉用宫灯选中态对应全站功能菜单七项", () => {
    expect(WIKI_PRODUCT_MENUS.map((menu) => menu.label)).toEqual([
      "文献搜索",
      "期刊搜索",
      "智能助手",
      "智能写作",
      "智能审稿",
      "我的资源",
      "Skills广场",
    ]);
    expect(resolveWikiProductMenu("claw", "assistant")?.id).toBe("claw");
    expect(
      resolveWikiProductMenu("academic-search", "literature-search")?.id,
    ).toBe("search");
    expect(
      resolveWikiProductMenu("journal-search-page", "journal-search")?.id,
    ).toBe("journal-search");
    expect(resolveWikiProductMenu("prism", "writing")?.id).toBe("prism");
    expect(resolveWikiProductMenu("peer-review", "review")?.id).toBe(
      "peer-review",
    );
    expect(
      resolveWikiProductMenu("literature-library", "resources")?.label,
    ).toBe("我的资源");
    expect(resolveWikiProductMenu("community-skills", "assistant")?.id).toBe(
      "tools",
    );
    expect(resolveWikiProductMenu("feature-tools", "other")?.id).toBe("tools");
    expect(resolveWikiProductMenu("ai-usage-quota", "limits")).toBeUndefined();
    expect(resolveWikiProductMenuFromNavCategory("journal-search")?.id).toBe(
      "journal-search",
    );
    expect(resolveWikiProductMenuFromNavCategory("limits")).toBeUndefined();

    const articlePage = readFileSync(
      path.join(
        repoRoot,
        "frontend-user/src/features/wiki/pages/WikiArticlePage.tsx",
      ),
      "utf8",
    );
    const categoryPage = readFileSync(
      path.join(
        repoRoot,
        "frontend-user/src/features/wiki/pages/WikiCategoryPage.tsx",
      ),
      "utf8",
    );
    expect(articlePage).toContain("<WikiProductMenuDock");
    expect(articlePage).not.toContain("WikiProductMenuList");
    expect(categoryPage).toContain("<WikiProductMenuDock");
  });

  it("词条 slug、标题与章节标识唯一", () => {
    expect(new Set(WIKI_ARTICLES.map((article) => article.slug)).size).toBe(
      WIKI_ARTICLES.length,
    );
    expect(new Set(WIKI_ARTICLES.map((article) => article.title)).size).toBe(
      WIKI_ARTICLES.length,
    );

    for (const article of WIKI_ARTICLES) {
      expect(article.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(new Set(article.sections.map((section) => section.id)).size).toBe(
        article.sections.length,
      );
    }
  });

  it("不存在无正文或无来源的占位词条", () => {
    expect(WIKI_ARTICLES.length).toBeGreaterThanOrEqual(100);
    for (const article of WIKI_ARTICLES) {
      expect(article.summary.trim().length, article.slug).toBeGreaterThan(20);
      expect(article.sections.length, article.slug).toBeGreaterThan(0);
      expect(article.sourcePaths.length, article.slug).toBeGreaterThan(0);
      for (const section of article.sections) {
        expect(
          section.title.trim().length,
          `${article.slug}/${section.id}`,
        ).toBeGreaterThan(0);
        const hasEmbeds = (section.embeds?.length ?? 0) > 0;
        const hasTable = Boolean(section.table);
        // 纯对照图章节可只有 embeds / table，不必硬塞说明废话
        if (!hasEmbeds && !hasTable) {
          expect(
            section.markdown.trim().length,
            `${article.slug}/${section.id}`,
          ).toBeGreaterThan(40);
        }
      }
    }
  });

  it("所有来源路径都存在于当前代码基线", () => {
    for (const article of WIKI_ARTICLES) {
      for (const sourcePath of article.sourcePaths) {
        expect(
          existsSync(path.resolve(repoRoot, sourcePath)),
          `${article.slug}: ${sourcePath}`,
        ).toBe(true);
      }
    }
  });

  it("所有相关词条都能解析", () => {
    for (const article of WIKI_ARTICLES) {
      for (const related of article.related ?? []) {
        expect(
          WIKI_ARTICLE_BY_SLUG.has(related),
          `${article.slug} -> ${related}`,
        ).toBe(true);
      }
    }
  });

  it("规范术语只在正文首次有效出现处建立站内链接", () => {
    for (const entry of WIKI_TERM_LINKS) {
      expect(
        WIKI_ARTICLE_BY_SLUG.has(entry.articleSlug),
        entry.articleSlug,
      ).toBe(true);
    }

    const linked = linkWikiTerms(
      "智能助手可以引用个人文献集。再次提到智能助手。`智能助手`。\n| 智能助手 | 说明 |",
      "example",
    );
    expect(linked).toContain("[智能助手](/wiki/claw)");
    expect(linked.match(/\/wiki\/claw/g)).toHaveLength(1);
    expect(linked).toContain("`智能助手`");
    expect(linked).toContain("| 智能助手 | 说明 |");
    expect(linkWikiTerms("智能助手", "claw")).toBe("智能助手");
  });

  it("结构化文档块顺序明确，Prompt 与站内跳转目标都有效", () => {
    let promptGroupCount = 0;

    const expectTarget = (source: string, target: WikiArticleTarget) => {
      const article = WIKI_ARTICLE_BY_SLUG.get(target.articleSlug);
      expect(article, `${source} -> ${target.articleSlug}`).toBeDefined();
      if (target.sectionId) {
        expect(
          article?.sections.some((section) => section.id === target.sectionId),
          `${source} -> ${target.articleSlug}#${target.sectionId}`,
        ).toBe(true);
      }
    };

    for (const article of WIKI_ARTICLES) {
      for (const section of article.sections) {
        const source = `${article.slug}#${section.id}`;
        const blocks = section.blocks ?? [];
        const blockKeys = blocks.map((block, index) => {
          if (block.type === "prompt-tabs") return `prompt:${block.group.id}`;
          return `${block.type}:${index}`;
        });
        expect(new Set(blockKeys).size, source).toBe(blockKeys.length);

        if (blocks.length > 0) {
          if (section.markdown.trim()) {
            expect(
              blocks.some((block) => block.type === "markdown"),
              `${source} 丢失 markdown block`,
            ).toBe(true);
          }
          if (section.table) {
            expect(
              blocks.some((block) => block.type === "table"),
              `${source} 丢失 table block`,
            ).toBe(true);
          }
          if (section.embeds?.length) {
            expect(
              blocks.some((block) => block.type === "embeds"),
              `${source} 丢失 embeds block`,
            ).toBe(true);
          }
        }

        for (const block of blocks) {
          if (block.type === "prompt-tabs") {
            promptGroupCount += 1;
            expect(block.group.title.trim().length, source).toBeGreaterThan(0);
            expect(block.group.options.length, source).toBeGreaterThanOrEqual(
              2,
            );
            expect(
              new Set(block.group.options.map((option) => option.id)).size,
              source,
            ).toBe(block.group.options.length);
            for (const option of block.group.options) {
              expect(option.label.trim().length, source).toBeGreaterThan(0);
              expect(option.prompt.trim().length, source).toBeGreaterThan(40);
            }
            if (block.group.defaultOptionId) {
              expect(
                block.group.options.some(
                  (option) => option.id === block.group.defaultOptionId,
                ),
                source,
              ).toBe(true);
            }
          }
          if (block.type === "article-link") {
            expectTarget(source, block.card);
          }
          if (block.type === "tip" && block.tip.link) {
            expectTarget(source, block.tip.link);
          }
          if (block.type === "next-steps") {
            expect(block.group.items.length, source).toBeGreaterThan(0);
            expect(block.group.items.length, source).toBeLessThanOrEqual(4);
            for (const item of block.group.items) {
              expect(item.description.trim().length, source).toBeGreaterThan(
                10,
              );
              expectTarget(source, item);
            }
          }
        }
      }
    }

    expect(promptGroupCount).toBeGreaterThanOrEqual(10);
  });

  it("Prompt、解释卡、Tips 与下一步都进入 Wiki 搜索文本", () => {
    const section = WIKI_ARTICLE_BY_SLUG.get(
      "smart-literature-search-guide",
    )?.sections.find((item) => item.id === "frame-the-question");
    expect(section).toBeDefined();
    const text = wikiSectionPlainText(section!);
    expect(text).toContain("通用研究");
    expect(text).toContain("研究主题");
  });

  it("每个 Wiki 演示都已登记并至少挂载到一个词条", () => {
    const refs = allEmbedRefs();
    const registered = Object.keys(WIKI_EMBED_REGISTRY) as WikiEmbedId[];
    const used = new Set(refs.map((ref) => ref.id));

    expect(registered).toHaveLength(226);
    expect(new Set(registered).size).toBe(registered.length);
    for (const ref of refs) {
      expect(WIKI_EMBED_REGISTRY[ref.id], ref.id).toBeDefined();
    }
    for (const id of registered) {
      expect(used.has(id), `${id} 未挂载`).toBe(true);
      expect(WIKI_EMBED_REGISTRY[id].id).toBe(id);
    }
  });

  it("Wiki 演示壳保持凹进井层级，不能退化为平面边框", () => {
    const embedRoot = path.join(
      repoRoot,
      "frontend-user/src/features/wiki/embeds",
    );
    const frame = readFileSync(
      path.join(embedRoot, "WikiEmbedFrame.tsx"),
      "utf8",
    );
    const globals = readFileSync(
      path.join(repoRoot, "frontend-user/src/styles/globals.css"),
      "utf8",
    );
    const stageRule = globals.match(/\.wiki-embed-stage\s*\{([^}]+)\}/)?.[1];
    const canvasRule = globals.match(/\.wiki-embed-canvas\s*\{([^}]+)\}/)?.[1];

    expect(frame).toContain('className="mt-6 w-fit max-w-full scroll-mt-20"');
    expect(frame).toContain(
      'className="wiki-embed-stage w-fit max-w-full rounded-16 p-3 md:p-4"',
    );
    expect(stageRule).toBeDefined();
    expect(stageRule).not.toMatch(/box-shadow\s*:\s*none/);
    expect(stageRule?.match(/\binset\b/g)).toHaveLength(5);
    expect(canvasRule).toBeDefined();
    expect(canvasRule).not.toMatch(/filter\s*:\s*none/);
    expect(canvasRule?.match(/drop-shadow\s*\(/g)).toHaveLength(2);
  });

  it("Wiki fixture 保持静态，不接入生产状态或写操作", () => {
    const embedRoot = path.join(
      repoRoot,
      "frontend-user/src/features/wiki/embeds",
    );
    const fixtureFiles = walkFiles(embedRoot).filter(
      (file) =>
        path.basename(file).startsWith("WikiEmbed") &&
        !["WikiEmbedFrame.tsx", "WikiEmbedList.tsx"].includes(
          path.basename(file),
        ),
    );
    const forbidden = [
      /from ["'][^"']*\/api(?:\/|["'])/,
      /from ["'][^"']*\/stores?(?:\/|["'])/,
      /from ["'][^"']*\/hooks?(?:\/|["'])/,
      /\b(?:useQuery|useMutation|useState|useEffect|useStore)\s*\(/,
      /\bon(?:Click|Submit|Change|CheckedChange|ValueChange)\s*=/,
      /\b(?:fetch|axios|http)\s*\(/,
    ];

    expect(fixtureFiles.length).toBeGreaterThanOrEqual(100);
    for (const file of fixtureFiles) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(source, `${path.basename(file)}: ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });

  it("Wiki fixture 只使用能实际编译的现行字号档", () => {
    const embedRoot = path.join(
      repoRoot,
      "frontend-user/src/features/wiki/embeds",
    );
    const fixtureFiles = walkFiles(embedRoot).filter((file) =>
      path.basename(file).startsWith("WikiEmbed"),
    );
    const retiredNumericText = /\btext-(?:9|10|11|13)\b/g;

    for (const file of fixtureFiles) {
      const source = readFileSync(file, "utf8");
      const matches = source.match(retiredNumericText) ?? [];
      expect(
        matches,
        `${path.basename(file)} 使用了 Tailwind 已封闭、不会生成 CSS 的字号类`,
      ).toHaveLength(0);
    }
  });

  it("Claw 新对话只展示当前已经开放的三类模板", () => {
    const fixture = readFileSync(
      path.join(
        repoRoot,
        "frontend-user/src/features/wiki/embeds/WikiEmbedClawEmptyState.tsx",
      ),
      "utf8",
    );

    expect(fixture).toContain('title: "制作PPT"');
    expect(fixture).toContain('title: "科研绘图"');
    expect(fixture).toContain('title: "数据分析"');
    expect(fixture).not.toContain('title: "智能选刊"');
    expect(fixture).not.toContain('title: "PDF-Chat"');
  });

  it("文件夹外观选择器在暂存区与个人文献集复用同一静态示意", () => {
    const staging = WIKI_ARTICLE_BY_SLUG.get("staging-area");
    const library = WIKI_ARTICLE_BY_SLUG.get("literature-library");
    const stagingEmbeds = staging?.sections.find(
      (section) => section.id === "persistence",
    )?.embeds;
    const libraryEmbeds = library?.sections.find(
      (section) => section.id === "organization",
    )?.embeds;

    expect(stagingEmbeds?.map((embed) => embed.id)).toContain(
      "folder-icon-picker",
    );
    expect(libraryEmbeds?.map((embed) => embed.id)).toContain(
      "folder-icon-picker",
    );
    expect(WIKI_EMBED_REGISTRY["folder-icon-picker"].defaultCaption).toContain(
      "图标与背景色",
    );

    const fixture = readFileSync(
      path.join(
        repoRoot,
        "frontend-user/src/features/wiki/embeds/WikiEmbedFolderIconPicker.tsx",
      ),
      "utf8",
    );
    expect(fixture).toContain('data-wiki-fixture="folder-icon-picker"');
    expect(fixture).toContain('label: "浅灰"');
    expect(fixture).toContain('label: "学历"');
  });

  it("牛犀犀助手使用真实位图，且不混淆移动端 AI Claw 龙虾品牌", () => {
    const embedRoot = path.join(
      repoRoot,
      "frontend-user/src/features/wiki/embeds",
    );
    const rhinoFixture = readFileSync(
      path.join(embedRoot, "WikiEmbedRhinoAssistant.tsx"),
      "utf8",
    );
    const rhinoAsset = readFileSync(
      path.join(
        repoRoot,
        "frontend-user/public/wiki/assets/rhino/pet-idle-frame-000.png",
      ),
    );
    const clawIcon = readFileSync(
      path.join(
        repoRoot,
        "frontend-user/src/shared/components/ClawBrandIcon.tsx",
      ),
      "utf8",
    );

    expect(rhinoAsset.subarray(1, 4).toString()).toBe("PNG");
    expect(rhinoFixture).toContain(
      '"/wiki/assets/rhino/pet-idle-frame-000.png"',
    );
    expect(rhinoFixture).not.toContain("ClawBrandIcon");
    expect(rhinoFixture).not.toContain("<svg");
    expect(clawIcon).toContain("AI Claw 品牌图标(矢量龙虾)");

    for (const id of [
      "rhino-assistant-entry",
      "rhino-assistant-dock",
      "rhino-assistant-help-panel",
      "rhino-assistant-support-panels",
      "rhino-assistant-feedback-panel",
    ] as const) {
      expect(WIKI_EMBED_REGISTRY[id]).toBeDefined();
      expect(allEmbedRefs().some((embed) => embed.id === id)).toBe(true);
    }
  });

  it("单态 Wiki 演示的图注与冻结界面一致", () => {
    const embedRoot = path.join(
      repoRoot,
      "frontend-user/src/features/wiki/embeds",
    );
    const rhinoFixture = readFileSync(
      path.join(embedRoot, "WikiEmbedRhinoAssistant.tsx"),
      "utf8",
    );
    const prismHomeFixture = readFileSync(
      path.join(embedRoot, "WikiEmbedPrismHome.tsx"),
      "utf8",
    );
    const authRegistrationFixture = readFileSync(
      path.join(embedRoot, "WikiEmbedAuthBillingMarketingSurfaces.tsx"),
      "utf8",
    );
    const mobileTruthFixture = readFileSync(
      path.join(embedRoot, "WikiEmbedMobileTruthSurfaces.tsx"),
      "utf8",
    );

    expect(
      WIKI_EMBED_REGISTRY["rhino-assistant-help-panel"].defaultCaption,
    ).toContain("「拖点」");
    expect(rhinoFixture).not.toContain("开始“首页导览”");
    expect(WIKI_EMBED_REGISTRY["wechat-qr-login"].defaultCaption).toBe(
      "微信扫码登录 · 等待扫码",
    );
    expect(WIKI_EMBED_REGISTRY["mobile-auth-surfaces"].defaultCaption).toBe(
      "移动认证 · 从「我的」页打开的登录 Sheet",
    );
    expect(
      WIKI_EMBED_REGISTRY["prism-compile-states"].defaultCaption,
    ).toContain("编译失败");
    expect(WIKI_EMBED_REGISTRY["prism-home"].defaultCaption).toContain(
      "未选中项目",
    );
    expect(prismHomeFixture).not.toContain("active: true");
    expect(authRegistrationFixture).not.toContain('label="邀请码（选填）"');
    expect(mobileTruthFixture).toContain("登录即表示同意");
    expect(mobileTruthFixture).toContain("服务条款");
    expect(mobileTruthFixture).toContain("隐私政策");
  });

  it("账户与商业词条保留端差异、合法周期和正确演示归位", () => {
    const profile = WIKI_ARTICLE_BY_SLUG.get("profile-settings");
    const security = WIKI_ARTICLE_BY_SLUG.get("account-security-settings");
    const connections = WIKI_ARTICLE_BY_SLUG.get("account-connections");
    const subscription = WIKI_ARTICLE_BY_SLUG.get(
      "membership-subscription-guide",
    );
    const giftCodes = WIKI_ARTICLE_BY_SLUG.get("gift-codes");
    const paymentOrders = WIKI_ARTICLE_BY_SLUG.get("payment-orders");
    const authentication = WIKI_ARTICLE_BY_SLUG.get(
      "email-phone-authentication",
    );
    const inviteCampaign = WIKI_ARTICLE_BY_SLUG.get("invite-campaign");

    expect(profile?.sections[0]?.markdown).toContain("昵称上限是 32");
    expect(profile?.sections[0]?.markdown).toContain("不能在移动页修改");
    expect(
      security?.sections.find((section) => section.id === "boundary")?.markdown,
    ).toContain("移动安全页只读");
    expect(
      connections?.sections.find((section) => section.id === "bind")?.markdown,
    ).toContain("新绑定 Google");
    expect(
      subscription?.sections.find((section) => section.id === "purchase-cycle")
        ?.markdown,
    ).toContain("年付在期用户不能用月付续费");
    expect(
      giftCodes?.sections.find((section) => section.id === "grant")?.markdown,
    ).toContain("每个账号对同一码只能成功一次");

    expect(
      giftCodes?.sections.find((section) => section.id === "preview")?.embeds,
    ).toEqual([{ id: "redeem-preview", caption: "用户端 · 兑换预览" }]);
    expect(
      giftCodes?.sections
        .find((section) => section.id === "grant")
        ?.embeds?.map((embed) => embed.id),
    ).toContain("admin-gift-codes");
    expect(
      paymentOrders?.sections
        .find((section) => section.id === "quote")
        ?.embeds?.map((embed) => embed.id),
    ).not.toContain("admin-orders");
    expect(
      paymentOrders?.sections
        .find((section) => section.id === "fulfillment")
        ?.embeds?.map((embed) => embed.id),
    ).toContain("admin-orders");
    expect(allEmbedRefs().map((embed) => embed.id)).toContain(
      "paper-favorite-flow",
    );
    expect(
      authentication?.sections
        .find((section) => section.id === "registration")
        ?.embeds?.map((embed) => embed.id),
    ).toContain("invite-code-field");
    expect(
      inviteCampaign?.sections
        .find((section) => section.id === "binding")
        ?.embeds?.map((embed) => embed.id),
    ).toContain("invite-code-prompt");

    const embedRoot = path.join(
      repoRoot,
      "frontend-user/src/features/wiki/embeds",
    );
    const profileFixture = readFileSync(
      path.join(embedRoot, "WikiEmbedProfileSettings.tsx"),
      "utf8",
    );
    const inviteFixture = readFileSync(
      path.join(embedRoot, "WikiEmbedInviteShare.tsx"),
      "utf8",
    );
    const membershipFixture = readFileSync(
      path.join(embedRoot, "WikiEmbedMobileMembershipPurchase.tsx"),
      "utf8",
    );
    const inviteRegistrationFixture = readFileSync(
      path.join(embedRoot, "WikiEmbedInviteRegistration.tsx"),
      "utf8",
    );
    expect(profileFixture).toContain("个人资料");
    expect(profileFixture).toContain('label="昵称"');
    expect(profileFixture).toContain('label="简介"');
    expect(profileFixture).toContain('label="头像图片地址"');
    expect(profileFixture).toContain("保存");
    expect(profileFixture).not.toContain("Mobile");
    expect(inviteFixture).toContain('const INVITE_CODE = "KQ9M2RT7"');
    expect(inviteFixture).toContain("/?invite=");
    expect(membershipFixture).toContain("月付不可选");
    expect(inviteRegistrationFixture).toContain("填写好友邀请码");
    expect(inviteRegistrationFixture).toContain("确认");
    expect(inviteRegistrationFixture).toContain("填写邀请码，领取邀请礼");
    expect(inviteRegistrationFixture).toContain("获取邀请码");
    expect(inviteRegistrationFixture).toContain("立即填写");
    expect(WIKI_EMBED_REGISTRY["account-connections"].defaultCaption).toBe(
      "账户设置 · 已连接账号",
    );
  });

  it("分享接收与论文收藏示意图只说明当前单态", () => {
    const sharing = WIKI_ARTICLE_BY_SLUG.get("library-sharing");
    const sharingSection = sharing?.sections.find(
      (section) => section.id === "receive",
    );
    const favorites = WIKI_ARTICLE_BY_SLUG.get("paper-favorites");
    const favoriteSection = favorites?.sections.find(
      (section) => section.id === "favorite",
    );
    const unfavoriteSection = favorites?.sections.find(
      (section) => section.id === "unfavorite",
    );
    const shareFixture = readFileSync(
      path.join(
        repoRoot,
        "frontend-user/src/features/wiki/embeds/WikiEmbedLibrarySurfaces.tsx",
      ),
      "utf8",
    );

    expect(sharingSection?.embeds?.map((embed) => embed.id)).toEqual([
      "library-share-receive",
      "share-receive-variants",
    ]);
    expect(sharingSection?.markdown).toContain(
      "第二张图只展示受保护合集的提取码输入状态",
    );
    expect(sharingSection?.markdown).not.toContain("已过期");
    expect(shareFixture.match(/<SharePhone/g)).toHaveLength(1);
    expect(shareFixture).not.toContain('<SharePhone title="论文详情">');
    expect(shareFixture).not.toContain('<SharePhone title="期刊详情">');

    expect(WIKI_EMBED_REGISTRY["paper-favorite-flow"].defaultCaption).toBe(
      "收藏论文 · 选择目标文献集",
    );
    expect(favoriteSection?.markdown).toContain(
      "下图只展示确认收藏前的文献集选择界面",
    );
    expect(favoriteSection?.markdown).not.toContain("保存完成");
    expect(unfavoriteSection?.markdown).toContain("这一步不在上图中");
  });

  it("每个顶层分类至少有一个已核对词条", () => {
    for (const category of WIKI_CATEGORIES) {
      expect(
        WIKI_ARTICLES.some((article) => article.category === category.slug),
        category.slug,
      ).toBe(true);
    }
  });

  it("管理后台与平台与架构标记为仅管理员可见", () => {
    const administration = WIKI_CATEGORIES.find(
      (item) => item.slug === "administration",
    );
    const platform = WIKI_CATEGORIES.find((item) => item.slug === "platform");
    expect(administration?.adminOnly).toBe(true);
    expect(platform?.adminOnly).toBe(true);
    expect(
      WIKI_CATEGORIES.filter((item) => item.adminOnly)
        .map((item) => item.slug)
        .sort(),
    ).toEqual(["administration", "platform"]);
  });

  it("读者目录与 XMind 的 15 个主栏目一致，并追加“其他”", () => {
    expect(WIKI_NAV_CATEGORIES.map((item) => item.title)).toEqual([
      "全站概览",
      "常见场景",
      "智能助手",
      "文献搜索",
      "期刊搜索",
      "智能写作",
      "智能审稿",
      "学术情报",
      "我的资源",
      "使用限额",
      "会员订阅",
      "邀请返利",
      "登录方式",
      "开发计划",
      "使用条款",
      "其他",
    ]);

    const nodes = WIKI_NAV_CATEGORIES.flatMap((category) =>
      walkNav(category.children),
    );
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
  });

  it("开始页仅保留可公开访问的高频栏目入口", () => {
    expect(WIKI_START_PATHS.map((item) => item.title)).toEqual([
      "全站概览",
      "文献查询与分析",
      "智能助手",
      "智能写作",
      "智能审稿",
      "会员订阅",
    ]);

    const publicCategorySlugs = new Set(
      visibleNavCategories(false).map((category) => category.slug),
    );
    for (const path of WIKI_START_PATHS) {
      expect(
        publicCategorySlugs.has(path.categorySlug),
        path.categorySlug,
      ).toBe(true);
    }
  });

  it("导航目标、章节锚点与唯一主归位全部可解析", () => {
    const nodes = WIKI_NAV_CATEGORIES.flatMap((category) =>
      walkNav(category.children),
    );
    const targets = nodes
      .map((node) => node.target)
      .filter((target): target is WikiNavTarget => Boolean(target));

    for (const target of targets) {
      const article = WIKI_ARTICLE_BY_SLUG.get(target.articleSlug);
      expect(article, target.articleSlug).toBeDefined();
      if (target.sectionId) {
        expect(
          article?.sections.some((section) => section.id === target.sectionId),
          `${target.articleSlug}#${target.sectionId}`,
        ).toBe(true);
      }
    }

    for (const article of WIKI_ARTICLES) {
      const primaryTargets = targets.filter(
        (target) =>
          target.articleSlug === article.slug && target.shortcut !== true,
      );
      expect(primaryTargets, article.slug).toHaveLength(1);
      expect(articleNavTrail(article.slug), article.slug).toBeDefined();
    }
  });

  it("XMind 中未落地或无固定口径的节点保留但不冒充现行能力", () => {
    expect(WIKI_ARTICLE_BY_SLUG.get("literature-graph-status")?.status).toBe(
      "planned",
    );
    expect(WIKI_ARTICLE_BY_SLUG.get("roadmap-status")?.status).toBe("planned");
    const guardedCorpus = [
      WIKI_ARTICLE_BY_SLUG.get("membership-subscription-guide"),
      WIKI_ARTICLE_BY_SLUG.get("invitation-rebate-guide"),
      WIKI_ARTICLE_BY_SLUG.get("journal-update-cycle"),
    ]
      .flatMap(
        (article) => article?.sections.map((section) => section.markdown) ?? [],
      )
      .join("\n");
    expect(guardedCorpus).toContain("云闪付");
    expect(guardedCorpus).toContain("不能写成已经上线");
    expect(guardedCorpus).toContain("达人");
    expect(guardedCorpus).toContain("固定");
  });

  it("覆盖全部 56 个后端一级业务模块", () => {
    const internalRoot = path.join(repoRoot, "backend/internal");
    const modules = readdirSync(internalRoot)
      .filter((name) => statSync(path.join(internalRoot, name)).isDirectory())
      .sort();
    const corpus = wikiCorpus();

    expect(modules).toHaveLength(56);
    for (const module of modules) {
      expect(corpus, `backend/internal/${module}`).toContain(
        `backend/internal/${module}`,
      );
    }
  });

  it("覆盖小程序全部页面与 Agent 全部 feature", () => {
    const appConfig = JSON.parse(
      readFileSync(path.join(repoRoot, "miniprogram/app.json"), "utf8"),
    ) as { pages: string[] };
    const corpus = wikiCorpus();

    expect(appConfig.pages).toHaveLength(15);
    for (const page of appConfig.pages) {
      expect(corpus, page).toContain(page.toLowerCase());
    }

    for (const feature of [
      "smart_search",
      "claw",
      "prism",
      "peerreview",
      "boltslides",
      "sci_draw",
      "stat_lab",
    ]) {
      expect(corpus, feature).toContain(feature);
    }
  });

  it("Agent 的 109 个技能名称全部可检索", () => {
    const skillFiles = walkFiles(path.join(repoRoot, "agent-skills"))
      .filter((file) => path.basename(file) === "SKILL.md")
      .sort();
    const corpus = wikiCorpus();

    expect(skillFiles).toHaveLength(109);
    for (const skillFile of skillFiles) {
      const skillName = path.basename(path.dirname(skillFile)).toLowerCase();
      expect(corpus, path.relative(repoRoot, skillFile)).toContain(skillName);
    }
  });

  it("迁移与功能广场数据计数和当前基线一致", () => {
    const migrations = readdirSync(
      path.join(repoRoot, "docker/mysql/migrations"),
    ).filter((name) => name.endsWith(".sql"));
    const tools = JSON.parse(
      readFileSync(
        path.join(repoRoot, "feature-tools-coldstart/feature-tools.json"),
        "utf8",
      ),
    ) as unknown[];

    expect(migrations).toHaveLength(128);
    expect(tools).toHaveLength(201);
    expect(wikiCorpus()).toContain("chemcad52cracked");
  });

  it("每个非 Wiki 路由的懒加载页面都有词条直接引用", () => {
    const routeFiles = [
      path.join(repoRoot, "frontend-user/src/app/router.tsx"),
      ...walkFiles(path.join(repoRoot, "frontend-user/src/features")).filter(
        (file) =>
          file.endsWith("/routes.tsx") && !file.includes("/features/wiki/"),
      ),
    ];
    const targets = new Set<string>();

    for (const routeFile of routeFiles) {
      const source = readFileSync(routeFile, "utf8");
      for (const match of source.matchAll(
        /import\(\s*['"]([^'"]+)['"]\s*\)/g,
      )) {
        const specifier = match[1];
        const unresolved = specifier.startsWith("@/")
          ? path.join(repoRoot, "frontend-user/src", specifier.slice(2))
          : path.resolve(path.dirname(routeFile), specifier);
        const resolved = [
          unresolved,
          `${unresolved}.tsx`,
          `${unresolved}.ts`,
          path.join(unresolved, "index.tsx"),
          path.join(unresolved, "index.ts"),
        ].find(
          (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
        );
        if (resolved) targets.add(path.relative(repoRoot, resolved));
      }
    }

    const citedSources = new Set(
      WIKI_ARTICLES.flatMap((article) => article.sourcePaths),
    );
    // scholay-wiki: `/` index 改为 redirect('/wiki')，不再懒加载 HomePage。
    expect(targets).toHaveLength(109);
    for (const target of targets) {
      expect(citedSources.has(target), target).toBe(true);
    }
  });

  it("后台算力用量的文章、导航、图注与 fixture 使用同一口径", () => {
    const article = WIKI_ARTICLE_BY_SLUG.get("admin-token-cost");
    expect(article?.title).toBe("算力用量统计");
    expect(article?.summary).toContain("算力点、Token 与实际成本");
    expect(JSON.stringify(article)).not.toContain("积分");

    const adminTokenNav = WIKI_NAV_CATEGORIES.flatMap((category) =>
      walkNav(category.children),
    ).find((node) => node.id === "other-admin-token-cost");
    expect(adminTokenNav?.title).toBe("算力用量统计");
    expect(WIKI_EMBED_REGISTRY["admin-token-cost"].defaultCaption).toBe(
      "后台 · 算力用量统计",
    );

    const source = readFileSync(
      path.join(
        repoRoot,
        "frontend-user/src/features/wiki/embeds/WikiEmbedAdminAnalytics.tsx",
      ),
      "utf8",
    );
    const kpiOrder = ["总算力点", "调用次数", "总 Tokens", "独立用户"].map(
      (label) => source.indexOf(`label: "${label}"`),
    );
    expect(kpiOrder.every((index) => index >= 0)).toBe(true);
    expect(kpiOrder).toEqual([...kpiOrder].sort((a, b) => a - b));
    expect(source).toContain(
      'tabs={["模型", "功能", "来源", "Provider", "Top 用户"]}',
    );
  });

  it("后台 fixture 保留批次、权限、订单退款和计费字段的真实约束", () => {
    const embedRoot = path.join(
      repoRoot,
      "frontend-user/src/features/wiki/embeds",
    );
    const users = readFileSync(
      path.join(embedRoot, "WikiEmbedAdminUsers.tsx"),
      "utf8",
    );
    const overview = readFileSync(
      path.join(embedRoot, "WikiEmbedAdminOverview.tsx"),
      "utf8",
    );
    const analytics = readFileSync(
      path.join(embedRoot, "WikiEmbedAdminAnalytics.tsx"),
      "utf8",
    );
    const content = readFileSync(
      path.join(embedRoot, "WikiEmbedAdminContent.tsx"),
      "utf8",
    );

    expect(users).toContain("K7Q9-2XMP-R4TV-8WCD");
    expect(users).toMatch(/4×4\s+格式/);
    for (const label of ["批次搜索", "批次号 / 备注", "发放类型", "会员等级"]) {
      expect(users).toContain(label);
    }
    for (const status of ["已支付", "待支付", "已过期", "已全额退款"]) {
      expect(users).toContain(status);
    }
    expect(users).toContain(
      "主状态只使用已支付、待支付、已过期；退款作为已支付订单的附加记录展示",
    );
    expect(users).not.toContain("已履约");

    expect(overview).not.toContain("支付配置");
    expect(overview).not.toContain("系统设置");

    for (const field of [
      "充值汇率",
      "1 元 = 100 经费",
      "经费兑换率",
      "1 经费 = 3 算力点",
      "经费→重置次数换算率（历史迁移用）",
      "60 经费 / 次 · 只读",
    ]) {
      expect(analytics).toContain(field);
    }
    expect(analytics).not.toContain("订阅赠送");
    expect(analytics).not.toContain("重置凭证");

    expect(content).toContain("具备 config.manage 权限");
    expect(content).toContain("operations");
    expect(content).toContain("允许绑定时窗");
    expect(content).toContain("首单有效时窗");
    expect(content).not.toContain("config.manage 权限：禁止");
  });

  it("product-mock 可见表面有逐组覆盖账本，且全部注册、挂载", () => {
    const registered = new Set(Object.keys(WIKI_EMBED_REGISTRY));
    const mounted = new Set(allEmbedRefs().map((ref) => ref.id));
    const keys = MOCK_SURFACE_COVERAGE.map((entry) => entry.key);
    const ledgerFixtureIds = new Set(
      MOCK_SURFACE_COVERAGE.flatMap((entry) => entry.fixtureIds),
    );

    expect(new Set(keys).size).toBe(keys.length);
    expect(USER_MOCK_SURFACE_COVERAGE).toHaveLength(
      MOCK_SURFACE_COVERAGE_EXPECTED_TOTALS.user,
    );
    expect(MOBILE_MOCK_SURFACE_COVERAGE).toHaveLength(
      MOCK_SURFACE_COVERAGE_EXPECTED_TOTALS.mobile,
    );
    expect(ADMIN_MOCK_SURFACE_COVERAGE).toHaveLength(
      MOCK_SURFACE_COVERAGE_EXPECTED_TOTALS.admin,
    );
    expect(MOCK_SURFACE_COVERAGE).toHaveLength(
      MOCK_SURFACE_COVERAGE_EXPECTED_TOTALS.all,
    );
    expect(MOCK_SURFACE_COVERAGE_STATS.visibleTotal).toBe(
      MOCK_SURFACE_COVERAGE_EXPECTED_TOTALS.visibleTotal,
    );
    expect(MOCK_SURFACE_COVERAGE_STATS.visibleTotal).toBe(
      WIKI_MOCK_SURFACE_BASELINE.visible,
    );
    expect(MOCK_SURFACE_COVERAGE_STATS.all.fixture).toBe(
      WIKI_MOCK_SURFACE_BASELINE.migratedOrCorrected,
    );
    expect(MOCK_SURFACE_COVERAGE_STATS.all.covered).toBe(
      WIKI_MOCK_SURFACE_BASELINE.existing,
    );
    expect(MOCK_SURFACE_COVERAGE_STATS.all.excluded).toBe(
      WIKI_MOCK_SURFACE_BASELINE.excluded,
    );
    expect(ledgerFixtureIds.size).toBe(
      WIKI_MOCK_SURFACE_BASELINE.registeredFixtures,
    );
    expect(ledgerFixtureIds).toEqual(registered);

    for (const entry of MOCK_SURFACE_COVERAGE) {
      expect(entry.reason.trim().length, entry.key).toBeGreaterThan(12);
      expect(entry.mockSourcePaths.length, entry.key).toBeGreaterThan(0);
      if (entry.disposition === "excluded") {
        expect(entry.fixtureIds, entry.key).toHaveLength(0);
        continue;
      }
      expect(entry.fixtureIds.length, entry.key).toBeGreaterThan(0);
      for (const id of entry.fixtureIds) {
        expect(registered.has(id), `${entry.key} -> ${id} 未注册`).toBe(true);
        expect(
          mounted.has(id as WikiEmbedId),
          `${entry.key} -> ${id} 未挂载`,
        ).toBe(true);
      }
    }
  });

  it("本地存在 sibling mock 时，覆盖账本中的源文件全部可解析", () => {
    const mockRoot = path.resolve(repoRoot, "../scholar-product-mock");
    if (!existsSync(mockRoot)) return;

    for (const entry of MOCK_SURFACE_COVERAGE) {
      for (const sourcePath of entry.mockSourcePaths) {
        expect(
          existsSync(path.join(mockRoot, sourcePath)),
          `${entry.key}: ${sourcePath}`,
        ).toBe(true);
      }
    }
  });
});
