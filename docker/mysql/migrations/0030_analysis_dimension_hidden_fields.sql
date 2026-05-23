-- ============================================================================
-- 0030: analysis_dimensions 新增 is_hidden 字段(隐藏 vs 启用 解耦)
--
-- 既有 is_active 表示「维度是否启用(用于分析)」,但用户在 UI 上的"隐藏"诉求
-- 语义不同 —— 用户想暂时不显示某列,但不一定想停掉该维度的分析配置。
-- 拆开两个字段后:
--   is_active = 维度本身是否有效
--   is_hidden = 用户主动隐藏 / 在矩阵 UI 不展示
--
-- 关键策略:**隐藏系统维度走「创建用户 override + is_hidden=true」**,
-- 不修改系统行(user_id=-1 始终不可变),与 name/description 自定义同款。
-- ============================================================================

CALL add_column_if_not_exists(
  'analysis_dimensions',
  'is_hidden',
  'TINYINT(1) NOT NULL DEFAULT 0 COMMENT "用户隐藏:1=隐藏(矩阵不展示),仅对 user_id>0 的 override 有效"'
);
