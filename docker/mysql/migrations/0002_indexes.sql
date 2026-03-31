-- ============================================================================
-- 全部索引定义（二级索引 + 唯一索引 + 外键约束）
-- 使用 0000_utils.sql 提供的存储过程保证幂等性
-- 后续新增索引请直接追加到本文件末尾
-- ============================================================================

SET foreign_key_checks = 0;

-- admin_users 表索引
CALL add_index_if_not_exists('admin_users', 'uk_username', '`username`', TRUE);
CALL add_index_if_not_exists('admin_users', 'idx_status', '`status`', FALSE);

-- users 表索引
CALL add_index_if_not_exists('users', 'uk_username', '`username`', TRUE);
CALL add_index_if_not_exists('users', 'uk_email', '`email`', TRUE);
CALL add_index_if_not_exists('users', 'uk_phone', '`phone`', TRUE);
CALL add_index_if_not_exists('users', 'idx_status', '`status`', FALSE);
CALL add_index_if_not_exists('users', 'idx_subscription_plan', '`subscription_plan`', FALSE);
CALL add_index_if_not_exists('users', 'idx_location', '`location`', FALSE);
CALL add_index_if_not_exists('users', 'idx_last_login_at', '`last_login_at`', FALSE);

-- user_auth_providers 表索引
CALL add_index_if_not_exists('user_auth_providers', 'uk_provider_user', '`provider`, `provider_user_id`', TRUE);
CALL add_index_if_not_exists('user_auth_providers', 'uk_provider_union', '`provider`, `provider_union_id`', TRUE);
CALL add_index_if_not_exists('user_auth_providers', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('user_auth_providers', 'idx_union_id', '`provider_union_id`', FALSE);
CALL add_foreign_key_if_not_exists('user_auth_providers', 'fk_user_auth_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- user_sessions 表索引
CALL add_index_if_not_exists('user_sessions', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('user_sessions', 'idx_token', '`token`(64)', FALSE);
CALL add_index_if_not_exists('user_sessions', 'idx_device_type', '`user_id`, `device_type`', FALSE);
CALL add_index_if_not_exists('user_sessions', 'idx_active_sessions', '`last_activity`, `expires_at`', FALSE);
CALL add_index_if_not_exists('user_sessions', 'idx_user_activity', '`user_id`, `last_activity` DESC', FALSE);
CALL add_foreign_key_if_not_exists('user_sessions', 'fk_user_sessions_user_id', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- user_statistics 表索引
CALL add_index_if_not_exists('user_statistics', 'uk_date', '`date`', TRUE);
CALL add_index_if_not_exists('user_statistics', 'idx_date', '`date`', FALSE);

-- online_user_snapshots 表索引
CALL add_index_if_not_exists('online_user_snapshots', 'uk_timestamp', '`timestamp`', TRUE);

-- conversations 表索引
CALL add_index_if_not_exists('conversations', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('conversations', 'idx_updated_at', '`updated_at`', FALSE);
CALL add_index_if_not_exists('conversations', 'idx_conversation_type', '`conversation_type`', FALSE);
CALL add_index_if_not_exists('conversations', 'idx_user_type', '`user_id`, `conversation_type`', FALSE);
CALL add_index_if_not_exists('conversations', 'idx_user_updated', '`user_id`, `updated_at` DESC', FALSE);
CALL add_index_if_not_exists('conversations', 'idx_user_type_updated', '`user_id`, `conversation_type`, `updated_at` DESC', FALSE);
CALL add_foreign_key_if_not_exists('conversations', 'fk_conversations_user_id', 'FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE');

-- conversation_messages 表索引
CALL add_index_if_not_exists('conversation_messages', 'uk_message_id', '`message_id`', TRUE);
CALL add_index_if_not_exists('conversation_messages', 'idx_conversation_id', '`conversation_id`', FALSE);
CALL add_index_if_not_exists('conversation_messages', 'idx_parent_message_id', '`parent_message_id`', FALSE);
CALL add_index_if_not_exists('conversation_messages', 'idx_created_at', '`created_at`', FALSE);
CALL add_index_if_not_exists('conversation_messages', 'idx_conversation_created', '`conversation_id`, `created_at`', FALSE);
CALL add_index_if_not_exists('conversation_messages', 'idx_message_chain', '`conversation_id`, `parent_message_id`, `created_at`', FALSE);
CALL add_index_if_not_exists('conversation_messages', 'idx_parent', '`parent_message_id`, `conversation_id`', FALSE);
CALL add_foreign_key_if_not_exists('conversation_messages', 'fk_conversation_messages_conversation_id', 'FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE');

-- subscription_plans 表索引
CALL add_index_if_not_exists('subscription_plans', 'uk_plan_code', '`plan_code`', TRUE);
CALL add_index_if_not_exists('subscription_plans', 'idx_is_active', '`is_active`', FALSE);
CALL add_index_if_not_exists('subscription_plans', 'idx_sort_order', '`sort_order`', FALSE);
CALL add_index_if_not_exists('subscription_plans', 'idx_active_type', '`is_active`, `plan_code`', FALSE);

-- user_subscriptions 表索引
CALL add_index_if_not_exists('user_subscriptions', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('user_subscriptions', 'idx_status', '`status`', FALSE);
CALL add_index_if_not_exists('user_subscriptions', 'idx_end_date', '`end_date`', FALSE);
CALL add_index_if_not_exists('user_subscriptions', 'idx_user_status', '`user_id`, `status`', FALSE);
CALL add_index_if_not_exists('user_subscriptions', 'idx_user_active', '`user_id`, `status`, `end_date`', FALSE);
CALL add_foreign_key_if_not_exists('user_subscriptions', 'fk_user_subscriptions_user_id', 'FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE');

-- usage_quotas 表索引
CALL add_index_if_not_exists('usage_quotas', 'uk_user_date', '`user_id`, `quota_date`', TRUE);
CALL add_index_if_not_exists('usage_quotas', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('usage_quotas', 'idx_quota_date', '`quota_date`', FALSE);
CALL add_index_if_not_exists('usage_quotas', 'idx_user_date_desc', '`user_id`, `quota_date` DESC', FALSE);
CALL add_foreign_key_if_not_exists('usage_quotas', 'fk_usage_quotas_user_id', 'FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE');

-- orders 表索引
CALL add_index_if_not_exists('orders', 'uk_order_no', '`order_no`', TRUE);
CALL add_index_if_not_exists('orders', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('orders', 'idx_order_type', '`order_type`', FALSE);
CALL add_index_if_not_exists('orders', 'idx_coupon_id', '`coupon_id`', FALSE);
CALL add_index_if_not_exists('orders', 'idx_status', '`status`', FALSE);
CALL add_index_if_not_exists('orders', 'idx_created_at', '`created_at`', FALSE);
CALL add_index_if_not_exists('orders', 'idx_user_created', '`user_id`, `created_at` DESC', FALSE);
CALL add_index_if_not_exists('orders', 'idx_status_created', '`status`, `created_at` DESC', FALSE);
CALL add_foreign_key_if_not_exists('orders', 'fk_orders_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- payment_transactions 表索引
CALL add_index_if_not_exists('payment_transactions', 'idx_order_id', '`order_id`', FALSE);
CALL add_index_if_not_exists('payment_transactions', 'idx_transaction_no', '`transaction_no`', FALSE);
CALL add_foreign_key_if_not_exists('payment_transactions', 'fk_payment_order', 'FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE');

-- coupon_templates 表索引
CALL add_index_if_not_exists('coupon_templates', 'uk_code', '`code`', TRUE);
CALL add_index_if_not_exists('coupon_templates', 'idx_status_type', '`status`, `distribution_type`', FALSE);
CALL add_index_if_not_exists('coupon_templates', 'idx_valid_time', '`fixed_valid_start`, `fixed_valid_end`', FALSE);

-- user_coupons 表索引
CALL add_index_if_not_exists('user_coupons', 'uk_coupon_code', '`coupon_code`', TRUE);
CALL add_index_if_not_exists('user_coupons', 'idx_user_status', '`user_id`, `status`', FALSE);
CALL add_index_if_not_exists('user_coupons', 'idx_template', '`template_id`', FALSE);
CALL add_index_if_not_exists('user_coupons', 'idx_valid_time', '`valid_from`, `valid_until`', FALSE);
CALL add_index_if_not_exists('user_coupons', 'idx_source', '`source_type`, `source_id`', FALSE);
CALL add_foreign_key_if_not_exists('user_coupons', 'fk_user_coupon_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');
CALL add_foreign_key_if_not_exists('user_coupons', 'fk_user_coupon_template', 'FOREIGN KEY (`template_id`) REFERENCES `coupon_templates` (`id`)');

-- coupon_usage_logs 表索引
CALL add_index_if_not_exists('coupon_usage_logs', 'idx_user_coupon', '`user_coupon_id`', FALSE);
CALL add_index_if_not_exists('coupon_usage_logs', 'idx_user', '`user_id`', FALSE);
CALL add_index_if_not_exists('coupon_usage_logs', 'idx_order', '`order_id`', FALSE);
CALL add_foreign_key_if_not_exists('coupon_usage_logs', 'fk_usage_log_user_coupon', 'FOREIGN KEY (`user_coupon_id`) REFERENCES `user_coupons` (`id`)');
CALL add_foreign_key_if_not_exists('coupon_usage_logs', 'fk_usage_log_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');
CALL add_foreign_key_if_not_exists('coupon_usage_logs', 'fk_usage_log_order', 'FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE');

-- user_invitations 表索引
CALL add_index_if_not_exists('user_invitations', 'uk_user_id', '`user_id`', TRUE);
CALL add_index_if_not_exists('user_invitations', 'uk_invitation_code', '`invitation_code`', TRUE);
CALL add_index_if_not_exists('user_invitations', 'idx_is_active', '`is_active`', FALSE);
CALL add_foreign_key_if_not_exists('user_invitations', 'fk_invitation_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- invitation_relationships 表索引
CALL add_index_if_not_exists('invitation_relationships', 'uk_invitee', '`invitee_id`', TRUE);
CALL add_index_if_not_exists('invitation_relationships', 'idx_inviter', '`inviter_id`', FALSE);
CALL add_index_if_not_exists('invitation_relationships', 'idx_invitation_code', '`invitation_code`', FALSE);
CALL add_index_if_not_exists('invitation_relationships', 'idx_status', '`status`', FALSE);
CALL add_foreign_key_if_not_exists('invitation_relationships', 'fk_relationship_inviter', 'FOREIGN KEY (`inviter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');
CALL add_foreign_key_if_not_exists('invitation_relationships', 'fk_relationship_invitee', 'FOREIGN KEY (`invitee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- coupon_batches 表索引
CALL add_index_if_not_exists('coupon_batches', 'uk_batch_code', '`batch_code`', TRUE);
CALL add_index_if_not_exists('coupon_batches', 'idx_template', '`template_id`', FALSE);
CALL add_index_if_not_exists('coupon_batches', 'idx_status', '`status`', FALSE);
CALL add_foreign_key_if_not_exists('coupon_batches', 'fk_batch_template', 'FOREIGN KEY (`template_id`) REFERENCES `coupon_templates` (`id`)');

-- privacy_policies 表索引
CALL add_index_if_not_exists('privacy_policies', 'idx_is_active', '`is_active`', FALSE);
CALL add_index_if_not_exists('privacy_policies', 'idx_created_at', '`created_at`', FALSE);

-- terms_of_service 表索引
CALL add_index_if_not_exists('terms_of_service', 'idx_is_active', '`is_active`', FALSE);
CALL add_index_if_not_exists('terms_of_service', 'idx_created_at', '`created_at`', FALSE);

-- email_configs 表索引
CALL add_index_if_not_exists('email_configs', 'idx_is_active', '`is_active`', FALSE);
CALL add_index_if_not_exists('email_configs', 'idx_created_at', '`created_at`', FALSE);

-- sms_configs 表索引
CALL add_index_if_not_exists('sms_configs', 'idx_is_active', '`is_active`', FALSE);
CALL add_index_if_not_exists('sms_configs', 'idx_created_at', '`created_at`', FALSE);

-- alipay_configs 表索引
CALL add_index_if_not_exists('alipay_configs', 'idx_is_active', '`is_active`', FALSE);

-- wechat_pay_configs 表索引
CALL add_index_if_not_exists('wechat_pay_configs', 'idx_is_active', '`is_active`', FALSE);

-- wechat_configs 表索引
CALL add_index_if_not_exists('wechat_configs', 'idx_is_active', '`is_active`', FALSE);

-- third_party_accounts 表索引
CALL add_index_if_not_exists('third_party_accounts', 'idx_type_status', '`type`, `status`', FALSE);
CALL add_index_if_not_exists('third_party_accounts', 'idx_type_priority', '`type`, `status`, `priority`', FALSE);
CALL add_index_if_not_exists('third_party_accounts', 'idx_last_used', '`last_used_at`', FALSE);

-- prompt_templates 表索引
CALL add_index_if_not_exists('prompt_templates', 'uk_key', '`key`', TRUE);
CALL add_index_if_not_exists('prompt_templates', 'idx_active', '`is_active`', FALSE);

-- paper_analysis 表索引
CALL add_index_if_not_exists('paper_analysis', 'uk_paper_dimension', '`paper_id`, `dimension_hash`', TRUE);
CALL add_index_if_not_exists('paper_analysis', 'idx_dimension_hash', '`dimension_hash`', FALSE);
CALL add_index_if_not_exists('paper_analysis', 'idx_created_at', '`created_at`', FALSE);

-- analysis_dimensions 表索引
CALL add_index_if_not_exists('analysis_dimensions', 'uk_user_dimension', '`user_id`, `dimension_key`', TRUE);
CALL add_index_if_not_exists('analysis_dimensions', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('analysis_dimensions', 'idx_dimension_key', '`dimension_key`', FALSE);
CALL add_index_if_not_exists('analysis_dimensions', 'idx_sort_order', '`sort_order`', FALSE);

-- peer_review_tasks 表索引
CALL add_index_if_not_exists('peer_review_tasks', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('peer_review_tasks', 'idx_status', '`status`', FALSE);
CALL add_index_if_not_exists('peer_review_tasks', 'idx_user_status', '`user_id`, `status`', FALSE);
CALL add_index_if_not_exists('peer_review_tasks', 'idx_user_created', '`user_id`, `created_at` DESC', FALSE);
CALL add_index_if_not_exists('peer_review_tasks', 'idx_content_hash', '`content_hash`', FALSE);
CALL add_foreign_key_if_not_exists('peer_review_tasks', 'fk_pr_task_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- peer_review_files 表索引
CALL add_index_if_not_exists('peer_review_files', 'idx_task_id', '`task_id`', FALSE);
CALL add_index_if_not_exists('peer_review_files', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('peer_review_files', 'idx_file_role', '`task_id`, `file_role`', FALSE);
CALL add_index_if_not_exists('peer_review_files', 'idx_created_at', '`created_at`', FALSE);
CALL add_foreign_key_if_not_exists('peer_review_files', 'fk_pr_file_task', 'FOREIGN KEY (`task_id`) REFERENCES `peer_review_tasks` (`id`) ON DELETE CASCADE');
CALL add_foreign_key_if_not_exists('peer_review_files', 'fk_pr_file_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- peer_review_results 表索引
CALL add_index_if_not_exists('peer_review_results', 'uk_task_reviewer', '`task_id`, `reviewer_index`', TRUE);
CALL add_index_if_not_exists('peer_review_results', 'idx_task_id', '`task_id`', FALSE);
CALL add_index_if_not_exists('peer_review_results', 'idx_status', '`status`', FALSE);
CALL add_foreign_key_if_not_exists('peer_review_results', 'fk_pr_result_task', 'FOREIGN KEY (`task_id`) REFERENCES `peer_review_tasks` (`id`) ON DELETE CASCADE');

-- feedbacks 表索引
CALL add_index_if_not_exists('feedbacks', 'idx_email', '`email`', FALSE);
CALL add_index_if_not_exists('feedbacks', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('feedbacks', 'idx_status', '`status`', FALSE);
CALL add_index_if_not_exists('feedbacks', 'idx_created_at', '`created_at`', FALSE);
CALL add_index_if_not_exists('feedbacks', 'idx_status_created', '`status`, `created_at` DESC', FALSE);
CALL add_foreign_key_if_not_exists('feedbacks', 'fk_feedback_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL');

-- feedback_attachments 表索引
CALL add_index_if_not_exists('feedback_attachments', 'idx_upload_key', '`upload_key`', FALSE);
CALL add_index_if_not_exists('feedback_attachments', 'idx_feedback_id', '`feedback_id`', FALSE);
CALL add_index_if_not_exists('feedback_attachments', 'idx_is_used', '`is_used`', FALSE);
CALL add_index_if_not_exists('feedback_attachments', 'idx_created_at', '`created_at`', FALSE);
CALL add_foreign_key_if_not_exists('feedback_attachments', 'fk_attachment_feedback', 'FOREIGN KEY (`feedback_id`) REFERENCES `feedbacks` (`id`) ON DELETE CASCADE');

-- latex_documents 表索引
CALL add_index_if_not_exists('latex_documents', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('latex_documents', 'idx_parent_id', '`parent_id`', FALSE);
CALL add_index_if_not_exists('latex_documents', 'idx_sort_order', '`sort_order`', FALSE);
CALL add_foreign_key_if_not_exists('latex_documents', 'fk_latex_doc_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');
CALL add_foreign_key_if_not_exists('latex_documents', 'fk_latex_doc_parent', 'FOREIGN KEY (`parent_id`) REFERENCES `latex_documents` (`id`) ON DELETE CASCADE');

-- user_checkins 表索引
CALL add_index_if_not_exists('user_checkins', 'uk_user_date', '`user_id`, `checkin_date`', TRUE);
CALL add_index_if_not_exists('user_checkins', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('user_checkins', 'idx_checkin_date', '`checkin_date`', FALSE);
CALL add_foreign_key_if_not_exists('user_checkins', 'fk_checkin_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- user_checkin_stats 表索引
CALL add_index_if_not_exists('user_checkin_stats', 'uk_user_id', '`user_id`', TRUE);
CALL add_foreign_key_if_not_exists('user_checkin_stats', 'fk_checkin_stats_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- wallets 表索引
CALL add_index_if_not_exists('wallets', 'uk_user_id', '`user_id`', TRUE);
CALL add_foreign_key_if_not_exists('wallets', 'fk_wallet_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- currency_transactions 表索引
CALL add_index_if_not_exists('currency_transactions', 'uk_transaction_no', '`transaction_no`', TRUE);
CALL add_index_if_not_exists('currency_transactions', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('currency_transactions', 'idx_currency_type', '`currency_type`', FALSE);
CALL add_index_if_not_exists('currency_transactions', 'idx_transaction_type', '`transaction_type`', FALSE);
CALL add_index_if_not_exists('currency_transactions', 'idx_biz_type', '`biz_type`', FALSE);
CALL add_index_if_not_exists('currency_transactions', 'idx_created_at', '`created_at`', FALSE);
CALL add_foreign_key_if_not_exists('currency_transactions', 'fk_transaction_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- membership_funds 表索引
CALL add_index_if_not_exists('membership_funds', 'uk_fund_month', '`fund_month`', TRUE);
CALL add_index_if_not_exists('membership_funds', 'idx_status', '`status`', FALSE);

-- membership_fund_distributions 表索引
CALL add_index_if_not_exists('membership_fund_distributions', 'idx_fund_id', '`fund_id`', FALSE);
CALL add_index_if_not_exists('membership_fund_distributions', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('membership_fund_distributions', 'idx_distributed_at', '`distributed_at`', FALSE);
CALL add_index_if_not_exists('membership_fund_distributions', 'uk_fund_user', '`fund_id`, `user_id`', TRUE);
CALL add_foreign_key_if_not_exists('membership_fund_distributions', 'fk_distribution_fund', 'FOREIGN KEY (`fund_id`) REFERENCES `membership_funds` (`id`) ON DELETE CASCADE');
CALL add_foreign_key_if_not_exists('membership_fund_distributions', 'fk_distribution_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- currency_deduct_configs 表索引
CALL add_index_if_not_exists('currency_deduct_configs', 'uk_biz_type', '`biz_type`', TRUE);

-- currency_configs 表索引
CALL add_index_if_not_exists('currency_configs', 'uk_config_key', '`config_key`', TRUE);
CALL add_index_if_not_exists('currency_configs', 'idx_category', '`category`', FALSE);

-- usage_logs 表索引
CALL add_index_if_not_exists('usage_logs', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('usage_logs', 'idx_session_id', '`session_id`', FALSE);
CALL add_index_if_not_exists('usage_logs', 'idx_feature_code', '`feature_code`', FALSE);
CALL add_index_if_not_exists('usage_logs', 'idx_action', '`action`', FALSE);
CALL add_index_if_not_exists('usage_logs', 'idx_entry_point', '`entry_point`', FALSE);
CALL add_index_if_not_exists('usage_logs', 'idx_ip_address', '`ip_address`', FALSE);
CALL add_index_if_not_exists('usage_logs', 'idx_created_at', '`created_at`', FALSE);
CALL add_index_if_not_exists('usage_logs', 'idx_feature_created', '`feature_code`, `created_at`', FALSE);
CALL add_index_if_not_exists('usage_logs', 'idx_user_feature', '`user_id`, `feature_code`', FALSE);

-- feature_configs 表索引
CALL add_index_if_not_exists('feature_configs', 'uk_feature_code', '`feature_code`', TRUE);

-- message_templates 表索引
CALL add_index_if_not_exists('message_templates', 'uk_code', '`code`', TRUE);
CALL add_index_if_not_exists('message_templates', 'idx_category', '`category`', FALSE);
CALL add_index_if_not_exists('message_templates', 'idx_is_active', '`is_active`', FALSE);

-- messages 表索引
CALL add_index_if_not_exists('messages', 'idx_category', '`category`', FALSE);
CALL add_index_if_not_exists('messages', 'idx_send_type', '`send_type`', FALSE);
CALL add_index_if_not_exists('messages', 'idx_status', '`status`', FALSE);
CALL add_index_if_not_exists('messages', 'idx_send_at', '`send_at`', FALSE);
CALL add_index_if_not_exists('messages', 'idx_expire_at', '`expire_at`', FALSE);
CALL add_index_if_not_exists('messages', 'idx_sender_id', '`sender_id`', FALSE);

-- user_messages 表索引
CALL add_index_if_not_exists('user_messages', 'uk_user_message', '`user_id`, `message_id`', TRUE);
CALL add_index_if_not_exists('user_messages', 'idx_user_unread', '`user_id`, `is_read`, `is_deleted`', FALSE);
CALL add_index_if_not_exists('user_messages', 'idx_user_created', '`user_id`, `created_at` DESC', FALSE);
CALL add_index_if_not_exists('user_messages', 'idx_message_id', '`message_id`', FALSE);
CALL add_foreign_key_if_not_exists('user_messages', 'fk_user_messages_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');
CALL add_foreign_key_if_not_exists('user_messages', 'fk_user_messages_message', 'FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE');

-- code_snippets 表索引
CALL add_index_if_not_exists('code_snippets', 'uk_code_key', '`code_key`', TRUE);
CALL add_index_if_not_exists('code_snippets', 'idx_category', '`category`', FALSE);
CALL add_index_if_not_exists('code_snippets', 'idx_position', '`position`', FALSE);
CALL add_index_if_not_exists('code_snippets', 'idx_is_enabled', '`is_enabled`', FALSE);
CALL add_index_if_not_exists('code_snippets', 'idx_priority', '`priority`', FALSE);

-- currency_batches 表索引
CALL add_index_if_not_exists('currency_batches', 'uk_batch_no', '`batch_no`', TRUE);
CALL add_index_if_not_exists('currency_batches', 'idx_currency_type', '`currency_type`', FALSE);
CALL add_index_if_not_exists('currency_batches', 'idx_target_type', '`target_type`', FALSE);
CALL add_index_if_not_exists('currency_batches', 'idx_status', '`status`', FALSE);
CALL add_index_if_not_exists('currency_batches', 'idx_created_by', '`created_by`', FALSE);
CALL add_index_if_not_exists('currency_batches', 'idx_created_at', '`created_at`', FALSE);

-- currency_batch_distributions 表索引
CALL add_index_if_not_exists('currency_batch_distributions', 'idx_batch_id', '`batch_id`', FALSE);
CALL add_index_if_not_exists('currency_batch_distributions', 'idx_batch_no', '`batch_no`', FALSE);
CALL add_index_if_not_exists('currency_batch_distributions', 'idx_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('currency_batch_distributions', 'idx_status', '`status`', FALSE);
CALL add_foreign_key_if_not_exists('currency_batch_distributions', 'fk_cbd_batch', 'FOREIGN KEY (`batch_id`) REFERENCES `currency_batches` (`id`) ON DELETE CASCADE');
CALL add_foreign_key_if_not_exists('currency_batch_distributions', 'fk_cbd_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');

-- latex_agent_models 表索引
CALL add_index_if_not_exists('latex_agent_models', 'idx_latex_model_enabled', '`is_enabled`', FALSE);
CALL add_index_if_not_exists('latex_agent_models', 'idx_latex_model_sort', '`sort_order`', FALSE);

-- latex_conversations 表索引
CALL add_index_if_not_exists('latex_conversations', 'idx_latex_conv_user_id', '`user_id`', FALSE);
CALL add_index_if_not_exists('latex_conversations', 'idx_latex_conv_document_id', '`document_id`', FALSE);
CALL add_index_if_not_exists('latex_conversations', 'idx_latex_conv_user_document', '`user_id`, `document_id`', TRUE);
CALL add_foreign_key_if_not_exists('latex_conversations', 'fk_latex_conv_user', 'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE');
CALL add_foreign_key_if_not_exists('latex_conversations', 'fk_latex_conv_document', 'FOREIGN KEY (`document_id`) REFERENCES `latex_documents` (`id`) ON DELETE CASCADE');

-- latex_chat_messages 表索引
CALL add_index_if_not_exists('latex_chat_messages', 'idx_latex_msg_conversation_id', '`conversation_id`', FALSE);
CALL add_index_if_not_exists('latex_chat_messages', 'idx_latex_msg_role', '`role`', FALSE);
CALL add_index_if_not_exists('latex_chat_messages', 'idx_latex_msg_created_at', '`created_at`', FALSE);
CALL add_foreign_key_if_not_exists('latex_chat_messages', 'fk_latex_msg_conversation', 'FOREIGN KEY (`conversation_id`) REFERENCES `latex_conversations` (`id`) ON DELETE CASCADE');

-- agent_tool_permissions 表索引
CALL add_index_if_not_exists('agent_tool_permissions', 'uk_user_tool_scope', '`user_id`, `tool_name`, `scope`, `session_id`', TRUE);
CALL add_index_if_not_exists('agent_tool_permissions', 'idx_tool_permissions_user', '`user_id`', FALSE);
CALL add_index_if_not_exists('agent_tool_permissions', 'idx_tool_permissions_tool', '`tool_name`', FALSE);

-- conversation_summaries 表索引
CALL add_index_if_not_exists('conversation_summaries', 'idx_conv_summary_conversation', '`conversation_id`', FALSE);
CALL add_index_if_not_exists('conversation_summaries', 'idx_conv_summary_created', '`created_at`', FALSE);

-- hot_search_keywords 表索引
CALL add_index_if_not_exists('hot_search_keywords', 'uk_keyword_hash', '`keyword_hash`', TRUE);
CALL add_index_if_not_exists('hot_search_keywords', 'idx_search_count', '`search_count` DESC', FALSE);
CALL add_index_if_not_exists('hot_search_keywords', 'idx_last_searched', '`last_searched_at`', FALSE);
CALL add_index_if_not_exists('hot_search_keywords', 'idx_first_searched', '`first_searched_at`', FALSE);

-- hot_papers 表索引
CALL add_index_if_not_exists('hot_papers', 'uk_paper_id', '`paper_id`', TRUE);
CALL add_index_if_not_exists('hot_papers', 'idx_doi', '`doi`', FALSE);
CALL add_index_if_not_exists('hot_papers', 'idx_view_count', '`view_count` DESC', FALSE);
CALL add_index_if_not_exists('hot_papers', 'idx_last_viewed', '`last_viewed_at`', FALSE);
CALL add_index_if_not_exists('hot_papers', 'idx_first_viewed', '`first_viewed_at`', FALSE);

-- online_user_snapshots 索引迁移（删除旧普通索引，已有唯一索引）
CALL drop_index_if_exists('online_user_snapshots', 'idx_timestamp');

-- peer_review_tasks 主稿件文件外键
CALL add_foreign_key_if_not_exists('peer_review_tasks', 'fk_pr_task_manuscript', 'FOREIGN KEY (`manuscript_file_id`) REFERENCES `peer_review_files` (`id`) ON DELETE SET NULL');

-- ============================================================================
-- 增量索引变更
-- 后续新增索引请追加到此处
-- ============================================================================

-- 统一账号体系索引
CALL add_index_if_not_exists('users', 'idx_role', '`role`', FALSE);
CALL add_index_if_not_exists('users', 'uk_legacy_admin_id', '`legacy_admin_id`', TRUE);

SET foreign_key_checks = 1;