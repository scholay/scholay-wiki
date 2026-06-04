-- ============================================================================
-- 0010_prism_edits.sql — Scholay Prism AI 编辑作业(异步 patch 提案)
--
-- AI 编辑/Fix-with-AI 是异步:POST 建一行 queued → 后台 goroutine 让 agent 出 [PRISM_PATCH]
-- → 后端应用到 current → 把「提案全文」存 proposed_body → 前端轮询拿到 → 内联 diff
-- (current vs proposed)→ 用户 accept(走 SaveFile 落 accepted 版本)/ discard。
-- agent 永不落盘真源(锁定架构 D2);本表是提案的审计 + 防丢。文本列 utf8mb4。
-- 幂等:CREATE TABLE IF NOT EXISTS。
-- ============================================================================

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE IF NOT EXISTS `prism_edits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `file_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `kind` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'edit' COMMENT 'edit(选区/指令) / fix(修编译错)',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued' COMMENT 'queued/running/done/error',
  `instruction` text COLLATE utf8mb4_unicode_ci COMMENT '用户编辑指令(fix 为编译错误摘要)',
  `base_version_id` bigint unsigned DEFAULT NULL COMMENT '提案所基于的 current 版本(乐观锁锚)',
  `proposed_body` longtext COLLATE utf8mb4_unicode_ci COMMENT 'agent patch 应用到 current 后的提案全文(done 时有)',
  `applied_hunks` int NOT NULL DEFAULT '0' COMMENT '成功应用的 hunk 数',
  `failed_hunks` int NOT NULL DEFAULT '0' COMMENT '未能唯一匹配的 hunk 数',
  `error_summary` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '失败友好摘要(不回显原始 err)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_file` (`project_id`,`file_id`,`created_at`),
  KEY `idx_user` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prism AI 编辑作业(异步 patch 提案 + 审计)';

/*!40101 SET character_set_client = @saved_cs_client */;
