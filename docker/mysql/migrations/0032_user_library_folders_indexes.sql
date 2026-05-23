-- ============================================================================
-- 0032: user_library_folders 与 user_library_papers.folder_id 索引
-- ============================================================================

-- folders:按用户聚合 + position 排序(列表渲染热路径)
CALL add_index_if_not_exists(
  'user_library_folders',
  'idx_user_position',
  '`user_id`,`position`',
  FALSE
);

-- papers:按 (user_id, folder_id) 查文件夹内容
CALL add_index_if_not_exists(
  'user_library_papers',
  'idx_user_folder',
  '`user_id`,`folder_id`',
  FALSE
);
