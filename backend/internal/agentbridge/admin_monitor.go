// ============================================================================
// 用户会话监控(管理端,内测期定位用户问题用)—— 列某 feature 下用户的 agent 会话,
// 并拉取某会话的完整 transcript(免归属校验)。前端用 shared 的 replayHistoryAsTurns
// 把 transcript 折成「和用户重入看到的一模一样」的会话渲染。只读,不改任何会话。
//
// 覆盖 smart_search / claw / prism / boltslides / sci_draw / stat_lab 六个 agent 对话 feature。
// 智能审稿不是对话流(走 peer_review 报告/记录),不经此路。
// ============================================================================

package agentbridge

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// AdminSessionRow 是会话监控列表的一行 —— agent_sessions 关联 users 取邮箱/用户名。
type AdminSessionRow struct {
	AgentSessionID   string    `json:"agentSessionId"`
	FeatureKey       string    `json:"featureKey"`
	Title            string    `json:"title"`
	PinnedModel      string    `json:"pinnedModel"`
	LatestModel      string    `json:"latestModel"`
	TurnCount        int64     `json:"turnCount"`
	LatestTurnStatus string    `json:"latestTurnStatus"`
	UserID           uint      `json:"userId"`
	UserEmail        string    `json:"userEmail"`
	Username         string    `json:"username"`
	OwnerKind        *string   `json:"ownerKind"`
	OwnerID          *uint64   `json:"ownerId"`
	ResetCount       int       `json:"resetCount"`
	CreatedAt        time.Time `json:"createdAt"`
	LastAccessedAt   time.Time `json:"lastAccessedAt"`
}

var adminMonitorFeatures = map[string]struct{}{
	"smart_search": {},
	"claw":         {},
	"prism":        {},
	"boltslides":   {},
	"sci_draw":     {},
	"stat_lab":     {},
}

func isAdminMonitorFeature(feature string) bool {
	_, ok := adminMonitorFeatures[feature]
	return ok
}

// adminSessionSearchClause 把用户身份检索与会话 ID / 标题放在同一个 OR 组。
// LIKE 的转义规则与 utils.UserSearchClause 一致，避免 '%'/'_' 被当成通配符。
func adminSessionSearchClause(keyword string) (string, []any) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return "", nil
	}
	if len(keyword) > 100 {
		keyword = keyword[:100]
	}
	userSQL, userArgs := utils.UserSearchClause(keyword, "u.id", "u.username", "u.email", "u.phone")
	escaped := strings.ReplaceAll(keyword, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, "%", `\%`)
	escaped = strings.ReplaceAll(escaped, "_", `\_`)
	like := "%" + escaped + "%"

	parts := make([]string, 0, 3)
	args := make([]any, 0, len(userArgs)+2)
	if userSQL != "" {
		parts = append(parts, userSQL)
		args = append(args, userArgs...)
	}
	parts = append(parts,
		`s.agent_session_id LIKE ? ESCAPE '\\'`,
		`s.title LIKE ? ESCAPE '\\'`,
	)
	args = append(args, like, like)
	return "(" + strings.Join(parts, " OR ") + ")", args
}

// AdminListSessions 列某 feature 下的会话(userID 精确 / keyword 按用户+会话 ID+标题),按最近活跃倒序。
func (r *Repository) AdminListSessions(feature string, userID *uint, keyword string, offset, limit int) ([]AdminSessionRow, int64, error) {
	q := r.db.Table("agent_sessions AS s").
		Joins("LEFT JOIN users u ON u.id = s.user_id").
		Where("s.feature_key = ?", feature)
	if userID != nil {
		q = q.Where("s.user_id = ?", *userID)
	}
	if sql, args := adminSessionSearchClause(keyword); sql != "" {
		q = q.Where(sql, args...)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []AdminSessionRow
	// latestModel 只能来自“最新轮”本身。最新 failed 轮的模型只在
	// EvError 时，列表暂置空；绝不倒退拿前一个成功轮冒充“最近模型”。
	if err := q.
		Joins(`LEFT JOIN agent_turns latest_turn ON latest_turn.id = (
			SELECT t.id FROM agent_turns t
			WHERE t.agent_session_id = s.agent_session_id
			ORDER BY t.seq DESC, t.id DESC LIMIT 1
		)`).
		Select("s.agent_session_id AS agent_session_id, s.feature_key AS feature_key, " +
			"COALESCE(s.title,'') AS title, COALESCE(s.pinned_model,'') AS pinned_model, " +
			"COALESCE(latest_turn.model_main,'') AS latest_model, " +
			"(SELECT COUNT(*) FROM agent_turns counted_turn " +
			" WHERE counted_turn.agent_session_id = s.agent_session_id) AS turn_count, " +
			"COALESCE(latest_turn.status,'') AS latest_turn_status, s.user_id AS user_id, " +
			"COALESCE(u.email,'') AS user_email, COALESCE(u.username,'') AS username, " +
			"s.owner_kind AS owner_kind, s.owner_id AS owner_id, s.reset_count AS reset_count, " +
			"s.created_at AS created_at, s.last_accessed_at AS last_accessed_at").
		Order("s.last_accessed_at DESC").
		Offset(offset).Limit(limit).
		Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// AdminListSessions GET /admin/agent-sessions?feature=&userId=&keyword=&page=&pageSize=
func (b *Bridge) AdminListSessions(c *gin.Context) {
	feature := strings.TrimSpace(c.Query("feature"))
	if feature == "" {
		utils.BadRequest(c, "feature 参数必填")
		return
	}
	if !isAdminMonitorFeature(feature) {
		utils.BadRequest(c, "feature 不支持会话监控")
		return
	}
	var userID *uint
	if s := strings.TrimSpace(c.Query("userId")); s != "" {
		if v, err := strconv.ParseUint(s, 10, 64); err == nil && v > 0 {
			u := uint(v)
			userID = &u
		}
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	// 分页参数统一 page_size(与其余列表端点一致,架构报告 M3);兼容旧前端仍传 pageSize,
	// 过渡期两者都认,先 page_size 后回落 pageSize。
	pageSizeStr := c.Query("page_size")
	if pageSizeStr == "" {
		pageSizeStr = c.DefaultQuery("pageSize", "20")
	}
	pageSize, _ := strconv.Atoi(pageSizeStr)
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	rows, total, err := b.repo.AdminListSessions(feature, userID, keyword, (page-1)*pageSize, pageSize)
	if err != nil {
		utils.InternalError(c, 500, "查询会话失败", err)
		return
	}
	utils.Success(c, gin.H{"list": rows, "total": total, "page": page, "pageSize": pageSize})
}

type AdminTurnUsage struct {
	InputTokens         int64 `json:"inputTokens"`
	OutputTokens        int64 `json:"outputTokens"`
	CacheReadTokens     int64 `json:"cacheReadTokens"`
	CacheCreationTokens int64 `json:"cacheCreationTokens"`
}

type AdminTurnUserAttachment struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	Path     string `json:"path"`
}

type AdminTurnUserReference struct {
	Kind       string `json:"kind"`
	Title      string `json:"title"`
	PaperCount *int   `json:"paperCount,omitempty"`
}

// AdminTurnEnvelope 是管理端的权威轮级快照。Messages 仍是用户端已在消费的
// daemon-flat 块序列；其余字段直接来自 agent_turns / ledger，不用当前默认模型猜历史。
type AdminTurnEnvelope struct {
	ID          uint64                    `json:"id"`
	Seq         uint                      `json:"seq"`
	CursorSeq   uint                      `json:"cursorSeq"`
	Status      string                    `json:"status"`
	Kind        string                    `json:"kind"`
	Attempt     int                       `json:"attempt"`
	Model       string                    `json:"model"`
	UserText    string                    `json:"userText"`
	StartedAt   time.Time                 `json:"startedAt"`
	CompletedAt *time.Time                `json:"completedAt"`
	DurationMs  *int64                    `json:"durationMs"`
	Usage       *AdminTurnUsage           `json:"usage,omitempty"`
	Attachments []AdminTurnUserAttachment `json:"attachments,omitempty"`
	References  []AdminTurnUserReference  `json:"references,omitempty"`
	Messages    []agent.SessionMessage    `json:"messages"`
}

type AdminSessionTranscriptResponse struct {
	Messages      []agent.SessionMessage `json:"messages,omitempty"` // legacy 兼容；structured=1 时 journal 轮不再重复返回
	Turns         []AdminTurnEnvelope    `json:"turns"`
	TotalTurns    int                    `json:"totalTurns"`
	HasMore       bool                   `json:"hasMore"`
	NextBeforeSeq *uint                  `json:"nextBeforeSeq,omitempty"`
	Source        string                 `json:"source"`
}

type adminJournalPage struct {
	Turns         []Turn
	Events        []Event
	Ledgers       []BillingLedgerRow
	TotalTurns    int
	HasMore       bool
	NextBeforeSeq *uint
}

// adminReadJournalPage 包含 blocked/quota 轮：它们不进 legacy messages，但是管理端需要
// status/kind/userText 才能复盘真实的额度拦截。任一 SQL 错误都向上返回，禁止把 journal 故障伪装成空历史。
func (r *Repository) adminReadJournalPage(ctx context.Context, sessionID string, limitTurns int, beforeSeq *uint) (*adminJournalPage, error) {
	var total int64
	if err := r.db.WithContext(ctx).Model(&Turn{}).
		Where("agent_session_id = ?", sessionID).Count(&total).Error; err != nil {
		return nil, err
	}
	page := &adminJournalPage{TotalTurns: int(total)}
	if total == 0 {
		return page, nil
	}
	q := r.db.WithContext(ctx).Where("agent_session_id = ?", sessionID)
	if beforeSeq != nil {
		q = q.Where("seq < ?", *beforeSeq)
	}
	// limitTurns<=0 仅供 hybrid 合并内部读全量 journal；公网参数仍封顶 200。
	// 混合会话必须看到 archive/journal 真实边界才能去重。
	if limitTurns > 0 {
		q = q.Limit(limitTurns + 1)
	}
	// 多取一行判定是否还有更早轮；不再靠 total-limit 猜 cursor 页状态。
	if err := q.Order("seq DESC, id DESC").Find(&page.Turns).Error; err != nil {
		return nil, err
	}
	if limitTurns > 0 && len(page.Turns) > limitTurns {
		page.HasMore = true
		page.Turns = page.Turns[:limitTurns]
	}
	// API 与用户端历史一样按旧 → 新输出。
	for left, right := 0, len(page.Turns)-1; left < right; left, right = left+1, right-1 {
		page.Turns[left], page.Turns[right] = page.Turns[right], page.Turns[left]
	}
	if page.HasMore && len(page.Turns) > 0 {
		next := page.Turns[0].Seq
		page.NextBeforeSeq = &next
	}
	ids := make([]uint64, 0, len(page.Turns))
	for i := range page.Turns {
		ids = append(ids, page.Turns[i].ID)
	}
	var eventRows []TurnEventRow
	if err := r.db.WithContext(ctx).Where("turn_id IN ?", ids).
		Order("turn_id ASC, ev_seq ASC, id ASC").Find(&eventRows).Error; err != nil {
		return nil, err
	}
	page.Events = toEvents(eventRows)
	if err := r.db.WithContext(ctx).Where("turn_id IN ?", ids).
		Find(&page.Ledgers).Error; err != nil {
		return nil, err
	}
	return page, nil
}

func buildAdminTurnEnvelopes(page *adminJournalPage) ([]AdminTurnEnvelope, []agent.SessionMessage) {
	if page == nil || len(page.Turns) == 0 {
		return []AdminTurnEnvelope{}, []agent.SessionMessage{}
	}
	eventsByTurn := make(map[uint64][]Event, len(page.Turns))
	for _, event := range page.Events {
		eventsByTurn[event.TurnID] = append(eventsByTurn[event.TurnID], event)
	}
	for turnID := range eventsByTurn {
		events := eventsByTurn[turnID]
		sort.SliceStable(events, func(i, j int) bool {
			if events[i].EvSeq == events[j].EvSeq {
				return events[i].ID < events[j].ID
			}
			return events[i].EvSeq < events[j].EvSeq
		})
		eventsByTurn[turnID] = events
	}
	ledgerByTurn := make(map[uint64]BillingLedgerRow, len(page.Ledgers))
	for _, ledger := range page.Ledgers {
		ledgerByTurn[ledger.TurnID] = ledger
	}
	folder := &eventlogStore{} // FoldToMessages 是纯函数，不依赖 store DB/batcher。
	turns := make([]AdminTurnEnvelope, 0, len(page.Turns))
	flat := make([]agent.SessionMessage, 0, len(page.Events))
	for _, turn := range page.Turns {
		turnEvents := eventsByTurn[turn.ID]
		messages := folder.FoldToMessages(turnEvents)
		adminNormalizeUserMessagePaths(messages, turn.AgentSessionID)
		if messages == nil {
			messages = []agent.SessionMessage{}
		}
		envelope := AdminTurnEnvelope{
			ID: turn.ID, Seq: turn.Seq, CursorSeq: turn.Seq, Status: turn.Status, Kind: turn.Kind,
			Attempt: turn.Attempt, Model: turn.ModelMain,
			UserText:  adminNormalizeUserTextPath(turn.RoleUserText, turn.AgentSessionID),
			StartedAt: turn.CreatedAt, CompletedAt: turn.CompletedAt, Messages: messages,
		}
		if adminTurnWasAborted(turnEvents) {
			envelope.Status = "aborted"
		}
		envelope.Attachments, envelope.References = adminUserContextFromEvents(turnEvents, turn.AgentSessionID)
		if turn.CompletedAt != nil {
			duration := turn.CompletedAt.Sub(turn.CreatedAt).Milliseconds()
			envelope.DurationMs = &duration
		}
		if ledger, ok := ledgerByTurn[turn.ID]; ok {
			envelope.Usage = &AdminTurnUsage{
				InputTokens: ledger.InputTokens, OutputTokens: ledger.OutputTokens,
				CacheReadTokens: ledger.CacheRead, CacheCreationTokens: ledger.CacheCreation,
			}
		}
		// 失败轮的 FailTurn 历史上不写 model_main / billing ledger，但执行器的最后一帧
		// EvError 会携带当轮权威 usage/calls。只在列真缺失时回填，绝不用当前默认模型猜。
		if fallbackUsage, fallbackModel, ok := adminUsageFromLastError(turnEvents); ok {
			if envelope.Model == "" {
				envelope.Model = fallbackModel
			}
			if envelope.Usage == nil {
				envelope.Usage = fallbackUsage
			}
		}
		turns = append(turns, envelope)
		// blocked/quota 是真实审计轮，但从未投递给模型：结构化 envelope
		// 保留它的用户附件/引用，legacy flat messages 仍只含真实对话。
		if turn.Status != turnStatusBlocked {
			flat = append(flat, messages...)
		}
	}
	return turns, flat
}

func adminTurnWasAborted(events []Event) bool {
	for i := len(events) - 1; i >= 0; i-- {
		if events[i].EvType != EvMessageComplete {
			continue
		}
		var frame struct {
			Aborted bool `json:"aborted"`
		}
		return json.Unmarshal(events[i].Payload, &frame) == nil && frame.Aborted
	}
	return false
}

func adminRelativeWorkspacePath(raw, sessionID string) (string, bool) {
	if path.IsAbs(raw) {
		prefix := strings.TrimSuffix(path.Join(agentSessionWorkdirRoot(), sessionID), "/") + "/"
		if !strings.HasPrefix(raw, prefix) {
			return "", false
		}
		raw = strings.TrimPrefix(raw, prefix)
	}
	return normalizeAdminWorkspacePath(raw)
}

func adminNormalizeUserTextPath(text, sessionID string) string {
	prefix := strings.TrimSuffix(path.Join(agentSessionWorkdirRoot(), sessionID), "/") + "/"
	return strings.ReplaceAll(text, `@"`+prefix, `@"`)
}

func adminNormalizeUserMessagePaths(messages []agent.SessionMessage, sessionID string) {
	for i := range messages {
		if messages[i].Type != "user" {
			continue
		}
		// daemon/archive 存量同时存在 content="text" 和 content=[{type,text}]
		// 两种形状；统一正规化，hybrid 指纹也因此在同一口径上比较。
		var direct string
		if json.Unmarshal(messages[i].Content, &direct) == nil {
			if normalized := adminNormalizeUserTextPath(direct, sessionID); normalized != direct {
				if content, err := json.Marshal(normalized); err == nil {
					messages[i].Content = content
				}
			}
			continue
		}
		var blocks []map[string]any
		if json.Unmarshal(messages[i].Content, &blocks) != nil {
			continue
		}
		changed := false
		for _, block := range blocks {
			text, _ := block["text"].(string)
			if text == "" {
				continue
			}
			normalized := adminNormalizeUserTextPath(text, sessionID)
			if normalized != text {
				block["text"] = normalized
				changed = true
			}
		}
		if changed {
			if content, err := json.Marshal(blocks); err == nil {
				messages[i].Content = content
			}
		}
	}
}

func adminUserContextFromEvents(events []Event, sessionID string) ([]AdminTurnUserAttachment, []AdminTurnUserReference) {
	for i := len(events) - 1; i >= 0; i-- {
		if events[i].EvType != EvUserMessage {
			continue
		}
		var frame struct {
			Content     string                    `json:"content"`
			Attachments []AdminTurnUserAttachment `json:"attachments"`
		}
		if json.Unmarshal(events[i].Payload, &frame) != nil {
			continue
		}
		if len(frame.Attachments) > 10 {
			frame.Attachments = frame.Attachments[:10]
		}
		attachments := make([]AdminTurnUserAttachment, 0, len(frame.Attachments))
		for _, attachment := range frame.Attachments {
			clean, ok := adminRelativeWorkspacePath(attachment.Path, sessionID)
			if !ok {
				continue
			}
			attachment.Path = clean
			attachments = append(attachments, attachment)
		}
		return attachments, parseAdminUserReferences(frame.Content)
	}
	return nil, nil
}

func parseAdminUserReferences(content string) []AdminTurnUserReference {
	const open = "【引用文献】"
	const close = "【/引用文献】"
	start := strings.LastIndex(content, open)
	if start < 0 {
		return nil
	}
	block := content[start+len(open):]
	if end := strings.Index(block, close); end >= 0 {
		block = block[:end]
	}
	refs := make([]AdminTurnUserReference, 0, 4)
	for _, raw := range strings.Split(block, "\n") {
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "- 📄 ") {
			if title := strings.TrimSpace(strings.TrimPrefix(line, "- 📄 ")); title != "" {
				refs = append(refs, AdminTurnUserReference{Kind: "paper", Title: title})
			}
			continue
		}
		if !strings.HasPrefix(line, "- 📁 ") || !strings.HasSuffix(line, "篇]") {
			continue
		}
		body := strings.TrimSpace(strings.TrimPrefix(line, "- 📁 "))
		countAt := strings.LastIndex(body, " [")
		if countAt <= 0 {
			continue
		}
		countText := strings.TrimSuffix(strings.TrimPrefix(body[countAt:], " ["), "篇]")
		count, err := strconv.Atoi(countText)
		if err != nil || count < 0 {
			continue
		}
		countCopy := count
		refs = append(refs, AdminTurnUserReference{
			Kind: "folder", Title: strings.TrimSpace(body[:countAt]), PaperCount: &countCopy,
		})
	}
	return refs
}

// adminUsageFromLastError 从该轮最后一条可解析 EvError 取权威用量。sanitizeAgentErrorFrame
// 只替换友好文案、保留 usage/calls；这里复用计费链同一 extractErrorUsage 解析器。
func adminUsageFromLastError(events []Event) (*AdminTurnUsage, string, bool) {
	for i := len(events) - 1; i >= 0; i-- {
		if events[i].EvType != EvError {
			continue
		}
		usage, calls, _, ok := extractErrorUsage(events[i].Payload)
		if !ok {
			continue
		}
		model := usage.Model
		if model == "" {
			for j := len(calls) - 1; j >= 0; j-- {
				if calls[j].Model != "" {
					model = calls[j].Model
					break
				}
			}
		}
		return &AdminTurnUsage{
			InputTokens: int64(usage.InputTokens), OutputTokens: int64(usage.OutputTokens),
			CacheReadTokens: int64(usage.CacheReadTokens), CacheCreationTokens: int64(usage.CacheCreationTokens),
		}, model, true
	}
	return nil, "", false
}

func adminLimitTurns(c *gin.Context) int {
	value := strings.TrimSpace(c.Query("limit_turns"))
	if value == "" { // 兼容曾经跟 daemon 同名的 camelCase 调用方。
		value = strings.TrimSpace(c.Query("limitTurns"))
	}
	limit, err := strconv.Atoi(value)
	if err != nil || limit <= 0 {
		return 60
	}
	if limit > 200 {
		return 200
	}
	return limit
}

func adminBeforeSeq(c *gin.Context) (*uint, error) {
	value := strings.TrimSpace(c.Query("before_seq"))
	if value == "" {
		return nil, nil
	}
	parsed, err := strconv.ParseUint(value, 10, 32)
	if err != nil || parsed == 0 {
		return nil, errors.New("before_seq 必须为正整数")
	}
	seq := uint(parsed)
	return &seq, nil
}

func adminStructured(c *gin.Context) bool {
	value := strings.ToLower(strings.TrimSpace(c.Query("structured")))
	return value == "1" || value == "true"
}

func nonNilSessionMessages(messages []agent.SessionMessage) []agent.SessionMessage {
	if messages == nil {
		return []agent.SessionMessage{}
	}
	return messages
}

// AdminGetSessionMessages GET /admin/agent-sessions/:sessionId/messages
// journal 用 limit_turns + before_seq 做真实游标分页；structured=1 时不再把 journal
// 对话又复制一份到 messages。切流前 archive / daemon 仍保留扁平 messages 兼容。
func (b *Bridge) AdminGetSessionMessages(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	if sessionID == "" {
		utils.BadRequest(c, "sessionId 必填")
		return
	}
	limitTurns := adminLimitTurns(c)
	beforeSeq, err := adminBeforeSeq(c)
	if err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	structured := adminStructured(c)
	row, rowErr := b.repo.FindByAgentSessionID(sessionID)
	if rowErr != nil && !errors.Is(rowErr, ErrNotFound) {
		utils.InternalError(c, 500, "查询会话归属失败", rowErr)
		return
	}

	// archive 可与新 journal 同时存在（切流时的真实存量形状）。先严格读它，
	// 再决定 journal 是否需读全量做边界去重；不得因 journal 非空就静默丢旧段。
	archiveMessages, archiveErr := b.adminReadArchive(sessionID)
	if archiveErr != nil {
		utils.InternalError(c, 500, "拉取会话归档失败", archiveErr)
		return
	}
	journalLimit := limitTurns
	journalBefore := beforeSeq
	if len(archiveMessages) > 0 {
		journalLimit = 0 // hybrid 内部合并需完整边界，最终仍只回传一页。
		journalBefore = nil
	}
	page, journalErr := b.repo.adminReadJournalPage(c.Request.Context(), sessionID, journalLimit, journalBefore)
	if journalErr != nil {
		utils.InternalError(c, 500, "拉取会话 journal 失败", journalErr)
		return
	}
	if page.TotalTurns > 0 {
		turns, messages := buildAdminTurnEnvelopes(page)
		if len(archiveMessages) > 0 {
			utils.Success(c, buildAdminHybridTranscript(archiveMessages, turns, limitTurns, beforeSeq, structured))
			return
		}
		if structured {
			messages = nil
		}
		utils.Success(c, AdminSessionTranscriptResponse{
			Messages: messages, Turns: turns, TotalTurns: page.TotalTurns,
			HasMore: page.HasMore, NextBeforeSeq: page.NextBeforeSeq, Source: "journal",
		})
		return
	}

	// archive / daemon 都没有 before_seq 契约，因此一次全量返回且
	// hasMore=false；绝不把无法继续取老页的截断结果伪装成可加载。
	if len(archiveMessages) > 0 {
		utils.Success(c, AdminSessionTranscriptResponse{
			Messages: nonNilSessionMessages(archiveMessages), Turns: []AdminTurnEnvelope{},
			TotalTurns: len(splitAdminMessageTurns(archiveMessages)), HasMore: false, Source: "archive",
		})
		return
	}

	client := b.client
	if row != nil {
		client = b.clientForFeature(row.FeatureKey)
	}
	if client == nil {
		utils.InternalError(c, 500, "会话执行器未配置", errors.New("agentbridge: nil admin session client"))
		return
	}
	resp, err := client.GetSessionMessages(c.Request.Context(), sessionID, 0) // 兜底切流前 daemon transcript
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			utils.Success(c, AdminSessionTranscriptResponse{
				Messages: []agent.SessionMessage{}, Turns: []AdminTurnEnvelope{}, Source: "daemon",
			})
			return
		}
		utils.InternalError(c, 500, "拉取会话记录失败", err)
		return
	}
	if resp == nil {
		utils.InternalError(c, 500, "拉取会话记录失败", errors.New("agentbridge: nil admin session response"))
		return
	}
	messages := resp.Messages
	stripInjectionFromMessages(messages)
	adminNormalizeUserMessagePaths(messages, sessionID)
	_, localTotal, _ := sliceRecentTurns(messages, 0)
	total := localTotal
	if resp.TotalTurns != nil {
		total = *resp.TotalTurns
	}
	utils.Success(c, AdminSessionTranscriptResponse{
		Messages: nonNilSessionMessages(messages), Turns: []AdminTurnEnvelope{},
		TotalTurns: total, HasMore: false, Source: "daemon",
	})
}

// AdminGetSessionFile GET /admin/agent-sessions/:sessionId/file?path=<relPath>&download=1
// 从 agent 会话隔离 cwd 取一个文件的原始字节(claw/prism 用户上传的文件、引用文献、产物等),
// 供管理端会话监控**内联预览 / 下载**。只读；后端先做相对路径规范化，
// 再限制为该 session 的 agent_attachments 或 EvArtifact 已声明路径，不信任 agent resolver 代做 ACL。
// 默认 inline(前端 react-pdf / <img> / 文本直接预览),download=1 强制下载。一律 nosniff + no-store。
func (b *Bridge) AdminGetSessionFile(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	rawPath := c.Query("path")
	if sessionID == "" || rawPath == "" {
		utils.BadRequest(c, "sessionId 与 path 必填")
		return
	}
	relPath, validPath := normalizeAdminWorkspacePath(rawPath)
	if !validPath {
		utils.BadRequest(c, "path 必须是会话工作区内的规范相对路径")
		return
	}
	row, rowErr := b.repo.FindByAgentSessionID(sessionID)
	if errors.Is(rowErr, ErrNotFound) {
		utils.NotFound(c, "会话不存在或已清理")
		return
	}
	if rowErr != nil {
		utils.InternalError(c, 500, "查询会话归属失败", rowErr)
		return
	}
	allowed, durableAttachments, allowErr := b.adminLoadWorkspaceAllowlist(c.Request.Context(), row)
	if allowErr != nil {
		utils.InternalError(c, 500, "校验会话文件归属失败", allowErr)
		return
	}
	if _, ok := allowed[relPath]; !ok {
		// 未声明、别的会话声明、以及猜测路径都统一 404，不做存在性预言机。
		utils.NotFound(c, "文件不存在或不属于该会话")
		return
	}
	if attachment, ok := durableAttachments[relPath]; ok && adminServeDurableAttachment(c, attachment) {
		return
	}
	client := b.clientForFeature(row.FeatureKey)
	if client == nil {
		utils.InternalError(c, 500, "会话执行器未配置", errors.New("agentbridge: nil admin session client"))
		return
	}
	raw, err := client.ReadWorkspaceFileRaw(c.Request.Context(), sessionID, relPath)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			utils.NotFound(c, "会话不存在或已清理")
			return
		}
		utils.InternalError(c, 500, "读取会话文件失败", err)
		return
	}
	switch raw.State {
	case "ok":
		// 继续流式回传
	case "missing":
		utils.NotFound(c, "文件不存在(可能已被清理)")
		return
	case "too_large":
		utils.BadRequest(c, "文件过大,无法预览/下载")
		return
	default:
		utils.BadRequest(c, "文件无法读取")
		return
	}

	filename := path.Base(relPath)
	disposition := "inline"
	if c.Query("download") == "1" {
		disposition = "attachment"
	}
	ctype := raw.MimeType
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	// 安全:内联展示用户上传文件时,把可在浏览器执行脚本的类型(html/xhtml/svg)降级为纯文本,防存储型 XSS
	// (用户传带 <script> 的 html/svg,管理员在后台源里打开会执行、可窃取管理员 token)。下载不执行,保留原类型。
	if disposition == "inline" {
		switch strings.ToLower(strings.TrimSpace(strings.SplitN(ctype, ";", 2)[0])) {
		case "text/html", "application/xhtml+xml", "image/svg+xml":
			ctype = "text/plain; charset=utf-8"
		}
	}
	// filename* 用 PathEscape(空格→%20);QueryEscape 会把空格编成 '+' 破坏文件名。
	c.Header("Content-Disposition", disposition+`; filename*=UTF-8''`+url.PathEscape(filename))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, ctype, raw.Bytes)
}
