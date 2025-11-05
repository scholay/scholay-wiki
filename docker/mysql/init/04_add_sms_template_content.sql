-- Add template_content column to sms_configs table
-- This allows storing the actual SMS template text for variable extraction

-- Check if column exists and add if not
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE table_schema = 'scholar'
                   AND table_name = 'sms_configs'
                   AND column_name = 'template_content');

SET @sql = IF(@col_exists = 0,
              'ALTER TABLE `sms_configs` ADD COLUMN `template_content` TEXT NOT NULL COMMENT \'SMS template content with variables like ${code}\' AFTER `template_code`',
              'SELECT \'Column template_content already exists\' as message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
