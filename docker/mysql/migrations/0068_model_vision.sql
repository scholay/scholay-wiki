-- 0068: 模型目录加 vision(视觉/识图)能力列 —— P2 图片通道(2026-07 输入框统一)。
-- 用途:①hub 随模型帧下发 vision,executor 发请求时按当前模型能力过滤历史里的 image 块
-- (否则会话中途切回无视觉模型(DeepSeek)时,历史图块直接打上游 400);②前端按会话模型
-- 能力启停「上传图片」入口;③admin 表单勾选维护。
-- 幂等:add_column_if_not_exists;never DROP。种子模型默认 0(DeepSeek 系无视觉),
-- gpt-4o-mini 等有视觉模型由 owner 在后台勾选。

CALL add_column_if_not_exists('agent_models', 'vision',
  'TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''视觉能力:1=支持图片输入(vision),0=纯文本''');
