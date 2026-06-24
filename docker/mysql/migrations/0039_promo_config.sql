-- ============================================================================
-- 0039 限时领取会员推广(Promo)
--   promo_config —— 单行配置(id 恒为 1):功能总开关 + 微信客服二维码 + 可配置文案。
--   用户端顶部导航出现「限时领取会员」按钮;首次进站自动弹一次 + free 用户额度用尽时
--   再弹,弹窗展示二维码引导扫码加客服领取。
--   二维码以 data URL(MEDIUMTEXT)直存(同 0027 support_center_config 的二维码),
--   免对象存储 + 免签名 URL 过期问题。
-- 幂等:CREATE TABLE IF NOT EXISTS + INSERT IGNORE。永不 DROP。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `promo_config` (
  `id`          INT UNSIGNED NOT NULL DEFAULT 1,
  `enabled`     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '限时领取会员推广总开关',
  `title`       VARCHAR(255) NOT NULL DEFAULT '' COMMENT '弹窗标题(留空走前端默认)',
  `subtitle`    VARCHAR(255) NOT NULL DEFAULT '' COMMENT '弹窗副标题(留空走前端默认)',
  `benefits`    TEXT                              COMMENT '福利点(一行一条,留空走前端默认)',
  `button_text` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '按钮/引导文案(留空走前端默认)',
  `wechat_qr`   MEDIUMTEXT                        COMMENT '微信客服二维码(data URL)',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='限时领取会员推广配置(单行)';

-- 初始化单行(id=1,默认关闭)
INSERT IGNORE INTO `promo_config` (`id`, `enabled`) VALUES (1, 0);
