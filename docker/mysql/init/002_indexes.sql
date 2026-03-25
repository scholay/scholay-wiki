-- ============================================================================
-- Scholar 学术平台 - 性能索引定义
-- 此文件包含所有非 PK/UK/FK 的性能索引
-- 幂等性: 通过 safe_create_index 存储过程保证索引不重复创建
-- ============================================================================

SET NAMES utf8mb4;

-- 创建幂等索引辅助存储过程
DROP PROCEDURE IF EXISTS safe_create_index;
DELIMITER //
CREATE PROCEDURE safe_create_index(
    IN p_table VARCHAR(64),
    IN p_index VARCHAR(64),
    IN p_sql VARCHAR(2000)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table
        AND INDEX_NAME = p_index
    ) THEN
        SET @ddl = p_sql;
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- ============================================
-- admin_users
-- ============================================
CALL safe_create_index('admin_users', 'idx_status',
    'CREATE INDEX `idx_status` ON `admin_users` (`status`)');

-- ============================================
-- users
-- ============================================
CALL safe_create_index('users', 'idx_status',
    'CREATE INDEX `idx_status` ON `users` (`status`)');
CALL safe_create_index('users', 'idx_users_role',
    'CREATE INDEX `idx_users_role` ON `users` (`role`)');
CALL safe_create_index('users', 'idx_subscription_plan',
    'CREATE INDEX `idx_subscription_plan` ON `users` (`subscription_plan`)');
CALL safe_create_index('users', 'idx_location',
    'CREATE INDEX `idx_location` ON `users` (`location`)');
CALL safe_create_index('users', 'idx_last_login_at',
    'CREATE INDEX `idx_last_login_at` ON `users` (`last_login_at`)');

-- ============================================
-- user_auth_providers
-- ============================================
CALL safe_create_index('user_auth_providers', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `user_auth_providers` (`user_id`)');
CALL safe_create_index('user_auth_providers', 'idx_union_id',
    'CREATE INDEX `idx_union_id` ON `user_auth_providers` (`provider_union_id`)');

-- ============================================
-- user_sessions
-- ============================================
CALL safe_create_index('user_sessions', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `user_sessions` (`user_id`)');
CALL safe_create_index('user_sessions', 'idx_token',
    'CREATE INDEX `idx_token` ON `user_sessions` (`token`(64))');
CALL safe_create_index('user_sessions', 'idx_device_type',
    'CREATE INDEX `idx_device_type` ON `user_sessions` (`user_id`, `device_type`)');
CALL safe_create_index('user_sessions', 'idx_active_sessions',
    'CREATE INDEX `idx_active_sessions` ON `user_sessions` (`last_activity`, `expires_at`)');
CALL safe_create_index('user_sessions', 'idx_user_activity',
    'CREATE INDEX `idx_user_activity` ON `user_sessions` (`user_id`, `last_activity` DESC)');

-- ============================================
-- conversations
-- ============================================
CALL safe_create_index('conversations', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `conversations` (`user_id`)');
CALL safe_create_index('conversations', 'idx_updated_at',
    'CREATE INDEX `idx_updated_at` ON `conversations` (`updated_at`)');
CALL safe_create_index('conversations', 'idx_conversation_type',
    'CREATE INDEX `idx_conversation_type` ON `conversations` (`conversation_type`)');
CALL safe_create_index('conversations', 'idx_user_type',
    'CREATE INDEX `idx_user_type` ON `conversations` (`user_id`, `conversation_type`)');
CALL safe_create_index('conversations', 'idx_user_updated',
    'CREATE INDEX `idx_user_updated` ON `conversations` (`user_id`, `updated_at` DESC)');
CALL safe_create_index('conversations', 'idx_user_type_updated',
    'CREATE INDEX `idx_user_type_updated` ON `conversations` (`user_id`, `conversation_type`, `updated_at` DESC)');

-- ============================================
-- conversation_messages
-- ============================================
CALL safe_create_index('conversation_messages', 'idx_conversation_id',
    'CREATE INDEX `idx_conversation_id` ON `conversation_messages` (`conversation_id`)');
CALL safe_create_index('conversation_messages', 'idx_parent_message_id',
    'CREATE INDEX `idx_parent_message_id` ON `conversation_messages` (`parent_message_id`)');
CALL safe_create_index('conversation_messages', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `conversation_messages` (`created_at`)');
CALL safe_create_index('conversation_messages', 'idx_conversation_created',
    'CREATE INDEX `idx_conversation_created` ON `conversation_messages` (`conversation_id`, `created_at`)');
CALL safe_create_index('conversation_messages', 'idx_message_chain',
    'CREATE INDEX `idx_message_chain` ON `conversation_messages` (`conversation_id`, `parent_message_id`, `created_at`)');
CALL safe_create_index('conversation_messages', 'idx_parent',
    'CREATE INDEX `idx_parent` ON `conversation_messages` (`parent_message_id`, `conversation_id`)');

-- ============================================
-- subscription_plans
-- ============================================
CALL safe_create_index('subscription_plans', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `subscription_plans` (`is_active`)');
CALL safe_create_index('subscription_plans', 'idx_sort_order',
    'CREATE INDEX `idx_sort_order` ON `subscription_plans` (`sort_order`)');
CALL safe_create_index('subscription_plans', 'idx_active_type',
    'CREATE INDEX `idx_active_type` ON `subscription_plans` (`is_active`, `plan_code`)');

-- ============================================
-- user_subscriptions
-- ============================================
CALL safe_create_index('user_subscriptions', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `user_subscriptions` (`user_id`)');
CALL safe_create_index('user_subscriptions', 'idx_status',
    'CREATE INDEX `idx_status` ON `user_subscriptions` (`status`)');
CALL safe_create_index('user_subscriptions', 'idx_end_date',
    'CREATE INDEX `idx_end_date` ON `user_subscriptions` (`end_date`)');
CALL safe_create_index('user_subscriptions', 'idx_user_status',
    'CREATE INDEX `idx_user_status` ON `user_subscriptions` (`user_id`, `status`)');
CALL safe_create_index('user_subscriptions', 'idx_user_active',
    'CREATE INDEX `idx_user_active` ON `user_subscriptions` (`user_id`, `status`, `end_date`)');
CALL safe_create_index('user_subscriptions', 'idx_plan_code',
    'CREATE INDEX `idx_plan_code` ON `user_subscriptions` (`plan_code`)');

-- ============================================
-- usage_quotas
-- ============================================
CALL safe_create_index('usage_quotas', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `usage_quotas` (`user_id`)');
CALL safe_create_index('usage_quotas', 'idx_quota_date',
    'CREATE INDEX `idx_quota_date` ON `usage_quotas` (`quota_date`)');
CALL safe_create_index('usage_quotas', 'idx_user_date_desc',
    'CREATE INDEX `idx_user_date_desc` ON `usage_quotas` (`user_id`, `quota_date` DESC)');

-- ============================================
-- orders
-- ============================================
CALL safe_create_index('orders', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `orders` (`user_id`)');
CALL safe_create_index('orders', 'idx_order_type',
    'CREATE INDEX `idx_order_type` ON `orders` (`order_type`)');
CALL safe_create_index('orders', 'idx_coupon_id',
    'CREATE INDEX `idx_coupon_id` ON `orders` (`coupon_id`)');
CALL safe_create_index('orders', 'idx_status',
    'CREATE INDEX `idx_status` ON `orders` (`status`)');
CALL safe_create_index('orders', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `orders` (`created_at`)');
CALL safe_create_index('orders', 'idx_user_created',
    'CREATE INDEX `idx_user_created` ON `orders` (`user_id`, `created_at` DESC)');
CALL safe_create_index('orders', 'idx_status_created',
    'CREATE INDEX `idx_status_created` ON `orders` (`status`, `created_at` DESC)');

-- ============================================
-- payment_transactions
-- ============================================
CALL safe_create_index('payment_transactions', 'idx_order_id',
    'CREATE INDEX `idx_order_id` ON `payment_transactions` (`order_id`)');
CALL safe_create_index('payment_transactions', 'idx_transaction_no',
    'CREATE INDEX `idx_transaction_no` ON `payment_transactions` (`transaction_no`)');
CALL safe_create_index('payment_transactions', 'idx_status_created',
    'CREATE INDEX `idx_status_created` ON `payment_transactions` (`status`, `created_at`)');

-- ============================================
-- coupon_templates
-- ============================================
CALL safe_create_index('coupon_templates', 'idx_status_type',
    'CREATE INDEX `idx_status_type` ON `coupon_templates` (`status`, `distribution_type`)');
CALL safe_create_index('coupon_templates', 'idx_valid_time',
    'CREATE INDEX `idx_valid_time` ON `coupon_templates` (`fixed_valid_start`, `fixed_valid_end`)');

-- ============================================
-- user_coupons
-- ============================================
CALL safe_create_index('user_coupons', 'idx_user_status',
    'CREATE INDEX `idx_user_status` ON `user_coupons` (`user_id`, `status`)');
CALL safe_create_index('user_coupons', 'idx_template',
    'CREATE INDEX `idx_template` ON `user_coupons` (`template_id`)');
CALL safe_create_index('user_coupons', 'idx_valid_time',
    'CREATE INDEX `idx_valid_time` ON `user_coupons` (`valid_from`, `valid_until`)');
CALL safe_create_index('user_coupons', 'idx_source',
    'CREATE INDEX `idx_source` ON `user_coupons` (`source_type`, `source_id`)');

-- ============================================
-- coupon_usage_logs
-- ============================================
CALL safe_create_index('coupon_usage_logs', 'idx_user_coupon',
    'CREATE INDEX `idx_user_coupon` ON `coupon_usage_logs` (`user_coupon_id`)');
CALL safe_create_index('coupon_usage_logs', 'idx_user',
    'CREATE INDEX `idx_user` ON `coupon_usage_logs` (`user_id`)');
CALL safe_create_index('coupon_usage_logs', 'idx_order',
    'CREATE INDEX `idx_order` ON `coupon_usage_logs` (`order_id`)');

-- ============================================
-- user_invitations
-- ============================================
CALL safe_create_index('user_invitations', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `user_invitations` (`is_active`)');

-- ============================================
-- invitation_relationships
-- ============================================
CALL safe_create_index('invitation_relationships', 'idx_inviter',
    'CREATE INDEX `idx_inviter` ON `invitation_relationships` (`inviter_id`)');
CALL safe_create_index('invitation_relationships', 'idx_invitation_code',
    'CREATE INDEX `idx_invitation_code` ON `invitation_relationships` (`invitation_code`)');
CALL safe_create_index('invitation_relationships', 'idx_status',
    'CREATE INDEX `idx_status` ON `invitation_relationships` (`status`)');

-- ============================================
-- coupon_batches
-- ============================================
CALL safe_create_index('coupon_batches', 'idx_template',
    'CREATE INDEX `idx_template` ON `coupon_batches` (`template_id`)');
CALL safe_create_index('coupon_batches', 'idx_status',
    'CREATE INDEX `idx_status` ON `coupon_batches` (`status`)');

-- ============================================
-- privacy_policies
-- ============================================
CALL safe_create_index('privacy_policies', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `privacy_policies` (`is_active`)');
CALL safe_create_index('privacy_policies', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `privacy_policies` (`created_at`)');

-- ============================================
-- terms_of_service
-- ============================================
CALL safe_create_index('terms_of_service', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `terms_of_service` (`is_active`)');
CALL safe_create_index('terms_of_service', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `terms_of_service` (`created_at`)');

-- ============================================
-- email_configs
-- ============================================
CALL safe_create_index('email_configs', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `email_configs` (`is_active`)');
CALL safe_create_index('email_configs', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `email_configs` (`created_at`)');

-- ============================================
-- sms_configs
-- ============================================
CALL safe_create_index('sms_configs', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `sms_configs` (`is_active`)');
CALL safe_create_index('sms_configs', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `sms_configs` (`created_at`)');

-- ============================================
-- alipay_configs
-- ============================================
CALL safe_create_index('alipay_configs', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `alipay_configs` (`is_active`)');

-- ============================================
-- wechat_pay_configs
-- ============================================
CALL safe_create_index('wechat_pay_configs', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `wechat_pay_configs` (`is_active`)');

-- ============================================
-- wechat_configs
-- ============================================
CALL safe_create_index('wechat_configs', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `wechat_configs` (`is_active`)');

-- ============================================
-- third_party_accounts
-- ============================================
CALL safe_create_index('third_party_accounts', 'idx_type_status',
    'CREATE INDEX `idx_type_status` ON `third_party_accounts` (`type`, `status`)');
CALL safe_create_index('third_party_accounts', 'idx_type_priority',
    'CREATE INDEX `idx_type_priority` ON `third_party_accounts` (`type`, `status`, `priority`)');
CALL safe_create_index('third_party_accounts', 'idx_last_used',
    'CREATE INDEX `idx_last_used` ON `third_party_accounts` (`last_used_at`)');

-- ============================================
-- prompt_templates
-- ============================================
CALL safe_create_index('prompt_templates', 'idx_active',
    'CREATE INDEX `idx_active` ON `prompt_templates` (`is_active`)');

-- ============================================
-- paper_analysis
-- ============================================
CALL safe_create_index('paper_analysis', 'idx_dimension_hash',
    'CREATE INDEX `idx_dimension_hash` ON `paper_analysis` (`dimension_hash`)');
CALL safe_create_index('paper_analysis', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `paper_analysis` (`created_at`)');

-- ============================================
-- analysis_dimensions
-- ============================================
CALL safe_create_index('analysis_dimensions', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `analysis_dimensions` (`user_id`)');
CALL safe_create_index('analysis_dimensions', 'idx_dimension_key',
    'CREATE INDEX `idx_dimension_key` ON `analysis_dimensions` (`dimension_key`)');
CALL safe_create_index('analysis_dimensions', 'idx_sort_order',
    'CREATE INDEX `idx_sort_order` ON `analysis_dimensions` (`sort_order`)');

-- ============================================
-- peer_review_tasks
-- ============================================
CALL safe_create_index('peer_review_tasks', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `peer_review_tasks` (`user_id`)');
CALL safe_create_index('peer_review_tasks', 'idx_status',
    'CREATE INDEX `idx_status` ON `peer_review_tasks` (`status`)');
CALL safe_create_index('peer_review_tasks', 'idx_user_status',
    'CREATE INDEX `idx_user_status` ON `peer_review_tasks` (`user_id`, `status`)');
CALL safe_create_index('peer_review_tasks', 'idx_user_created',
    'CREATE INDEX `idx_user_created` ON `peer_review_tasks` (`user_id`, `created_at` DESC)');
CALL safe_create_index('peer_review_tasks', 'idx_content_hash',
    'CREATE INDEX `idx_content_hash` ON `peer_review_tasks` (`content_hash`)');

-- ============================================
-- peer_review_files
-- ============================================
CALL safe_create_index('peer_review_files', 'idx_task_id',
    'CREATE INDEX `idx_task_id` ON `peer_review_files` (`task_id`)');
CALL safe_create_index('peer_review_files', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `peer_review_files` (`user_id`)');
CALL safe_create_index('peer_review_files', 'idx_file_role',
    'CREATE INDEX `idx_file_role` ON `peer_review_files` (`task_id`, `file_role`)');
CALL safe_create_index('peer_review_files', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `peer_review_files` (`created_at`)');

-- ============================================
-- peer_review_results
-- ============================================
CALL safe_create_index('peer_review_results', 'idx_task_id',
    'CREATE INDEX `idx_task_id` ON `peer_review_results` (`task_id`)');
CALL safe_create_index('peer_review_results', 'idx_status',
    'CREATE INDEX `idx_status` ON `peer_review_results` (`status`)');

-- ============================================
-- feedbacks
-- ============================================
CALL safe_create_index('feedbacks', 'idx_email',
    'CREATE INDEX `idx_email` ON `feedbacks` (`email`)');
CALL safe_create_index('feedbacks', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `feedbacks` (`user_id`)');
CALL safe_create_index('feedbacks', 'idx_status',
    'CREATE INDEX `idx_status` ON `feedbacks` (`status`)');
CALL safe_create_index('feedbacks', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `feedbacks` (`created_at`)');
CALL safe_create_index('feedbacks', 'idx_status_created',
    'CREATE INDEX `idx_status_created` ON `feedbacks` (`status`, `created_at` DESC)');

-- ============================================
-- feedback_attachments
-- ============================================
CALL safe_create_index('feedback_attachments', 'idx_upload_key',
    'CREATE INDEX `idx_upload_key` ON `feedback_attachments` (`upload_key`)');
CALL safe_create_index('feedback_attachments', 'idx_feedback_id',
    'CREATE INDEX `idx_feedback_id` ON `feedback_attachments` (`feedback_id`)');
CALL safe_create_index('feedback_attachments', 'idx_is_used',
    'CREATE INDEX `idx_is_used` ON `feedback_attachments` (`is_used`)');
CALL safe_create_index('feedback_attachments', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `feedback_attachments` (`created_at`)');

-- ============================================
-- latex_documents
-- ============================================
CALL safe_create_index('latex_documents', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `latex_documents` (`user_id`)');
CALL safe_create_index('latex_documents', 'idx_parent_id',
    'CREATE INDEX `idx_parent_id` ON `latex_documents` (`parent_id`)');
CALL safe_create_index('latex_documents', 'idx_sort_order',
    'CREATE INDEX `idx_sort_order` ON `latex_documents` (`sort_order`)');

-- ============================================
-- latex_agent_models
-- ============================================
CALL safe_create_index('latex_agent_models', 'idx_latex_model_enabled',
    'CREATE INDEX `idx_latex_model_enabled` ON `latex_agent_models` (`is_enabled`)');
CALL safe_create_index('latex_agent_models', 'idx_latex_model_sort',
    'CREATE INDEX `idx_latex_model_sort` ON `latex_agent_models` (`sort_order`)');

-- ============================================
-- latex_conversations
-- ============================================
CALL safe_create_index('latex_conversations', 'idx_latex_conv_user_id',
    'CREATE INDEX `idx_latex_conv_user_id` ON `latex_conversations` (`user_id`)');
CALL safe_create_index('latex_conversations', 'idx_latex_conv_document_id',
    'CREATE INDEX `idx_latex_conv_document_id` ON `latex_conversations` (`document_id`)');

-- ============================================
-- latex_chat_messages
-- ============================================
CALL safe_create_index('latex_chat_messages', 'idx_latex_msg_conversation_id',
    'CREATE INDEX `idx_latex_msg_conversation_id` ON `latex_chat_messages` (`conversation_id`)');
CALL safe_create_index('latex_chat_messages', 'idx_latex_msg_role',
    'CREATE INDEX `idx_latex_msg_role` ON `latex_chat_messages` (`role`)');
CALL safe_create_index('latex_chat_messages', 'idx_latex_msg_created_at',
    'CREATE INDEX `idx_latex_msg_created_at` ON `latex_chat_messages` (`created_at`)');

-- ============================================
-- agent_tool_permissions
-- ============================================
CALL safe_create_index('agent_tool_permissions', 'idx_tool_permissions_user',
    'CREATE INDEX `idx_tool_permissions_user` ON `agent_tool_permissions` (`user_id`)');
CALL safe_create_index('agent_tool_permissions', 'idx_tool_permissions_tool',
    'CREATE INDEX `idx_tool_permissions_tool` ON `agent_tool_permissions` (`tool_name`)');

-- ============================================
-- conversation_summaries
-- ============================================
CALL safe_create_index('conversation_summaries', 'idx_conv_summary_conversation',
    'CREATE INDEX `idx_conv_summary_conversation` ON `conversation_summaries` (`conversation_id`)');
CALL safe_create_index('conversation_summaries', 'idx_conv_summary_created',
    'CREATE INDEX `idx_conv_summary_created` ON `conversation_summaries` (`created_at`)');

-- ============================================
-- user_checkins
-- ============================================
CALL safe_create_index('user_checkins', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `user_checkins` (`user_id`)');
CALL safe_create_index('user_checkins', 'idx_checkin_date',
    'CREATE INDEX `idx_checkin_date` ON `user_checkins` (`checkin_date`)');

-- ============================================
-- currency_transactions
-- ============================================
CALL safe_create_index('currency_transactions', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `currency_transactions` (`user_id`)');
CALL safe_create_index('currency_transactions', 'idx_currency_type',
    'CREATE INDEX `idx_currency_type` ON `currency_transactions` (`currency_type`)');
CALL safe_create_index('currency_transactions', 'idx_transaction_type',
    'CREATE INDEX `idx_transaction_type` ON `currency_transactions` (`transaction_type`)');
CALL safe_create_index('currency_transactions', 'idx_biz_type',
    'CREATE INDEX `idx_biz_type` ON `currency_transactions` (`biz_type`)');
CALL safe_create_index('currency_transactions', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `currency_transactions` (`created_at`)');
CALL safe_create_index('currency_transactions', 'idx_status_created',
    'CREATE INDEX `idx_status_created` ON `currency_transactions` (`status`, `created_at`)');
CALL safe_create_index('currency_transactions', 'idx_user_created',
    'CREATE INDEX `idx_user_created` ON `currency_transactions` (`user_id`, `created_at`)');

-- ============================================
-- membership_funds
-- ============================================
CALL safe_create_index('membership_funds', 'idx_status',
    'CREATE INDEX `idx_status` ON `membership_funds` (`status`)');

-- ============================================
-- membership_fund_distributions
-- ============================================
CALL safe_create_index('membership_fund_distributions', 'idx_fund_id',
    'CREATE INDEX `idx_fund_id` ON `membership_fund_distributions` (`fund_id`)');
CALL safe_create_index('membership_fund_distributions', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `membership_fund_distributions` (`user_id`)');
CALL safe_create_index('membership_fund_distributions', 'idx_distributed_at',
    'CREATE INDEX `idx_distributed_at` ON `membership_fund_distributions` (`distributed_at`)');

-- ============================================
-- currency_configs
-- ============================================
CALL safe_create_index('currency_configs', 'idx_category',
    'CREATE INDEX `idx_category` ON `currency_configs` (`category`)');

-- ============================================
-- usage_logs
-- ============================================
CALL safe_create_index('usage_logs', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `usage_logs` (`user_id`)');
CALL safe_create_index('usage_logs', 'idx_session_id',
    'CREATE INDEX `idx_session_id` ON `usage_logs` (`session_id`)');
CALL safe_create_index('usage_logs', 'idx_feature_code',
    'CREATE INDEX `idx_feature_code` ON `usage_logs` (`feature_code`)');
CALL safe_create_index('usage_logs', 'idx_action',
    'CREATE INDEX `idx_action` ON `usage_logs` (`action`)');
CALL safe_create_index('usage_logs', 'idx_entry_point',
    'CREATE INDEX `idx_entry_point` ON `usage_logs` (`entry_point`)');
CALL safe_create_index('usage_logs', 'idx_ip_address',
    'CREATE INDEX `idx_ip_address` ON `usage_logs` (`ip_address`)');
CALL safe_create_index('usage_logs', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `usage_logs` (`created_at`)');
CALL safe_create_index('usage_logs', 'idx_feature_created',
    'CREATE INDEX `idx_feature_created` ON `usage_logs` (`feature_code`, `created_at`)');
CALL safe_create_index('usage_logs', 'idx_user_feature',
    'CREATE INDEX `idx_user_feature` ON `usage_logs` (`user_id`, `feature_code`)');
CALL safe_create_index('usage_logs', 'idx_user_created',
    'CREATE INDEX `idx_user_created` ON `usage_logs` (`user_id`, `created_at`)');

-- ============================================
-- messages
-- ============================================
CALL safe_create_index('messages', 'idx_category',
    'CREATE INDEX `idx_category` ON `messages` (`category`)');
CALL safe_create_index('messages', 'idx_send_type',
    'CREATE INDEX `idx_send_type` ON `messages` (`send_type`)');
CALL safe_create_index('messages', 'idx_status',
    'CREATE INDEX `idx_status` ON `messages` (`status`)');
CALL safe_create_index('messages', 'idx_send_at',
    'CREATE INDEX `idx_send_at` ON `messages` (`send_at`)');
CALL safe_create_index('messages', 'idx_expire_at',
    'CREATE INDEX `idx_expire_at` ON `messages` (`expire_at`)');
CALL safe_create_index('messages', 'idx_sender_id',
    'CREATE INDEX `idx_sender_id` ON `messages` (`sender_id`)');
CALL safe_create_index('messages', 'idx_status_send_at',
    'CREATE INDEX `idx_status_send_at` ON `messages` (`status`, `send_at`)');

-- ============================================
-- message_templates
-- ============================================
CALL safe_create_index('message_templates', 'idx_category',
    'CREATE INDEX `idx_category` ON `message_templates` (`category`)');
CALL safe_create_index('message_templates', 'idx_is_active',
    'CREATE INDEX `idx_is_active` ON `message_templates` (`is_active`)');

-- ============================================
-- user_messages
-- ============================================
CALL safe_create_index('user_messages', 'idx_user_unread',
    'CREATE INDEX `idx_user_unread` ON `user_messages` (`user_id`, `is_read`, `is_deleted`)');
CALL safe_create_index('user_messages', 'idx_user_created',
    'CREATE INDEX `idx_user_created` ON `user_messages` (`user_id`, `created_at` DESC)');
CALL safe_create_index('user_messages', 'idx_message_id',
    'CREATE INDEX `idx_message_id` ON `user_messages` (`message_id`)');

-- ============================================
-- code_snippets
-- ============================================
CALL safe_create_index('code_snippets', 'idx_category',
    'CREATE INDEX `idx_category` ON `code_snippets` (`category`)');
CALL safe_create_index('code_snippets', 'idx_position',
    'CREATE INDEX `idx_position` ON `code_snippets` (`position`)');
CALL safe_create_index('code_snippets', 'idx_is_enabled',
    'CREATE INDEX `idx_is_enabled` ON `code_snippets` (`is_enabled`)');
CALL safe_create_index('code_snippets', 'idx_priority',
    'CREATE INDEX `idx_priority` ON `code_snippets` (`priority`)');

-- ============================================
-- currency_batches
-- ============================================
CALL safe_create_index('currency_batches', 'idx_currency_type',
    'CREATE INDEX `idx_currency_type` ON `currency_batches` (`currency_type`)');
CALL safe_create_index('currency_batches', 'idx_target_type',
    'CREATE INDEX `idx_target_type` ON `currency_batches` (`target_type`)');
CALL safe_create_index('currency_batches', 'idx_status',
    'CREATE INDEX `idx_status` ON `currency_batches` (`status`)');
CALL safe_create_index('currency_batches', 'idx_created_by',
    'CREATE INDEX `idx_created_by` ON `currency_batches` (`created_by`)');
CALL safe_create_index('currency_batches', 'idx_created_at',
    'CREATE INDEX `idx_created_at` ON `currency_batches` (`created_at`)');

-- ============================================
-- currency_batch_distributions
-- ============================================
CALL safe_create_index('currency_batch_distributions', 'idx_batch_id',
    'CREATE INDEX `idx_batch_id` ON `currency_batch_distributions` (`batch_id`)');
CALL safe_create_index('currency_batch_distributions', 'idx_batch_no',
    'CREATE INDEX `idx_batch_no` ON `currency_batch_distributions` (`batch_no`)');
CALL safe_create_index('currency_batch_distributions', 'idx_user_id',
    'CREATE INDEX `idx_user_id` ON `currency_batch_distributions` (`user_id`)');
CALL safe_create_index('currency_batch_distributions', 'idx_status',
    'CREATE INDEX `idx_status` ON `currency_batch_distributions` (`status`)');

-- ============================================
-- hot_search_keywords
-- ============================================
CALL safe_create_index('hot_search_keywords', 'idx_search_count',
    'CREATE INDEX `idx_search_count` ON `hot_search_keywords` (`search_count` DESC)');
CALL safe_create_index('hot_search_keywords', 'idx_last_searched',
    'CREATE INDEX `idx_last_searched` ON `hot_search_keywords` (`last_searched_at`)');
CALL safe_create_index('hot_search_keywords', 'idx_first_searched',
    'CREATE INDEX `idx_first_searched` ON `hot_search_keywords` (`first_searched_at`)');

-- ============================================
-- hot_papers
-- ============================================
CALL safe_create_index('hot_papers', 'idx_doi',
    'CREATE INDEX `idx_doi` ON `hot_papers` (`doi`)');
CALL safe_create_index('hot_papers', 'idx_view_count',
    'CREATE INDEX `idx_view_count` ON `hot_papers` (`view_count` DESC)');
CALL safe_create_index('hot_papers', 'idx_last_viewed',
    'CREATE INDEX `idx_last_viewed` ON `hot_papers` (`last_viewed_at`)');
CALL safe_create_index('hot_papers', 'idx_first_viewed',
    'CREATE INDEX `idx_first_viewed` ON `hot_papers` (`first_viewed_at`)');

-- 清理辅助存储过程
DROP PROCEDURE IF EXISTS safe_create_index;
