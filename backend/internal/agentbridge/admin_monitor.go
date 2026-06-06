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

// AdminListSessions 列某 feature 下的会话(userID 精确 / keyword 模糊邮箱+用户名),按最近活跃倒序。
func (r *Repository) AdminListSessions(feature string, userID *uint, keyword string, offset, limit int) ([]AdminSessionRow, int64, error) {
	q := r.db.Table("agent_sessions AS s").
		Joins("LEFT JOIN users u ON u.id = s.user_id").
		Where("s.feature_key = ?", feature)
	if userID != nil {
		q = q.Where("s.user_id = ?", *userID)
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("u.email LIKE ? OR u.username LIKE ?", like, like)
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
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
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
	resp, err := b.client.GetSessionMessages(c.Request.Context(), sessionID)
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
