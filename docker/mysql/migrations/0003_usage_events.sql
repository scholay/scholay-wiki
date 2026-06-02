-- ============================================================================
-- 0003_usage_events.sql — 功能使用统计 v2 原始事件表
--
-- 背景: 旧 usage_logs 表(0001_baseline)经一次迭代后预制功能/字段数据不健康
-- (幽灵 feature_code、一堆从不填充的字段)。这里重做一张干净的原始事件表,旧表
-- usage_logs **保留不删**(历史数据,只读),新埋点全部写入本表。
--
-- 设计: 一行一事件(读时聚合),支持匿名(user_id NULL + anon_id)、来源区分
-- (source: traditional/smart)、连贯性(correlation_id: 审稿 submission_id 等)。
-- 幂等: CREATE TABLE IF NOT EXISTS。
-- ============================================================================

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `usage_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL COMMENT '登录用户ID,NULL=匿名',
  `anon_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '匿名访客稳定标识(前端 localStorage uuid),用于匿名独立访客统计',
  `feature` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能: paper_search/smart_search/journal_search/staging/favorite/matrix/peer_review/claw/translate',
  `action` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '动作: search/question/stage/favorite/dimension_edit/step_*/message/translate 等',
  `correlation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '连贯性关联键(如审稿 submission_id),把同一流程的多步骤串起来',
  `source` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源上下文: traditional/smart(暂存/收藏区分来源)',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP地址(支持IPv6)',
  `user_agent` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '浏览器User-Agent',
  `device_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备类型: desktop/mobile/tablet',
  `extra` json DEFAULT NULL COMMENT '业务上下文(query/paper_id/dimension_key/from_step→to_step 等)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '事件发生时间',
  PRIMARY KEY (`id`),
  KEY `idx_feature` (`feature`),
  KEY `idx_action` (`action`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_anon_id` (`anon_id`),
  KEY `idx_correlation_id` (`correlation_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_feature_created` (`feature`,`created_at`),
  KEY `idx_feature_action_created` (`feature`,`action`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能使用统计 v2 原始事件表(旧 usage_logs 保留不删)';
/*!40101 SET character_set_client = @saved_cs_client */;
