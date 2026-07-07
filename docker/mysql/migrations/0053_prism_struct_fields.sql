-- ============================================================================
-- 0053_prism_struct_fields.sql — Prism 双轨改造:结构体真源 + 新旧分轨 flag
--   见 docs/research/prism-render-surface-2026-06/REPORT.md Part III。
--
-- 设计:旧项目(legacy)保留裸 LaTeX 文件真源,cutover 后冻结只读;新项目(struct)真源 =
--   一份结构体 JSON(doc_struct),经 projector 投影成 .tex 复用既有编译链。
-- 幂等:add_column_if_not_exists / CREATE TABLE IF NOT EXISTS。
--   纯加列 —— 现存所有项目按列默认值落 'legacy',零数据移动、零行为变更(ReadOnly() 还受
--   PRISM_STRUCT_ENABLED 开关二次门控,cutover 前旧项目照常可编辑)。
-- target_template 复用既有 venue_template_key 列(0009 起就在),不新增。
-- 全文本列 utf8mb4(铁律:中文双重编码 mojibake 踩过)。
-- ============================================================================

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;

-- (1) prism_projects:新旧分轨 flag + 结构体真源列 ----------------------------
CALL add_column_if_not_exists('prism_projects', 'schema_version', "varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'legacy' COMMENT '文档轨道: legacy(旧裸LaTeX,cutover后只读) / struct(新结构体)'");
CALL add_column_if_not_exists('prism_projects', 'doc_struct', "longtext COLLATE utf8mb4_unicode_ci NULL COMMENT '结构体真源 JSON(struct 轨;legacy 为空)'");
CALL add_column_if_not_exists('prism_projects', 'struct_version_id', "bigint unsigned NULL COMMENT '→ prism_struct_versions.id(当前 current 快照)'");

-- (2) 结构体版本链(追加式,镜像 prism_file_versions 的不可变审计纪律)----------
CREATE TABLE IF NOT EXISTS `prism_struct_versions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `version_no` int NOT NULL DEFAULT 1,
  `doc_struct` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '整份结构体快照 JSON',
  `struct_sha256` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `author` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT 'user/agent/accepted',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'current' COMMENT 'pending/current/superseded',
  `base_version_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_proj_version` (`project_id`,`version_no`),
  KEY `idx_proj_status` (`project_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prism 结构体版本链(追加式)';

/*!40101 SET character_set_client = @saved_cs_client */;
