-- ============================================================================
-- 0078 · agent_artifacts 加 user_edited —— 科研绘图「无限画布」编辑持久化。
--
-- 背景:sci_draw 的 A 车道产物是 scene-graph(*.fig.json),前端用 React Flow 渲成无限画布,
--   用户可拖拽/改标签/删节点。用户编辑后经 POST /sci_draw/figure/save 把新 scene-graph 落回
--   该产物的 MinIO 对象 + 本行内容列,并置 user_edited=1。
--
-- 作用:scidraw 的收割逻辑(internal/scidraw/artifact.go harvestFile)遇到 user_edited=1 的行
--   直接跳过,**不被 agent 重新产出的版本覆盖**(否则用户的画布编辑会被下一轮 agent 产物冲掉)。
--   claw/boltslides 的收割不读此列(只 scidraw harvest 判),对它们无影响。
--
-- 幂等:add_column_if_not_exists 见列已存在跳过。安全:只加一个带默认值的列,不动数据。
-- ============================================================================

CALL add_column_if_not_exists(
  'agent_artifacts',
  'user_edited',
  'TINYINT(1) NOT NULL DEFAULT 0'
);
