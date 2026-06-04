-- ============================================================================
-- 0009_prism_fields.sql — Scholay Prism (智能写作 / AI-native LaTeX IDE) 核心表
--
-- 锁定架构 D1: 后端 DB 是项目文件的**唯一真源**(agent 永不落盘;cwd 仅编译一次性拷贝)。
--   prism_projects       — 写作项目(与 agent 会话解耦)
--   prism_files          — 文件清单(.tex/.bib/.sty/asset),current 版本指针
--   prism_file_versions  — 追加式版本表 = inline-diff base + accept/reject + 防丢失审计的承重表
--   prism_compiles       — 编译记录 + 内容哈希缓存(命中免起容器)
--
-- 编译产物(PDF/log)+ 二进制 asset 落 MinIO 桶 scholar-prism;文本正文进版本表 body。
-- 全文本列 utf8mb4(铁律: 中文标题/摘要/编译日志双重编码 mojibake 踩过)。
-- 幂等: CREATE TABLE IF NOT EXISTS;索引内联(新表,整建跳过即幂等)。无外键(同项目惯例, 解耦)。
-- ============================================================================

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;

-- (1) 写作项目 ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `prism_projects` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '归属用户(users.id)',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '项目标题',
  `main_file` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'main.tex' COMMENT '编译入口文件',
  `venue_template_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '期刊/会议模板 key(Phase B)',
  `agent_session_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '映射 agent_sessions(AI 编辑会话;可空可重建)',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT 'active/archived',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`,`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prism 写作项目';

-- (2) 文件清单 ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `prism_files` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `rel_path` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目内相对路径(已做 basename/拒 ../ 校验)',
  `file_kind` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tex' COMMENT 'tex/bib/sty/cls/asset',
  `current_version_id` bigint unsigned DEFAULT NULL COMMENT '→ prism_file_versions.id(当前 current 版本)',
  `content_sha256` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'current 内容哈希(乐观锁/缓存用)',
  `size` bigint NOT NULL DEFAULT '0',
  `mime` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `minio_object_key` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '仅 asset(二进制图/字体);文本 body 进版本表',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_project_path` (`project_id`,`rel_path`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prism 项目文件清单';

-- (3) 追加式版本表 ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `prism_file_versions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `file_id` bigint unsigned NOT NULL,
  `version_no` int NOT NULL DEFAULT '1' COMMENT '同文件内自增版本号',
  `body` longtext COLLATE utf8mb4_unicode_ci COMMENT '文本文件正文;asset 为 NULL',
  `content_sha256` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `author` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT 'user/agent/accepted(来源审计)',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'current' COMMENT 'pending/current/superseded',
  `base_version_id` bigint unsigned DEFAULT NULL COMMENT 'agent patch 所基于的 base 版本(3-way merge / 乐观锁锚)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_file_version` (`file_id`,`version_no`),
  KEY `idx_file_status` (`file_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prism 文件版本(diff base + accept/reject + 防丢失)';

-- (4) 编译记录 + 内容哈希缓存 -------------------------------------------------
CREATE TABLE IF NOT EXISTS `prism_compiles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `content_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'sha256(排序后全部 current 文件内容);缓存命中键',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued' COMMENT 'queued/running/success/error',
  `engine` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pdflatex' COMMENT 'pdflatex/xelatex',
  `pdf_object_key` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_object_key` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_excerpt` text COLLATE utf8mb4_unicode_ci COMMENT '错误摘要(友好展示, 不回显原始 crash)',
  `error_summary` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration_ms` int NOT NULL DEFAULT '0',
  `expires_at` datetime DEFAULT NULL COMMENT '缓存 TTL(默认 1h)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project` (`project_id`,`created_at`),
  KEY `idx_content_hash` (`content_hash`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prism 编译记录 + 内容哈希缓存';

/*!40101 SET character_set_client = @saved_cs_client */;
