-- ============================================================================
-- 0012_prism_chat.sql — Scholay Prism 对话持久化(重入恢复聊天线)
--
-- 之前对话只在前端内存,刷新即丢。这里把每轮(用户指令 + 助手说明 + 改动摘要)落库,
-- 重开项目时按 project 拉回。文本列 utf8mb4。幂等 CREATE TABLE IF NOT EXISTS。
-- ============================================================================

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE IF NOT EXISTS `prism_chat_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `role` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'user / assistant',
  `text` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '用户指令 / 助手说明(已剥离 [PRISM_PATCH])',
  `edit_id` bigint unsigned DEFAULT NULL COMMENT '助手消息关联的编辑作业(有改动时)',
  `file_id` bigint unsigned DEFAULT NULL,
  `applied_hunks` int NOT NULL DEFAULT '0',
  `failed_hunks` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project` (`project_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prism AI 对话线(重入恢复)';

/*!40101 SET character_set_client = @saved_cs_client */;
