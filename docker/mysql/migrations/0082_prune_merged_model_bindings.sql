-- 0082_prune_merged_model_bindings.sql
-- 精简能力绑定闭集(2026-07):把「制作PPT / 科研绘图 / 审稿子阶段 / 写作内部子任务 / 免费档覆盖」
-- 从 admin 可配的绑定里下线,统一经代码里的 purposeAlias 归到主 purpose。
--
--   chat_default.boltslides   → chat_default.claw   (制作PPT → 智能助手默认)
--   chat_default.sci_draw     → chat_default.claw   (科研绘图 → 智能助手默认;注:从 qwen 视觉模型降级到 flash)
--   peerreview.letter         → peerreview.meta      (信件起草 → 预填识别,合并)
--   peerreview.scoring/chief  → peerreview.methodology(审稿人盲评 / 主审 → 审稿环节,合并)
--   prism.planner             → chat_default.prism   (写作画像 → 智能写作默认)
--   project.revision          → chat_default.prism   (修改意见拆条 → 智能写作默认)
--   chat_default.*.free       → 主绑定               (免费档覆盖整套下线,不再区分免费/付费档)
--
-- 这里删除这些 purpose 在 agent_model_bindings 里的存量行 —— 删除后运行时 Resolve() 经 purposeAlias
-- 归到主 purpose 取值,行为等价(除 sci_draw 按产品决定从 qwen 改走 claw 的 flash)。
-- 幂等:DELETE ... WHERE IN 重放无副作用(行已删则 0 行受影响)。绝不 DROP 表。

DELETE FROM agent_model_bindings
WHERE purpose IN (
  'chat_default.boltslides',
  'chat_default.sci_draw',
  'peerreview.letter',
  'peerreview.scoring',
  'peerreview.chief',
  'prism.planner',
  'project.revision',
  -- 免费档覆盖(历史上从未写入 DB,一并列出以防存量环境残留)
  'chat_default.smart_search.free',
  'chat_default.claw.free',
  'chat_default.prism.free',
  'chat_default.boltslides.free',
  'chat_default.sci_draw.free'
);
