-- ============================================================================
-- 0067: feature_prompts + feature_prompt_history 索引
--
-- 查询模式:
--   - Resolve(feature_key, slug)          → uk_feature_slug (主路径, BySlugPicker)
--   - ListByPersona(feature_key, persona) → idx_feature_persona_enabled (peerreview picker)
--   - ListAll(feature_key)                → 同 idx_feature_persona_enabled 前缀也可走
--   - history by prompt_id 倒序           → idx_prompt_version
-- ============================================================================

-- 主键查找路径 (Resolve)
CALL add_index_if_not_exists('feature_prompts', 'uk_feature_slug',
  '`feature_key`, `slug`', TRUE);

-- persona picker 路径 (列出某 feature 某 persona 的 enabled 行)
CALL add_index_if_not_exists('feature_prompts', 'idx_feature_persona_enabled',
  '`feature_key`, `persona`, `enabled`', FALSE);

-- admin 列表按更新时间倒序看
CALL add_index_if_not_exists('feature_prompts', 'idx_feature_updated',
  '`feature_key`, `updated_at` DESC', FALSE);

-- history: 一份 prompt 的版本倒序
CALL add_index_if_not_exists('feature_prompt_history', 'idx_prompt_version',
  '`prompt_id`, `version` DESC', FALSE);
