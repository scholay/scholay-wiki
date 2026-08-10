-- ============================================================================
-- 0122: SEO 脏数据一次性清洗(2026-08-10 双智能体交叉审计确认)
--
-- 三类脏数据,全部来自 2026-04 匿名 expose 入库时代(该通道已封死,现行
-- server-verified 链路不再产生;但 upsert 的「摘要更长才覆盖 / DOI 空值不清旧值」
-- 规则使脏行永不自愈,只能显式清洗):
--
--   A. 字段嫁接错配(1 行):olx:W29576601 的标题/期刊/年份是 1985 年核辐射论文,
--      doi/abstract 却整体复制自相邻行(2018 年 J. Epidemiology 的 LGDB 论文)。
--      清掉嫁接字段 + 重置 enriched_at → 该行退出 sitemap(无摘要即 thin),
--      后台回填 worker 会从上游重新拉取【正确的】摘要。
--
--   B. 投稿须知冒充摘要(5 行):同一份《机械与电子控制工程》来稿须知模板
--      («1. 来稿要真实性…来稿文责自负…»)逐字出现在 5 篇不同论文的 abstract 里。
--      同法清掉假摘要(其余同 DOI 前缀的行摘要各不相同,是真实摘要,不动)。
--
--   C. 期刊 ISSN 数组污染(18 行):上游 print_issn/electronic_issn 本身是逗号
--      拼接串,入库未拆分 → Periodical JSON-LD 输出形如
--      ["0028-0836","0028-0836, 0090-0028",…] 的重复+拼接脏数组,命中的恰是
--      Nature/JAMA 等权重最高的期刊页。此处写入拆分去重后的净值。
--      ⚠️ 必须迁移修:入库侧「更长才覆盖」策略使干净(更短)值永远盖不回脏值。
--
-- 幂等性:每条 UPDATE 的 WHERE 都钉住「仍处脏状态」的特征 —— 清洗完成后
-- WHERE 不再命中,重放为 no-op;后续人工/上游对这些行的新修改也不会被本迁移回滚。
-- ============================================================================

-- ── A. 字段嫁接错配行 ────────────────────────────────────────────────────────
UPDATE `seo_papers`
   SET `doi` = '', `abstract` = '', `enriched_at` = NULL
 WHERE `paper_id` = 'olx:W29576601'
   AND `doi` = '10.2188/jea.je20170079';

-- ── B. 投稿须知模板冒充摘要(5 行,按 id + 模板前缀双重钉定)──────────────────
UPDATE `seo_papers`
   SET `abstract` = '', `enriched_at` = NULL
 WHERE `id` IN (3224, 34395, 45307, 45313, 45559)
   AND `doi` LIKE '10.37155/2717-5197%'
   AND `abstract` LIKE '1. 来稿要真实性%';

-- ── C. 期刊 ISSN 数组净化(18 行,按 journal_id + 「元素内含逗号」脏特征钉定)──
-- 净值 = 原数组每个元素按 [,;] 拆分、TrimSpace、大写 X、保序去重(离线计算,
-- 与 backend/internal/minicod/handler.go buildJournalSEOSeed 新加的入库归一逻辑同口径)。
UPDATE `seo_journals` SET `issns_json` = '["1474-175X", "1474-1776", "1474-1768", "1474-1784"]'                             WHERE `journal_id` = 3083  AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["0028-0836", "0090-0028", "0300-8746", "1476-4687", "2058-1092", "2058-1106"]'   WHERE `journal_id` = 3078  AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["1548-7091", "1552-4450", "1548-7105", "1552-4469"]'                             WHERE `journal_id` = 8809  AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["0149-2195", "1546-0738", "1057-5987", "1545-861X", "1545-8636", "1545-8601"]'   WHERE `journal_id` = 37342 AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["0002-9955", "0098-7484", "1538-3598"]'                                          WHERE `journal_id` = 6474  AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["1743-4378", "1759-5045", "1743-4386", "1759-5053"]'                             WHERE `journal_id` = 10148 AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["0961-1444", "1520-7439", "1573-8981"]'                                          WHERE `journal_id` = 2857  AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["9999-9999", "1749-4885", "1749-4893", "1756-0357"]'                             WHERE `journal_id` = 9910  AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["2667-1417", "2097-2431"]'                                                       WHERE `journal_id` = 83499 AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["2468-3922", "2772-9591", "2468-3930", "2772-9605"]'                             WHERE `journal_id` = 80460 AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["0273-1223", "1606-9749", "1996-9732", "1607-0798"]'                             WHERE `journal_id` = 11594 AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["1053-8119", "2666-9560", "1095-9572"]'                                          WHERE `journal_id` = 570   AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["0168-8278", "1600-0641"]'                                                       WHERE `journal_id` = 1611  AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["0927-796X", "0920-2307", "1879-212X"]'                                          WHERE `journal_id` = 1861  AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["2774-9649", "2775-0035", "1424-2818"]'                                          WHERE `journal_id` = 16578 AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["1342-1670", "2189-7301"]'                                                       WHERE `journal_id` = 27513 AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["2468-2659", "2096-2703"]'                                                       WHERE `journal_id` = 41460 AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
UPDATE `seo_journals` SET `issns_json` = '["2063-6792", "0025-5416", "1873-4928"]'                                          WHERE `journal_id` = 6880  AND `issns_json` REGEXP '"[0-9]{4}-[0-9Xx]{4}[,; ]';
