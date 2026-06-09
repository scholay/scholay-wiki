-- ============================================================================
-- 0022: 邮件发送记录(email_logs)
--
-- 记录全站每一封邮件的发送结果(成功/失败 + 报错 + 收件地址 + 主题 + 发件人 + 时间),
-- 供管理后台「邮件记录」菜单查看。由 utils.SendEmailWithTLS 的 observer 自动落库,
-- 所有邮件(验证码 / 反馈回复 / 会员通知 / 配置测试 等)无差别记录。
--
-- 幂等:CREATE TABLE IF NOT EXISTS。never DROP。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `to_email` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '收件地址(多个用逗号连接)',
  `subject` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '邮件主题',
  `category` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other' COMMENT 'verification|feedback|billing|test|other(按主题归类)',
  `from_email` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '发件邮箱',
  `from_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '发件人名称',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'success' COMMENT 'success|failed',
  `error` text COLLATE utf8mb4_unicode_ci COMMENT '失败报错(成功为空)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`),
  KEY `idx_status` (`status`),
  KEY `idx_category` (`category`),
  KEY `idx_to` (`to_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邮件发送记录';
