// ============================================================================
// 用户会话监控(管理端,内测期定位用户问题用)—— 列某 feature 下用户的 agent 会话,
// 并拉取某会话的完整 transcript(免归属校验)。前端用 shared 的 replayHistoryAsTurns
// 把 transcript 折成「和用户重入看到的一模一样」的会话渲染。只读,不改任何会话。
//
// 覆盖 smart_search / claw / prism 三个 agent 对话 feature(都落在 agent_sessions)。
// 智能审稿不是对话流(走 peer_review 报告/记录),不经此路。
// ============================================================================

package agentbridge

import (
	"errors"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// AdminSessionRow 是会话监控列表的一行 —— agent_sessions 关联 users 取邮箱/用户名。
type AdminSessionRow struct {
	AgentSessionID string    `json:"agentSessionId"`
	FeatureKey     string    `json:"featureKey"`
	UserID         uint      `json:"userId"`
	UserEmail      string    `json:"userEmail"`
	Username       string    `json:"username"`
	OwnerKind      *string   `json:"ownerKind"`
	OwnerID        *uint64   `json:"ownerId"`
	ResetCount     int       `json:"resetCount"`
	CreatedAt      time.Time `json:"createdAt"`
	LastAccessedAt time.Time `json:"lastAccessedAt"`
}

// AdminListSessions 列某 feature 下的会话(userID 精确 / keyword 按 ID+用户名+邮箱+手机号),按最近活跃倒序。
func (r *Repository) AdminListSessions(feature string, userID *uint, keyword string, offset, limit int) ([]AdminSessionRow, int64, error) {
	q := r.db.Table("agent_sessions AS s").
		Joins("LEFT JOIN users u ON u.id = s.user_id").
		Where("s.feature_key = ?", feature)
	if userID != nil {
		q = q.Where("s.user_id = ?", *userID)
	}
	// 统一口径:ID 精确 + username/email/phone 模糊。
	if sql, args := utils.UserSearchClause(keyword, "u.id", "u.username", "u.email", "u.phone"); sql != "" {
		q = q.Where(sql, args...)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []AdminSessionRow
	if err := q.
		Select("s.agent_session_id AS agent_session_id, s.feature_key AS feature_key, s.user_id AS user_id, " +
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

// AdminGetSessionMessages GET /admin/agent-sessions/:sessionId/messages —— 拉某会话完整 transcript
// (免归属校验)。返回原始 entries,前端用 shared replayHistoryAsTurns 折成会话渲染。会话已删 → 空。
func (b *Bridge) AdminGetSessionMessages(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	if sessionID == "" {
		utils.BadRequest(c, "sessionId 必填")
		return
	}
	// H1 修复:切到 executor 的 feature,transcript 在后端 journal,fork(b.client)见不到 → 会全空。
	// 按归属 feature 判定:executor-routed 则从 journal 折叠(空再回退 fork,救切流前老会话)。
	if row, derr := b.repo.FindByAgentSessionID(sessionID); derr == nil && row != nil && b.isExecutorFeature(row.FeatureKey) && b.log != nil {
		if evs, _, _, jerr := b.log.ReadRecentTurns(c.Request.Context(), sessionID, 500); jerr == nil {
			if msgs := b.log.FoldToMessages(evs); len(msgs) > 0 {
				utils.Success(c, gin.H{"messages": msgs})
				return
			}
		}
		// journal 空(切流前老会话)→ 读归档表(P6:fork 退役前归档)。
		if ar, ok := b.readArchive(sessionID); ok {
			utils.Success(c, gin.H{"messages": ar.Messages})
			return
		}
	}
	resp, err := b.client.GetSessionMessages(c.Request.Context(), sessionID, 0) // 兜底(过渡 fork / collapse 后 executor)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			utils.Success(c, gin.H{"messages": []any{}})
			return
		}
		utils.InternalError(c, 500, "拉取会话记录失败", err)
		return
	}
	utils.Success(c, gin.H{"messages": resp.Messages})
}

// AdminGetSessionFile GET /admin/agent-sessions/:sessionId/file?path=<relPath>&download=1
// 从 agent 会话隔离 cwd 取一个文件的原始字节(claw/prism 用户上传的文件、引用文献、产物等),
// 供管理端会话监控**内联预览 / 下载**。只读;agent 侧 resolveWorkspacePath 已做 cwd 越界校验。
// 默认 inline(前端 react-pdf / <img> / 文本直接预览),download=1 强制下载。一律 nosniff + no-store。
func (b *Bridge) AdminGetSessionFile(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	relPath := strings.TrimSpace(c.Query("path"))
	if sessionID == "" || relPath == "" {
		utils.BadRequest(c, "sessionId 与 path 必填")
		return
	}
	raw, err := b.client.ReadWorkspaceFileRaw(c.Request.Context(), sessionID, relPath)
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
