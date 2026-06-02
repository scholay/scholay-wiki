// ============================================================================
// llmusage.Service —— 统一 LLM token 账本的中央记录器。
//
// 两条路都喂它(都异步、best-effort、绝不阻塞请求):
//   - 项目侧 internal/ai 的咽喉点 executeWithRetry(读响应 Usage 后调 Record)
//   - agent 侧 agentbridge OnMessageComplete(WS)+ ServerSideChatStreaming(peerreview)
//
// 项目侧的 feature/user/request_id 通过 context.Context 携带(WithCall),
// 这样 executeWithRetry 不必改每个调用签名就能拿到归属信息。
// ============================================================================

package llmusage

import (
	"context"
	"log/slog"

	"scholar-backend/internal/common/safego"
)

// Usage —— Record 的入参(一次 LLM 调用的用量 + 归属)。
type Usage struct {
	UserID              *uint  // nil = 公众号 / 匿名
	Feature             string // 必填(取 Feature* 常量)
	Source              string // 必填: SourceProject | SourceAgent
	Provider            string
	AccountID           *uint
	Model               string
	InputTokens         int
	OutputTokens        int
	TotalTokens         int
	CacheReadTokens     int
	CacheCreationTokens int
	RequestID           string
}

// Recorder 业务依赖的最小接口 —— Service 实现, bootstrap 注入。
type Recorder interface {
	Record(u Usage)
}

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// Record 异步写一行账本(safego 带 recover; 单条 INSERT 失败仅 Warn, 不阻塞业务)。
// feature 缺省 → "unknown" + Warn, 让漏埋点可见。total 缺省时用 input+output 兜底(agent 不吐 total)。
func (s *Service) Record(u Usage) {
	if s == nil {
		return
	}
	if u.Feature == "" {
		u.Feature = "unknown"
		slog.Warn("llmusage: record with empty feature", "source", u.Source, "model", u.Model)
	}
	if u.TotalTokens == 0 && (u.InputTokens > 0 || u.OutputTokens > 0) {
		u.TotalTokens = u.InputTokens + u.OutputTokens
	}
	safego.Go("llmusage:"+u.Feature, func() {
		row := &LLMTokenUsage{
			UserID:              u.UserID,
			Feature:             u.Feature,
			Source:              u.Source,
			Provider:            u.Provider,
			AccountID:           u.AccountID,
			Model:               u.Model,
			InputTokens:         u.InputTokens,
			OutputTokens:        u.OutputTokens,
			TotalTokens:         u.TotalTokens,
			CacheReadTokens:     u.CacheReadTokens,
			CacheCreationTokens: u.CacheCreationTokens,
			RequestID:           u.RequestID,
		}
		if err := s.repo.Create(row); err != nil {
			slog.Warn("llmusage: record failed",
				"feature", u.Feature, "source", u.Source, "model", u.Model, "err", err)
		}
	})
}

// ─── ctx 携带调用归属(项目侧 internal/ai 用)──────────────────────────────
//
// 项目侧 100% 的 LLM 调用都过 executeWithRetry, 但它不知道"这次是哪个 feature、哪个用户"。
// 入口 handler 用 WithCall 把这些塞进 ctx, executeWithRetry 用 CallFromCtx 通用读出, 不必改每个签名。

// Call —— ctx 携带的调用归属信息。
type Call struct {
	Feature   string
	UserID    *uint
	RequestID string
}

type callKey struct{}

// WithCall 把调用归属塞进 ctx。入口(translate/matrix/wechat_oa handler 或 service)调一次。
func WithCall(ctx context.Context, c Call) context.Context {
	return context.WithValue(ctx, callKey{}, c)
}

// CallFromCtx 取出调用归属;没有则返回零值 Call(executeWithRetry 据此降级 feature="unknown")。
func CallFromCtx(ctx context.Context) Call {
	if ctx == nil {
		return Call{}
	}
	c, _ := ctx.Value(callKey{}).(Call)
	return c
}
