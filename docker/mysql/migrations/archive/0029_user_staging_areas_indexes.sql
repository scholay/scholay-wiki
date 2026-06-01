-- ============================================================================
-- 0029: user_staging_areas / user_staging_area_papers 索引
-- ============================================================================

-- user_staging_areas: 按用户聚合，是最常见的查询路径
CALL add_index_if_not_exists(
  'user_staging_areas',
  'idx_user_position',
  '`user_id`,`position`',
  FALSE
);

-- user_staging_area_papers: 区内按 (source, paper) 去重 —— 同一区不能重复加同一篇
CALL add_index_if_not_exists(
  'user_staging_area_papers',
  'uk_area_source_paper',
  '`area_id`,`source`,`source_paper_id`',
  TRUE
);

-- 列表读取：按区 + 加入顺序
CALL add_index_if_not_exists(
  'user_staging_area_papers',
  'idx_area_position',
  '`area_id`,`position`',
  FALSE
);

-- 用户视角聚合（删账号 / 清空数据时按 user_id 一把抓）
CALL add_index_if_not_exists(
  'user_staging_area_papers',
  'idx_user_id',
  '`user_id`',
  FALSE
);
