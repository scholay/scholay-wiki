-- ============================================================================
-- 0027: user_library_papers 索引
-- ============================================================================

-- 唯一键：同一用户 + 同一源 + 同一论文 ID 只保存一行
-- 复合 UNIQUE 已覆盖 user_id + source 的查询路径，无需额外索引
CALL add_index_if_not_exists(
  'user_library_papers',
  'uk_user_source_paper',
  '`user_id`,`source`,`source_paper_id`',
  TRUE
);

-- 列表查询：用户视角按加入时间倒序
CALL add_index_if_not_exists(
  'user_library_papers',
  'idx_user_created_at',
  '`user_id`,`created_at`',
  FALSE
);

-- DOI 反查（后续可能用来做"我收藏过这篇"的跨源去重判断）
CALL add_index_if_not_exists(
  'user_library_papers',
  'idx_user_doi',
  '`user_id`,`doi`',
  FALSE
);
