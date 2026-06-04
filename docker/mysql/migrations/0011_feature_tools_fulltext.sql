-- ============================================================================
-- 0011_feature_tools_fulltext.sql — 功能大全搜索:FULLTEXT(ngram) 索引
--
-- 背景: 列表搜索是模糊匹配(优先标题 name/name_en, 其次 tagline/description_md)。
--   数据预期 10W+ 且持续增长。原 `... LIKE '%kw%'` 前置通配符无法走索引 → 全表扫,
--   到几万行就明显变慢。改用 InnoDB FULLTEXT + ngram 解析器(支持中文分词),
--   后端走 MATCH(...) AGAINST(... IN NATURAL LANGUAGE MODE), 命中走倒排索引。
--
--   ft_name    (name, name_en)            —— 标题域(检索权重高)
--   ft_content (tagline, description_md)  —— 内容域
--
-- ngram_token_size 默认 2 → 2 字及以上中文/英文可命中;1 字搜索后端回退 LIKE。
--
-- 幂等: information_schema 守卫, 索引已存在则跳过(避免每次 schema-sync 重建)。
-- 需要 MySQL 5.7+ (ngram parser)。
-- ============================================================================

SET @has_ft_name := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'feature_tools'
    AND INDEX_NAME = 'ft_name'
);
SET @ddl1 := IF(
  @has_ft_name = 0,
  'ALTER TABLE `feature_tools` ADD FULLTEXT INDEX `ft_name` (`name`,`name_en`) WITH PARSER ngram',
  'SELECT 1'
);
PREPARE st1 FROM @ddl1;
EXECUTE st1;
DEALLOCATE PREPARE st1;

SET @has_ft_content := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'feature_tools'
    AND INDEX_NAME = 'ft_content'
);
SET @ddl2 := IF(
  @has_ft_content = 0,
  'ALTER TABLE `feature_tools` ADD FULLTEXT INDEX `ft_content` (`tagline`,`description_md`) WITH PARSER ngram',
  'SELECT 1'
);
PREPARE st2 FROM @ddl2;
EXECUTE st2;
DEALLOCATE PREPARE st2;
