// ============================================================================
// agent → backend 内网回调:scholar_agent 上报 token 用量,**一次真实模型调用一行(per-call)**。
//
// 记账口径(钉死,防双计):agent 侧所有 token 都经此端点 per-call 落库:
//   - agent_call: CLI 子进程内每次真实模型调用(主轮 / 子 agent / 上下文压缩),由 claude.ts 上报;
//   - title_gen:  agent server 端直连模型起标题的带外用量(不进 CLI 会话)。
// WS message_complete **不再落库**(改为只供前端 UI 展示整轮用量),故正常轮不经此双计。
//
// agent 只知道 sessionId(无 user 身份),后端用 sessionId 反查 agent_sessions 得到 user/feature,
// 再经 recordAgentTokens(唯一构造点)落统一账本 llm_token_usage(一次调用一行)。
// ============================================================================

package agentbridge

import (
	"log/slog"
	"net/http"

	"scholar-backend/internal/common/safego"

	"github.com/gin-gonic/gin"
)

// agentUsageCallbackBody 是 POST /api/v1/internal/agent/usage 的请求体。
type agentUsageCallbackBody struct {
	SessionID string `json:"sessionId"`
	Kind      string `json:"kind"` // title_gen | compaction | subagent(仅日志/兜底 feature,不影响归属)
	Model     string `json:"model"`
	Usage     struct {
		InputTokens         int `json:"input_tokens"`
		OutputTokens        int `json:"output_tokens"`
		CacheReadTokens     int `json:"cache_read_tokens"`
		CacheCreationTokens int `json:"cache_creation_tokens"`
	} `json:"usage"`
}

// HandleAgentUsageCallback —— scholar_agent 上报带外 token 用量。鉴权见 InternalAgentAuthMiddleware。
// 归属反查不到(会话已 GC/reset)时落 user_id=NULL + feature=kind,只丢 per-user 归属、全局统计仍在;
// **绝不 5xx**(agent 是 fire-and-forget,后端报错对它无意义,反而刷错误日志)。
func (b *Bridge) HandleAgentUsageCallback(c *gin.Context) {
	var body agentUsageCallbackBody
	if err := c.ShouldBindJSON(&body); err != nil || body.SessionID == "" {
		c.Status(http.StatusBadRequest)
		return
	}

	// 记账口径(per-call,防双计):agent 侧 token **一次真实模型调用一行**,全部经此回调落库。
	//   - agent_call: CLI 子进程内每次模型调用(主轮 / 子 agent / 上下文压缩),由 claude.ts 上报;
	//   - title_gen:  agent server 端直连模型起标题的带外用量(不进 CLI 会话)。
	// 仅收这两类;WS message_complete 不再落库(只供前端 UI),故正常轮不会经此双计。
	if body.Kind != "agent_call" && body.Kind != "title_gen" {
		slog.Warn("agent usage callback: ignoring unknown kind",
			"kind", body.Kind, "session_id", body.SessionID)
		c.Status(http.StatusNoContent)
		return
	}

	var uid *uint
	feature := body.Kind // 反查失败时的兜底 feature
	if row, err := b.repo.FindByAgentSessionID(body.SessionID); err == nil && row != nil {
		if row.UserID != 0 {
			u := row.UserID
			uid = &u
		}
		if row.FeatureKey != "" {
			feature = row.FeatureKey // 归到拥有该会话的 feature(title-gen 成本归本功能)
		}
	} else {
		slog.Warn("agent usage callback: unknown session, recording without owner",
			"session_id", body.SessionID, "kind", body.Kind)
	}

	usage := AgentUsage{
		Model:               body.Model,
		InputTokens:         body.Usage.InputTokens,
		OutputTokens:        body.Usage.OutputTokens,
		CacheReadTokens:     body.Usage.CacheReadTokens,
		CacheCreationTokens: body.Usage.CacheCreationTokens,
	}
	// 异步落库,不阻塞回调返回(同 OnMessageComplete 的 safego 风格)。
	uidCopy := uid
	feat := feature
	safego.Go("agent-usage-callback-record", func() {
		recordAgentTokens(b.llmRec, uidCopy, feat, "", usage)
	})
	c.Status(http.StatusNoContent)
}
