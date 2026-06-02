-- ============================================================================
-- 0006_llm_token_usage.sql — 统一 LLM token 用量账本
--
-- 背景: 之前 LLM token 全丢 —— 项目侧 internal/ai 只记了 third_party_accounts.total_requests
-- (请求数, 非 token);agent 侧 smart_search/claw 只打 slog、peerreview 直接丢弃。
-- 这里建一张**统一**的 per-call token 账本: 项目侧(internal/ai)+ agent 侧(scholar_agent)
-- 每次 LLM turn 一行,记 token(输入/输出/总/缓存)+ 模型 + provider/账号 + 归属用户。
--
-- 一行 = 一次 LLM 调用(含每次 retry,= 真实可计费次数)。读时按 user/feature/day 聚合。
-- user_id 可空: NULL = 公众号(wechat_oa)/匿名 —— 匿名 LLM 端点已强制登录, 故正常只有公众号为 NULL。
-- 幂等: CREATE TABLE IF NOT EXISTS。无外键(同 usage_events, 解耦)。
-- ============================================================================

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `llm_token_usage` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL COMMENT '归属用户,NULL=公众号(wechat_oa)/匿名',
  `feature` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能: smart_search/claw/peer_review/matrix/translate/wechat_oa',
  `source` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '来源: project(internal/ai) | agent(scholar_agent)',
  `provider` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'provider/厂商: agent=scholay-managed; project=上游 base_url host / 三方账号标识',
  `account_id` bigint unsigned DEFAULT NULL COMMENT 'third_party_accounts.id(project 侧, 可对账 total_requests);agent 侧 NULL',
  `model` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实际调用的模型 code',
  `input_tokens` int NOT NULL DEFAULT '0' COMMENT '输入(prompt) tokens',
  `output_tokens` int NOT NULL DEFAULT '0' COMMENT '输出(completion) tokens',
  `total_tokens` int NOT NULL DEFAULT '0' COMMENT '总 tokens(project=响应 total;agent=input+output, agent 不吐 total)',
  `cache_read_tokens` int NOT NULL DEFAULT '0' COMMENT '缓存命中读取 tokens',
  `cache_creation_tokens` int NOT NULL DEFAULT '0' COMMENT '缓存创建 tokens',
  `request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联键: project=RequestID;agent=session_id/审稿 submission_id',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '调用时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`,`created_at`),
  KEY `idx_feature_created` (`feature`,`created_at`),
  KEY `idx_created` (`created_at`),
  KEY `idx_source` (`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一 LLM token 用量账本(项目侧+agent侧, 一行一次调用)';
/*!40101 SET character_set_client = @saved_cs_client */;
