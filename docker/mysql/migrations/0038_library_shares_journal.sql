-- ============================================================================
-- 0038 文献分享支持「期刊分享」
--   期刊是公开/规范实体,分享 token 只需记 journal_id + 分享人(user_id),
--   被分享落地页按 journal_id 实时取期刊详情渲染(分区/影响因子/简介),无需快照。
--   kind='journal' / entity_type='journal';allow_save=0(期刊关注收藏后端未上线)。
-- 幂等:add_column_if_not_exists。
-- ============================================================================

CALL add_column_if_not_exists('library_shares', 'journal_id', "bigint unsigned NULL COMMENT '期刊分享:被分享期刊 id(kind=journal)'");
