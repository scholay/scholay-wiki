-- ============================================================================
-- 0043 情报 webhook 配置 news_webhook_config(单行,id 恒为 1)
--   对标 promo_config(0039):单行 + enabled 总开关 + INSERT IGNORE seed。
--   webhook_secret = 上游生成的 HMAC 密钥(hex),验签用,后台脱敏读写。
--   enabled 控「前端展示总开关」:关闭时公开 API 不返数据;**接收落库不受其影响**
--   (验签通过即落库,便于先攒数据再上线)。
--   接收 URL 不入库:固定为 {SITE_URL}/api/v1/webhook/minicod-news,后台动态展示。
-- 幂等:CREATE TABLE IF NOT EXISTS + INSERT IGNORE。永不 DROP。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `news_webhook_config` (
  `id`             INT UNSIGNED NOT NULL DEFAULT 1,
  `enabled`        TINYINT(1)   NOT NULL DEFAULT 0  COMMENT '情报前端展示总开关(不影响接收落库)',
  `webhook_secret` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '上游生成的HMAC-SHA256密钥(hex);脱敏读写',
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='情报webhook配置(单行)';

-- 初始化单行(id=1,默认关闭、无密钥)
INSERT IGNORE INTO `news_webhook_config` (`id`, `enabled`) VALUES (1, 0);
