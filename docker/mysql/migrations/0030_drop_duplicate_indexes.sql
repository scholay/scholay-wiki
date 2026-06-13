-- ============================================================================
-- 0030: 删除从 GORM AutoMigrate dump 带进 baseline 的重复索引
-- ----------------------------------------------------------------------------
-- baseline(0001)是把 GORM AutoMigrate 生成的 schema 直接 dump 进来的, GORM 对每个
-- 带 index tag 的列既建了显式命名索引(uk_*/idx_*), 又建了一个以列名裸命名的默认索引,
-- 于是同一列集上存在两份完全相同的 B-tree。共 95 个冗余索引对象 / 29 张表。
--
-- 危害(性能审计 be-db, medium): 每次 INSERT/UPDATE/DELETE 都要多维护一份相同 B-tree
-- (写放大 + 多占 binlog/redo), 且冗余索引白白占用 buffer-pool 与磁盘、压低缓存命中率,
-- 读侧零收益(优化器只会用其中一个)。热点例子: 每次登录 UPDATE users.last_login_at 要维护
-- 两份相同 last_login_at 索引; 每条站内信广播 fan-out 行要维护两份相同 (user_id,message_id)
-- UNIQUE + 两份相同 (user_id,is_read,is_deleted) 索引。
--
-- 安全性: 每个被删的索引都与一个**保留索引覆盖完全相同的列集**, 因此:
--   1. 外键约束仍有覆盖索引 → DROP 不会触发 errno 1553;
--   2. UNIQUE 约束由保留的 uk_* UNIQUE 索引继续保证(只删裸命名的那一份);
--   3. drop_index_if_exists 幂等(索引不存在即跳过)→ 可安全重放。
-- ============================================================================


-- alipay_configs
CALL drop_index_if_exists('alipay_configs', 'is_active');  -- dup of `idx_is_active` (is_active)

-- analysis_dimensions
CALL drop_index_if_exists('analysis_dimensions', 'dimension_key');  -- dup of `uk_user_dimension` (user_id,dimension_key)
CALL drop_index_if_exists('analysis_dimensions', 'sort_order');  -- dup of `idx_sort_order` (sort_order)
CALL drop_index_if_exists('analysis_dimensions', 'user_id');  -- dup of `idx_user_id` (user_id)

-- code_snippets
CALL drop_index_if_exists('code_snippets', 'category');  -- dup of `idx_category` (category)
CALL drop_index_if_exists('code_snippets', 'code_key');  -- dup of `uk_code_key` (code_key)
CALL drop_index_if_exists('code_snippets', 'is_enabled');  -- dup of `idx_is_enabled` (is_enabled)
CALL drop_index_if_exists('code_snippets', 'position');  -- dup of `idx_position` (position)
CALL drop_index_if_exists('code_snippets', 'priority');  -- dup of `idx_priority` (priority)

-- coupon_batches
CALL drop_index_if_exists('coupon_batches', 'batch_code');  -- dup of `uk_batch_code` (batch_code)
CALL drop_index_if_exists('coupon_batches', 'status');  -- dup of `idx_status` (status)
CALL drop_index_if_exists('coupon_batches', 'template_id');  -- dup of `idx_template` (template_id)

-- coupon_templates
CALL drop_index_if_exists('coupon_templates', 'code');  -- dup of `uk_code` (code)
CALL drop_index_if_exists('coupon_templates', 'distribution_type');  -- dup of `idx_status_type` (status,distribution_type)
CALL drop_index_if_exists('coupon_templates', 'fixed_valid_end');  -- dup of `idx_valid_time` (fixed_valid_start,fixed_valid_end)

-- coupon_usage_logs
CALL drop_index_if_exists('coupon_usage_logs', 'order_id');  -- dup of `idx_order` (order_id)
CALL drop_index_if_exists('coupon_usage_logs', 'user_coupon_id');  -- dup of `idx_user_coupon` (user_coupon_id)
CALL drop_index_if_exists('coupon_usage_logs', 'user_id');  -- dup of `idx_user` (user_id)

-- email_configs
CALL drop_index_if_exists('email_configs', 'created_at');  -- dup of `idx_created_at` (created_at)
CALL drop_index_if_exists('email_configs', 'is_active');  -- dup of `idx_is_active` (is_active)

-- feature_configs
CALL drop_index_if_exists('feature_configs', 'feature_code');  -- dup of `uk_feature_code` (feature_code)

-- feedback_attachments
CALL drop_index_if_exists('feedback_attachments', 'created_at');  -- dup of `idx_created_at` (created_at)
CALL drop_index_if_exists('feedback_attachments', 'feedback_id');  -- dup of `idx_feedback_id` (feedback_id)
CALL drop_index_if_exists('feedback_attachments', 'is_used');  -- dup of `idx_is_used` (is_used)
CALL drop_index_if_exists('feedback_attachments', 'upload_key');  -- dup of `idx_upload_key` (upload_key)

-- feedbacks
CALL drop_index_if_exists('feedbacks', 'created_at');  -- dup of `idx_created_at` (created_at)
CALL drop_index_if_exists('feedbacks', 'email');  -- dup of `idx_email` (email)
CALL drop_index_if_exists('feedbacks', 'status');  -- dup of `idx_status` (status)
CALL drop_index_if_exists('feedbacks', 'user_id');  -- dup of `idx_user_id` (user_id)

-- invitation_relationships
CALL drop_index_if_exists('invitation_relationships', 'invitation_code');  -- dup of `idx_invitation_code` (invitation_code)
CALL drop_index_if_exists('invitation_relationships', 'invitee_id');  -- dup of `uk_invitee` (invitee_id)
CALL drop_index_if_exists('invitation_relationships', 'inviter_id');  -- dup of `idx_inviter` (inviter_id)
CALL drop_index_if_exists('invitation_relationships', 'status');  -- dup of `idx_status` (status)

-- message_templates
CALL drop_index_if_exists('message_templates', 'category');  -- dup of `idx_category` (category)
CALL drop_index_if_exists('message_templates', 'code');  -- dup of `uk_code` (code)
CALL drop_index_if_exists('message_templates', 'is_active');  -- dup of `idx_is_active` (is_active)

-- messages
CALL drop_index_if_exists('messages', 'category');  -- dup of `idx_category` (category)
CALL drop_index_if_exists('messages', 'expire_at');  -- dup of `idx_expire_at` (expire_at)
CALL drop_index_if_exists('messages', 'send_at');  -- dup of `idx_send_at` (send_at)
CALL drop_index_if_exists('messages', 'send_type');  -- dup of `idx_send_type` (send_type)
CALL drop_index_if_exists('messages', 'sender_id');  -- dup of `idx_sender_id` (sender_id)
CALL drop_index_if_exists('messages', 'status');  -- dup of `idx_status` (status)

-- orders
CALL drop_index_if_exists('orders', 'coupon_id');  -- dup of `idx_coupon_id` (coupon_id)
CALL drop_index_if_exists('orders', 'created_at');  -- dup of `idx_created_at` (created_at)
CALL drop_index_if_exists('orders', 'order_no');  -- dup of `uk_order_no` (order_no)
CALL drop_index_if_exists('orders', 'order_type');  -- dup of `idx_order_type` (order_type)
CALL drop_index_if_exists('orders', 'status');  -- dup of `idx_status` (status)
CALL drop_index_if_exists('orders', 'user_id');  -- dup of `idx_user_id` (user_id)

-- paper_analysis
CALL drop_index_if_exists('paper_analysis', 'created_at');  -- dup of `idx_created_at` (created_at)
CALL drop_index_if_exists('paper_analysis', 'dimension_hash');  -- dup of `uk_paper_dimension` (paper_id,dimension_hash)

-- payment_transactions
CALL drop_index_if_exists('payment_transactions', 'order_id');  -- dup of `idx_order_id` (order_id)
CALL drop_index_if_exists('payment_transactions', 'transaction_no');  -- dup of `idx_transaction_no` (transaction_no)

-- sms_configs
CALL drop_index_if_exists('sms_configs', 'created_at');  -- dup of `idx_created_at` (created_at)
CALL drop_index_if_exists('sms_configs', 'is_active');  -- dup of `idx_is_active` (is_active)

-- subscription_plans
CALL drop_index_if_exists('subscription_plans', 'is_active');  -- dup of `idx_is_active` (is_active)
CALL drop_index_if_exists('subscription_plans', 'plan_code');  -- dup of `uk_plan_code` (plan_code)
CALL drop_index_if_exists('subscription_plans', 'sort_order');  -- dup of `idx_sort_order` (sort_order)

-- third_party_accounts
CALL drop_index_if_exists('third_party_accounts', 'last_used_at');  -- dup of `idx_last_used` (last_used_at)
CALL drop_index_if_exists('third_party_accounts', 'priority');  -- dup of `idx_type_priority` (type,status,priority)
CALL drop_index_if_exists('third_party_accounts', 'status');  -- dup of `idx_type_status` (type,status)

-- usage_logs
CALL drop_index_if_exists('usage_logs', 'action');  -- dup of `idx_action` (action)
CALL drop_index_if_exists('usage_logs', 'created_at');  -- dup of `idx_created_at` (created_at)
CALL drop_index_if_exists('usage_logs', 'entry_point');  -- dup of `idx_entry_point` (entry_point)
CALL drop_index_if_exists('usage_logs', 'feature_code');  -- dup of `idx_feature_code` (feature_code)
CALL drop_index_if_exists('usage_logs', 'ip_address');  -- dup of `idx_ip_address` (ip_address)
CALL drop_index_if_exists('usage_logs', 'session_id');  -- dup of `idx_session_id` (session_id)
CALL drop_index_if_exists('usage_logs', 'user_id');  -- dup of `idx_user_id` (user_id)

-- usage_quotas
CALL drop_index_if_exists('usage_quotas', 'quota_date');  -- dup of `uk_user_date` (user_id,quota_date)
CALL drop_index_if_exists('usage_quotas', 'user_id');  -- dup of `idx_user_id` (user_id)

-- user_auth_providers
CALL drop_index_if_exists('user_auth_providers', 'provider_union_id');  -- dup of `uk_provider_union` (provider,provider_union_id)
CALL drop_index_if_exists('user_auth_providers', 'provider_user_id');  -- dup of `uk_provider_user` (provider,provider_user_id)
CALL drop_index_if_exists('user_auth_providers', 'uq_provider_provider_user_id');  -- dup of `uk_provider_user` (provider,provider_user_id)
CALL drop_index_if_exists('user_auth_providers', 'user_id');  -- dup of `idx_user_id` (user_id)

-- user_coupons
CALL drop_index_if_exists('user_coupons', 'coupon_code');  -- dup of `uk_coupon_code` (coupon_code)
CALL drop_index_if_exists('user_coupons', 'source_id');  -- dup of `idx_source` (source_type,source_id)
CALL drop_index_if_exists('user_coupons', 'status');  -- dup of `idx_user_status` (user_id,status)
CALL drop_index_if_exists('user_coupons', 'template_id');  -- dup of `idx_template` (template_id)
CALL drop_index_if_exists('user_coupons', 'valid_until');  -- dup of `idx_valid_time` (valid_from,valid_until)

-- user_invitations
CALL drop_index_if_exists('user_invitations', 'invitation_code');  -- dup of `uk_invitation_code` (invitation_code)
CALL drop_index_if_exists('user_invitations', 'is_active');  -- dup of `idx_is_active` (is_active)
CALL drop_index_if_exists('user_invitations', 'user_id');  -- dup of `uk_user_id` (user_id)

-- user_messages
CALL drop_index_if_exists('user_messages', 'is_deleted');  -- dup of `idx_user_unread` (user_id,is_read,is_deleted)
CALL drop_index_if_exists('user_messages', 'message_id');  -- dup of `uk_user_message` (user_id,message_id)

-- user_subscriptions
CALL drop_index_if_exists('user_subscriptions', 'end_date');  -- dup of `idx_end_date` (end_date)
CALL drop_index_if_exists('user_subscriptions', 'status');  -- dup of `idx_status` (status)
CALL drop_index_if_exists('user_subscriptions', 'user_id');  -- dup of `idx_user_id` (user_id)

-- users
CALL drop_index_if_exists('users', 'email');  -- dup of `uk_email` (email)
CALL drop_index_if_exists('users', 'last_login_at');  -- dup of `idx_last_login_at` (last_login_at)
CALL drop_index_if_exists('users', 'location');  -- dup of `idx_location` (location)
CALL drop_index_if_exists('users', 'phone');  -- dup of `uk_phone` (phone)
CALL drop_index_if_exists('users', 'status');  -- dup of `idx_status` (status)
CALL drop_index_if_exists('users', 'subscription_plan');  -- dup of `idx_subscription_plan` (subscription_plan)
CALL drop_index_if_exists('users', 'username');  -- dup of `uk_username` (username)

-- wechat_configs
CALL drop_index_if_exists('wechat_configs', 'is_active');  -- dup of `idx_is_active` (is_active)

-- wechat_pay_configs
CALL drop_index_if_exists('wechat_pay_configs', 'is_active');  -- dup of `idx_is_active` (is_active)
