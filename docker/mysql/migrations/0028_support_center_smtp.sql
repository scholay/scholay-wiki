-- ============================================================================
-- 0028 客服邮箱发信(SMTP)配置
--   客服邮箱除了收信(IMAP,见 0027),也需要自己的发信服务器 —— 这样回信/写信
--   是从 support@ 这个客服邮箱发出,而不是借用全站系统邮件(noreply@)。
--   未配置时 service 层回落到全站激活的 email_configs(向后兼容)。
-- 幂等:add_column_if_not_exists。
-- ============================================================================

CALL add_column_if_not_exists('support_center_config', 'smtp_host', "varchar(255) NOT NULL DEFAULT '' COMMENT '客服邮箱发信服务器'");
CALL add_column_if_not_exists('support_center_config', 'smtp_port', "int NOT NULL DEFAULT 465 COMMENT '发信端口(465=SMTPS / 587=STARTTLS,按端口自动判定)'");
CALL add_column_if_not_exists('support_center_config', 'smtp_username', "varchar(255) NOT NULL DEFAULT '' COMMENT '发信账号(通常即客服邮箱地址)'");
CALL add_column_if_not_exists('support_center_config', 'smtp_password', "varchar(500) NOT NULL DEFAULT '' COMMENT '发信密码/授权码'");
CALL add_column_if_not_exists('support_center_config', 'smtp_from_name', "varchar(255) NOT NULL DEFAULT '' COMMENT '发信人显示名(空=用客服邮箱地址)'");
