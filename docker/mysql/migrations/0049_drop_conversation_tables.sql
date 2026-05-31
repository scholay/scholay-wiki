-- ============================================================================
-- 0049: 下线对话/智能搜索历史 (与早期 conversation + 智能搜索 v1/v2 互逆)
--
-- 背景:
--   原 backend 的 internal/conversation 模块提供:
--     - 通用 chat 接口 (POST /user/conversations/chat/*)
--     - 智能搜索流式接口 (GET /user/conversations/:id/messages/:mid/advanced-search)
--     - 多轮续聊 (POST /user/conversations/:id/continue)
--     - follow-up questions 缓存
--   配套表 conversations + conversation_messages 存对话标题、消息树 (parent_id 分支)、
--   搜索结果 paper id 列表、follow_up_questions。
--
--   新版智能搜索改成 backend 桥接 scholar_agent 容器,会话/历史落在 agent 容器自身的
--   /home/bun/.claude/projects/ (JSONL),不再走 DB。所以这两张表彻底下线。
--
-- 配套删除(代码侧,迁移外):
--   backend/internal/conversation/                  整个模块
--   backend/internal/ai/prompts/advanced_search.go  旧 system prompt
--   backend/cmd/server/bootstrap_ai.go              移除 conversation/chat 构造
--   backend/cmd/server/routes_user.go               移除全部 /user/conversations/* 路由
--   backend/cmd/server/adapters.go                  移除 conversationQueryAdapter
--   backend/cmd/server/bootstrap.go                 移除 SetConversationQueryService 注入
--   backend/internal/user/handler.go                移除 ConversationQueryService 接口
--
-- 幂等: DROP TABLE IF EXISTS,重放安全。
-- ============================================================================

DROP TABLE IF EXISTS `conversation_messages`;
DROP TABLE IF EXISTS `conversations`;
