-- ============================================================================
-- 0027 客服与联系中心(support center)
--   support_center_config —— 单行配置:用户侧联系方式展示(邮箱/二维码)+ IMAP 收件 + 飞书通知
--   mail_inbox            —— IMAP 拉取的收件箱(一封邮件一行,按 account+uidvalidity+uid 去重)
-- 二维码以 data URL 存 MEDIUMTEXT(图片小,免 MinIO 公开桶与签名 URL 过期问题)。
-- 幂等:CREATE TABLE IF NOT EXISTS + add_index_if_not_exists + INSERT IGNORE。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `support_center_config` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- 用户侧「联系我们」展示
  `support_email`  VARCHAR(255) NOT NULL DEFAULT '' COMMENT '产品支持邮箱(展示)',
  `business_email` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '商务合作邮箱(展示)',
  `contact_note`   VARCHAR(500) NOT NULL DEFAULT '' COMMENT '联系说明文案(可空)',
  `wecom_qr`  MEDIUMTEXT NULL COMMENT '企业微信二维码(data URL)',
  `feishu_qr` MEDIUMTEXT NULL COMMENT '飞书二维码(data URL)',
  -- IMAP 收件(客服邮箱收件箱拉取)
  `imap_enabled`  TINYINT(1) NOT NULL DEFAULT 0,
  `imap_host`     VARCHAR(255) NOT NULL DEFAULT '',
  `imap_port`     INT NOT NULL DEFAULT 993,
  `imap_username` VARCHAR(255) NOT NULL DEFAULT '',
  `imap_password` VARCHAR(500) NOT NULL DEFAULT '',
  `imap_tls`      TINYINT(1) NOT NULL DEFAULT 1,
  `imap_poll_minutes` INT NOT NULL DEFAULT 5 COMMENT '轮询间隔(分钟,最小 1)',
  -- 飞书通知(群自定义机器人 webhook)
  `feishu_webhook_url` VARCHAR(500) NOT NULL DEFAULT '',
  `feishu_secret`      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '签名校验 secret(可空)',
  `feishu_notify_feedback` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '在线反馈提交时推送',
  `feishu_notify_email`    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '收件箱新邮件时推送',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服与联系中心配置(单行)';

INSERT IGNORE INTO `support_center_config` (`id`) VALUES (1);

CREATE TABLE IF NOT EXISTS `mail_inbox` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account`      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '收件账号(imap_username)',
  `uid_validity` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `uid`          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `message_id`   VARCHAR(512) NOT NULL DEFAULT '',
  `from_name`    VARCHAR(255) NOT NULL DEFAULT '',
  `from_addr`    VARCHAR(320) NOT NULL DEFAULT '',
  `to_addr`      VARCHAR(512) NOT NULL DEFAULT '',
  `subject`      VARCHAR(998) NOT NULL DEFAULT '',
  `sent_at`      DATETIME NULL,
  `snippet`      VARCHAR(500) NOT NULL DEFAULT '' COMMENT '列表预览(正文前 200 字)',
  `text_body`    MEDIUMTEXT NULL,
  `html_body`    MEDIUMTEXT NULL,
  `status`       VARCHAR(16) NOT NULL DEFAULT 'unread' COMMENT 'unread|read|replied',
  `replied_at`   DATETIME NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服邮箱收件箱(IMAP 拉取)';

-- 去重键:同账号同 uidvalidity 下 uid 唯一(IMAP 增量拉取的幂等保证)
CALL add_index_if_not_exists('mail_inbox', 'uk_account_uidv_uid', '`account`(191), `uid_validity`, `uid`', TRUE);
CALL add_index_if_not_exists('mail_inbox', 'idx_mail_inbox_status', '`status`', FALSE);
CALL add_index_if_not_exists('mail_inbox', 'idx_mail_inbox_created', '`created_at`', FALSE);
