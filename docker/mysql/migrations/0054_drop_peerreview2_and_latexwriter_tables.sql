-- ============================================================================
-- 0054: 下线"旧 AI 审稿 v2"与"旧 LaTeX 编辑器" 全套表
--
-- 背景:
--   - 旧 AI 审稿 v2 (internal/peerreview2) 是 v1 之后的过渡版本, 走 peer.scholay.com
--     外部审稿 API。0053 已下线 v1; v2 现在也要让位给新一版 (用 scholar_agent
--     + agentbridge 架构, 走和智能搜索同款的桥接)。
--   - 旧 LaTeX 编辑器 (internal/latexwriter) 是基于自研 MCP tool registry + ai 域
--     ChatCompletionWithTools 的 agent loop, 同理也让位给新一版。
--
--   后端代码侧 (在本 PR 一起提交) 的删除范围:
--     - internal/peerreview2/                  整包
--     - internal/latexwriter/                  整包 (含 agents/ planner/coder/validator)
--     - internal/mcp/                          剩余的 tool provider (latexwriter 是唯一消费者)
--     - 路由 /api/v1/user/peer-review2/*, /api/v1/user/latex-writer/*,
--             /api/v1/admin/latex-agent/*
--     - config.PeerReviewV2 (env 配置块)
--
--   前端代码侧:
--     - features/admin/api/latex-agent.ts + features/admin/pages/LatexAgentPage.tsx
--     - admin nav/routes 中的 'latex-agent' 入口
--     - 保留 features/peer-review/ 和 features/prism/ (是 ComingSoon 占位, 不调任何 API)
--
-- 删除表清单:
--   pr2_anon_trials       AI 审稿 v2 匿名试用额度
--   pr2_conversations     AI 审稿 v2 会话/turn/messages 全部 (jsonb 列存所有结构)
--   latex_agent_config    LaTeX agent 配置 (单行表, 类似 agent_config)
--   latex_agent_models    LaTeX agent 模型列表 (admin 后台维护)
--   latex_chat_messages   LaTeX 对话消息
--   latex_conversations   LaTeX 会话
--   latex_documents       LaTeX 文档主表
--
-- 表之间有 FK (latex_chat_messages → latex_conversations → latex_documents 等),
-- 直接按字母 DROP 会触发 FK 拒绝; 仿 0053 用 SET FOREIGN_KEY_CHECKS=0 一次扫掉。
--
-- ⚠️ 销毁性: 上线前应该 mysqldump 备份。新版功能上线后,旧 LaTeX 文档/审稿任务
-- 不会迁移到新表 (架构差异太大), 用户已知需要重做。
--
-- 幂等: DROP TABLE IF EXISTS, 重放安全。
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `pr2_anon_trials`;
DROP TABLE IF EXISTS `pr2_conversations`;
DROP TABLE IF EXISTS `latex_chat_messages`;
DROP TABLE IF EXISTS `latex_conversations`;
DROP TABLE IF EXISTS `latex_documents`;
DROP TABLE IF EXISTS `latex_agent_models`;
DROP TABLE IF EXISTS `latex_agent_config`;

SET FOREIGN_KEY_CHECKS = 1;
