-- ============================================================================
-- 0053: 下线旧版"智能搜索 / 同行审稿" 配套表
--
-- 背景:
--   旧版智能搜索是自研 MCP server + 提示词驱动 LLM + 自动判断的循环, 已被
--   scholar_agent (cc-haha) + agentbridge 取代 (见 migration 0051)。
--   旧 peer-review (基于 mcp.NewMCPServer 的提示词调用) 也一并下线。
--
--   后端代码侧的删除范围:
--     - internal/mcp/                          整个包(MCP HTTP + 工具注册)
--     - internal/semanticscholar/              整个包(只被旧 mcp/ 引用)
--     - internal/peerreview/                   整个包(基于旧 mcp.NewMCPServer)
--     - internal/ai/service_chat.go            "对话"残骸 (wechatofficial 改写)
--     - 路由 /api/v1/mcp/*, /mcp-legacy/*, /user/peer-review (v1)
--
--   注: Matrix 多维分析 (paper_analysis / analysis_dimensions) 原本在本批次
--   一起删, 后来 Matrix 功能恢复, 故这两张表从删除清单移出, 由 0001/0003/0030
--   /0034/0035 幂等重建 + 重新 seed。本次重启时数据会丢一次 (历史 ~1200 行
--   analysis + 22 个 dimension), 已与用户对齐"接受数据丢失,代码恢复"。
--
-- 本迁移只负责表层面的真删除, 代码侧的删除在 PR 一起提交。
--
-- 删除表清单:
--   conversation_summaries   旧对话摘要缓存 (无代码消费)
--   peer_review_tasks        旧 peer-review 任务表
--   peer_review_results      旧 peer-review 三视角审稿结果
--   peer_review_files        旧 peer-review 上传文件
--   peer_review_anon_trials  旧 peer-review 匿名试用配额
--
-- ⚠️ 销毁性操作: 上线前应该 mysqldump 备份, 之后任何运维需要回滚都得从备份找;
-- migration 系统本身没有 down/rollback。
--
-- 幂等: DROP TABLE IF EXISTS, 重放安全 (后续重启 schema-sync 时不会报错)。
-- ============================================================================

-- peer_review_* 之间互相有 FK (fk_pr_task_manuscript 等), 单纯按字母序 DROP 会被拒。
-- 关闭一下 FOREIGN_KEY_CHECKS 把整组一次性扔掉; SESSION 级关闭, 当前迁移结束自动恢复。
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `peer_review_anon_trials`;
DROP TABLE IF EXISTS `peer_review_files`;
DROP TABLE IF EXISTS `peer_review_results`;
DROP TABLE IF EXISTS `peer_review_tasks`;
DROP TABLE IF EXISTS `conversation_summaries`;

SET FOREIGN_KEY_CHECKS = 1;
