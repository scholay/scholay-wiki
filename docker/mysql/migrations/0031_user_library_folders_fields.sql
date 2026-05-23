-- ============================================================================
-- 0031: 文献集文件夹 v1
--
-- 模型:**只有一级文件夹**(folders 表不带 parent_id;papers 通过 folder_id
-- 直接挂在文件夹下,folder_id IS NULL 表示「根目录」)。
-- 用户可以把论文放在某个文件夹里,也可以直接放在根目录。文件夹本身不嵌套。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `user_library_folders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户',
  `name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '文件夹名称',
  `position` INT NOT NULL DEFAULT 0 COMMENT '同级排序,越小越靠前',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文献集·一级文件夹(不嵌套)';

-- user_library_papers 增加 folder_id (nullable;NULL = 根目录)
CALL add_column_if_not_exists(
  'user_library_papers',
  'folder_id',
  'BIGINT UNSIGNED NULL DEFAULT NULL COMMENT "所属文件夹 id;NULL 表示根目录"'
);
