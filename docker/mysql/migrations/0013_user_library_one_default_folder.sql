-- ============================================================================
-- 0013: 文献集「默认文件夹」唯一性 —— 修复「一个用户出现多个默认文件夹」的 bug
--
-- 根因:library.ensureDefaultFolder 是 read-then-create 的 lazy 创建,其「并发兜底」
-- (Create 失败再读一次)本就**依赖一个唯一约束**让第二个并发 Create 失败 —— 但该约束
-- 一直缺失。首次进文献集时,前端并发拉「文件夹列表」和「论文列表」,两个请求各自
-- ensureDefaultFolder 都读到「无默认」→ 各建一个 → 用户看到两个「默认文件夹」。
--
-- 本迁移:
--   ① 合并已存在的重复默认文件夹:把多余默认文件夹里的论文迁回该用户保留的那个
--      (每用户保留 id 最小的),再删掉多余的。
--   ② 加生成列 default_anchor = IF(is_default, user_id, NULL) + 唯一索引,
--      保证「每个用户至多一个默认文件夹」。NULL 不参与唯一,普通(非默认)文件夹不受影响。
-- 约束加上后,handler.go 里既有的「Create 失败 → 再读兜底」逻辑即自动生效,无需改 Go。
--
-- 幂等:无重复时 ①为 no-op;②列/索引已存在则 add_*_if_not_exists 跳过。
-- ============================================================================

-- ① 多余默认文件夹里的论文 → 迁到该用户保留的默认文件夹(每用户 min(id))
UPDATE user_library_papers p
JOIN user_library_folders extra
  ON p.folder_id = extra.id AND extra.is_default = 1
JOIN (
  SELECT user_id, MIN(id) AS keep_id
  FROM user_library_folders
  WHERE is_default = 1
  GROUP BY user_id
) k ON k.user_id = extra.user_id
SET p.folder_id = k.keep_id
WHERE extra.id <> k.keep_id;

-- ② 删除多余的默认文件夹(只保留每用户 id 最小的那个)
DELETE extra FROM user_library_folders extra
JOIN (
  SELECT user_id, MIN(id) AS keep_id
  FROM user_library_folders
  WHERE is_default = 1
  GROUP BY user_id
) k ON k.user_id = extra.user_id
WHERE extra.is_default = 1 AND extra.id <> k.keep_id;

-- ③ 生成列:默认文件夹取 user_id,其余为 NULL(STORED 便于建唯一索引)
CALL add_column_if_not_exists(
  'user_library_folders',
  'default_anchor',
  'BIGINT UNSIGNED GENERATED ALWAYS AS (IF(is_default, user_id, NULL)) STORED'
);

-- ④ 唯一索引:每用户至多一个默认文件夹(default_anchor 为 NULL 的普通文件夹可重复)
CALL add_index_if_not_exists(
  'user_library_folders',
  'uk_one_default_per_user',
  'default_anchor',
  TRUE
);
