-- Create conversation_messages table with full LibreChat-style support
-- Uses CREATE TABLE IF NOT EXISTS to preserve existing data

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS `conversation_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` VARCHAR(36) NOT NULL UNIQUE COMMENT 'UUID for message (for message chain linking)',
  `conversation_id` BIGINT UNSIGNED NOT NULL COMMENT 'Conversation ID',
  `parent_message_id` VARCHAR(36) COMMENT 'Parent message ID for building message chain (enables branching)',
  `role` VARCHAR(20) NOT NULL COMMENT 'Message role: user, assistant, system',
  `content` TEXT NOT NULL COMMENT 'Message content',
  `search_query` VARCHAR(500) COMMENT 'Search query if this is a user search message',
  `search_results` JSON COMMENT 'Semantic Scholar search results',
  `search_results_total` INT NOT NULL DEFAULT 0 COMMENT 'Total count of search results from Semantic Scholar',
  `token_count` INT DEFAULT 0 COMMENT 'Token count for this message (for context window management)',
  `model` VARCHAR(50) COMMENT 'AI model used for assistant messages',
  `finish_reason` VARCHAR(20) COMMENT 'Completion reason: stop, length, content_filter, etc.',
  `error` BOOLEAN DEFAULT FALSE COMMENT 'Whether this message encountered an error',
  `unfinished` BOOLEAN DEFAULT FALSE COMMENT 'Whether this message is incomplete (streaming interrupted)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_message_id` (`message_id`),
  INDEX `idx_conversation_id` (`conversation_id`),
  INDEX `idx_parent_message_id` (`parent_message_id`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_conversation_created` (`conversation_id`, `created_at`),
  INDEX `idx_message_chain` (`conversation_id`, `parent_message_id`, `created_at`),
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Messages within conversations with chain support';
