-- Migration: Add search_results_total field to conversation_messages table
-- This field stores the total count of search results from Semantic Scholar API
-- Note: This migration is idempotent-safe via check-schema.sh script

-- Check if column exists before adding
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'conversation_messages'
  AND COLUMN_NAME = 'search_results_total';

SET @query = IF(@col_exists = 0,
  'ALTER TABLE `conversation_messages` ADD COLUMN `search_results_total` INT NOT NULL DEFAULT 0 COMMENT ''Total count of search results from Semantic Scholar'' AFTER `search_results`',
  'SELECT ''Column search_results_total already exists'' AS message');

PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
