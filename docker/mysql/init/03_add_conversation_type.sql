-- Add conversation_type field to conversations table if it doesn't exist
-- This separates chat conversations from search conversations

-- Check if column exists and add if not
SET @col_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'scholar'
    AND TABLE_NAME = 'conversations'
    AND COLUMN_NAME = 'conversation_type'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE conversations
     ADD COLUMN conversation_type VARCHAR(20) NOT NULL DEFAULT ''search'' COMMENT ''Conversation type: chat or search'' AFTER title,
     ADD INDEX idx_conversation_type (conversation_type),
     ADD INDEX idx_user_type (user_id, conversation_type)',
    'SELECT ''Column conversation_type already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
