-- ============================================================================
-- 0042 情报 webhook 投递去重/审计表 news_deliveries
--   delivery_id = X-Minicod-News-Delivery(uuid),做主键即唯一去重键。
--   Redis SetNX 是秒级一次性闸;本表是「成功处理」的长期记录 + 失败审计兜底。
--   只在「成功处理后」写 ok 行;失败不写(让上游退避重试能重新处理)。
-- 幂等:CREATE TABLE IF NOT EXISTS。永不 DROP。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `news_deliveries` (
  `delivery_id` CHAR(36)     NOT NULL                  COMMENT 'X-Minicod-News-Delivery(幂等去重键)',
  `event_type`  VARCHAR(32)  NOT NULL DEFAULT ''       COMMENT 'news.created/updated/heat',
  `status`      VARCHAR(24)  NOT NULL DEFAULT 'ok'     COMMENT 'ok/ignored',
  `received_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '处理完成时间',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`delivery_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='情报webhook投递去重/审计';
