// ============================================================================
// Scholay 制作PPT (boltslides) — HTTP handler
//
// 与 claw 同型(session / messages / context / ws-ticket / ws + 多会话 + 产物交付),
// 只是路由前缀不同、无上传/引用。产物交付见 artifact.go(单文件 HTML deck)。
// ============================================================================

package boltslides

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agentartifact"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"
)

const (
	codeAgentUnreachable = errcode.AgentUnreachable
	codeWSTicketFailed   = 5001
)

// Handler 是制作PPT 的 HTTP wrapper。全部 session 端点直接委托 FeatureBridge(与 claw 同风格),
// 产物端点(artifact.go)用 artifactRepo(nil 时退化为实时回读)。
type Handler struct {
	feature      *agentbridge.FeatureBridge
	artifactRepo *agentartifact.Repository // 成果交付物(MinIO)元数据访问;nil 时退化为实时回读
}

// NewHandler 由 bootstrap 调用;feature 由 agentbridge.Bridge.For(boltslides.BuildSpec()) 构造。
func NewHandler(feature *agentbridge.FeatureBridge, artifactRepo *agentartifact.Repository) *Handler {
	return &Handler{feature: feature, artifactRepo: artifactRepo}
}

func (h *Handler) GetSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.feature.GetOrCreateSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "制作PPT暂时不可用,请稍后重试", err)
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
			slog.Debug("boltslides: context estimate unavailable, degrading", "session_id", sid, "err", err)
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
		slog.Debug("boltslides: context estimate unavailable, degrading", "err", err)
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
			utils.InternalError(c, codeAgentUnreachable, "制作PPT暂时不可用,请稍后重试", err)
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

// ListModels — GET /user/boltslides/models(模型切换下拉,透传 agent /api/models)。
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

// ExportPptx — POST /user/boltslides/session/export-pptx {session_id, path}
//
// 把已生成的单文件 HTML deck(path=out/<name>.html)交给 executor 逐张截图拼成图片版 .pptx
// 落 out/<name>.pptx。产物在下次 GetSessionArtifacts 收割时作为可下载 .pptx 出现(前端导出后
// invalidate 产物列表即可见)。演示稿会话 cwd 里必须仍有该 html(刚生成即导出为常态;若会话工作区
// 已回收则报错提示重新生成)。
func (h *Handler) ExportPptx(c *gin.Context) {
	userID := c.GetUint("user_id")
	var req struct {
		SessionID string `json:"session_id" binding:"required"`
		Path      string `json:"path" binding:"required"`
		Format    string `json:"format"` // "pptx"(默认,图片版) | "pptx-native"(可编辑) | "pdf"(矢量版)
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	format := "pptx"
	if req.Format == "pdf" {
		format = "pdf"
	} else if req.Format == "pptx-native" {
		format = "pptx-native"
	}
	owns, err := h.feature.OwnsSession(userID, req.SessionID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "会话校验失败,请稍后重试", err)
		return
	}
	if !owns {
		utils.Error(c, 4404, "会话不存在或不属于你")
		return
	}
	// 只允许 out/<basename>.html;name 去扩展名作 pptx 文件名。
	rel, name := artifactRelPath(req.Path)
	if rel == "" || !strings.HasSuffix(strings.ToLower(name), ".html") {
		utils.BadRequest(c, "无效的演示稿路径")
		return
	}
	base := strings.TrimSuffix(name, path.Ext(name))
	// 执行器工作区是临时的(重启/TTL 即清),而 deck 产物耐久在 MinIO。导出前把 deck html 从 MinIO
	// 回灌进会话 cwd(PutWorkspaceFile 会按需重建被清的会话),使导出对工作区回收鲁棒 —— 用户不必为
	// 导出重新生成一遍。回灌失败(如 storage 未启用)则退回原样,靠 cwd 里可能还在的文件,executor 再兜。
	if h.artifactRepo != nil && storage.IsEnabled() {
		anchor := agentartifact.DedupAnchorFor(req.SessionID, rel)
		if row, gerr := h.artifactRepo.GetByDedup(anchor); gerr == nil && row != nil && row.StorageKey != "" {
			if obj, _, oerr := storage.GetObject(c.Request.Context(), storage.AgentArtifactsBucket(), row.StorageKey); oerr == nil {
				data, rerr := io.ReadAll(obj)
				_ = obj.Close()
				if rerr == nil && len(data) > 0 {
					if perr := h.feature.AgentClient().PutWorkspaceFile(c.Request.Context(), req.SessionID, rel, data); perr != nil {
						slog.Warn("boltslides export: re-materialize deck into cwd failed, proceeding", "session", req.SessionID, "err", perr)
					}
				}
			}
		}
	}
	res, err := h.feature.AgentClient().ExportDeckPptx(c.Request.Context(), req.SessionID, rel, base, format)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "导出失败 —— 请确认演示稿已生成,稍后重试", err)
		return
	}
	// 一次性导出:把产物字节**直接流回浏览器下载**,不落 MinIO、不进产物列表(harvest 已排除 .pptx/.pdf)。
	raw, rerr := h.feature.AgentClient().ReadWorkspaceFileRaw(c.Request.Context(), req.SessionID, res.Path)
	if rerr != nil || raw == nil || raw.State != "ok" || len(raw.Bytes) == 0 {
		utils.InternalError(c, codeAgentUnreachable, "导出成功但读取产物失败,请稍后重试", rerr)
		return
	}
	ext, mime := "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	if format == "pdf" {
		ext, mime = "pdf", "application/pdf"
	}
	filename := base + "." + ext
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Deck-Slides", strconv.Itoa(res.Slides))
	c.Header("Access-Control-Expose-Headers", "X-Deck-Slides, Content-Disposition")
	c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.QueryEscape(filename))
	c.Data(http.StatusOK, mime, raw.Bytes)
}

// isErrNotFound — 把 agentbridge.ErrNotFound 包到 handler 友好分支判断。
func isErrNotFound(err error) bool {
	return errors.Is(err, agentbridge.ErrNotFound)
}
