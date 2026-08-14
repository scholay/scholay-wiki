-- ============================================================================
-- 0125: 期刊全量主动化 —— seo_journals 扩列 + 同步任务表 (2026-08-11)
--
-- 背景:期刊库从「用户搜索/点击驱动的 1,161 行」升级为「minicod /v1/jnl 全量
-- 327,327 行主动摄取」。摄取行先进 staged (publish_state=0):不进 sitemap、
-- SSR 输出 noindex、不主动推送;由 admin 按 value_tier 分批发布,防止 30 万
-- 薄页一夜之间涌进索引被判 soft-404。
--
-- publish_state 是收录资格的新硬闸(Go: journalRowIndexable / SQL:
-- journalSitemapRows 成对修改,sitemap_pages_test.go 钉住)。老行必须保持
-- published —— 见文末幂等回填,否则现有已收录的 1,161 刊会瞬间从 sitemap
-- 消失并全量 noindex。
--
-- content_hash: 摄取 upsert 的 updated_at 诚实性依据 —— resync 未变化的行
-- **零写入**(连 UPDATE 都不发),updated_at 绝不动。0123 刚修完「30 万 lastmod
-- 同日全花」的坑,全量重摄取是同一事故的最大复发面,哈希比对是结构性防线。
--
-- 幂等性:全部 add_column_if_not_exists / CREATE TABLE IF NOT EXISTS /
-- 自熄灭 UPDATE,可重放。
-- ============================================================================

-- ── 发布闸门与批次 ──────────────────────────────────────────────────────────
CALL add_column_if_not_exists('seo_journals', 'publish_state', "TINYINT NOT NULL DEFAULT 0 COMMENT '0=staged(摄取待发布) 1=published(进 sitemap/可索引/可推送)'");
CALL add_column_if_not_exists('seo_journals', 'ingest_batch', "INT NOT NULL DEFAULT 0 COMMENT '发布批次号, 0=非批量发布(老行/有机行); 回滚按批次整批打回 staged'");
CALL add_column_if_not_exists('seo_journals', 'value_tier', "TINYINT NOT NULL DEFAULT 9 COMMENT '1=jcr/fqb/xr 有分区 2=scimago/ccf 3=doaj/oa 4=openalex-only 9=未评(摄取前老行)'");

-- ── ISSN-L(摄取 upsert 的跨行去重键;老行为 NULL,唯一索引允许多 NULL)────────
CALL add_column_if_not_exists('seo_journals', 'issn_l', "VARCHAR(16) DEFAULT NULL COMMENT 'linking ISSN, 摄取时填; 唯一冲突的行跳过(rows_skipped)'");

-- ── 指标矩阵(SSR 全字段模板的数据面)─────────────────────────────────────────
CALL add_column_if_not_exists('seo_journals', 'jcr_category', "VARCHAR(255) DEFAULT NULL COMMENT 'JCR 学科类目, 如 NEUROSCIENCES(SCIE)'");
CALL add_column_if_not_exists('seo_journals', 'jcr_year', "INT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'sjr', "VARCHAR(32) DEFAULT NULL COMMENT 'SCImago SJR 原始串(欧式小数逗号, 如 1,071)'");
CALL add_column_if_not_exists('seo_journals', 'sjr_best_quartile', "VARCHAR(8) DEFAULT NULL COMMENT 'Q1-Q4'");
CALL add_column_if_not_exists('seo_journals', 'scimago_h_index', "INT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'fqb_major_category', "VARCHAR(64) DEFAULT NULL COMMENT '中科院大类(中文, 如 医学)'");
CALL add_column_if_not_exists('seo_journals', 'fqb_major_quartile', "VARCHAR(8) DEFAULT NULL COMMENT '中科院大类分区, 归一化纯数字 1-4(上游原始形如 4 [2568/5603])'");
CALL add_column_if_not_exists('seo_journals', 'fqb_top', "TINYINT DEFAULT NULL COMMENT '中科院 Top 期刊 1/0'");
CALL add_column_if_not_exists('seo_journals', 'fqb_year', "INT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'fqb_subcategory', "VARCHAR(128) DEFAULT NULL COMMENT '中科院小类 1(如 NEUROSCIENCES 神经科学)'");
CALL add_column_if_not_exists('seo_journals', 'fqb_sub_quartile', "VARCHAR(8) DEFAULT NULL COMMENT '中科院小类分区, 归一化纯数字'");
CALL add_column_if_not_exists('seo_journals', 'xr_major_category_cn', "VARCHAR(64) DEFAULT NULL COMMENT '新锐分区大类(中文)'");
CALL add_column_if_not_exists('seo_journals', 'xr_major_quartile', "VARCHAR(8) DEFAULT NULL COMMENT '新锐分区, 归一化纯数字(上游原始形如 3 区)'");
CALL add_column_if_not_exists('seo_journals', 'xr_top', "TINYINT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'xr_year', "INT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'ccf_rank', "VARCHAR(8) DEFAULT NULL COMMENT 'CCF A/B/C'");
CALL add_column_if_not_exists('seo_journals', 'ccf_field', "VARCHAR(64) DEFAULT NULL");

-- ── 预警(高价值搜索词「XX期刊 预警」的数据源)────────────────────────────────
CALL add_column_if_not_exists('seo_journals', 'gjqk_warning_level', "VARCHAR(16) DEFAULT NULL COMMENT '国际期刊预警等级(高/中/低)'");
CALL add_column_if_not_exists('seo_journals', 'gjqk_warning_reason', "VARCHAR(255) DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'gjqk_year', "INT DEFAULT NULL");

-- ── OpenAlex 体量指标 ───────────────────────────────────────────────────────
CALL add_column_if_not_exists('seo_journals', 'works_count', "INT DEFAULT NULL COMMENT '载文量(openalex_works_count)'");
CALL add_column_if_not_exists('seo_journals', 'cited_by_count', "BIGINT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'i10_index', "INT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'two_yr_citedness', "DECIMAL(8,3) DEFAULT NULL COMMENT 'openalex 2yr mean citedness'");

-- ── OA / 身份 / 封面 / 投稿参考 ─────────────────────────────────────────────
CALL add_column_if_not_exists('seo_journals', 'is_in_doaj', "TINYINT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'has_apc', "TINYINT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'wikidata_label_zh', "VARCHAR(255) DEFAULT NULL COMMENT '期刊中文名(如有)'");
CALL add_column_if_not_exists('seo_journals', 'inception', "VARCHAR(16) DEFAULT NULL COMMENT '创刊日期(wikidata, 原始串如 1975-01-01)'");
CALL add_column_if_not_exists('seo_journals', 'cover_url', "VARCHAR(512) DEFAULT NULL COMMENT '封面图(上游 original_url, 外链)'");
CALL add_column_if_not_exists('seo_journals', 'has_guideline', "TINYINT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'has_latex', "TINYINT DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'latex_class', "VARCHAR(64) DEFAULT NULL");
CALL add_column_if_not_exists('seo_journals', 'comment_count', "INT DEFAULT NULL COMMENT '真实投稿评价条数'");
CALL add_column_if_not_exists('seo_journals', 'comment_rating', "DECIMAL(3,2) DEFAULT NULL COMMENT '综合评分 0-5'");
CALL add_column_if_not_exists('seo_journals', 'scirev_first_review_months', "DECIMAL(5,2) DEFAULT NULL COMMENT '平均首审周期(月), 由 comments 源 avg_first_review_days/30.44 折算'");

-- ── 压缩 JSON(逐年趋势 / 兜底扩展;原始 sources 血包 65KB 绝不落库)──────────
CALL add_column_if_not_exists('seo_journals', 'metrics_json', "JSON DEFAULT NULL COMMENT '逐年趋势 {\"jcr\":[[year,if],...],\"sjr\":[[year,sjr,quartile],...]} ≤2KB'");
CALL add_column_if_not_exists('seo_journals', 'extra_json', "JSON DEFAULT NULL COMMENT '兜底(openalex topics top5 / comments 指数 / apc) ≤2KB'");

-- ── 摄取簿记 ────────────────────────────────────────────────────────────────
CALL add_column_if_not_exists('seo_journals', 'upstream_built_at', "DATETIME DEFAULT NULL COMMENT '该行来自上游哪个构建版本(/v1/jnl/meta lastBuiltAt)'");
CALL add_column_if_not_exists('seo_journals', 'content_hash', "CHAR(40) DEFAULT NULL COMMENT '页面可见字段的 SHA1; resync 哈希相同的行零写入, updated_at 诚实性防线(0123)'");

-- ── 同步任务表:断点续跑真源(不依赖 Redis)────────────────────────────────────
CREATE TABLE IF NOT EXISTS `seo_journal_sync_runs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `kind` varchar(16) NOT NULL DEFAULT 'full' COMMENT 'full=admin 手动全量 / incremental=每日 lastBuiltAt 变化自动重摄',
  `status` varchar(16) NOT NULL DEFAULT 'running' COMMENT 'running / paused / done / failed / cancelled',
  `cursor_id` bigint NOT NULL DEFAULT 0 COMMENT '已处理的最大上游 journal id(官方承诺 id 永不复用, 页漂移时按它去重)',
  `pages_done` int NOT NULL DEFAULT 0 COMMENT '已完成页数(page_size=100), 续跑从 pages_done+1 开始',
  `rows_seen` int NOT NULL DEFAULT 0,
  `rows_upserted` int NOT NULL DEFAULT 0 COMMENT '新插入 + 内容真实变化的更新(哈希相同不计)',
  `rows_skipped` int NOT NULL DEFAULT 0 COMMENT 'canonical_name 空 / issn_l 唯一冲突 / 游标去重',
  `errors` int NOT NULL DEFAULT 0,
  `last_error` text,
  `upstream_total` int NOT NULL DEFAULT 0 COMMENT '/v1/jnl/meta totalJournals(进度条分母)',
  `upstream_built_at` datetime DEFAULT NULL COMMENT '/v1/jnl/meta lastBuiltAt(每日增量检查的比对基准)',
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sync_runs_status` (`status`),
  KEY `idx_sync_runs_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='期刊全量摄取任务(断点续跑真源)';

-- ── 老行回填:现有已收录期刊保持 published(幂等自熄)─────────────────────────
-- 摄取上线前的全部 active 行都是「已经在 sitemap 里/已被收录」的存量(1,161 刊),
-- 必须原地保持可索引。created_at 阈值取发版参考时刻之后一天, 首轮把命中行置 1 后
-- WHERE publish_state=0 不再命中, 重放 no-op;阈值之后的新行(摄取 staged)永不被误伤。
UPDATE `seo_journals`
   SET `updated_at` = `updated_at`, `publish_state` = 1
 WHERE `status` = 1
   AND `publish_state` = 0
   AND `created_at` < '2026-08-12 00:00:00';
