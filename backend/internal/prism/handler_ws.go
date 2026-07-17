// ============================================================================
// prism 用户 WS handler —— agent-native 对话编辑(同 claw/smart-search 的 WS 模式)。
// AI 对话走 HandleWS(纯 pipe + 断线续流);轮次边界(铺源/应用/丢弃/待应用/读 cwd)走这里的
// HTTP 端点。每个接口先校验项目归属(非本人当 404)。
// ============================================================================

package prism

import (
	"log/slog"
	"net/http"

	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// projectID 从 :id 取 + 取 userID。失败已写响应。
func (h *Handler) wsProject(c *gin.Context) (uint, uint, bool) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return 0, 0, false
	}
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return 0, 0, false
	}
	return uid, id, true
}

// wsWritableProject = wsProject + 取项目校验归属 + 挡只读(旧版 cutover 后冻结 / struct 走专用端点)。
// 旧版编辑/轮次端点(ws-ticket / round prepare·apply·reject)用它,杜绝对冻结项目发起编辑会话。
func (h *Handler) wsWritableProject(c *gin.Context) (uint, uint, bool) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return 0, 0, false
	}
	p, err := h.svc.GetProject(pid, uid)
	if err != nil {
		utils.InternalError(c, 500, "加载项目失败,请稍后重试", err)
		return 0, 0, false
	}
	if p == nil {
		utils.NotFound(c, "项目不存在")
		return 0, 0, false
	}
	// 只挡「冻结的旧版项目」;struct 项目经 WS 编辑 document.md,必须放行。
	if p.EditFrozen() {
		utils.SafeBadRequest(c, ErrReadOnlyProject)
		return 0, 0, false
	}
	return uid, pid, true
}

// IssueWSTicket POST /user/prism/projects/:id/ws-ticket → 颁发 30s 一次性 ws ticket。
func (h *Handler) IssueWSTicket(c *gin.Context) {
	uid, pid, ok := h.wsWritableProject(c)
	if !ok {
		return
	}
	sessionID, token, err := h.svc.IssueWSTicket(c.Request.Context(), uid, pid, c.Query("session_id"))
	if err != nil {
		if err == ErrProjectNotFound || err == ErrConversationNotFound {
			utils.NotFound(c, "会话不存在")
			return
		}
		utils.InternalError(c, 500, "无法签发会话凭证,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID, "wsToken": token, "expiresInSeconds": 30})
}

// HandleWS GET /user/prism/ws/:sessionId?ws_token=... → 代理到 agentbridge 的 WS pipe。
// 鉴权由 ticket 完成(IssueWSTicket 已校验项目归属),这里直接 pipe。
func (h *Handler) HandleWS(c *gin.Context) {
	h.svc.WSFeature().HandleWS(c)
}

// roundConflict 把 V3-4.4-1 的轮次冲突错误写成 409(前端据 status 提示重试,不算内部错误)。
func roundConflict(c *gin.Context, err error) bool {
	if err == ErrRoundBusy || err == ErrRoundEpochMismatch {
		c.JSON(http.StatusConflict, gin.H{"code": http.StatusConflict, "message": err.Error()})
		return true
	}
	return false
}

// ListConversations GET /user/prism/projects/:id/conversations → 本项目的对话列表(多对话侧栏)。
func (h *Handler) ListConversations(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	items, err := h.svc.ListConversations(c.Request.Context(), uid, pid)
	if err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
			return
		}
		utils.InternalError(c, 500, "加载对话列表失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessions": items})
}

// NewConversation POST /user/prism/projects/:id/conversations → 新建一条对话(同项目共享同一份论文)。
func (h *Handler) NewConversation(c *gin.Context) {
	uid, pid, ok := h.wsWritableProject(c)
	if !ok {
		return
	}
	sessionID, err := h.svc.NewConversation(c.Request.Context(), uid, pid)
	if err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
			return
		}
		utils.InternalError(c, 500, "新建对话失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID})
}

// PrepareRound POST /user/prism/projects/:id/round/prepare → 每轮 AI 前铺源(DB→cwd)。
// 返回轮次世代号 epoch(V3-4.4-1);AI 回答进行中返回 409。
func (h *Handler) PrepareRound(c *gin.Context) {
	uid, pid, ok := h.wsWritableProject(c)
	if !ok {
		return
	}
	epoch, err := h.svc.PrepareRound(c.Request.Context(), uid, pid, c.Query("session_id"))
	if err != nil {
		if err == ErrProjectNotFound || err == ErrConversationNotFound {
			utils.NotFound(c, "会话不存在")
			return
		}
		if roundConflict(c, err) {
			return
		}
		utils.InternalError(c, 500, "准备工作区失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"ok": true, "epoch": epoch})
}

// PendingRound GET /user/prism/projects/:id/round/pending → 检出 cwd 相对 DB 的待应用改动。
// 响应携带服务端当前 epoch(V3-4.4-1):重入 tab 未调过 prepare,据此才能 commit 而不必 409。
func (h *Handler) PendingRound(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	files, epoch, err := h.svc.PendingRound(c.Request.Context(), uid, pid, c.Query("session_id"))
	if err != nil {
		if err == ErrProjectNotFound || err == ErrConversationNotFound {
			utils.NotFound(c, "会话不存在")
			return
		}
		utils.InternalError(c, 500, "读取改动失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"files": files, "epoch": epoch})
}

// ApplyRound POST /user/prism/projects/:id/round/apply → 固化 cwd 改动进 DB。
func (h *Handler) ApplyRound(c *gin.Context) {
	uid, pid, ok := h.wsWritableProject(c)
	if !ok {
		return
	}
	// 可选 body:
	//   instruction —— 本轮干净指令,用于首次固化后自动给项目起名(缺省也行)。
	//   files       —— per-file / per-hunk 固化:relPath→最终正文。legacy 轨 = 逐文件固化;struct 轨
	//                  (P2)= files[document.md] 作前端「逐块审阅」合并后的正文,替代 cwd(旧「假门」已拆)。
	//   epoch       —— prepare/pending 拿到的轮次世代号(V3-4.4-1);不符返回 409。
	var body struct {
		Instruction string            `json:"instruction"`
		Files       map[string]string `json:"files"`
		Epoch       string            `json:"epoch"`
	}
	_ = c.ShouldBindJSON(&body)
	applied, err := h.svc.ApplyRound(c.Request.Context(), uid, pid, body.Instruction, body.Files, body.Epoch, c.Query("session_id"))
	if err != nil {
		if err == ErrProjectNotFound || err == ErrConversationNotFound {
			utils.NotFound(c, "会话不存在")
			return
		}
		if roundConflict(c, err) {
			return
		}
		utils.InternalError(c, 500, "应用改动失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"applied": applied})
}

// RejectRound POST /user/prism/projects/:id/round/reject → 丢弃 cwd 改动(重铺源还原)。
// AI 回答进行中返回 409(流式中重铺会抽换 agent 脚下的文件)。
func (h *Handler) RejectRound(c *gin.Context) {
	uid, pid, ok := h.wsWritableProject(c)
	if !ok {
		return
	}
	if err := h.svc.RejectRound(c.Request.Context(), uid, pid, c.Query("session_id")); err != nil {
		if err == ErrProjectNotFound || err == ErrConversationNotFound {
			utils.NotFound(c, "会话不存在")
			return
		}
		if roundConflict(c, err) {
			return
		}
		utils.InternalError(c, 500, "丢弃改动失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// ResetSession POST /user/prism/projects/:id/session/reset → 手动重开会话(V3-4.6-1)。
// 真源在 DB,重开只丢对话连续性:文稿/画像/文献库全不丢。AI 回答进行中返回 409。
func (h *Handler) ResetSession(c *gin.Context) {
	uid, pid, ok := h.wsWritableProject(c)
	if !ok {
		return
	}
	p, err := h.svc.GetProject(pid, uid)
	if err != nil || p == nil {
		utils.NotFound(c, "项目不存在")
		return
	}
	if err := h.svc.ResetProjectSession(c.Request.Context(), p); err != nil {
		if roundConflict(c, err) {
			return
		}
		utils.InternalError(c, 500, "重开会话失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// ReadWorkspaceFile GET /user/prism/projects/:id/workspace/file?path=<rel> → 读 cwd 文件当前正文
// (流式中前端按 tool_result 逐个 refetch 做实时 diff)。
func (h *Handler) ReadWorkspaceFile(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	relPath := c.Query("path")
	if relPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少 path"})
		return
	}
	content, found, err := h.svc.ReadWorkspaceFile(c.Request.Context(), uid, pid, relPath, c.Query("session_id"))
	if err != nil {
		if err == ErrProjectNotFound || err == ErrConversationNotFound {
			utils.NotFound(c, "会话不存在")
			return
		}
		utils.InternalError(c, 500, "读取工作区文件失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"found": found, "content": content})
}

// GetWSMessages GET /user/prism/projects/:id/session/messages → agent 会话历史(重入恢复用)。
// ?limit=N 取最近 N 个用户轮(超长会话分页,同 claw/smart-search);返回 {messages,totalTurns,hasMore}。
func (h *Handler) GetWSMessages(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	res, err := h.svc.GetWSHistory(c.Request.Context(), uid, pid, agentbridge.ParseLimitTurns(c), c.Query("session_id"))
	if err != nil {
		if err == ErrProjectNotFound || err == ErrConversationNotFound {
			utils.NotFound(c, "会话不存在")
			return
		}
		utils.InternalError(c, 500, "加载历史失败,请稍后重试", err)
		return
	}
	utils.Success(c, res)
}

// GetContext GET /user/prism/projects/:id/session/context → 当前会话上下文水位(token 占用)。
// 前端 footer 实时展示百分比;没会话 / 没说过话 / 会话已失效都按 0 返回(自愈,不报错)。
func (h *Handler) GetContext(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	est, err := h.svc.ContextEstimate(c.Request.Context(), uid, pid, c.Query("session_id"))
	if err != nil {
		if err == ErrProjectNotFound || err == ErrConversationNotFound {
			utils.NotFound(c, "会话不存在")
			return
		}
		// 非关键水位表:agent 慢/超时降级返 0(注释已声明"会话已失效都按 0 返回,自愈"),
		// 不让它拖出 500 + ERROR。仅 DEBUG 记一笔。
		slog.Debug("prism: context estimate unavailable, degrading", "err", err)
		utils.Success(c, gin.H{"totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": "", "degraded": true})
		return
	}
	if est == nil {
		utils.Success(c, gin.H{"totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": ""})
		return
	}
	utils.Success(c, gin.H{
		"totalTokens": est.TotalTokens,
		"maxTokens":   est.MaxTokens,
		"percentage":  est.Percentage,
		"model":       est.Model,
	})
}
