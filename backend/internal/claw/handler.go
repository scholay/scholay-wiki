// ============================================================================
// Scholay 智能助手 (Claw) — HTTP handler
//
// 大部分接口跟 smartsearch 同型 (session / messages / context / ws-ticket / ws),
// 只是路由前缀不同。额外的:
//   POST /claw/upload   multipart 文件上传 → 返回 attachment payload, 前端在下一条
//                        user_message 里 inline 给 agent
// ============================================================================

package claw

import (
	"errors"
	"log/slog"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agentartifact"
	"scholar-backend/internal/agentattach"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/library"
)

// 业务错误码 alias 到 errcode 包. 跨模块共享的 (AgentUnreachable / Turnstile) 走 errcode,
// claw 自家的 (codeWSTicketFailed) 留为本地常量, 不破坏现有调用。
const (
	codeAgentUnreachable = errcode.AgentUnreachable
	codeWSTicketFailed   = 5001
	codeUploadFailed     = errcode.TurnstileFailed // 4001 — 上传校验沿用 turnstile 段位
)

type Handler struct {
	feature      *agentbridge.FeatureBridge
	uploader     *agentattach.Uploader
	referencer   *agentattach.Referencer   // 引用用户文献集 → 物化进会话 cwd;libReader 为 nil 时不挂引用路由
	artifactRepo *agentartifact.Repository // 成果交付物(MinIO)元数据访问;nil 时退化为实时回读
}

func NewHandler(feature *agentbridge.FeatureBridge, artifactRepo *agentartifact.Repository, libReader *library.Reader) *Handler {
	// 上传 / 引用实现已泛化到 internal/agentattach (2026-07-14 三 feature 输入框统一),
	// claw 这里只剩薄委托。resolveEmpty 传 nil = CreateNewSession,即 claw 原语义
	// ("添加文件 = 开始新会话",前端 adopt 返回的 sessionId),行为不变。
	return &Handler{
		feature:      feature,
		uploader:     agentattach.NewUploader(feature, nil),
		referencer:   agentattach.NewReferencer(feature, libReader, nil),
		artifactRepo: artifactRepo,
	}
}

func (h *Handler) GetSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.feature.GetOrCreateSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "智能助手暂时不可用,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID})
}

func (h *Handler) ResetSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	ctx := c.Request.Context()
	// 旧会话的交付物(MinIO 对象 + 元数据行)随会话一起作废 → 重置前先**只读**旧 sid(不创建,
	// 否则无 mapping 时会误建一个空会话再删),重置成功后清理(会话 TTL)。
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
	// limit=最近 N 轮分页 (超长会话: 不一次性全量推给浏览器解析/渲染)。缺省 0 = 全量。
	limit := agentbridge.ParseLimitTurns(c)
	// 多会话场景下前端会显式带 ?session_id=xxx 指定要看哪个 session 的历史 (避免
	// 切换中 race); 不带就走 "latest active" 路径兼容旧调用。
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
			// 上下文水位只是 footer 的非关键 UI 表;agent 慢/超时不该让前端吃 502。
			// 降级返 0(与"还没说过话"同形)+ DEBUG 记一笔,不污染错误日志、不打断用户。
			slog.Debug("claw: context estimate unavailable, degrading", "session_id", sid, "err", err)
			utils.Success(c, gin.H{"sessionId": sid, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": "", "degraded": true})
			return
		}
		if est == nil {
			utils.Success(c, gin.H{"sessionId": sid, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": ""})
			return
		}
		utils.Success(c, gin.H{
			"sessionId":   sid,
			"totalTokens": est.TotalTokens,
			"maxTokens":   est.MaxTokens,
			"percentage":  est.Percentage,
			"model":       est.Model,
		})
		return
	}
	est, sessionID, err := h.feature.GetContextEstimate(c.Request.Context(), userID)
	if err != nil {
		// 同上:非关键水位表降级返 0,不让 agent 慢拖出 502。
		slog.Debug("claw: context estimate unavailable, degrading", "err", err)
		utils.Success(c, gin.H{"sessionId": sessionID, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": "", "degraded": true})
		return
	}
	if est == nil {
		utils.Success(c, gin.H{"sessionId": sessionID, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": ""})
		return
	}
	utils.Success(c, gin.H{
		"sessionId":   sessionID,
		"totalTokens": est.TotalTokens,
		"maxTokens":   est.MaxTokens,
		"percentage":  est.Percentage,
		"model":       est.Model,
	})
}

func (h *Handler) IssueWSTicket(c *gin.Context) {
	userID := c.GetUint("user_id")
	// 同 GetSessionMessages: 前端带 ?session_id=xxx 时给指定 session 签 ticket
	// (鉴权 OwnsSession), 不带就给 latest active 签 (兼容老逻辑)。
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
			utils.InternalError(c, codeAgentUnreachable, "智能助手暂时不可用,请稍后重试", err)
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

// ─── 模型列表 (sidebar 模型切换下拉) ────────────────────────────────────

// ListModels — GET /user/claw/models
//
// 透传 agent /api/models, 返回该 agent 可用的 tier 列表 (Main/Haiku/Sonnet/Opus)。
// 前端 ClawModelSelector 拿这个填下拉, 用户选了后通过 WS set_runtime_config 切。
//
// 不做用户级过滤 (agent 本就只有一套 provider 配置), 但走 user 鉴权防爬。
// 出错: agent 不可达 → 500, 其它 → 透传。
func (h *Handler) ListModels(c *gin.Context) {
	list, err := h.feature.AgentClient().ListModels(c.Request.Context())
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "无法加载模型列表,请稍后重试", err)
		return
	}
	// 过滤掉空 id / 重复 id (agent 不同 tier 可能用同一 model 别名, 4 个去重后给前端展示)
	seen := make(map[string]bool)
	dedup := make([]gin.H, 0, len(list.Models))
	for _, m := range list.Models {
		if m.ID == "" || seen[m.ID] {
			continue
		}
		seen[m.ID] = true
		dedup = append(dedup, gin.H{
			"id":          m.ID,
			"name":        m.Name,
			"description": m.Description, // "Main model" / "Haiku model" / "Sonnet model" / "Opus model"
		})
	}
	utils.Success(c, gin.H{"models": dedup, "total": len(dedup)})
}

// ─── 多会话 API (P5+: claw 侧边栏 ChatGPT 风格会话列表) ────────────────

// ListSessions — GET /claw/sessions
//
// 列出当前用户的所有 claw 会话, 按 last_accessed_at DESC 排序 (最近用过的在前)。
// 用于侧边栏会话列表渲染。每项含 title / messageCount, 来自 agent 端 transcript。
func (h *Handler) ListSessions(c *gin.Context) {
	userID := c.GetUint("user_id")
	items, err := h.feature.ListSessions(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "无法加载会话列表,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": len(items)})
}

// CreateNewSession — POST /claw/sessions
//
// 新建一个会话, 不删任何已有会话 (跟 ResetSession 的"删旧+建新"语义不同)。
// 前端"新对话"按钮调这个。返回新 sessionId, 前端切到这个 id 上即可。
func (h *Handler) CreateNewSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.feature.CreateNewSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "新建会话失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID})
}

// RenameSession — PATCH /claw/sessions/:id
//
// body: { "title": "新标题" }
// 透传 agent PATCH /api/sessions/:id 改标题。鉴权: 必须是本人 session。
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

// DeleteSession — DELETE /claw/sessions/:id
//
// 删除某具体 session (agent jsonl + DB mapping)。鉴权: 必须是本人 session。
// 如果删的是当前活跃 session, 前端应主动切换到另一条 (或新建)。
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
	// 会话删了 → 其交付物(MinIO 对象 + 元数据行)一并清理(会话 TTL)。
	h.cleanupArtifacts(c.Request.Context(), sessionID)
	utils.SuccessWithMessage(c, "已删除", nil)
}

// ActivateSession — POST /claw/sessions/:id/activate
//
// 用户在侧边栏点了某 session → 调这个把它的 last_accessed_at 设为 NOW, 之后
// GetOrCreateSession / IssueWSTicket 这些"取当前"的接口自然返回到这个 session。
// 鉴权: 必须是本人 session。
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

// UploadAttachment — POST /claw/upload (multipart):
//
//	form field: file        — 文件本身 (图片 ≤5MB / 文件 ≤30MB)
//
// 方案 B: backend 不抽文本, 把原始文件推到 agent 的会话隔离 cwd, 让大模型用 Read 原生分析。
// 返回 JSON, 前端把 path 放进下一条 user_message.attachments[].path:
//
//	{ sessionId, type:"image"|"file", name, mimeType, size, path:"<agent 容器内绝对路径>" }
//
// sessionId 用于"添加文件即开会话": 新对话下首次上传会 get-or-create 会话, 前端 adopt 它;
// 历史会话上传时 sessionId 不变。文件随会话删除/重置一并清理 (见 agent sessionService)。
func (h *Handler) UploadAttachment(c *gin.Context) {
	userID := c.GetUint("user_id")
	att, err := h.uploader.HandleUpload(c, userID)
	if err != nil {
		// 错误多数是面向用户的校验反馈(类型不支持 / 超限),原样回显;
		// **per-user 附件额度满**要单独回 7010,前端据此弹附件管理让用户自己腾空间。
		agentattach.RespondUploadError(c, codeUploadFailed, err)
		return
	}
	utils.Success(c, att)
}

// ReferenceLibrary — POST /claw/reference {session_id?, paper_ids[], folder_ids[]}:
// 把用户文献集里选中的论文 / 文件夹物化进会话 cwd 的 references/,返回 chip 元数据。
func (h *Handler) ReferenceLibrary(c *gin.Context) {
	userID := c.GetUint("user_id")
	res, err := h.referencer.HandleReference(c, userID)
	if err != nil {
		utils.SafeError(c, codeUploadFailed, err)
		return
	}
	utils.Success(c, res)
}
