// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/llmusage"
)

// ghostCleanupDelay 是 reset 流程中 "二次 DELETE" 的等待时间。
// 背景见 smartsearch v1 的同名常量: scholar_agent 在 WS 流结束后会异步把 last-prompt
// flush 回 jsonl, 第一次 DELETE 可能赶不上; 等 ~250ms 再删一次能擦掉 cache 残骸。
const ghostCleanupDelay = 250 * time.Millisecond

// Bridge 是 agent 桥接的总入口, 持有 agent HTTP 客户端 + 通用 repository。
//
// 实例由 bootstrap 构造一份, 跨 feature 共享; feature 通过 Bridge.For(spec) 拿到
// 与自己 feature 绑定的 FeatureBridge。
type Bridge struct {
	client *agent.Client
	repo   *Repository

	// activeWSConns 跟踪每个 (user, feature) 当前活跃的 WS 连接, 用于"多窗口接管"
	// 体验: 新窗口建 WS 时, 先把老 WS 发一帧 displaced 通知再 Close, 让前端 banner
	// 提示用户"此会话已在其他窗口打开"。
	//
	// key 形如 "smart_search:42"; value 是 *displacedConn。同 (user, feature) 永远只
	// 保留一条 active 记录。
	//
	// 注意: 这是 process-local 状态, 多实例部署时只在同一实例命中。这是 by design —
	// 方案 A 是 "best-effort 提示, 不是强互斥"; 跨实例真互斥需 Redis 锁 (方案 B,
	// 暂不实施)。生产用单实例 backend 时此实现等效真互斥。
	activeWSConns sync.Map

	// llmRec 统一 LLM token 账本录入器 (允许 nil = 不记账)。
	// server-side chat (peerreview) 在 ServerSideChatStreaming 内部用它落一行账本,
	// 调用方 (5 个 peerreview 调用点) 无法漏记。WS 路 (smart_search/claw) 不走这里 ——
	// 它们各自在 spec.OnMessageComplete 落库 (见 hooks.NewDBUsageRecorder)。
	llmRec llmusage.Recorder
}

// New 装配 Bridge。client 由 agent.LoadFromEnv() 构造, repo 由 NewRepository(db) 构造。
func New(client *agent.Client, repo *Repository) *Bridge {
	return &Bridge{client: client, repo: repo}
}

// SetLLMUsageRecorder 注入统一 LLM token 账本录入器 (server-side chat 用)。
// bootstrap 调用一次; nil = 不记账。
func (b *Bridge) SetLLMUsageRecorder(r llmusage.Recorder) {
	b.llmRec = r
}

// displacementKey 拼 activeWSConns 的 key, 二维寻址 (feature, user)。
func displacementKey(featureKey string, userID uint) string {
	return featureKey + ":" + strconv.FormatUint(uint64(userID), 10)
}

// registerAndDisplaceOldWS 把新 WS 注册进 activeWSConns, 并把同 key 的旧 WS
// (如有) 发 displaced 帧后 Close。返回一个 cleanup 函数, caller 必须 defer 调用
// (在 WS pipe 退出后) 把自己从 map 摘掉。
//
// 注意: 摘掉只会摘"还是我"的情况; 如果中途又有更新的 WS 把我替换了, 不会误删。
func (b *Bridge) registerAndDisplaceOldWS(featureKey string, userID uint, newConn *displacedConn) func() {
	key := displacementKey(featureKey, userID)
	if prev, loaded := b.activeWSConns.Swap(key, newConn); loaded {
		if old, ok := prev.(*displacedConn); ok {
			// 异步 displace, 不阻塞新 WS 建联流程。失败也只是老 WS 没收到通知,
			// 不影响新 WS 工作 — 老 WS 下一次 read deadline 到了会自然超时退出。
			safego.Go("agentbridge-ws-displace:"+featureKey, old.displace)
		}
	}
	return func() {
		b.activeWSConns.CompareAndDelete(key, newConn)
	}
}

// For 返回一个绑定到指定 FeatureSpec 的视图。
// FeatureBridge 是值类型, 内部持有指针, 复制开销可忽略 (可以放心传值)。
func (b *Bridge) For(spec FeatureSpec) *FeatureBridge {
	return &FeatureBridge{bridge: b, spec: spec}
}

// Client 暴露底层 agent.Client, 适用于 bootstrap 阶段需要直接对接的极少数场景
// (例如 UpsertSkill / Health)。业务侧不应直接持有它, 走 FeatureBridge 即可。
func (b *Bridge) Client() *agent.Client { return b.client }

// FeatureBridge 是绑定某个 FeatureSpec 后的 bridge 视图。所有方法都自动用 spec.Key
// 做 (user, feature) 寻址, feature 模块零样板。
type FeatureBridge struct {
	bridge *Bridge
	spec   FeatureSpec
}

// Spec 返回绑定的 FeatureSpec (WS bridge 内部要用; feature 模块通常用不到)。
func (f *FeatureBridge) Spec() FeatureSpec { return f.spec }

// AgentClient 暴露底层 agent.Client, 适用于 feature 在 server 端自驱动
// (POST chat → poll status → fetch messages) 的场景, 例如 peer review 的
// 后台 4 轮串行编排。普通对话场景应该走 WebSocket 桥接, 不需要直接持有 client。
func (f *FeatureBridge) AgentClient() *agent.Client { return f.bridge.client }

// Bridge 暴露父 Bridge, 让 feature 可以调用 ServerSideChat 等 backend-driven 方法。
func (f *FeatureBridge) Bridge() *Bridge { return f.bridge }

// SessionMessagesResult 是 GetSessionMessages 的返回包装, 把 sessionId 一并带回,
// 让前端拿一份 payload 就能既建 WS 又渲染历史。
type SessionMessagesResult struct {
	SessionID string                 `json:"sessionId"`
	Messages  []agent.SessionMessage `json:"messages"`
}

// GetOrCreateSession 进入 feature 页时调 — 拿当前 (user, feature) 的 agent_session_id,
// 没有就新建并写库。
//
// 如果 DB 里有 mapping 但 agent 端 jsonl 已经被运维或清理掉, 后续接口 (GetSessionMessages
// / GetContextEstimate / WS dial) 会在拿到 404 时显式 recreate 自愈, 避免本接口
// 多发一次往返做探活。
func (f *FeatureBridge) GetOrCreateSession(ctx context.Context, userID uint) (string, error) {
	row, err := f.bridge.repo.Get(userID, f.spec.Key)
	switch {
	case err == nil:
		return row.AgentSessionID, nil
	case errors.Is(err, ErrNotFound):
		return f.createAndPersist(ctx, userID)
	default:
		return "", fmt.Errorf("get session mapping: %w", err)
	}
}

// ResetSession 删旧 + 建新 + 改 DB。旧 sessionId 在 agent 端 404 视为已删, 不算错。
// 顺序: 先建新 → 改 DB → (DB 失败则回滚新建) → 删旧 → 异步 ghost cleanup。
// 这样用户拿到的新 sessionId 永远是可用的, 任何中间失败都不会让 mapping 指向失效行。
func (f *FeatureBridge) ResetSession(ctx context.Context, userID uint) (string, error) {
	row, err := f.bridge.repo.Get(userID, f.spec.Key)
	switch {
	case errors.Is(err, ErrNotFound):
		return f.createAndPersist(ctx, userID)
	case err != nil:
		return "", fmt.Errorf("get session mapping: %w", err)
	}

	oldSessionID := row.AgentSessionID

	created, err := f.bridge.client.CreateSession(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("create new agent session: %w", err)
	}
	newSessionID := created.SessionID

	if err := f.bridge.repo.UpdateSessionID(userID, f.spec.Key, newSessionID); err != nil {
		slog.Error("agentbridge reset: DB update failed, cleaning up new session",
			"feature", f.spec.Key, "user_id", userID,
			"new_session_id", newSessionID, "err", err)
		if delErr := f.bridge.client.DeleteSession(ctx, newSessionID); delErr != nil {
			slog.Warn("agentbridge reset: cleanup new session also failed",
				"session_id", newSessionID, "err", delErr)
		}
		return "", fmt.Errorf("update session mapping: %w", err)
	}

	if oldSessionID != "" {
		slog.Info("agentbridge reset: deleting old session",
			"feature", f.spec.Key, "user_id", userID, "old_session_id", oldSessionID)
		delErr := f.bridge.client.DeleteSession(ctx, oldSessionID)
		switch {
		case delErr == nil:
			slog.Info("agentbridge reset: old session deleted",
				"feature", f.spec.Key, "user_id", userID, "old_session_id", oldSessionID)
		case errors.Is(delErr, agent.ErrSessionNotFound):
			slog.Info("agentbridge reset: old session already gone (404)",
				"feature", f.spec.Key, "user_id", userID, "old_session_id", oldSessionID)
		default:
			slog.Warn("agentbridge reset: delete old session failed (best-effort)",
				"feature", f.spec.Key, "user_id", userID,
				"old_session_id", oldSessionID, "err", delErr)
		}

		// 二次清理: agent 在 WS 关闭后异步 flush 一份 last-prompt cache, 等 ~250ms 再删。
		go f.cleanupGhostCache(oldSessionID, userID)
	}

	slog.Info("agentbridge reset: session swapped",
		"feature", f.spec.Key, "user_id", userID, "old", oldSessionID, "new", newSessionID)
	return newSessionID, nil
}

// GetSessionMessages 拉历史消息; agent 端 404 时清旧 mapping + 重建空 session。
func (f *FeatureBridge) GetSessionMessages(ctx context.Context, userID uint) (*SessionMessagesResult, error) {
	sessionID, err := f.GetOrCreateSession(ctx, userID)
	if err != nil {
		return nil, err
	}
	msgs, err := f.bridge.client.GetSessionMessages(ctx, sessionID)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			newID, createErr := f.recreate(ctx, userID)
			if createErr != nil {
				return nil, createErr
			}
			return &SessionMessagesResult{SessionID: newID, Messages: nil}, nil
		}
		return nil, fmt.Errorf("agent get messages: %w", err)
	}
	return &SessionMessagesResult{SessionID: sessionID, Messages: msgs.Messages}, nil
}

// GetSessionMessagesByID 拉指定 sessionID 的历史 (多会话场景: 用户在侧边栏选了某 session,
// 前端应当显式带 sessionID 而不是依赖 "latest active" 隐式选择, 避免切换中 race)。
//
// 鉴权: 强制 OwnsSession 检查, 防止越权读他人 session。
// agent 端 404: 不自愈 (跟 GetSessionMessages 的"自动重建空 session"不同) —
// 用户特意指定了一个 sessionId, 它真不存在时直接报 ErrNotFound 让前端 toast 提示,
// 不应该静默换一个新 session 让用户困惑。
func (f *FeatureBridge) GetSessionMessagesByID(ctx context.Context, userID uint, sessionID string) (*SessionMessagesResult, error) {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return nil, ErrNotFound
	}
	msgs, err := f.bridge.client.GetSessionMessages(ctx, sessionID)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			// agent 端确实没有 (孤儿 DB 行) → 顺手清 DB row 防止下次列表里又出现
			if delErr := f.bridge.repo.DeleteByAgentSessionID(userID, f.spec.Key, sessionID); delErr != nil {
				slog.Warn("agentbridge GetSessionMessagesByID: cleanup orphan failed",
					"feature", f.spec.Key, "user_id", userID, "session_id", sessionID, "err", delErr)
			}
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("agent get messages: %w", err)
	}
	return &SessionMessagesResult{SessionID: sessionID, Messages: msgs.Messages}, nil
}

// GetContextEstimate 透传上下文水位; 会话还没说过话时 agent 返回空 contextEstimate,
// 这里以 (nil, sessionID, nil) 返回, 上层渲染成 0/maxTokens。agent 404 时同样自愈。
func (f *FeatureBridge) GetContextEstimate(ctx context.Context, userID uint) (*agent.SessionContextEstimate, string, error) {
	sessionID, err := f.GetOrCreateSession(ctx, userID)
	if err != nil {
		return nil, "", err
	}
	est, err := f.bridge.client.GetSessionContextEstimate(ctx, sessionID)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			newID, createErr := f.recreate(ctx, userID)
			if createErr != nil {
				return nil, "", createErr
			}
			return nil, newID, nil
		}
		return nil, sessionID, fmt.Errorf("agent get context estimate: %w", err)
	}
	return est, sessionID, nil
}

// GetContextEstimateByID — 多会话场景: 显式 sessionID 查上下文水位。鉴权同 GetSessionMessagesByID。
func (f *FeatureBridge) GetContextEstimateByID(ctx context.Context, userID uint, sessionID string) (*agent.SessionContextEstimate, error) {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return nil, ErrNotFound
	}
	est, err := f.bridge.client.GetSessionContextEstimate(ctx, sessionID)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("agent get context estimate: %w", err)
	}
	return est, nil
}

// SessionAlreadyHasUserMessage 探测 agent transcript 里是否已有过 user entry。
// WS 升级时用于决定要不要注入 system prompt prefix:
//   - 首次开会话 → transcript 空 → false → 注入
//   - 之后刷新/重连 → 已注入过 → true → 跳过 (避免每次都污染 transcript)
//
// 网络失败时返回 (false, err), caller 自行选择: 当前 WS bridge 兜底为"未注入",
// 多注入一次的代价小于完全跳过 (会导致主 agent 退回 Bash/Read 死循环)。
func (f *FeatureBridge) SessionAlreadyHasUserMessage(ctx context.Context, sessionID string) (bool, error) {
	if sessionID == "" {
		return false, nil
	}
	msgs, err := f.bridge.client.GetSessionMessages(ctx, sessionID)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			return false, nil
		}
		return false, fmt.Errorf("agent get messages: %w", err)
	}
	for _, m := range msgs.Messages {
		if m.Type == "user" {
			return true, nil
		}
	}
	return false, nil
}

// OwnsSession 校验 sessionId 是否归当前 (user, feature) 所有。
// WS 升级前必须调一次, 防止用户拿到别人的 sessionId 偷拉历史。
//
// 多会话 (claw) 场景下, 同 (user, feature) 可有多行 row, 任一 row 的 agent_session_id
// 命中即视为 ownership 成立。单会话 (smart_search) 场景退化为单行匹配。
func (f *FeatureBridge) OwnsSession(userID uint, sessionID string) (bool, error) {
	if sessionID == "" {
		return false, nil
	}
	row, err := f.bridge.repo.GetByAgentSessionID(userID, f.spec.Key, sessionID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return row != nil && row.AgentSessionID == sessionID, nil
}

// ─── 多会话 API (claw 用; smart_search 不调这些, 沿用 GetOrCreateSession / ResetSession) ────

// SessionListItem 是 ListSessions 返回的一项 — DB mapping + agent transcript 元数据合并。
//
// Title / MessageCount / ModifiedAt 来自 agent /api/sessions; 若 agent 端找不到此
// sessionId (DB 孤儿) 则字段为零值, caller 仍能看到, 一般会触发"自愈删除孤儿"路径。
type SessionListItem struct {
	SessionID      string    `json:"sessionId"`
	Title          string    `json:"title"`
	MessageCount   int       `json:"messageCount"`
	LastAccessedAt time.Time `json:"lastAccessedAt"`
	CreatedAt      time.Time `json:"createdAt"`
	// agent 端如果探不到 (孤儿), 这两个会是 zero
	AgentCreatedAt  string `json:"agentCreatedAt,omitempty"`
	AgentModifiedAt string `json:"agentModifiedAt,omitempty"`
}

// ListSessions 列出 (user, feature) 下的全部 agent session, 按 last_accessed_at DESC 排序。
//
// 实现: DB.ListByUserFeature → 拿到该用户的 sessionId 集合 → agent.ListSessions
// 拉全量 (含 title/messageCount) → 按 sessionId 做 left-join → 返回。
//
// agent 端不存在的 DB 行 (孤儿) 不会自动清理 — 让 caller 看到 messageCount=0 / title=""
// 的项, 用户可以选择删除。这避免列表查询时偷偷删数据。
func (f *FeatureBridge) ListSessions(ctx context.Context, userID uint) ([]SessionListItem, error) {
	rows, err := f.bridge.repo.ListByUserFeature(userID, f.spec.Key)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	if len(rows) == 0 {
		return []SessionListItem{}, nil
	}

	// 拉 agent 全量 (TODO: agent 加 ids 过滤后改用)
	agentList, agentErr := f.bridge.client.ListSessions(ctx, nil)
	// agent 拉失败不致命: 仍返 DB 行, title/messageCount 留空
	agentByID := make(map[string]agent.SessionSummary)
	if agentErr == nil && agentList != nil {
		for _, s := range agentList.Sessions {
			agentByID[s.ID] = s
		}
	} else if agentErr != nil {
		slog.Warn("agentbridge ListSessions: agent list failed, returning DB-only view",
			"feature", f.spec.Key, "user_id", userID, "err", agentErr)
	}

	out := make([]SessionListItem, 0, len(rows))
	for _, r := range rows {
		item := SessionListItem{
			SessionID:      r.AgentSessionID,
			LastAccessedAt: r.LastAccessedAt,
			CreatedAt:      r.CreatedAt,
		}
		if meta, ok := agentByID[r.AgentSessionID]; ok {
			item.Title = meta.Title
			item.MessageCount = meta.MessageCount
			item.AgentCreatedAt = meta.CreatedAt
			item.AgentModifiedAt = meta.ModifiedAt
		}
		out = append(out, item)
	}
	return out, nil
}

// CreateNewSession 给 (user, feature) **新建** 一条 session, 不删任何已有 session。
//
// 用法对比:
//   - 单会话 (smart_search): 不调这个; 用 GetOrCreateSession (已有就复用) 或
//     ResetSession (删旧 + 建新)
//   - 多会话 (claw): 用户点"新对话"按钮调这个, 老 session 保留在历史列表中可访问
//
// 返回新建的 agent_session_id; DB mapping 一并写入, last_accessed_at = NOW 让新
// session 自动成为"当前活跃"。
func (f *FeatureBridge) CreateNewSession(ctx context.Context, userID uint) (string, error) {
	created, err := f.bridge.client.CreateSession(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("create agent session: %w", err)
	}
	row := &SessionRow{
		UserID:         userID,
		FeatureKey:     f.spec.Key,
		AgentSessionID: created.SessionID,
		LastAccessedAt: time.Now(),
	}
	if err := f.bridge.repo.Create(row); err != nil {
		// 写 DB 失败 → 回滚 agent 端 session, 避免孤儿
		slog.Error("agentbridge CreateNewSession: DB insert failed, rolling back agent session",
			"feature", f.spec.Key, "user_id", userID, "session_id", created.SessionID, "err", err)
		if delErr := f.bridge.client.DeleteSession(ctx, created.SessionID); delErr != nil {
			slog.Warn("agentbridge CreateNewSession: agent rollback failed", "err", delErr)
		}
		return "", fmt.Errorf("persist session mapping: %w", err)
	}
	slog.Info("agentbridge CreateNewSession: session created",
		"feature", f.spec.Key, "user_id", userID, "session_id", created.SessionID)
	return created.SessionID, nil
}

// RenameSession 改 session 标题 (透传 agent PATCH /api/sessions/:id)。
// 必须先 OwnsSession 鉴权, 防止改别人的 session 标题。
func (f *FeatureBridge) RenameSession(ctx context.Context, userID uint, sessionID, title string) error {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return ErrNotFound
	}
	if err := f.bridge.client.PatchSession(ctx, sessionID, title); err != nil {
		return fmt.Errorf("agent rename: %w", err)
	}
	// 改标题也算"活跃" 一次, 让它在列表里前置
	_ = f.bridge.repo.Touch(sessionID)
	return nil
}

// DeleteSessionByID 删除某具体 session (DB 行 + agent jsonl)。
//
// 顺序: 先删 agent (best-effort, 404 ok) → 再删 DB 行。
// 反向顺序 (先 DB) 会出现"用户看不到了但 jsonl 还在"的孤儿, 而正向最坏只是
// 短暂的"DB 行还在但 agent 已删", 下次 ListSessions 会让 caller 看到孤儿提示。
func (f *FeatureBridge) DeleteSessionByID(ctx context.Context, userID uint, sessionID string) error {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return ErrNotFound
	}
	if err := f.bridge.client.DeleteSession(ctx, sessionID); err != nil &&
		!errors.Is(err, agent.ErrSessionNotFound) {
		return fmt.Errorf("agent delete: %w", err)
	}
	if err := f.bridge.repo.DeleteByAgentSessionID(userID, f.spec.Key, sessionID); err != nil {
		return fmt.Errorf("db delete: %w", err)
	}
	slog.Info("agentbridge DeleteSessionByID",
		"feature", f.spec.Key, "user_id", userID, "session_id", sessionID)
	return nil
}

// ActivateSession 校验某 session 归属当前用户 (用户在侧边栏点选时 frontend 调一次)。
//
// **故意不再 Touch last_accessed_at**: 列表按 last_accessed_at DESC 排序, 若点选就 Touch,
// 用户每点一次历史会话它就跳到顶部 —— 不符合"会话列表按最近活跃排序"的直觉。
// 正确语义: 只有"继续对话"(发出 user_message) 才算活跃, 才置顶 (见 ws.go 的 Touch)。
// 单纯查看历史会话不改变排序。这里保留 ownership 校验, 失败让 frontend 拿到 4404。
func (f *FeatureBridge) ActivateSession(userID uint, sessionID string) error {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return ErrNotFound
	}
	return nil
}

func (f *FeatureBridge) createAndPersist(ctx context.Context, userID uint) (string, error) {
	created, err := f.bridge.client.CreateSession(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("create agent session: %w", err)
	}
	row := &SessionRow{
		UserID:         userID,
		FeatureKey:     f.spec.Key,
		AgentSessionID: created.SessionID,
	}
	if err := f.bridge.repo.Create(row); err != nil {
		// 并发竞态: 另一个请求已经写了一行, 把刚建的 agent session 回收, 复用对方写的 id。
		slog.Warn("agentbridge create: mapping race, retrying with read",
			"feature", f.spec.Key, "user_id", userID, "err", err)
		if delErr := f.bridge.client.DeleteSession(ctx, created.SessionID); delErr != nil {
			slog.Warn("agentbridge create: cleanup orphaned session failed",
				"session_id", created.SessionID, "err", delErr)
		}
		existing, getErr := f.bridge.repo.Get(userID, f.spec.Key)
		if getErr != nil {
			return "", fmt.Errorf("create + race lookup: %w", err)
		}
		return existing.AgentSessionID, nil
	}
	slog.Info("agentbridge create: session created",
		"feature", f.spec.Key, "user_id", userID, "session_id", created.SessionID)
	return created.SessionID, nil
}

// recreate 自愈路径: agent 端 404 时清旧 mapping + 建新 + 写 DB。
func (f *FeatureBridge) recreate(ctx context.Context, userID uint) (string, error) {
	created, err := f.bridge.client.CreateSession(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("recreate agent session: %w", err)
	}
	if err := f.bridge.repo.UpdateSessionID(userID, f.spec.Key, created.SessionID); err != nil {
		return "", fmt.Errorf("recreate update mapping: %w", err)
	}
	slog.Info("agentbridge recreate: session rebuilt after agent 404",
		"feature", f.spec.Key, "user_id", userID, "new_session_id", created.SessionID)
	return created.SessionID, nil
}

// cleanupGhostCache 在 reset 后等待一小段时间, 把 agent 异步 flush 的 last-prompt
// cache 文件也一并删掉。失败不算错 — 残留只是 ~500B 的空 jsonl, 业务不读它。
func (f *FeatureBridge) cleanupGhostCache(sessionID string, userID uint) {
	time.Sleep(ghostCleanupDelay)
	bgCtx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()
	err := f.bridge.client.DeleteSession(bgCtx, sessionID)
	switch {
	case err == nil:
		slog.Info("agentbridge: ghost cache swept",
			"feature", f.spec.Key, "user_id", userID, "session_id", sessionID)
	case errors.Is(err, agent.ErrSessionNotFound):
		// happy path: 没有残留
	default:
		slog.Warn("agentbridge: ghost cache sweep failed (best-effort)",
			"feature", f.spec.Key, "user_id", userID,
			"session_id", sessionID, "err", err)
	}
}
