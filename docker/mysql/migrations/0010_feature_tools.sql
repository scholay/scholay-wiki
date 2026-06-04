-- ============================================================================
-- 0010_feature_tools.sql — 功能大全 (学术工具黄页)
--
-- 数据流: 外部采集 → admin 导入 (feature_tool_import_jobs 任务) → feature_tools 落库
--          → 前端渲染; 任一工具 增/改/删 → 通过 feature_tool_webhooks 通知下游
--          (discourse 等) 同步, 投递记录入 feature_tool_webhook_deliveries。
--
-- 嵌套/可变字段 (access/spec/faq/vendor/use_cases/tags/...) 统一存 JSON 列,
-- 由 Go 端 gorm `serializer:json` 读写; 可查询的扁平字段 (category/price_type/
-- access_type/status/...) 单列 + 索引。
--
-- 幂等: CREATE TABLE IF NOT EXISTS。中文注释 utf8mb4。never DROP。
-- ============================================================================

/*!40101 SET @saved_cs_client = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;

-- ── 工具主表 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `feature_tools` (
  `id`                bigint unsigned NOT NULL AUTO_INCREMENT,
  `slug`              varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'URL slug, 唯一',
  `source_topic_id`   bigint DEFAULT NULL COMMENT '采集源 discourse topic id (溯源/导入幂等键)',
  `source_url`        varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_category_id` int DEFAULT NULL COMMENT '采集源 discourse 子分类 id',
  `name`              varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '工具名',
  `name_en`           varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aliases`           json DEFAULT NULL COMMENT '别名数组',
  `logo`              varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tagline`           varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '一句话简介',
  `description_md`    text COLLATE utf8mb4_unicode_ci COMMENT '详细描述 markdown',
  `category`          varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other' COMMENT '主分类 slug',
  `category_label`    varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tags`              json DEFAULT NULL COMMENT '标签名数组',
  `price_type`        varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown' COMMENT 'free|trial|paid|edu|freemium|unknown',
  `is_open_source`    tinyint(1) DEFAULT NULL,
  `languages`         json DEFAULT NULL COMMENT 'zh|en|multi 数组',
  `platforms`         json DEFAULT NULL COMMENT 'windows|mac|linux|web|cross 数组',
  `access_type`       varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'website' COMMENT 'website|download|both',
  `official_url`      varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `access`            json DEFAULT NULL COMMENT '完整获取信息 {type,official_url,resources[],download{}}',
  `spec`              json DEFAULT NULL COMMENT '结构化详情 {core_use,audience,scenarios[],workflow[],...}',
  `faq`               json DEFAULT NULL COMMENT '常见问题 [{q,a}]',
  `disclaimer`        text COLLATE utf8mb4_unicode_ci,
  `use_cases`         json DEFAULT NULL COMMENT '典型使用场景 [{icon,title,desc}]',
  `vendor`            json DEFAULT NULL COMMENT '厂商 {name,country,founded,homepage,desc}',
  `founded_year`      int DEFAULT NULL,
  `country`           varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pricing`           json DEFAULT NULL COMMENT '价格档 [{label,price}]',
  `free_trial`        varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alternatives`      json DEFAULT NULL COMMENT '替代品 [{name,note,url}]',
  `tutorials`         json DEFAULT NULL COMMENT '教程 [{title,url}]',
  `stats`             json DEFAULT NULL COMMENT '统计 {rating,rating_count,monthly_visits,favorites,citations} (不造假, 上线后回填)',
  `reviews`           json DEFAULT NULL COMMENT '用户评价 (种子期空)',
  `status`            varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'published' COMMENT 'draft|pending|published|archived',
  `featured`          tinyint(1) NOT NULL DEFAULT '0' COMMENT '编辑精选',
  `sort_weight`       int NOT NULL DEFAULT '0' COMMENT '人工排序权重 (大在前)',
  `view_count`        bigint NOT NULL DEFAULT '0',
  `favorite_count`    bigint NOT NULL DEFAULT '0',
  `data_quality`      json DEFAULT NULL COMMENT '{enriched,needs_review,needs_enrich[],sources[]}',
  `created_by`        bigint unsigned DEFAULT NULL COMMENT '创建/导入的管理员 user_id',
  `created_at`        datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `published_at`      datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slug` (`slug`),
  UNIQUE KEY `uk_source_topic` (`source_topic_id`),
  KEY `idx_category` (`category`),
  KEY `idx_price_type` (`price_type`),
  KEY `idx_access_type` (`access_type`),
  KEY `idx_status` (`status`),
  KEY `idx_featured` (`featured`),
  KEY `idx_status_cat` (`status`, `category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能大全 · 学术工具';

-- ── 导入任务 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `feature_tool_import_jobs` (
  `id`          bigint unsigned NOT NULL AUTO_INCREMENT,
  `status`      varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'pending|running|succeeded|partial|failed',
  `source`      varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'json' COMMENT 'json|file|seed',
  `filename`    varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notify`      tinyint(1) NOT NULL DEFAULT '1' COMMENT '导入是否触发 webhook',
  `total`       int NOT NULL DEFAULT '0',
  `processed`   int NOT NULL DEFAULT '0',
  `created_cnt` int NOT NULL DEFAULT '0',
  `updated_cnt` int NOT NULL DEFAULT '0',
  `skipped_cnt` int NOT NULL DEFAULT '0',
  `failed_cnt`  int NOT NULL DEFAULT '0',
  `error`       text COLLATE utf8mb4_unicode_ci COMMENT '整体失败原因 (若有)',
  `detail`      json DEFAULT NULL COMMENT '逐条结果/错误 [{idx,name,action,error}]',
  `created_by`  bigint unsigned DEFAULT NULL,
  `created_at`  datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能大全 · 导入任务';

-- ── Webhook 订阅 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `feature_tool_webhooks` (
  `id`               bigint unsigned NOT NULL AUTO_INCREMENT,
  `name`             varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url`              varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `secret`           varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'HMAC-SHA256 签名密钥',
  `events`           json DEFAULT NULL COMMENT '订阅事件 [created,updated,deleted]; 空=全部',
  `enabled`          tinyint(1) NOT NULL DEFAULT '1',
  `last_status`      varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'success|failed',
  `last_delivered_at` datetime DEFAULT NULL,
  `last_error`       text COLLATE utf8mb4_unicode_ci,
  `created_by`       bigint unsigned DEFAULT NULL,
  `created_at`       datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能大全 · webhook 订阅';

-- ── Webhook 投递记录 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `feature_tool_webhook_deliveries` (
  `id`            bigint unsigned NOT NULL AUTO_INCREMENT,
  `webhook_id`    bigint unsigned NOT NULL,
  `tool_id`       bigint unsigned DEFAULT NULL,
  `event`         varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'created|updated|deleted',
  `status`        varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'success|failed',
  `http_status`   int DEFAULT NULL,
  `attempt`       int NOT NULL DEFAULT '1',
  `request_body`  mediumtext COLLATE utf8mb4_unicode_ci,
  `response_body` text COLLATE utf8mb4_unicode_ci,
  `error`         text COLLATE utf8mb4_unicode_ci,
  `created_at`    datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_webhook` (`webhook_id`, `created_at`),
  KEY `idx_tool` (`tool_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能大全 · webhook 投递记录';

/*!40101 SET character_set_client = @saved_cs_client */;
