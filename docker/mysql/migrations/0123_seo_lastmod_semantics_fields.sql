-- ============================================================================
-- 0123: SEO 表 lastmod 语义修复(2026-08-10 审计)
--
-- 背景:seo_papers / seo_authors / seo_journals 的 updated_at 列带
-- `ON UPDATE CURRENT_TIMESTAMP`,而 updated_at 同时是 sitemap <lastmod> 的
-- 数据源。任何不显式管理 updated_at 的维护性 UPDATE(sitemap_page 回填、
-- enriched_at 标记、ORCID 旁路写入、EnrichAuthor 补全)都会把整批行的
-- <lastmod> 刷成执行时刻 —— 线上实测 papers-2 全片 4,737 条 / authors-3 全片
-- 17,375 条 lastmod 集中在同日 2 小时窗口、90%+ 以「:55」秒结尾(分钟桶批量戳)。
-- 「整片 URL 同一天全部被修改」的假象会让 Google/Bing 学会不信任本站 lastmod,
-- 连带诚实分片一起失效。
--
-- 两步修复:
--   A. 去掉三张表 updated_at 的 ON UPDATE 自动刷新 —— 所有 upsert / enrich
--      路径都已显式管理 updated_at(仅真实内容变化才 bump),自动刷新只剩
--      「被遗漏的维护语句悄悄污染 lastmod」这一种效果。Go 侧同步给全部维护
--      UPDATE 加了 updated_at = updated_at 显式自赋值,双保险。
--   B. 历史脏值归一化:2026-08-11 04:00 (+08:00, 修复发版参考时刻) 之前的
--      updated_at 一律重置为 created_at(入库时间)。被污染的行无法追溯真实的
--      内容变更时刻,归一到 created_at 后 handler 侧按「updated_at ≈ created_at
--      = 入库后未变化」省略 <lastmod>(sitemap 协议允许),这是诚实基线。
--      若实际发版晚于该时刻,可把日期上调到发版时刻后重启一次,再归一化增量脏值。
--
-- 幂等性:
--   A: MODIFY COLUMN 到同一定义,重放是元数据 no-op(MySQL 8 即时变更)。
--   B: 首轮把命中行改成 updated_at = created_at 后,WHERE 的
--      `updated_at <> created_at` 不再命中,重放为 no-op;阈值之后的真实更新
--      (updated_at >= 阈值)永不被触碰。
-- ============================================================================

-- ── A. 去掉 ON UPDATE CURRENT_TIMESTAMP ────────────────────────────────────
ALTER TABLE `seo_papers`
  MODIFY COLUMN `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `seo_authors`
  MODIFY COLUMN `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `seo_journals`
  MODIFY COLUMN `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

-- ── B. 历史 lastmod 脏值归一化(自熄灭,见头注) ──────────────────────────────
UPDATE `seo_papers`
   SET `updated_at` = `created_at`
 WHERE `updated_at` < '2026-08-11 04:00:00'
   AND `updated_at` <> `created_at`;

UPDATE `seo_authors`
   SET `updated_at` = `created_at`
 WHERE `updated_at` < '2026-08-11 04:00:00'
   AND `updated_at` <> `created_at`;

UPDATE `seo_journals`
   SET `updated_at` = `created_at`
 WHERE `updated_at` < '2026-08-11 04:00:00'
   AND `updated_at` <> `created_at`;
