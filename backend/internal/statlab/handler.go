// ============================================================================
// Scholay 数据分析 (statlab) — HTTP handler
//
// 与 claw/boltslides 同型(session / messages / context / ws-ticket / ws + 多会话 + 产物交付),
// 只是路由前缀不同。产物交付见 artifact.go(三线表 docx / Results md / 可复现脚本 py,走 ./out → MinIO 管线)。
// P0 支持上传数据文件(csv/xlsx),产物走现有 artifact-format 预览(docx/md/py 全覆盖)。
// ============================================================================

package statlab

import (
	"errors"
	"log/slog"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agentartifact"
	"scholar-backend/internal/agentattach"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
)

const (
	codeAgentUnreachable = errcode.AgentUnreachable
	codeUploadFailed     = errcode.TurnstileFailed // 4001 — 上传校验沿用 turnstile 段位(同 claw)
	codeWSTicketFailed   = 5001
)

// Handler 是数据分析的 HTTP wrapper。全部 session 端点直接委托 FeatureBridge(与 claw 同风格),
// 产物端点(artifact.go)用 artifactRepo(nil 时退化为实时回读)。
type Handler struct {
	uploader     *agentattach.Uploader
	feature      *agentbridge.FeatureBridge
	artifactRepo *agentartifact.Repository // 成果交付物(MinIO)元数据访问;nil 时退化为实时回读
}

// NewHandler 由 bootstrap 调用;feature 由 agentbridge.Bridge.For(statlab.BuildSpec()) 构造。
func NewHandler(feature *agentbridge.FeatureBridge, artifactRepo *agentartifact.Repository) *Handler {
	return &Handler{
		feature:      feature,
		artifactRepo: artifactRepo,
		// 数据分析**必须**能收文件 —— 没有数据就没有分析。这是它与前两张卡(制作PPT / 科研绘图)
		// 最直接的差异:那两张是「纯文本描述 → 生成」,本卡是「用户的数据 → 分析」。
		// 复用 claw 的 agentattach 通道(单文件上限与扩展名白名单在 agentattach/upload.go 统一维护)。
		// ⚠️ 本仓已确立的铁律:**扩展名白名单与解析器必须同一次上线** —— 「收得进但打不开」
		// 制造的是一个用户看得见、我们看不见的断层。csv/xlsx 引擎已能读,故 P0 就收这两类;
		// .sav/.dta 在白名单里仍被拒,要收得等 pyreadstat 一并进镜像。
		uploader: agentattach.NewUploader(feature, nil),
	}
}

func (h *Handler) GetSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.feature.GetOrCreateSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "数据分析暂时不可用,请稍后重试", err)
		return
	}
	// 附带首连 ws ticket(best-effort),省掉前端首连前的 POST /session/ws-ticket 一跳。
	utils.Success(c, agentbridge.SessionEnvelopeWithTicket(c.Request.Context(), h.feature, userID, sessionID))
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
			slog.Debug("statlab: context estimate unavailable, degrading", "session_id", sid, "err", err)
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
		slog.Debug("statlab: context estimate unavailable, degrading", "err", err)
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
			utils.InternalError(c, codeAgentUnreachable, "数据分析暂时不可用,请稍后重试", err)
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

// ListModels — GET /user/stat_lab/models(模型切换下拉,透传 agent /api/models)。
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
	// 建后必连:附首连 ws ticket 省一跳 POST(best-effort)。
	utils.Success(c, agentbridge.SessionEnvelopeWithTicket(c.Request.Context(), h.feature, userID, sessionID))
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
	// 切会话后 WS 必重连:附首连 ws ticket 省一跳 POST。
	utils.Success(c, agentbridge.SessionEnvelopeWithTicket(c.Request.Context(), h.feature, userID, sessionID))
}

// isErrNotFound — 把 agentbridge.ErrNotFound 包到 handler 友好分支判断。
func isErrNotFound(err error) bool {
	return errors.Is(err, agentbridge.ErrNotFound)
}

// UploadAttachment — POST /stat_lab/upload(multipart):把用户的数据文件推进会话工作目录。
//
// 与 claw 同一条通道(agentattach),差异只在**语义**:这里传的是待分析的数据,不是聊天附件。
// 「添加文件即开会话」:新对话下首次上传会 get-or-create 会话,前端 adopt 它。
//
// ⚠️ 上传的数据文件落在会话 cwd 根,**不在 `analysis/` 保留区里** —— 保留区只放引擎产出的 bundle。
// 用户数据是模型要读要清洗的东西,必须可读可写;bundle 是报告的数字真源,必须模型碰不到。
// 这两件事刻意分开,别把用户数据也塞进保留区(那会让清洗车道整个失效)。
func (h *Handler) UploadAttachment(c *gin.Context) {
	userID := c.GetUint("user_id")
	att, err := h.uploader.HandleUpload(c, userID)
	if err != nil {
		// 同 claw:配额满走 7010(前端弹附件管理),其余原样回显。
		agentattach.RespondUploadError(c, codeUploadFailed, err)
		return
	}
	utils.Success(c, att)
}
