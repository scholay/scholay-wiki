// ============================================================================
// Scholay 科研绘图 (scidraw) — HTTP handler
//
// 与 claw/boltslides 同型(session / messages / context / ws-ticket / ws + 多会话 + 产物交付),
// 只是路由前缀不同。产物交付见 artifact.go(SVG/PNG/PDF 等矢量/位图文件,走 ./out → MinIO 管线)。
// P0 无上传/引用、无导出(仅生成 SVG + 交付预览)。
// ============================================================================

package scidraw

import (
	"errors"
	"log/slog"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agentartifact"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
)

const (
	codeAgentUnreachable = errcode.AgentUnreachable
	codeWSTicketFailed   = 5001
)

// Handler 是科研绘图的 HTTP wrapper。全部 session 端点直接委托 FeatureBridge(与 claw 同风格),
// 产物端点(artifact.go)用 artifactRepo(nil 时退化为实时回读)。
type Handler struct {
	feature      *agentbridge.FeatureBridge
	artifactRepo *agentartifact.Repository // 成果交付物(MinIO)元数据访问;nil 时退化为实时回读
}

// NewHandler 由 bootstrap 调用;feature 由 agentbridge.Bridge.For(scidraw.BuildSpec()) 构造。
func NewHandler(feature *agentbridge.FeatureBridge, artifactRepo *agentartifact.Repository) *Handler {
	return &Handler{feature: feature, artifactRepo: artifactRepo}
}

func (h *Handler) GetSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.feature.GetOrCreateSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "科研绘图暂时不可用,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID})
}

func (h *Handler) ResetSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	ctx := c.Request.Context()
	oldSid, _ := h.feature.GetSessionID(userID)
	sessionID, err := h.feature.ResetSession(ctx, userID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "新建对话失败,请稍后重试", err)
		return
	}
	if oldSid != "" && oldSid != sessionID {
		h.cleanupArtifacts(ctx, oldSid)
	}
	utils.Success(c, gin.H{"sessionId": sessionID})
}

func (h *Handler) GetSessionMessages(c *gin.Context) {
	userID := c.GetUint("user_id")
	limit := agentbridge.ParseLimitTurns(c)
	if sid := c.Query("session_id"); sid != "" {
		result, err := h.feature.GetSessionMessagesByID(c.Request.Context(), userID, sid, limit)
		if err != nil {
			if isErrNotFound(err) {
				utils.Error(c, 4404, "会话不存在或不属于你")
				return
			}
			utils.InternalError(c, codeAgentUnreachable, "无法加载历史会话,请稍后重试", err)
			return
		}
		utils.Success(c, gin.H{"sessionId": result.SessionID, "messages": result.Messages, "totalTurns": result.TotalTurns, "hasMore": result.HasMore})
		return
	}
	result, err := h.feature.GetSessionMessages(c.Request.Context(), userID, limit)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "无法加载历史会话,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessionId": result.SessionID, "messages": result.Messages, "totalTurns": result.TotalTurns, "hasMore": result.HasMore})
}

func (h *Handler) GetContextEstimate(c *gin.Context) {
	userID := c.GetUint("user_id")
	if sid := c.Query("session_id"); sid != "" {
		est, err := h.feature.GetContextEstimateByID(c.Request.Context(), userID, sid)
		if err != nil {
			if isErrNotFound(err) {
				utils.Error(c, 4404, "会话不存在或不属于你")
				return
			}
			slog.Debug("scidraw: context estimate unavailable, degrading", "session_id", sid, "err", err)
			utils.Success(c, gin.H{"sessionId": sid, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": "", "degraded": true})
			return
		}
		if est == nil {
			utils.Success(c, gin.H{"sessionId": sid, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": ""})
			return
		}
		utils.Success(c, gin.H{"sessionId": sid, "totalTokens": est.TotalTokens, "maxTokens": est.MaxTokens, "percentage": est.Percentage, "model": est.Model})
		return
	}
	est, sessionID, err := h.feature.GetContextEstimate(c.Request.Context(), userID)
	if err != nil {
		slog.Debug("scidraw: context estimate unavailable, degrading", "err", err)
		utils.Success(c, gin.H{"sessionId": sessionID, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": "", "degraded": true})
		return
	}
	if est == nil {
		utils.Success(c, gin.H{"sessionId": sessionID, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": ""})
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID, "totalTokens": est.TotalTokens, "maxTokens": est.MaxTokens, "percentage": est.Percentage, "model": est.Model})
}

func (h *Handler) IssueWSTicket(c *gin.Context) {
	userID := c.GetUint("user_id")
	var sessionID string
	if sid := c.Query("session_id"); sid != "" {
		owns, err := h.feature.OwnsSession(userID, sid)
		if err != nil {
			utils.InternalError(c, codeAgentUnreachable, "鉴权失败", err)
			return
		}
		if !owns {
			utils.Error(c, 4404, "会话不存在或不属于你")
			return
		}
		sessionID = sid
	} else {
		sid, err := h.feature.GetOrCreateSession(c.Request.Context(), userID)
		if err != nil {
			utils.InternalError(c, codeAgentUnreachable, "科研绘图暂时不可用,请稍后重试", err)
			return
		}
		sessionID = sid
	}
	token, err := h.feature.IssueWSTicket(c.Request.Context(), userID, sessionID)
	if err != nil {
		utils.InternalError(c, codeWSTicketFailed, "无法签发会话凭证,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID, "wsToken": token, "expiresInSeconds": 30})
}

func (h *Handler) HandleWS(c *gin.Context) {
	h.feature.HandleWS(c)
}

// ListModels — GET /user/sci_draw/models(模型切换下拉,透传 agent /api/models)。
func (h *Handler) ListModels(c *gin.Context) {
	list, err := h.feature.AgentClient().ListModels(c.Request.Context())
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "无法加载模型列表,请稍后重试", err)
		return
	}
	seen := make(map[string]bool)
	dedup := make([]gin.H, 0, len(list.Models))
	for _, m := range list.Models {
		if m.ID == "" || seen[m.ID] {
			continue
		}
		seen[m.ID] = true
		dedup = append(dedup, gin.H{"id": m.ID, "name": m.Name, "description": m.Description})
	}
	utils.Success(c, gin.H{"models": dedup, "total": len(dedup)})
}

// ─── 多会话 API ────────────────────────────────────────────────────────────

func (h *Handler) ListSessions(c *gin.Context) {
	userID := c.GetUint("user_id")
	items, err := h.feature.ListSessions(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "无法加载会话列表,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": len(items)})
}

func (h *Handler) CreateNewSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.feature.CreateNewSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "新建会话失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID})
}

func (h *Handler) RenameSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := c.Param("id")
	if sessionID == "" {
		utils.BadRequest(c, "missing session id")
		return
	}
	var req struct {
		Title string `json:"title" binding:"required,min=1,max=120"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if err := h.feature.RenameSession(c.Request.Context(), userID, sessionID, req.Title); err != nil {
		if isErrNotFound(err) {
			utils.Error(c, 4404, "会话不存在或不属于你")
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "重命名失败,请稍后重试", err)
		return
	}
	utils.SuccessWithMessage(c, "已重命名", gin.H{"sessionId": sessionID, "title": req.Title})
}

func (h *Handler) DeleteSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := c.Param("id")
	if sessionID == "" {
		utils.BadRequest(c, "missing session id")
		return
	}
	if err := h.feature.DeleteSessionByID(c.Request.Context(), userID, sessionID); err != nil {
		if isErrNotFound(err) {
			utils.Error(c, 4404, "会话不存在或不属于你")
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "删除失败,请稍后重试", err)
		return
	}
	h.cleanupArtifacts(c.Request.Context(), sessionID)
	utils.SuccessWithMessage(c, "已删除", nil)
}

func (h *Handler) ActivateSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := c.Param("id")
	if sessionID == "" {
		utils.BadRequest(c, "missing session id")
		return
	}
	if err := h.feature.ActivateSession(userID, sessionID); err != nil {
		if isErrNotFound(err) {
			utils.Error(c, 4404, "会话不存在或不属于你")
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "切换会话失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID})
}

// isErrNotFound — 把 agentbridge.ErrNotFound 包到 handler 友好分支判断。
func isErrNotFound(err error) bool {
	return errors.Is(err, agentbridge.ErrNotFound)
}
