-- ============================================
-- 添加 UnionID 字段到 user_auth_providers 表
-- 用于支持微信 UnionID 存储
-- ============================================

-- 检查字段是否已存在，如果不存在则添加
ALTER TABLE `user_auth_providers` 
ADD COLUMN IF NOT EXISTS `provider_union_id` VARCHAR(255) 
COMMENT '第三方平台联合ID（微信UnionID，用于跨应用识别同一用户）' 
AFTER `provider_user_id`;

-- 添加唯一索引（如果不存在）
-- 注意：如果字段已有数据，需要先清理重复数据
CREATE UNIQUE INDEX IF NOT EXISTS `uk_provider_union` 
ON `user_auth_providers` (`provider`, `provider_union_id`);

-- 添加普通索引用于查询优化
CREATE INDEX IF NOT EXISTS `idx_union_id` 
ON `user_auth_providers` (`provider_union_id`);

-- 注意事项：
-- 1. 此脚本为幂等操作，可以重复执行
-- 2. 新字段允许为 NULL，兼容历史数据
-- 3. 唯一索引会忽略 NULL 值，不会影响历史记录
-- 4. 新用户登录时会自动填充 UnionID

