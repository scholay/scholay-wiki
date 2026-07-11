-- ============================================================================
-- 0056 微信小程序配置 wechat_miniprogram_config(单行,id 恒为 1)
--   对标 news_webhook_config(0043)/ promo_config(0039):单行 + enabled 总开关
--   + INSERT IGNORE seed。
--
--   小程序凭据【刻意独立】于网页 OAuth 的 wechat_configs(那张表只有 snsapi_login
--   的 redirect_uri/scope 字段,语义不同)。小程序 AppID/AppSecret 来自 mp.weixin.qq.com
--   「开发管理」,用于 /sns/jscode2session 一键登录。
--
--   enabled = 小程序登录总开关:关闭时后端 Code2Session 直接拒绝(不打上游),
--   避免凭据未配齐就误开登录入口。
--   app_secret 后台脱敏读写(GET 默认 ******** ,?show_sensitive=true 解蔽)。
--
--   与 PC 扫码同号靠 unionid:两端须绑定到同一微信开放平台账号,jscode2session 才会
--   返回 unionid,后端 LoginOrRegisterWithWeChat 按 unionid 命中现有 users 行归一。
-- 幂等:CREATE TABLE IF NOT EXISTS + INSERT IGNORE。永不 DROP。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `wechat_miniprogram_config` (
  `id`         INT UNSIGNED NOT NULL DEFAULT 1,
  `app_id`     VARCHAR(100) NOT NULL DEFAULT '' COMMENT '小程序 AppID(mp.weixin.qq.com 开发管理)',
  `app_secret` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '小程序 AppSecret;后台脱敏读写',
  `enabled`    TINYINT(1)   NOT NULL DEFAULT 0  COMMENT '小程序登录总开关(关闭时后端拒绝 jscode2session)',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='微信小程序配置(单行)';

-- 初始化单行(id=1,默认关闭、无凭据)
INSERT IGNORE INTO `wechat_miniprogram_config` (`id`, `enabled`) VALUES (1, 0);
