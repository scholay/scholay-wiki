# ── TABLES (base) ──
TABLE _schema_migration_marks
TABLE admin_audit_logs
TABLE agent_config
TABLE agent_sessions
TABLE alipay_configs
TABLE analysis_dimensions
TABLE announcements
TABLE apple_oauth_config
TABLE code_snippets
TABLE coupon_batches
TABLE coupon_templates
TABLE coupon_usage_logs
TABLE discourse_sso_config
TABLE email_configs
TABLE feature_configs
TABLE feature_prompt_history
TABLE feature_prompts
TABLE feedback_attachments
TABLE feedbacks
TABLE github_oauth_config
TABLE google_oauth_config
TABLE hot_content_config
TABLE hot_papers
TABLE hot_search_keywords
TABLE invitation_relationships
TABLE message_templates
TABLE messages
TABLE microsoft_oauth_config
TABLE orcid_oauth_config
TABLE orders
TABLE paper_analysis
TABLE payment_transactions
TABLE peer_review_assets
TABLE peer_review_reports
TABLE peer_review_skills
TABLE peer_review_step_cache
TABLE peer_review_submissions
TABLE seo_authors
TABLE seo_journals
TABLE seo_papers
TABLE sms_configs
TABLE subscription_plans
TABLE system_configs
TABLE third_party_accounts
TABLE usage_log_config
TABLE usage_logs
TABLE usage_quotas
TABLE user_auth_providers
TABLE user_coupons
TABLE user_invitations
TABLE user_library_folders
TABLE user_library_papers
TABLE user_messages
TABLE user_staging_area_papers
TABLE user_staging_areas
TABLE user_subscriptions
TABLE users
TABLE wechat_configs
TABLE wechat_official_config
TABLE wechat_pay_configs
# ── COLUMNS (table.col type null extra) ──
COL _schema_migration_marks.applied_at | timestamp | null=NO | DEFAULT_GENERATED
COL _schema_migration_marks.mark | varchar(64) | null=NO
COL admin_audit_logs.action | varchar(50) | null=NO
COL admin_audit_logs.admin_role | varchar(20) | null=NO
COL admin_audit_logs.admin_user_id | bigint unsigned | null=NO
COL admin_audit_logs.admin_username | varchar(100) | null=NO
COL admin_audit_logs.created_at | datetime | null=NO | DEFAULT_GENERATED
COL admin_audit_logs.details | json | null=YES
COL admin_audit_logs.id | bigint unsigned | null=NO | auto_increment
COL admin_audit_logs.ip | varchar(45) | null=YES
COL admin_audit_logs.resource_id | varchar(100) | null=YES
COL admin_audit_logs.resource_type | varchar(50) | null=NO
COL admin_audit_logs.user_agent | varchar(500) | null=YES
COL agent_config.api_key | varchar(500) | null=NO
COL agent_config.base_url | varchar(500) | null=NO
COL agent_config.created_at | datetime | null=NO | DEFAULT_GENERATED
COL agent_config.enabled | tinyint(1) | null=NO
COL agent_config.haiku_model | varchar(200) | null=NO
COL agent_config.id | bigint unsigned | null=NO | auto_increment
COL agent_config.last_pushed_at | datetime | null=YES
COL agent_config.main_model | varchar(200) | null=NO
COL agent_config.opus_model | varchar(200) | null=NO
COL agent_config.push_error | varchar(1024) | null=NO
COL agent_config.push_status | varchar(16) | null=NO
COL agent_config.sonnet_model | varchar(200) | null=NO
COL agent_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL agent_sessions.agent_session_id | varchar(64) | null=NO
COL agent_sessions.created_at | datetime | null=NO | DEFAULT_GENERATED
COL agent_sessions.feature_key | varchar(64) | null=NO
COL agent_sessions.id | bigint unsigned | null=NO | auto_increment
COL agent_sessions.last_accessed_at | datetime | null=NO | DEFAULT_GENERATED
COL agent_sessions.reset_count | int unsigned | null=NO
COL agent_sessions.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL agent_sessions.user_id | bigint unsigned | null=NO
COL alipay_configs.alipay_public_key | text | null=NO
COL alipay_configs.app_id | varchar(32) | null=NO
COL alipay_configs.created_at | datetime | null=NO | DEFAULT_GENERATED
COL alipay_configs.gateway_url | varchar(255) | null=NO
COL alipay_configs.id | bigint unsigned | null=NO | auto_increment
COL alipay_configs.is_active | tinyint(1) | null=NO
COL alipay_configs.is_sandbox | tinyint(1) | null=NO
COL alipay_configs.notify_url | varchar(255) | null=NO
COL alipay_configs.private_key | text | null=NO
COL alipay_configs.return_url | varchar(255) | null=YES
COL alipay_configs.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL analysis_dimensions.created_at | datetime | null=NO | DEFAULT_GENERATED
COL analysis_dimensions.description | text | null=NO
COL analysis_dimensions.dimension_key | varchar(50) | null=NO
COL analysis_dimensions.id | bigint unsigned | null=NO | auto_increment
COL analysis_dimensions.is_active | tinyint(1) | null=NO
COL analysis_dimensions.is_hidden | tinyint(1) | null=NO
COL analysis_dimensions.name | varchar(100) | null=NO
COL analysis_dimensions.sort_order | int | null=NO
COL analysis_dimensions.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL analysis_dimensions.user_id | bigint | null=NO
COL announcements.content | text | null=NO
COL announcements.created_at | datetime | null=NO | DEFAULT_GENERATED
COL announcements.created_by | bigint unsigned | null=YES
COL announcements.dismissable | tinyint | null=NO
COL announcements.ends_at | datetime | null=YES
COL announcements.id | bigint unsigned | null=NO | auto_increment
COL announcements.is_active | tinyint | null=NO
COL announcements.link_text | varchar(50) | null=YES
COL announcements.link_url | varchar(500) | null=YES
COL announcements.priority | int | null=NO
COL announcements.severity | varchar(20) | null=NO
COL announcements.starts_at | datetime | null=YES
COL announcements.target_audience | varchar(20) | null=NO
COL announcements.title | varchar(200) | null=NO
COL announcements.type | varchar(20) | null=NO
COL announcements.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL apple_oauth_config.created_at | datetime | null=NO | DEFAULT_GENERATED
COL apple_oauth_config.enabled | tinyint(1) | null=NO
COL apple_oauth_config.id | bigint unsigned | null=NO | auto_increment
COL apple_oauth_config.key_id | varchar(20) | null=NO
COL apple_oauth_config.private_key | text | null=NO
COL apple_oauth_config.redirect_uri | varchar(255) | null=NO
COL apple_oauth_config.service_id | varchar(100) | null=NO
COL apple_oauth_config.team_id | varchar(20) | null=NO
COL apple_oauth_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL code_snippets.category | varchar(30) | null=NO
COL code_snippets.code_content | text | null=NO
COL code_snippets.code_key | varchar(50) | null=NO
COL code_snippets.created_at | datetime | null=NO | DEFAULT_GENERATED
COL code_snippets.description | varchar(500) | null=YES
COL code_snippets.id | bigint unsigned | null=NO | auto_increment
COL code_snippets.is_enabled | tinyint(1) | null=NO
COL code_snippets.name | varchar(100) | null=NO
COL code_snippets.pages | json | null=YES
COL code_snippets.position | varchar(20) | null=NO
COL code_snippets.priority | int | null=NO
COL code_snippets.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL coupon_batches.batch_code | varchar(50) | null=NO
COL coupon_batches.completed_at | datetime | null=YES
COL coupon_batches.created_at | datetime | null=NO | DEFAULT_GENERATED
COL coupon_batches.created_by | bigint unsigned | null=YES
COL coupon_batches.description | text | null=YES
COL coupon_batches.distributed_quantity | int | null=YES
COL coupon_batches.id | bigint unsigned | null=NO | auto_increment
COL coupon_batches.name | varchar(100) | null=NO
COL coupon_batches.scheduled_at | datetime | null=YES
COL coupon_batches.started_at | datetime | null=YES
COL coupon_batches.status | enum('draft','processing','completed','cancelled') | null=YES
COL coupon_batches.target_conditions | json | null=YES
COL coupon_batches.target_type | enum('all','new_users','paid_users','specific_users','user_group') | null=NO
COL coupon_batches.target_users | json | null=YES
COL coupon_batches.template_id | bigint unsigned | null=NO
COL coupon_batches.total_quantity | int | null=NO
COL coupon_batches.used_quantity | int | null=YES
COL coupon_templates.applicable_plans | json | null=YES
COL coupon_templates.applicable_products | json | null=YES
COL coupon_templates.code | varchar(50) | null=NO
COL coupon_templates.created_at | datetime | null=NO | DEFAULT_GENERATED
COL coupon_templates.created_by | bigint unsigned | null=YES
COL coupon_templates.description | text | null=YES
COL coupon_templates.discount_value | decimal(10,2) | null=NO
COL coupon_templates.distribution_type | enum('manual','auto_invite','auto_register','batch','targeted') | null=NO
COL coupon_templates.first_purchase_only | tinyint(1) | null=YES
COL coupon_templates.fixed_valid_end | datetime | null=YES
COL coupon_templates.fixed_valid_start | datetime | null=YES
COL coupon_templates.id | bigint unsigned | null=NO | auto_increment
COL coupon_templates.inviter_benefit | json | null=YES
COL coupon_templates.is_invite_coupon | tinyint(1) | null=YES
COL coupon_templates.max_usage_per_user | int | null=YES
COL coupon_templates.max_usage_total | int | null=YES
COL coupon_templates.min_purchase_amount | decimal(10,2) | null=YES
COL coupon_templates.name | varchar(100) | null=NO
COL coupon_templates.new_user_only | tinyint(1) | null=YES
COL coupon_templates.priority | int | null=YES
COL coupon_templates.status | enum('draft','active','paused','expired') | null=YES
COL coupon_templates.type | enum('percentage','fixed','price_off') | null=NO
COL coupon_templates.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL coupon_templates.valid_days | int | null=YES
COL coupon_usage_logs.applied_at | datetime | null=YES | DEFAULT_GENERATED
COL coupon_usage_logs.confirmed_at | datetime | null=YES
COL coupon_usage_logs.discount_amount | decimal(10,2) | null=NO
COL coupon_usage_logs.final_amount | decimal(10,2) | null=NO
COL coupon_usage_logs.id | bigint unsigned | null=NO | auto_increment
COL coupon_usage_logs.metadata | json | null=YES
COL coupon_usage_logs.order_id | bigint unsigned | null=NO
COL coupon_usage_logs.original_amount | decimal(10,2) | null=NO
COL coupon_usage_logs.refunded_at | datetime | null=YES
COL coupon_usage_logs.status | enum('applied','confirmed','refunded') | null=YES
COL coupon_usage_logs.user_coupon_id | bigint unsigned | null=NO
COL coupon_usage_logs.user_id | bigint unsigned | null=NO
COL discourse_sso_config.created_at | datetime | null=NO | DEFAULT_GENERATED
COL discourse_sso_config.enabled | tinyint(1) | null=NO
COL discourse_sso_config.id | bigint unsigned | null=NO | auto_increment
COL discourse_sso_config.redirect_uri | varchar(255) | null=NO
COL discourse_sso_config.site_url | varchar(255) | null=NO
COL discourse_sso_config.sso_secret | varchar(255) | null=NO
COL discourse_sso_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL email_configs.created_at | datetime | null=NO | DEFAULT_GENERATED
COL email_configs.from_email | varchar(255) | null=NO
COL email_configs.from_name | varchar(255) | null=NO
COL email_configs.id | bigint unsigned | null=NO | auto_increment
COL email_configs.is_active | tinyint(1) | null=NO
COL email_configs.smtp_host | varchar(255) | null=NO
COL email_configs.smtp_password | varchar(255) | null=NO
COL email_configs.smtp_port | int | null=NO
COL email_configs.smtp_user | varchar(255) | null=NO
COL email_configs.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL feature_configs.created_at | datetime | null=NO | DEFAULT_GENERATED
COL feature_configs.description | varchar(255) | null=YES
COL feature_configs.enabled | tinyint(1) | null=NO
COL feature_configs.feature_code | varchar(50) | null=NO
COL feature_configs.feature_group | varchar(50) | null=YES
COL feature_configs.feature_name | varchar(100) | null=NO
COL feature_configs.id | bigint unsigned | null=NO | auto_increment
COL feature_configs.sort_order | int | null=NO
COL feature_configs.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL feature_prompt_history.applicable_subjects | json | null=YES
COL feature_prompt_history.change_note | varchar(500) | null=YES
COL feature_prompt_history.changed_by_user_id | bigint unsigned | null=YES
COL feature_prompt_history.created_at | datetime | null=NO | DEFAULT_GENERATED
COL feature_prompt_history.enabled | tinyint(1) | null=NO
COL feature_prompt_history.id | bigint unsigned | null=NO | auto_increment
COL feature_prompt_history.name | varchar(120) | null=NO
COL feature_prompt_history.prompt_id | bigint unsigned | null=NO
COL feature_prompt_history.system_prompt | mediumtext | null=NO
COL feature_prompt_history.version | int | null=NO
COL feature_prompt_history.weight | decimal(4,2) | null=NO
COL feature_prompts.applicable_subjects | json | null=YES
COL feature_prompts.created_at | datetime | null=NO | DEFAULT_GENERATED
COL feature_prompts.description | varchar(500) | null=YES
COL feature_prompts.enabled | tinyint(1) | null=NO
COL feature_prompts.feature_key | varchar(64) | null=NO
COL feature_prompts.id | bigint unsigned | null=NO | auto_increment
COL feature_prompts.name | varchar(120) | null=NO
COL feature_prompts.persona | varchar(32) | null=NO
COL feature_prompts.slug | varchar(128) | null=NO
COL feature_prompts.source | enum('seed','admin') | null=NO
COL feature_prompts.system_prompt | mediumtext | null=NO
COL feature_prompts.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL feature_prompts.updated_by_user_id | bigint unsigned | null=YES
COL feature_prompts.version | int | null=NO
COL feature_prompts.weight | decimal(4,2) | null=NO
COL feedback_attachments.created_at | datetime | null=NO | DEFAULT_GENERATED
COL feedback_attachments.feedback_id | bigint unsigned | null=YES
COL feedback_attachments.file_size | bigint unsigned | null=NO
COL feedback_attachments.file_type | varchar(20) | null=NO
COL feedback_attachments.id | bigint unsigned | null=NO | auto_increment
COL feedback_attachments.is_used | tinyint(1) | null=NO
COL feedback_attachments.mime_type | varchar(100) | null=NO
COL feedback_attachments.object_key | varchar(512) | null=NO
COL feedback_attachments.original_name | varchar(255) | null=NO
COL feedback_attachments.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL feedback_attachments.upload_key | varchar(36) | null=NO
COL feedbacks.assigned_to | bigint unsigned | null=YES
COL feedbacks.attachments | text | null=YES
COL feedbacks.category | varchar(32) | null=NO
COL feedbacks.content | text | null=NO
COL feedbacks.created_at | datetime | null=NO | DEFAULT_GENERATED
COL feedbacks.deleted_at | datetime | null=YES
COL feedbacks.email | varchar(255) | null=NO
COL feedbacks.first_response_at | datetime | null=YES
COL feedbacks.id | bigint unsigned | null=NO | auto_increment
COL feedbacks.internal_notes | text | null=YES
COL feedbacks.ip | varchar(45) | null=YES
COL feedbacks.ip_location | varchar(255) | null=YES
COL feedbacks.replied_at | datetime | null=YES
COL feedbacks.replied_by | varchar(100) | null=YES
COL feedbacks.reply_content | text | null=YES
COL feedbacks.status | varchar(20) | null=NO
COL feedbacks.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL feedbacks.user_id | bigint unsigned | null=YES
COL feedbacks.username | varchar(100) | null=YES
COL github_oauth_config.client_id | varchar(100) | null=NO
COL github_oauth_config.client_secret | varchar(255) | null=NO
COL github_oauth_config.created_at | datetime | null=NO | DEFAULT_GENERATED
COL github_oauth_config.enabled | tinyint(1) | null=NO
COL github_oauth_config.id | bigint unsigned | null=NO | auto_increment
COL github_oauth_config.redirect_uri | varchar(255) | null=NO
COL github_oauth_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL google_oauth_config.client_id | varchar(200) | null=NO
COL google_oauth_config.client_secret | varchar(255) | null=NO
COL google_oauth_config.created_at | datetime | null=NO | DEFAULT_GENERATED
COL google_oauth_config.enabled | tinyint(1) | null=NO
COL google_oauth_config.id | bigint unsigned | null=NO | auto_increment
COL google_oauth_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL hot_content_config.id | tinyint unsigned | null=NO
COL hot_content_config.max_records | int unsigned | null=NO
COL hot_content_config.retention_days | int unsigned | null=NO
COL hot_content_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL hot_papers.abstract | text | null=YES
COL hot_papers.authors | text | null=YES
COL hot_papers.click_count | bigint unsigned | null=NO
COL hot_papers.doi | varchar(255) | null=YES
COL hot_papers.first_viewed_at | datetime | null=NO | DEFAULT_GENERATED
COL hot_papers.id | bigint unsigned | null=NO | auto_increment
COL hot_papers.impression_count | bigint unsigned | null=NO
COL hot_papers.last_viewed_at | datetime | null=NO | DEFAULT_GENERATED
COL hot_papers.paper_id | varchar(64) | null=NO
COL hot_papers.seo_view_count | bigint unsigned | null=NO
COL hot_papers.title | text | null=YES
COL hot_papers.venue | varchar(500) | null=YES
COL hot_papers.view_count | int unsigned | null=NO
COL hot_papers.year | int | null=YES
COL hot_search_keywords.first_searched_at | datetime | null=NO | DEFAULT_GENERATED
COL hot_search_keywords.id | bigint unsigned | null=NO | auto_increment
COL hot_search_keywords.keyword | varchar(500) | null=NO
COL hot_search_keywords.keyword_hash | char(32) | null=NO
COL hot_search_keywords.last_searched_at | datetime | null=NO | DEFAULT_GENERATED
COL hot_search_keywords.search_count | int unsigned | null=NO
COL hot_search_keywords.search_type | varchar(16) | null=NO
COL invitation_relationships.activated_at | datetime | null=YES
COL invitation_relationships.created_at | datetime | null=NO | DEFAULT_GENERATED
COL invitation_relationships.id | bigint unsigned | null=NO | auto_increment
COL invitation_relationships.invitation_code | varchar(50) | null=YES
COL invitation_relationships.invitee_coupon_id | bigint unsigned | null=YES
COL invitation_relationships.invitee_id | bigint unsigned | null=NO
COL invitation_relationships.inviter_id | bigint unsigned | null=NO
COL invitation_relationships.inviter_reward_id | bigint unsigned | null=YES
COL invitation_relationships.registered_at | datetime | null=YES
COL invitation_relationships.status | enum('pending','registered','activated','rewarded') | null=YES
COL message_templates.category | varchar(50) | null=NO
COL message_templates.code | varchar(50) | null=NO
COL message_templates.content | text | null=NO
COL message_templates.created_at | datetime | null=NO | DEFAULT_GENERATED
COL message_templates.id | bigint unsigned | null=NO | auto_increment
COL message_templates.is_active | tinyint(1) | null=NO
COL message_templates.name | varchar(100) | null=NO
COL message_templates.title | varchar(200) | null=NO
COL message_templates.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL message_templates.variables | json | null=YES
COL messages.category | varchar(50) | null=NO
COL messages.content | text | null=NO
COL messages.created_at | datetime | null=NO | DEFAULT_GENERATED
COL messages.expire_at | datetime | null=YES
COL messages.id | bigint unsigned | null=NO | auto_increment
COL messages.link_text | varchar(100) | null=YES
COL messages.link_url | varchar(500) | null=YES
COL messages.read_count | int | null=NO
COL messages.recipient_count | int | null=NO
COL messages.send_at | datetime | null=YES
COL messages.send_type | varchar(20) | null=NO
COL messages.sender_id | bigint unsigned | null=YES
COL messages.sender_name | varchar(100) | null=YES
COL messages.status | varchar(20) | null=NO
COL messages.target_plans | json | null=YES
COL messages.target_user_ids | json | null=YES
COL messages.title | varchar(200) | null=NO
COL messages.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL microsoft_oauth_config.client_id | varchar(100) | null=NO
COL microsoft_oauth_config.client_secret | varchar(255) | null=NO
COL microsoft_oauth_config.created_at | datetime | null=NO | DEFAULT_GENERATED
COL microsoft_oauth_config.enabled | tinyint(1) | null=NO
COL microsoft_oauth_config.id | bigint unsigned | null=NO | auto_increment
COL microsoft_oauth_config.redirect_uri | varchar(255) | null=NO
COL microsoft_oauth_config.tenant | varchar(100) | null=NO
COL microsoft_oauth_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL orcid_oauth_config.client_id | varchar(100) | null=NO
COL orcid_oauth_config.client_secret | varchar(255) | null=NO
COL orcid_oauth_config.created_at | datetime | null=NO | DEFAULT_GENERATED
COL orcid_oauth_config.enabled | tinyint(1) | null=NO
COL orcid_oauth_config.id | bigint unsigned | null=NO | auto_increment
COL orcid_oauth_config.redirect_uri | varchar(255) | null=NO
COL orcid_oauth_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL orcid_oauth_config.use_sandbox | tinyint(1) | null=NO
COL orders.amount | decimal(10,2) | null=NO
COL orders.billing_cycle | varchar(20) | null=NO
COL orders.bonus_amount | bigint | null=NO
COL orders.coupon_id | bigint unsigned | null=YES
COL orders.created_at | datetime | null=NO | DEFAULT_GENERATED
COL orders.diamond_amount | bigint | null=NO
COL orders.discount_amount | decimal(10,2) | null=NO
COL orders.final_amount | decimal(10,2) | null=NO
COL orders.id | bigint unsigned | null=NO | auto_increment
COL orders.order_no | varchar(64) | null=NO
COL orders.order_type | varchar(20) | null=NO
COL orders.payment_method | varchar(50) | null=YES
COL orders.payment_time | datetime | null=YES
COL orders.plan_code | varchar(20) | null=NO
COL orders.plan_name | varchar(50) | null=NO
COL orders.status | varchar(20) | null=NO
COL orders.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL orders.user_id | bigint unsigned | null=NO
COL paper_analysis.analysis_data | text | null=YES
COL paper_analysis.created_at | datetime | null=NO | DEFAULT_GENERATED
COL paper_analysis.dimension_hash | varchar(32) | null=NO
COL paper_analysis.id | bigint unsigned | null=NO | auto_increment
COL paper_analysis.paper_id | varchar(100) | null=NO
COL paper_analysis.paper_title | varchar(500) | null=YES
COL paper_analysis.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL payment_transactions.amount | decimal(10,2) | null=NO
COL payment_transactions.created_at | datetime | null=NO | DEFAULT_GENERATED
COL payment_transactions.id | bigint unsigned | null=NO | auto_increment
COL payment_transactions.order_id | bigint unsigned | null=NO
COL payment_transactions.payment_data | json | null=YES
COL payment_transactions.payment_method | varchar(50) | null=NO
COL payment_transactions.status | varchar(20) | null=NO
COL payment_transactions.transaction_no | varchar(100) | null=YES
COL payment_transactions.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL peer_review_assets.category | varchar(32) | null=YES
COL peer_review_assets.created_at | datetime | null=NO | DEFAULT_GENERATED
COL peer_review_assets.filename | varchar(255) | null=NO
COL peer_review_assets.id | bigint unsigned | null=NO | auto_increment
COL peer_review_assets.mime | varchar(100) | null=NO
COL peer_review_assets.object_key | varchar(512) | null=NO
COL peer_review_assets.role | varchar(16) | null=NO
COL peer_review_assets.sha256 | char(64) | null=YES
COL peer_review_assets.size | bigint unsigned | null=NO
COL peer_review_assets.submission_id | bigint unsigned | null=NO
COL peer_review_assets.text_chars | int unsigned | null=YES
COL peer_review_assets.text_excerpt | mediumtext | null=YES
COL peer_review_reports.agent_duration_sec | int unsigned | null=YES
COL peer_review_reports.agent_tokens_in | int unsigned | null=YES
COL peer_review_reports.agent_tokens_out | int unsigned | null=YES
COL peer_review_reports.content_md | mediumtext | null=NO
COL peer_review_reports.created_at | datetime | null=NO | DEFAULT_GENERATED
COL peer_review_reports.deadline_days | int | null=YES
COL peer_review_reports.decision | varchar(16) | null=YES
COL peer_review_reports.dimensions_json | json | null=YES
COL peer_review_reports.expertise | varchar(120) | null=YES
COL peer_review_reports.final_summary_md | mediumtext | null=YES
COL peer_review_reports.id | bigint unsigned | null=NO | auto_increment
COL peer_review_reports.line_comments_json | json | null=YES
COL peer_review_reports.macro_comments_json | json | null=YES
COL peer_review_reports.must_fix_json | json | null=YES
COL peer_review_reports.recommendation | varchar(16) | null=YES
COL peer_review_reports.reviewer_responses_json | json | null=YES
COL peer_review_reports.reviewer_skill_id | bigint unsigned | null=YES
COL peer_review_reports.role | varchar(8) | null=NO
COL peer_review_reports.ruling_paragraph_md | mediumtext | null=YES
COL peer_review_reports.ruling_summary_md | mediumtext | null=YES
COL peer_review_reports.score | smallint | null=YES
COL peer_review_reports.scores_json | json | null=YES
COL peer_review_reports.submission_id | bigint unsigned | null=NO
COL peer_review_reports.suggestions_json | json | null=YES
COL peer_review_reports.summary_for_author | varchar(300) | null=YES
COL peer_review_skills.applicable_subjects | json | null=YES
COL peer_review_skills.created_at | datetime | null=NO | DEFAULT_GENERATED
COL peer_review_skills.discipline | varchar(64) | null=NO
COL peer_review_skills.enabled | tinyint(1) | null=NO
COL peer_review_skills.id | bigint unsigned | null=NO | auto_increment
COL peer_review_skills.name | varchar(120) | null=NO
COL peer_review_skills.persona | varchar(16) | null=NO
COL peer_review_skills.slug | varchar(64) | null=NO
COL peer_review_skills.system_prompt | mediumtext | null=NO
COL peer_review_skills.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL peer_review_skills.weight | decimal(4,2) | null=NO
COL peer_review_step_cache.agent_tokens_in | int unsigned | null=YES
COL peer_review_step_cache.agent_tokens_out | int unsigned | null=YES
COL peer_review_step_cache.created_at | datetime | null=NO | DEFAULT_GENERATED
COL peer_review_step_cache.input_fingerprint | varchar(64) | null=NO
COL peer_review_step_cache.payload_json | json | null=NO
COL peer_review_step_cache.step | tinyint unsigned | null=NO
COL peer_review_step_cache.submission_id | bigint unsigned | null=NO
COL peer_review_step_cache.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL peer_review_submissions.abstract | text | null=YES
COL peer_review_submissions.advisor_name | varchar(100) | null=YES
COL peer_review_submissions.agent_session_id | varchar(64) | null=YES
COL peer_review_submissions.agreed_at | datetime | null=YES
COL peer_review_submissions.assets_revision | int | null=NO
COL peer_review_submissions.completed_at | datetime | null=YES
COL peer_review_submissions.compute_error | varchar(500) | null=YES
COL peer_review_submissions.compute_state | varchar(20) | null=NO
COL peer_review_submissions.created_at | datetime | null=NO | DEFAULT_GENERATED
COL peer_review_submissions.degree_type | varchar(16) | null=YES
COL peer_review_submissions.discipline_field | varchar(255) | null=YES
COL peer_review_submissions.extra_meta_json | json | null=YES
COL peer_review_submissions.failed_reason | varchar(500) | null=YES
COL peer_review_submissions.id | bigint unsigned | null=NO | auto_increment
COL peer_review_submissions.journal_id | bigint unsigned | null=YES
COL peer_review_submissions.journal_meta_json | json | null=YES
COL peer_review_submissions.journal_name | varchar(500) | null=YES
COL peer_review_submissions.letter_body | mediumtext | null=YES
COL peer_review_submissions.letter_revision | int | null=NO
COL peer_review_submissions.manuscript_asset_id | bigint unsigned | null=YES
COL peer_review_submissions.meta_revision | int | null=NO
COL peer_review_submissions.mode | varchar(16) | null=NO
COL peer_review_submissions.school_name | varchar(255) | null=YES
COL peer_review_submissions.status | varchar(16) | null=NO
COL peer_review_submissions.step | tinyint unsigned | null=NO
COL peer_review_submissions.submitted_at | datetime | null=YES
COL peer_review_submissions.title | varchar(500) | null=YES
COL peer_review_submissions.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL peer_review_submissions.user_id | bigint unsigned | null=NO
COL seo_authors.affiliations | json | null=YES
COL seo_authors.author_id | varchar(64) | null=NO
COL seo_authors.citation_count | int | null=NO
COL seo_authors.created_at | datetime | null=YES | DEFAULT_GENERATED
COL seo_authors.first_seen_at | datetime | null=NO
COL seo_authors.h_index | int | null=YES
COL seo_authors.homepage | varchar(500) | null=YES
COL seo_authors.id | bigint unsigned | null=NO | auto_increment
COL seo_authors.last_seen_at | datetime | null=NO
COL seo_authors.name | varchar(500) | null=NO
COL seo_authors.paper_count | int | null=NO
COL seo_authors.priority | decimal(2,1) | null=NO
COL seo_authors.quality_tier | tinyint | null=NO
COL seo_authors.sitemap_page | int | null=NO
COL seo_authors.slug | varchar(200) | null=NO
COL seo_authors.source | varchar(32) | null=YES
COL seo_authors.status | tinyint | null=NO
COL seo_authors.updated_at | datetime | null=YES | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL seo_authors.view_count | int | null=NO
COL seo_journals.canonical_name | varchar(500) | null=NO
COL seo_journals.country | varchar(64) | null=YES
COL seo_journals.created_at | datetime | null=YES | DEFAULT_GENERATED
COL seo_journals.first_seen_at | datetime | null=NO
COL seo_journals.id | bigint unsigned | null=NO | auto_increment
COL seo_journals.is_oa | tinyint(1) | null=NO
COL seo_journals.issns_json | json | null=YES
COL seo_journals.jcr_impact_factor | decimal(8,3) | null=YES
COL seo_journals.jcr_quartile | varchar(8) | null=YES
COL seo_journals.journal_id | bigint | null=NO
COL seo_journals.last_seen_at | datetime | null=NO
COL seo_journals.openalex_h_index | int | null=YES
COL seo_journals.priority | decimal(2,1) | null=NO
COL seo_journals.publisher | varchar(500) | null=YES
COL seo_journals.quality_tier | tinyint | null=NO
COL seo_journals.sitemap_page | int | null=NO
COL seo_journals.slug | varchar(220) | null=NO
COL seo_journals.status | tinyint | null=NO
COL seo_journals.type | varchar(64) | null=YES
COL seo_journals.updated_at | datetime | null=YES | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL seo_journals.view_count | int | null=NO
COL seo_papers.abstract | text | null=YES
COL seo_papers.authors_json | json | null=YES
COL seo_papers.citation_count | int | null=NO
COL seo_papers.created_at | datetime | null=YES | DEFAULT_GENERATED
COL seo_papers.doi | varchar(255) | null=YES
COL seo_papers.fields_of_study | json | null=YES
COL seo_papers.first_seen_at | datetime | null=NO
COL seo_papers.id | bigint unsigned | null=NO | auto_increment
COL seo_papers.last_seen_at | datetime | null=NO
COL seo_papers.paper_id | varchar(64) | null=NO
COL seo_papers.priority | decimal(2,1) | null=NO
COL seo_papers.quality_tier | tinyint | null=NO
COL seo_papers.sitemap_page | int | null=NO
COL seo_papers.slug | varchar(200) | null=NO
COL seo_papers.source | varchar(32) | null=YES
COL seo_papers.status | tinyint | null=NO
COL seo_papers.title | varchar(1024) | null=NO
COL seo_papers.updated_at | datetime | null=YES | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL seo_papers.venue | varchar(500) | null=YES
COL seo_papers.view_count | int | null=NO
COL seo_papers.year | int | null=YES
COL sms_configs.access_key_id | varchar(255) | null=NO
COL sms_configs.access_secret | varchar(255) | null=NO
COL sms_configs.created_at | datetime | null=NO | DEFAULT_GENERATED
COL sms_configs.endpoint | varchar(255) | null=NO
COL sms_configs.id | bigint unsigned | null=NO | auto_increment
COL sms_configs.is_active | tinyint(1) | null=NO
COL sms_configs.sign_name | varchar(100) | null=NO
COL sms_configs.template_code | varchar(50) | null=NO
COL sms_configs.template_content | text | null=NO
COL sms_configs.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL subscription_plans.created_at | datetime | null=NO | DEFAULT_GENERATED
COL subscription_plans.current_price_monthly | decimal(10,2) | null=NO
COL subscription_plans.current_price_yearly | decimal(10,2) | null=NO
COL subscription_plans.features | json | null=NO
COL subscription_plans.id | bigint unsigned | null=NO | auto_increment
COL subscription_plans.is_active | tinyint | null=NO
COL subscription_plans.plan_code | varchar(20) | null=NO
COL subscription_plans.plan_name | varchar(50) | null=NO
COL subscription_plans.price_monthly | decimal(10,2) | null=NO
COL subscription_plans.price_yearly | decimal(10,2) | null=NO
COL subscription_plans.sort_order | int | null=NO
COL subscription_plans.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL subscription_plans.yearly_discount_enabled | tinyint | null=NO
COL subscription_plans.yearly_discount_percent | decimal(5,2) | null=NO
COL system_configs.created_at | datetime | null=NO | DEFAULT_GENERATED
COL system_configs.enable_turnstile | tinyint(1) | null=NO
COL system_configs.id | bigint unsigned | null=NO | auto_increment
COL system_configs.maintenance_message | varchar(500) | null=YES
COL system_configs.maintenance_mode | tinyint | null=NO
COL system_configs.require_email_verification | tinyint(1) | null=NO
COL system_configs.turnstile_secret_key | varchar(100) | null=YES
COL system_configs.turnstile_site_key | varchar(100) | null=YES
COL system_configs.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL third_party_accounts.config | json | null=NO
COL third_party_accounts.created_at | datetime | null=NO | DEFAULT_GENERATED
COL third_party_accounts.fail_count | bigint unsigned | null=NO
COL third_party_accounts.id | bigint unsigned | null=NO | auto_increment
COL third_party_accounts.last_used_at | datetime | null=YES
COL third_party_accounts.max_latency_ms | bigint unsigned | null=NO
COL third_party_accounts.name | varchar(100) | null=NO
COL third_party_accounts.priority | int | null=NO
COL third_party_accounts.slow_count | bigint unsigned | null=NO
COL third_party_accounts.slow_total_latency_ms | bigint unsigned | null=NO
COL third_party_accounts.status | tinyint | null=NO
COL third_party_accounts.success_count | bigint unsigned | null=NO
COL third_party_accounts.total_latency_ms | bigint unsigned | null=NO
COL third_party_accounts.total_latency_sq_ms | bigint unsigned | null=NO
COL third_party_accounts.total_requests | bigint unsigned | null=NO
COL third_party_accounts.type | varchar(50) | null=NO
COL third_party_accounts.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL third_party_accounts.usage_count | bigint unsigned | null=NO
COL usage_log_config.created_at | datetime | null=NO | DEFAULT_GENERATED
COL usage_log_config.id | bigint unsigned | null=NO | auto_increment
COL usage_log_config.retention_days | int | null=NO
COL usage_log_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL usage_logs.action | varchar(50) | null=NO
COL usage_logs.browser | varchar(50) | null=YES
COL usage_logs.created_at | datetime | null=NO | DEFAULT_GENERATED
COL usage_logs.device_type | varchar(20) | null=YES
COL usage_logs.entry_point | varchar(100) | null=YES
COL usage_logs.extra_data | json | null=YES
COL usage_logs.feature_code | varchar(50) | null=NO
COL usage_logs.feature_name | varchar(100) | null=NO
COL usage_logs.id | bigint unsigned | null=NO | auto_increment
COL usage_logs.ip_address | varchar(45) | null=YES
COL usage_logs.os | varchar(50) | null=YES
COL usage_logs.referer_path | varchar(255) | null=YES
COL usage_logs.request_path | varchar(255) | null=YES
COL usage_logs.session_id | varchar(64) | null=YES
COL usage_logs.user_agent | varchar(500) | null=YES
COL usage_logs.user_id | bigint unsigned | null=YES
COL usage_quotas.advanced_search_high_count | int | null=NO
COL usage_quotas.advanced_search_low_count | int | null=NO
COL usage_quotas.advanced_search_mid_count | int | null=NO
COL usage_quotas.ai_chat_high_count | int | null=NO
COL usage_quotas.ai_chat_mid_count | int | null=NO
COL usage_quotas.ai_chat_normal_count | int | null=NO
COL usage_quotas.created_at | datetime | null=NO | DEFAULT_GENERATED
COL usage_quotas.id | bigint unsigned | null=NO | auto_increment
COL usage_quotas.normal_search_count | int | null=NO
COL usage_quotas.quota_date | date | null=NO
COL usage_quotas.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL usage_quotas.user_id | bigint unsigned | null=NO
COL user_auth_providers.created_at | datetime | null=NO | DEFAULT_GENERATED
COL user_auth_providers.id | bigint unsigned | null=NO | auto_increment
COL user_auth_providers.provider | varchar(20) | null=NO
COL user_auth_providers.provider_data | json | null=YES
COL user_auth_providers.provider_union_id | varchar(255) | null=YES
COL user_auth_providers.provider_user_id | varchar(255) | null=NO
COL user_auth_providers.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL user_auth_providers.user_id | bigint unsigned | null=NO
COL user_coupons.coupon_code | varchar(100) | null=YES
COL user_coupons.created_at | datetime | null=NO | DEFAULT_GENERATED
COL user_coupons.discount_type | varchar(20) | null=NO
COL user_coupons.discount_value | decimal(10,2) | null=NO
COL user_coupons.id | bigint unsigned | null=NO | auto_increment
COL user_coupons.min_purchase_amount | decimal(10,2) | null=YES
COL user_coupons.source_detail | json | null=YES
COL user_coupons.source_id | varchar(100) | null=YES
COL user_coupons.source_type | enum('manual','invite','register','batch','targeted','activity') | null=NO
COL user_coupons.status | enum('unused','reserved','used','expired','cancelled') | null=YES
COL user_coupons.template_id | bigint unsigned | null=NO
COL user_coupons.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL user_coupons.used_at | datetime | null=YES
COL user_coupons.used_order_id | bigint unsigned | null=YES
COL user_coupons.user_id | bigint unsigned | null=NO
COL user_coupons.valid_from | datetime | null=NO
COL user_coupons.valid_until | datetime | null=NO
COL user_invitations.created_at | datetime | null=NO | DEFAULT_GENERATED
COL user_invitations.id | bigint unsigned | null=NO | auto_increment
COL user_invitations.invitation_code | varchar(50) | null=NO
COL user_invitations.invitation_url | varchar(500) | null=YES
COL user_invitations.is_active | tinyint(1) | null=YES
COL user_invitations.paid_invites | int | null=YES
COL user_invitations.successful_invites | int | null=YES
COL user_invitations.total_invites | int | null=YES
COL user_invitations.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL user_invitations.user_id | bigint unsigned | null=NO
COL user_library_folders.created_at | datetime | null=NO | DEFAULT_GENERATED
COL user_library_folders.id | bigint unsigned | null=NO | auto_increment
COL user_library_folders.is_default | tinyint(1) | null=NO
COL user_library_folders.name | varchar(64) | null=NO
COL user_library_folders.position | int | null=NO
COL user_library_folders.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL user_library_folders.user_id | bigint unsigned | null=NO
COL user_library_papers.abstract | mediumtext | null=YES
COL user_library_papers.authors_json | json | null=YES
COL user_library_papers.citation_count | int unsigned | null=NO
COL user_library_papers.created_at | datetime | null=NO | DEFAULT_GENERATED
COL user_library_papers.doi | varchar(255) | null=NO
COL user_library_papers.folder_id | bigint unsigned | null=YES
COL user_library_papers.id | bigint unsigned | null=NO | auto_increment
COL user_library_papers.link_state | varchar(16) | null=NO
COL user_library_papers.og_abstract | mediumtext | null=YES
COL user_library_papers.og_authors_json | json | null=YES
COL user_library_papers.og_doi | varchar(255) | null=NO
COL user_library_papers.og_title | varchar(1024) | null=NO
COL user_library_papers.og_venue | varchar(512) | null=NO
COL user_library_papers.og_year | smallint unsigned | null=YES
COL user_library_papers.origin | varchar(16) | null=NO
COL user_library_papers.pdf_mime | varchar(64) | null=NO
COL user_library_papers.pdf_object_key | varchar(512) | null=NO
COL user_library_papers.pdf_original_filename | varchar(255) | null=NO
COL user_library_papers.pdf_sha256 | char(64) | null=NO
COL user_library_papers.pdf_size | bigint | null=NO
COL user_library_papers.pdf_uploaded_at | timestamp | null=YES
COL user_library_papers.pdf_url | varchar(1024) | null=NO
COL user_library_papers.publication_types_json | json | null=YES
COL user_library_papers.raw_json | json | null=YES
COL user_library_papers.source | varchar(16) | null=NO
COL user_library_papers.source_paper_id | varchar(128) | null=NO
COL user_library_papers.title | varchar(1024) | null=NO
COL user_library_papers.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL user_library_papers.user_id | bigint unsigned | null=NO
COL user_library_papers.venue | varchar(512) | null=NO
COL user_library_papers.year | smallint unsigned | null=YES
COL user_messages.created_at | datetime | null=NO | DEFAULT_GENERATED
COL user_messages.deleted_at | datetime | null=YES
COL user_messages.id | bigint unsigned | null=NO | auto_increment
COL user_messages.is_deleted | tinyint(1) | null=NO
COL user_messages.is_read | tinyint(1) | null=NO
COL user_messages.message_id | bigint unsigned | null=NO
COL user_messages.read_at | datetime | null=YES
COL user_messages.user_id | bigint unsigned | null=NO
COL user_staging_area_papers.abstract | mediumtext | null=YES
COL user_staging_area_papers.area_id | bigint unsigned | null=NO
COL user_staging_area_papers.authors_json | json | null=YES
COL user_staging_area_papers.citation_count | int unsigned | null=NO
COL user_staging_area_papers.created_at | datetime | null=NO | DEFAULT_GENERATED
COL user_staging_area_papers.doi | varchar(255) | null=NO
COL user_staging_area_papers.id | bigint unsigned | null=NO | auto_increment
COL user_staging_area_papers.is_open_access | tinyint(1) | null=NO
COL user_staging_area_papers.pdf_url | varchar(1024) | null=NO
COL user_staging_area_papers.position | int | null=NO
COL user_staging_area_papers.raw_json | json | null=YES
COL user_staging_area_papers.source | varchar(16) | null=NO
COL user_staging_area_papers.source_paper_id | varchar(128) | null=NO
COL user_staging_area_papers.title | varchar(1024) | null=NO
COL user_staging_area_papers.user_id | bigint unsigned | null=NO
COL user_staging_area_papers.venue | varchar(512) | null=NO
COL user_staging_area_papers.year | smallint unsigned | null=YES
COL user_staging_areas.created_at | datetime | null=NO | DEFAULT_GENERATED
COL user_staging_areas.id | bigint unsigned | null=NO | auto_increment
COL user_staging_areas.name | varchar(64) | null=NO
COL user_staging_areas.position | int | null=NO
COL user_staging_areas.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL user_staging_areas.user_id | bigint unsigned | null=NO
COL user_subscriptions.auto_renew | tinyint | null=NO
COL user_subscriptions.created_at | datetime | null=NO | DEFAULT_GENERATED
COL user_subscriptions.end_date | datetime | null=YES
COL user_subscriptions.id | bigint unsigned | null=NO | auto_increment
COL user_subscriptions.plan_code | varchar(20) | null=NO
COL user_subscriptions.start_date | datetime | null=NO
COL user_subscriptions.status | varchar(20) | null=NO
COL user_subscriptions.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL user_subscriptions.user_id | bigint unsigned | null=NO
COL users.admin_notes | text | null=YES
COL users.avatar_url | varchar(255) | null=YES
COL users.bio | text | null=YES
COL users.created_at | datetime | null=NO | DEFAULT_GENERATED
COL users.email | varchar(100) | null=YES
COL users.email_verified | tinyint(1) | null=NO
COL users.frozen_at | datetime | null=YES
COL users.frozen_reason | varchar(255) | null=YES
COL users.id | bigint unsigned | null=NO | auto_increment
COL users.last_login_at | datetime | null=YES
COL users.last_login_ip | varchar(45) | null=YES
COL users.legacy_admin_id | bigint unsigned | null=YES
COL users.location | varchar(100) | null=YES
COL users.password_hash | varchar(255) | null=YES
COL users.phone | varchar(20) | null=YES
COL users.phone_verified | tinyint(1) | null=NO
COL users.role | varchar(20) | null=NO
COL users.status | tinyint | null=NO
COL users.subscription_expires_at | datetime | null=YES
COL users.subscription_plan | varchar(20) | null=NO
COL users.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL users.username | varchar(50) | null=YES
COL users.website | varchar(255) | null=YES
COL wechat_configs.app_id | varchar(32) | null=NO
COL wechat_configs.app_secret | varchar(64) | null=NO
COL wechat_configs.created_at | datetime | null=NO | DEFAULT_GENERATED
COL wechat_configs.id | bigint unsigned | null=NO | auto_increment
COL wechat_configs.is_active | tinyint(1) | null=NO
COL wechat_configs.redirect_uri | varchar(255) | null=NO
COL wechat_configs.scope | varchar(50) | null=NO
COL wechat_configs.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL wechat_official_config.ai_model_level | varchar(20) | null=NO
COL wechat_official_config.app_id | varchar(100) | null=NO
COL wechat_official_config.app_secret | varchar(255) | null=NO
COL wechat_official_config.auto_reply_enabled | tinyint(1) | null=NO
COL wechat_official_config.created_at | datetime | null=NO | DEFAULT_GENERATED
COL wechat_official_config.encoding_aes_key | varchar(100) | null=NO
COL wechat_official_config.encryption_mode | varchar(20) | null=NO
COL wechat_official_config.id | bigint unsigned | null=NO | auto_increment
COL wechat_official_config.system_prompt | text | null=YES
COL wechat_official_config.token | varchar(100) | null=NO
COL wechat_official_config.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
COL wechat_pay_configs.api_v3_key | varchar(64) | null=NO
COL wechat_pay_configs.app_id | varchar(32) | null=NO
COL wechat_pay_configs.created_at | datetime | null=NO | DEFAULT_GENERATED
COL wechat_pay_configs.id | bigint unsigned | null=NO | auto_increment
COL wechat_pay_configs.is_active | tinyint(1) | null=NO
COL wechat_pay_configs.is_sandbox | tinyint(1) | null=NO
COL wechat_pay_configs.mch_id | varchar(32) | null=NO
COL wechat_pay_configs.notify_url | varchar(255) | null=NO
COL wechat_pay_configs.private_key | text | null=NO
COL wechat_pay_configs.serial_no | varchar(64) | null=NO
COL wechat_pay_configs.updated_at | datetime | null=NO | DEFAULT_GENERATED on update CURRENT_TIMESTAMP
# ── INDEXES (table.index uniq cols) ──
IDX _schema_migration_marks.PRIMARY | uniq=1 | cols=mark
IDX admin_audit_logs.idx_action_time | uniq=0 | cols=action,created_at
IDX admin_audit_logs.idx_admin_user | uniq=0 | cols=admin_user_id
IDX admin_audit_logs.idx_created_at | uniq=0 | cols=created_at
IDX admin_audit_logs.idx_resource | uniq=0 | cols=resource_type,resource_id
IDX admin_audit_logs.PRIMARY | uniq=1 | cols=id
IDX agent_config.PRIMARY | uniq=1 | cols=id
IDX agent_sessions.idx_user_feature_accessed | uniq=0 | cols=user_id,feature_key,last_accessed_at
IDX agent_sessions.PRIMARY | uniq=1 | cols=id
IDX agent_sessions.uk_agent_session_id | uniq=1 | cols=agent_session_id
IDX alipay_configs.idx_is_active | uniq=0 | cols=is_active
IDX alipay_configs.is_active | uniq=0 | cols=is_active
IDX alipay_configs.PRIMARY | uniq=1 | cols=id
IDX analysis_dimensions.dimension_key | uniq=1 | cols=user_id,dimension_key
IDX analysis_dimensions.idx_dimension_key | uniq=0 | cols=dimension_key
IDX analysis_dimensions.idx_sort_order | uniq=0 | cols=sort_order
IDX analysis_dimensions.idx_user_id | uniq=0 | cols=user_id
IDX analysis_dimensions.PRIMARY | uniq=1 | cols=id
IDX analysis_dimensions.sort_order | uniq=0 | cols=sort_order
IDX analysis_dimensions.uk_user_dimension | uniq=1 | cols=user_id,dimension_key
IDX analysis_dimensions.user_id | uniq=0 | cols=user_id
IDX announcements.idx_active_time | uniq=0 | cols=is_active,starts_at,ends_at
IDX announcements.idx_type | uniq=0 | cols=type
IDX announcements.PRIMARY | uniq=1 | cols=id
IDX apple_oauth_config.PRIMARY | uniq=1 | cols=id
IDX code_snippets.category | uniq=0 | cols=category
IDX code_snippets.code_key | uniq=1 | cols=code_key
IDX code_snippets.idx_category | uniq=0 | cols=category
IDX code_snippets.idx_is_enabled | uniq=0 | cols=is_enabled
IDX code_snippets.idx_position | uniq=0 | cols=position
IDX code_snippets.idx_priority | uniq=0 | cols=priority
IDX code_snippets.is_enabled | uniq=0 | cols=is_enabled
IDX code_snippets.position | uniq=0 | cols=position
IDX code_snippets.PRIMARY | uniq=1 | cols=id
IDX code_snippets.priority | uniq=0 | cols=priority
IDX code_snippets.uk_code_key | uniq=1 | cols=code_key
IDX coupon_batches.batch_code | uniq=1 | cols=batch_code
IDX coupon_batches.idx_status | uniq=0 | cols=status
IDX coupon_batches.idx_template | uniq=0 | cols=template_id
IDX coupon_batches.PRIMARY | uniq=1 | cols=id
IDX coupon_batches.status | uniq=0 | cols=status
IDX coupon_batches.template_id | uniq=0 | cols=template_id
IDX coupon_batches.uk_batch_code | uniq=1 | cols=batch_code
IDX coupon_templates.code | uniq=1 | cols=code
IDX coupon_templates.distribution_type | uniq=0 | cols=status,distribution_type
IDX coupon_templates.fixed_valid_end | uniq=0 | cols=fixed_valid_start,fixed_valid_end
IDX coupon_templates.idx_status_type | uniq=0 | cols=status,distribution_type
IDX coupon_templates.idx_valid_time | uniq=0 | cols=fixed_valid_start,fixed_valid_end
IDX coupon_templates.PRIMARY | uniq=1 | cols=id
IDX coupon_templates.uk_code | uniq=1 | cols=code
IDX coupon_usage_logs.idx_order | uniq=0 | cols=order_id
IDX coupon_usage_logs.idx_user | uniq=0 | cols=user_id
IDX coupon_usage_logs.idx_user_coupon | uniq=0 | cols=user_coupon_id
IDX coupon_usage_logs.order_id | uniq=0 | cols=order_id
IDX coupon_usage_logs.PRIMARY | uniq=1 | cols=id
IDX coupon_usage_logs.user_coupon_id | uniq=0 | cols=user_coupon_id
IDX coupon_usage_logs.user_id | uniq=0 | cols=user_id
IDX discourse_sso_config.PRIMARY | uniq=1 | cols=id
IDX email_configs.created_at | uniq=0 | cols=created_at
IDX email_configs.idx_created_at | uniq=0 | cols=created_at
IDX email_configs.idx_is_active | uniq=0 | cols=is_active
IDX email_configs.is_active | uniq=0 | cols=is_active
IDX email_configs.PRIMARY | uniq=1 | cols=id
IDX feature_configs.feature_code | uniq=1 | cols=feature_code
IDX feature_configs.PRIMARY | uniq=1 | cols=id
IDX feature_configs.uk_feature_code | uniq=1 | cols=feature_code
IDX feature_prompt_history.idx_prompt_version | uniq=0 | cols=prompt_id,version
IDX feature_prompt_history.PRIMARY | uniq=1 | cols=id
IDX feature_prompts.idx_feature_persona_enabled | uniq=0 | cols=feature_key,persona,enabled
IDX feature_prompts.idx_feature_updated | uniq=0 | cols=feature_key,updated_at
IDX feature_prompts.PRIMARY | uniq=1 | cols=id
IDX feature_prompts.uk_feature_slug | uniq=1 | cols=feature_key,slug
IDX feedback_attachments.created_at | uniq=0 | cols=created_at
IDX feedback_attachments.feedback_id | uniq=0 | cols=feedback_id
IDX feedback_attachments.idx_created_at | uniq=0 | cols=created_at
IDX feedback_attachments.idx_feedback_id | uniq=0 | cols=feedback_id
IDX feedback_attachments.idx_is_used | uniq=0 | cols=is_used
IDX feedback_attachments.idx_upload_key | uniq=0 | cols=upload_key
IDX feedback_attachments.is_used | uniq=0 | cols=is_used
IDX feedback_attachments.PRIMARY | uniq=1 | cols=id
IDX feedback_attachments.upload_key | uniq=0 | cols=upload_key
IDX feedbacks.created_at | uniq=0 | cols=created_at
IDX feedbacks.email | uniq=0 | cols=email
IDX feedbacks.idx_assigned_to | uniq=0 | cols=assigned_to
IDX feedbacks.idx_category | uniq=0 | cols=category
IDX feedbacks.idx_created_at | uniq=0 | cols=created_at
IDX feedbacks.idx_deleted_at | uniq=0 | cols=deleted_at
IDX feedbacks.idx_email | uniq=0 | cols=email
IDX feedbacks.idx_status | uniq=0 | cols=status
IDX feedbacks.idx_status_created | uniq=0 | cols=status,created_at
IDX feedbacks.idx_user_id | uniq=0 | cols=user_id
IDX feedbacks.PRIMARY | uniq=1 | cols=id
IDX feedbacks.status | uniq=0 | cols=status
IDX feedbacks.user_id | uniq=0 | cols=user_id
IDX github_oauth_config.PRIMARY | uniq=1 | cols=id
IDX google_oauth_config.PRIMARY | uniq=1 | cols=id
IDX hot_content_config.PRIMARY | uniq=1 | cols=id
IDX hot_papers.idx_click_count | uniq=0 | cols=click_count
IDX hot_papers.idx_doi | uniq=0 | cols=doi
IDX hot_papers.idx_first_viewed | uniq=0 | cols=first_viewed_at
IDX hot_papers.idx_impression_count | uniq=0 | cols=impression_count
IDX hot_papers.idx_last_viewed | uniq=0 | cols=last_viewed_at
IDX hot_papers.idx_view_count | uniq=0 | cols=view_count
IDX hot_papers.PRIMARY | uniq=1 | cols=id
IDX hot_papers.uk_paper_id | uniq=1 | cols=paper_id
IDX hot_search_keywords.idx_first_searched | uniq=0 | cols=first_searched_at
IDX hot_search_keywords.idx_last_searched | uniq=0 | cols=last_searched_at
IDX hot_search_keywords.idx_search_count | uniq=0 | cols=search_count
IDX hot_search_keywords.PRIMARY | uniq=1 | cols=id
IDX hot_search_keywords.uk_keyword_hash_type | uniq=1 | cols=keyword_hash,search_type
IDX invitation_relationships.idx_invitation_code | uniq=0 | cols=invitation_code
IDX invitation_relationships.idx_inviter | uniq=0 | cols=inviter_id
IDX invitation_relationships.idx_status | uniq=0 | cols=status
IDX invitation_relationships.invitation_code | uniq=0 | cols=invitation_code
IDX invitation_relationships.invitee_id | uniq=1 | cols=invitee_id
IDX invitation_relationships.inviter_id | uniq=0 | cols=inviter_id
IDX invitation_relationships.PRIMARY | uniq=1 | cols=id
IDX invitation_relationships.status | uniq=0 | cols=status
IDX invitation_relationships.uk_invitee | uniq=1 | cols=invitee_id
IDX message_templates.category | uniq=0 | cols=category
IDX message_templates.code | uniq=1 | cols=code
IDX message_templates.idx_category | uniq=0 | cols=category
IDX message_templates.idx_is_active | uniq=0 | cols=is_active
IDX message_templates.is_active | uniq=0 | cols=is_active
IDX message_templates.PRIMARY | uniq=1 | cols=id
IDX message_templates.uk_code | uniq=1 | cols=code
IDX messages.category | uniq=0 | cols=category
IDX messages.expire_at | uniq=0 | cols=expire_at
IDX messages.idx_category | uniq=0 | cols=category
IDX messages.idx_expire_at | uniq=0 | cols=expire_at
IDX messages.idx_send_at | uniq=0 | cols=send_at
IDX messages.idx_send_type | uniq=0 | cols=send_type
IDX messages.idx_sender_id | uniq=0 | cols=sender_id
IDX messages.idx_status | uniq=0 | cols=status
IDX messages.idx_status_send_at | uniq=0 | cols=status,send_at
IDX messages.PRIMARY | uniq=1 | cols=id
IDX messages.send_at | uniq=0 | cols=send_at
IDX messages.send_type | uniq=0 | cols=send_type
IDX messages.sender_id | uniq=0 | cols=sender_id
IDX messages.status | uniq=0 | cols=status
IDX microsoft_oauth_config.PRIMARY | uniq=1 | cols=id
IDX orcid_oauth_config.PRIMARY | uniq=1 | cols=id
IDX orders.coupon_id | uniq=0 | cols=coupon_id
IDX orders.created_at | uniq=0 | cols=created_at
IDX orders.idx_coupon_id | uniq=0 | cols=coupon_id
IDX orders.idx_created_at | uniq=0 | cols=created_at
IDX orders.idx_order_type | uniq=0 | cols=order_type
IDX orders.idx_status | uniq=0 | cols=status
IDX orders.idx_status_created | uniq=0 | cols=status,created_at
IDX orders.idx_user_created | uniq=0 | cols=user_id,created_at
IDX orders.idx_user_id | uniq=0 | cols=user_id
IDX orders.order_no | uniq=1 | cols=order_no
IDX orders.order_type | uniq=0 | cols=order_type
IDX orders.PRIMARY | uniq=1 | cols=id
IDX orders.status | uniq=0 | cols=status
IDX orders.uk_order_no | uniq=1 | cols=order_no
IDX orders.user_id | uniq=0 | cols=user_id
IDX paper_analysis.created_at | uniq=0 | cols=created_at
IDX paper_analysis.dimension_hash | uniq=1 | cols=paper_id,dimension_hash
IDX paper_analysis.idx_created_at | uniq=0 | cols=created_at
IDX paper_analysis.idx_dimension_hash | uniq=0 | cols=dimension_hash
IDX paper_analysis.PRIMARY | uniq=1 | cols=id
IDX paper_analysis.uk_paper_dimension | uniq=1 | cols=paper_id,dimension_hash
IDX payment_transactions.idx_order_id | uniq=0 | cols=order_id
IDX payment_transactions.idx_transaction_no | uniq=0 | cols=transaction_no
IDX payment_transactions.idx_txn_no_order | uniq=0 | cols=transaction_no,order_id
IDX payment_transactions.order_id | uniq=0 | cols=order_id
IDX payment_transactions.PRIMARY | uniq=1 | cols=id
IDX payment_transactions.transaction_no | uniq=0 | cols=transaction_no
IDX peer_review_assets.idx_submission | uniq=0 | cols=submission_id
IDX peer_review_assets.PRIMARY | uniq=1 | cols=id
IDX peer_review_reports.PRIMARY | uniq=1 | cols=id
IDX peer_review_reports.uk_submission_role | uniq=1 | cols=submission_id,role
IDX peer_review_skills.idx_prs_discipline | uniq=0 | cols=discipline,enabled
IDX peer_review_skills.idx_prs_persona_enabled | uniq=0 | cols=persona,enabled
IDX peer_review_skills.PRIMARY | uniq=1 | cols=id
IDX peer_review_skills.uk_prs_slug | uniq=1 | cols=slug
IDX peer_review_step_cache.PRIMARY | uniq=1 | cols=submission_id,step
IDX peer_review_submissions.idx_status | uniq=0 | cols=status
IDX peer_review_submissions.idx_user_created | uniq=0 | cols=user_id,created_at
IDX peer_review_submissions.PRIMARY | uniq=1 | cols=id
IDX seo_authors.idx_status_sitemap_page | uniq=0 | cols=status,sitemap_page,id
IDX seo_authors.idx_updated_at | uniq=0 | cols=updated_at
IDX seo_authors.PRIMARY | uniq=1 | cols=id
IDX seo_authors.uk_author_id | uniq=1 | cols=author_id
IDX seo_authors.uk_slug | uniq=1 | cols=slug
IDX seo_journals.idx_slug | uniq=0 | cols=slug
IDX seo_journals.idx_status_sitemap_page | uniq=0 | cols=status,sitemap_page,id
IDX seo_journals.idx_updated_at | uniq=0 | cols=updated_at
IDX seo_journals.PRIMARY | uniq=1 | cols=id
IDX seo_journals.uk_journal_id | uniq=1 | cols=journal_id
IDX seo_papers.idx_doi | uniq=0 | cols=doi
IDX seo_papers.idx_status_sitemap_page | uniq=0 | cols=status,sitemap_page,id
IDX seo_papers.idx_tier_views | uniq=0 | cols=quality_tier,view_count
IDX seo_papers.idx_updated_at | uniq=0 | cols=updated_at
IDX seo_papers.PRIMARY | uniq=1 | cols=id
IDX seo_papers.uk_paper_id | uniq=1 | cols=paper_id
IDX seo_papers.uk_slug | uniq=1 | cols=slug
IDX sms_configs.created_at | uniq=0 | cols=created_at
IDX sms_configs.idx_created_at | uniq=0 | cols=created_at
IDX sms_configs.idx_is_active | uniq=0 | cols=is_active
IDX sms_configs.is_active | uniq=0 | cols=is_active
IDX sms_configs.PRIMARY | uniq=1 | cols=id
IDX subscription_plans.idx_active_type | uniq=0 | cols=is_active,plan_code
IDX subscription_plans.idx_is_active | uniq=0 | cols=is_active
IDX subscription_plans.idx_sort_order | uniq=0 | cols=sort_order
IDX subscription_plans.is_active | uniq=0 | cols=is_active
IDX subscription_plans.plan_code | uniq=1 | cols=plan_code
IDX subscription_plans.PRIMARY | uniq=1 | cols=id
IDX subscription_plans.sort_order | uniq=0 | cols=sort_order
IDX subscription_plans.uk_plan_code | uniq=1 | cols=plan_code
IDX system_configs.PRIMARY | uniq=1 | cols=id
IDX third_party_accounts.idx_last_used | uniq=0 | cols=last_used_at
IDX third_party_accounts.idx_type_priority | uniq=0 | cols=type,status,priority
IDX third_party_accounts.idx_type_status | uniq=0 | cols=type,status
IDX third_party_accounts.last_used_at | uniq=0 | cols=last_used_at
IDX third_party_accounts.PRIMARY | uniq=1 | cols=id
IDX third_party_accounts.priority | uniq=0 | cols=type,status,priority
IDX third_party_accounts.status | uniq=0 | cols=type,status
IDX usage_log_config.PRIMARY | uniq=1 | cols=id
IDX usage_logs.action | uniq=0 | cols=action
IDX usage_logs.created_at | uniq=0 | cols=created_at
IDX usage_logs.entry_point | uniq=0 | cols=entry_point
IDX usage_logs.feature_code | uniq=0 | cols=feature_code
IDX usage_logs.idx_action | uniq=0 | cols=action
IDX usage_logs.idx_created_at | uniq=0 | cols=created_at
IDX usage_logs.idx_entry_point | uniq=0 | cols=entry_point
IDX usage_logs.idx_feature_action_created | uniq=0 | cols=feature_code,action,created_at
IDX usage_logs.idx_feature_code | uniq=0 | cols=feature_code
IDX usage_logs.idx_feature_created | uniq=0 | cols=feature_code,created_at
IDX usage_logs.idx_ip_address | uniq=0 | cols=ip_address
IDX usage_logs.idx_session_id | uniq=0 | cols=session_id
IDX usage_logs.idx_user_created | uniq=0 | cols=user_id,created_at
IDX usage_logs.idx_user_feature | uniq=0 | cols=user_id,feature_code
IDX usage_logs.idx_user_id | uniq=0 | cols=user_id
IDX usage_logs.ip_address | uniq=0 | cols=ip_address
IDX usage_logs.PRIMARY | uniq=1 | cols=id
IDX usage_logs.session_id | uniq=0 | cols=session_id
IDX usage_logs.user_id | uniq=0 | cols=user_id
IDX usage_quotas.idx_quota_date | uniq=0 | cols=quota_date
IDX usage_quotas.idx_user_date_desc | uniq=0 | cols=user_id,quota_date
IDX usage_quotas.idx_user_id | uniq=0 | cols=user_id
IDX usage_quotas.PRIMARY | uniq=1 | cols=id
IDX usage_quotas.quota_date | uniq=1 | cols=user_id,quota_date
IDX usage_quotas.uk_user_date | uniq=1 | cols=user_id,quota_date
IDX usage_quotas.user_id | uniq=0 | cols=user_id
IDX user_auth_providers.idx_union_id | uniq=0 | cols=provider_union_id
IDX user_auth_providers.idx_user_id | uniq=0 | cols=user_id
IDX user_auth_providers.PRIMARY | uniq=1 | cols=id
IDX user_auth_providers.provider_union_id | uniq=1 | cols=provider,provider_union_id
IDX user_auth_providers.provider_user_id | uniq=1 | cols=provider,provider_user_id
IDX user_auth_providers.uk_provider_union | uniq=1 | cols=provider,provider_union_id
IDX user_auth_providers.uk_provider_user | uniq=1 | cols=provider,provider_user_id
IDX user_auth_providers.uq_provider_provider_user_id | uniq=1 | cols=provider,provider_user_id
IDX user_auth_providers.uq_user_id_provider | uniq=1 | cols=user_id,provider
IDX user_auth_providers.user_id | uniq=0 | cols=user_id
IDX user_coupons.coupon_code | uniq=1 | cols=coupon_code
IDX user_coupons.idx_source | uniq=0 | cols=source_type,source_id
IDX user_coupons.idx_template | uniq=0 | cols=template_id
IDX user_coupons.idx_user_status | uniq=0 | cols=user_id,status
IDX user_coupons.idx_user_status_valid | uniq=0 | cols=user_id,status,valid_until
IDX user_coupons.idx_valid_time | uniq=0 | cols=valid_from,valid_until
IDX user_coupons.PRIMARY | uniq=1 | cols=id
IDX user_coupons.source_id | uniq=0 | cols=source_type,source_id
IDX user_coupons.status | uniq=0 | cols=user_id,status
IDX user_coupons.template_id | uniq=0 | cols=template_id
IDX user_coupons.uk_coupon_code | uniq=1 | cols=coupon_code
IDX user_coupons.valid_until | uniq=0 | cols=valid_from,valid_until
IDX user_invitations.idx_is_active | uniq=0 | cols=is_active
IDX user_invitations.invitation_code | uniq=1 | cols=invitation_code
IDX user_invitations.is_active | uniq=0 | cols=is_active
IDX user_invitations.PRIMARY | uniq=1 | cols=id
IDX user_invitations.uk_invitation_code | uniq=1 | cols=invitation_code
IDX user_invitations.uk_user_id | uniq=1 | cols=user_id
IDX user_invitations.user_id | uniq=1 | cols=user_id
IDX user_library_folders.idx_user_position | uniq=0 | cols=user_id,position
IDX user_library_folders.PRIMARY | uniq=1 | cols=id
IDX user_library_papers.idx_user_created_at | uniq=0 | cols=user_id,created_at
IDX user_library_papers.idx_user_doi | uniq=0 | cols=user_id,doi
IDX user_library_papers.idx_user_folder | uniq=0 | cols=user_id,folder_id
IDX user_library_papers.idx_user_link_state | uniq=0 | cols=user_id,link_state
IDX user_library_papers.PRIMARY | uniq=1 | cols=id
IDX user_library_papers.uk_user_source_paper | uniq=1 | cols=user_id,source,source_paper_id
IDX user_messages.created_at | uniq=0 | cols=user_id,created_at
IDX user_messages.idx_message_id | uniq=0 | cols=message_id
IDX user_messages.idx_user_created | uniq=0 | cols=user_id,created_at
IDX user_messages.idx_user_unread | uniq=0 | cols=user_id,is_read,is_deleted
IDX user_messages.is_deleted | uniq=0 | cols=user_id,is_read,is_deleted
IDX user_messages.message_id | uniq=1 | cols=user_id,message_id
IDX user_messages.PRIMARY | uniq=1 | cols=id
IDX user_messages.uk_user_message | uniq=1 | cols=user_id,message_id
IDX user_staging_area_papers.idx_area_position | uniq=0 | cols=area_id,position
IDX user_staging_area_papers.idx_user_id | uniq=0 | cols=user_id
IDX user_staging_area_papers.PRIMARY | uniq=1 | cols=id
IDX user_staging_area_papers.uk_area_source_paper | uniq=1 | cols=area_id,source,source_paper_id
IDX user_staging_areas.idx_user_position | uniq=0 | cols=user_id,position
IDX user_staging_areas.PRIMARY | uniq=1 | cols=id
IDX user_subscriptions.end_date | uniq=0 | cols=end_date
IDX user_subscriptions.idx_end_date | uniq=0 | cols=end_date
IDX user_subscriptions.idx_status | uniq=0 | cols=status
IDX user_subscriptions.idx_user_active | uniq=0 | cols=user_id,status,end_date
IDX user_subscriptions.idx_user_id | uniq=0 | cols=user_id
IDX user_subscriptions.idx_user_status | uniq=0 | cols=user_id,status
IDX user_subscriptions.PRIMARY | uniq=1 | cols=id
IDX user_subscriptions.status | uniq=0 | cols=status
IDX user_subscriptions.user_id | uniq=0 | cols=user_id
IDX users.email | uniq=1 | cols=email
IDX users.idx_last_login_at | uniq=0 | cols=last_login_at
IDX users.idx_location | uniq=0 | cols=location
IDX users.idx_role | uniq=0 | cols=role
IDX users.idx_status | uniq=0 | cols=status
IDX users.idx_subscription_plan | uniq=0 | cols=subscription_plan
IDX users.last_login_at | uniq=0 | cols=last_login_at
IDX users.location | uniq=0 | cols=location
IDX users.phone | uniq=1 | cols=phone
IDX users.PRIMARY | uniq=1 | cols=id
IDX users.status | uniq=0 | cols=status
IDX users.subscription_plan | uniq=0 | cols=subscription_plan
IDX users.uk_email | uniq=1 | cols=email
IDX users.uk_legacy_admin_id | uniq=1 | cols=legacy_admin_id
IDX users.uk_phone | uniq=1 | cols=phone
IDX users.uk_username | uniq=1 | cols=username
IDX users.username | uniq=1 | cols=username
IDX wechat_configs.idx_is_active | uniq=0 | cols=is_active
IDX wechat_configs.is_active | uniq=0 | cols=is_active
IDX wechat_configs.PRIMARY | uniq=1 | cols=id
IDX wechat_official_config.PRIMARY | uniq=1 | cols=id
IDX wechat_pay_configs.idx_is_active | uniq=0 | cols=is_active
IDX wechat_pay_configs.is_active | uniq=0 | cols=is_active
IDX wechat_pay_configs.PRIMARY | uniq=1 | cols=id
# ── FOREIGN KEYS (table.constraint -> reftable) ──
FK coupon_batches.fk_batch_template -> coupon_templates
FK coupon_usage_logs.fk_usage_log_order -> orders
FK coupon_usage_logs.fk_usage_log_user -> users
FK coupon_usage_logs.fk_usage_log_user_coupon -> user_coupons
FK feedback_attachments.fk_attachment_feedback -> feedbacks
FK feedbacks.fk_feedback_user -> users
FK invitation_relationships.fk_relationship_invitee -> users
FK invitation_relationships.fk_relationship_inviter -> users
FK orders.fk_orders_user -> users
FK payment_transactions.fk_payment_order -> orders
FK peer_review_assets.fk_pra_submission -> peer_review_submissions
FK peer_review_reports.fk_prr_submission -> peer_review_submissions
FK peer_review_step_cache.fk_prsc_submission -> peer_review_submissions
FK usage_quotas.fk_usage_quotas_user_id -> users
FK user_auth_providers.fk_user_auth_user -> users
FK user_coupons.fk_user_coupon_template -> coupon_templates
FK user_coupons.fk_user_coupon_user -> users
FK user_invitations.fk_invitation_user -> users
FK user_messages.fk_user_messages_message -> messages
FK user_messages.fk_user_messages_user -> users
FK user_subscriptions.fk_user_subscriptions_user_id -> users
