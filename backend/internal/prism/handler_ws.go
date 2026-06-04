// ============================================================================
// prism 用户 WS handler —— agent-native 对话编辑(同 claw/smart-search 的 WS 模式)。
// AI 对话走 HandleWS(纯 pipe + 断线续流);轮次边界(铺源/应用/丢弃/待应用/读 cwd)走这里的
// HTTP 端点。每个接口先校验项目归属(非本人当 404)。
// ============================================================================

package prism

import (
	"net/http"

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

// IssueWSTicket POST /user/prism/projects/:id/ws-ticket → 颁发 30s 一次性 ws ticket。
func (h *Handler) IssueWSTicket(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	sessionID, token, err := h.svc.IssueWSTicket(c.Request.Context(), uid, pid)
	if err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
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

// PrepareRound POST /user/prism/projects/:id/round/prepare → 每轮 AI 前铺源(DB→cwd)。
func (h *Handler) PrepareRound(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	if err := h.svc.PrepareRound(c.Request.Context(), uid, pid); err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
			return
		}
		utils.InternalError(c, 500, "准备工作区失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// PendingRound GET /user/prism/projects/:id/round/pending → 检出 cwd 相对 DB 的待应用改动。
func (h *Handler) PendingRound(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	files, err := h.svc.PendingRound(c.Request.Context(), uid, pid)
	if err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
			return
		}
		utils.InternalError(c, 500, "读取改动失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"files": files})
}

// ApplyRound POST /user/prism/projects/:id/round/apply → 固化 cwd 改动进 DB。
func (h *Handler) ApplyRound(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	applied, err := h.svc.ApplyRound(c.Request.Context(), uid, pid)
	if err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
			return
		}
		utils.InternalError(c, 500, "应用改动失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"applied": applied})
}

// RejectRound POST /user/prism/projects/:id/round/reject → 丢弃 cwd 改动(重铺源还原)。
func (h *Handler) RejectRound(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	if err := h.svc.RejectRound(c.Request.Context(), uid, pid); err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
			return
		}
		utils.InternalError(c, 500, "丢弃改动失败,请稍后重试", err)
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
	content, found, err := h.svc.ReadWorkspaceFile(c.Request.Context(), uid, pid, relPath)
	if err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
			return
		}
		utils.InternalError(c, 500, "读取工作区文件失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"found": found, "content": content})
}

// GetWSMessages GET /user/prism/projects/:id/session/messages → agent 会话历史(重入恢复用)。
func (h *Handler) GetWSMessages(c *gin.Context) {
	uid, pid, ok := h.wsProject(c)
	if !ok {
		return
	}
	msgs, err := h.svc.GetWSHistory(c.Request.Context(), uid, pid)
	if err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
			return
		}
		utils.InternalError(c, 500, "加载历史失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"messages": msgs})
}
