-- ============================================================================
-- 0023: 发送记录扩展到短信 —— email_logs 增加 channel(email|sms)。
--
-- 邮件与短信发送记录统一进 email_logs(后台「发送记录」页用 tab 切换查看):
--   · channel=email:to_email=收件邮箱, from_name=发件人名, subject=主题
--   · channel=sms  :to_email=手机号,   from_name=短信签名, subject=模板内容
-- 短信也由 utils 短信发送的 observer 自动落库,与邮件同一套表/接口。
--
-- 幂等:add_column_if_not_exists + add_index_if_not_exists。never DROP。
-- ============================================================================

CALL add_column_if_not_exists('email_logs', 'channel', "varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'email' COMMENT 'email|sms'");
CALL add_index_if_not_exists('email_logs', 'idx_channel', 'channel', FALSE);
