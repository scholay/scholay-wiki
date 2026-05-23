-- ============================================================================
-- 0033: 文献集默认文件夹
--
-- 改动:
--   1) user_library_folders 加 is_default 标记 "系统默认文件夹"
--      每个用户最多一个 is_default=1 的文件夹,系统级,不可删/不可改名
--   2) 收藏论文若不指定 folder_id,后端会自动塞默认文件夹
--      不再有"根目录"放论文的概念
--   3) 旧的根目录论文(folder_id IS NULL)按产品决策直接清理
--      (用户已知:本地数据少,迁移不划算,直接清掉重新收藏)
-- ============================================================================

CALL add_column_if_not_exists(
  'user_library_folders',
  'is_default',
  'TINYINT(1) NOT NULL DEFAULT 0 COMMENT "系统默认文件夹(每用户至多 1 个,不可删/不可改名)"'
);

-- 清理所有 folder_id IS NULL 的论文(产品决策:不迁移)
DELETE FROM `user_library_papers` WHERE `folder_id` IS NULL;
