// ============================================================================
// Prism — 输入框附件: 文件上传 + 引用文献集 (per-project 会话)
//
// 2026-07-14 三 feature 输入框统一: 实现在 internal/agentattach (从 claw 泛化而来)。
// prism 与 claw/smart-search 的差异只在会话解析 —— 会话是 per-project 的:
//   1. wsWritableProject 校验项目归属 + 挡冻结的旧版项目 (同 ws-ticket / round 端点;
//      冻结项目没有 AI 编辑会话, 也不该往它的 cwd 塞附件);
//   2. ensureProjectSession 解析 / 建该项目的 agent 会话;
//   3. 调 agentattach 的 *ToSession 直通入口 (跳过表单 session_id 解析)。
//
// ⚠️ 遗留 (勿在本批次修): 上传文件落在会话 cwd **根目录** (uuid 前缀名), 没放 uploads/
// 子目录 —— executor 的 pushSessionFile (agent/src/server/workspace.ts:156) 会 basename
// 剥掉目录, 子目录落盘需要改 executor, 那是另一个批次。对 struct 轨项目无污染风险:
// 铺源/回读只碰 document.md / references.bib / terminology.md, 根目录多出的附件不会
// 被固化进 DB; LaTeX 编译在独立沙箱走 DB 真源, 也不受 cwd 附件影响。
//
//   POST /prism/projects/:id/upload     multipart {file}
//       → { sessionId, type:"image"|"file", name, mimeType, size, path }
//   POST /prism/projects/:id/reference  {paper_ids[], folder_ids[]}
//       → { sessionId, items[], paperTotal }
// ============================================================================

package prism

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agentattach"
	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
)

// codeAttachFailed — 上传/引用校验失败的业务码, 沿用 claw 的取值 (turnstile 段位 4001),
// 前端错误处理同一分支。
const codeAttachFailed = errcode.TurnstileFailed

// attachSession — 上传/引用共用的前置: 归属 + 可写校验 → 解析/建项目会话。
// 失败已写响应, 返回 ok=false。
//
// 多对话:附件必须落**当前活动对话**的隔离 cwd —— 前端带 ?session_id=<活动对话>,据此
// resolveConversation(校验 owner=project 归属;省略则回落当前/新建,兼容单会话)。否则用户切到
// 另一条对话后上传,文件会落进 ensureProjectSession 解析出的「指针对话」cwd(可能不是当前看的这条)。
func (h *Handler) attachSession(c *gin.Context) (string, uint, bool) {
	uid, pid, ok := h.wsWritableProject(c)
	if !ok {
		return "", 0, false
	}
	sessionID, err := h.svc.resolveConversation(c.Request.Context(), pid, uid, c.Query("session_id"), true)
	if err != nil {
		if err == ErrProjectNotFound {
			utils.NotFound(c, "项目不存在")
			return "", 0, false
		}
		if err == ErrConversationNotFound {
			utils.NotFound(c, "会话不存在")
			return "", 0, false
		}
		utils.InternalError(c, 500, "会话不可用,请稍后重试", err)
		return "", 0, false
	}
	return sessionID, uid, true
}

// UploadAttachment — POST /prism/projects/:id/upload (multipart, form field: file):
// 把原始文件推到该项目 agent 会话的隔离 cwd (方案 B, 大模型用 Read 原生分析)。
// 返回 JSON 与 claw/smart-search 同形, 前端把 path 放进下一条 user_message.attachments[].path。
func (h *Handler) UploadAttachment(c *gin.Context) {
	if h.uploader == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "附件功能未启用"})
		return
	}
	sessionID, _, ok := h.attachSession(c)
	if !ok {
		return
	}
	att, err := h.uploader.UploadToSession(c, sessionID)
	if err != nil {
		// UploadToSession 的错误是面向用户的校验反馈(类型不支持 / 超限),原样回显。
		utils.SafeError(c, codeAttachFailed, err)
		return
	}
	utils.Success(c, att)
}

// ReferenceLibrary — POST /prism/projects/:id/reference {paper_ids[], folder_ids[]}:
// 把用户文献集里选中的论文 / 文件夹物化进项目会话 cwd 的 references/,返回 chip 元数据。
// (符合 prism 编辑协议的「cwd 辅助文件, 只读为主」政策; agent 侧有 library-reference skill 教用法。)
func (h *Handler) ReferenceLibrary(c *gin.Context) {
	if h.referencer == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "附件功能未启用"})
		return
	}
	sessionID, uid, ok := h.attachSession(c)
	if !ok {
		return
	}
	res, err := h.referencer.ReferenceToSession(c, uid, sessionID)
	if err != nil {
		utils.SafeError(c, codeAttachFailed, err)
		return
	}
	utils.Success(c, res)
}

// GetSessionImage — GET /prism/projects/:id/session/file?path=<rel>
// 历史回放里图片缩略图/放大的取图代理。只读归属校验(不挡冻结项目 —— 旧项目的对话图片也该能看),
// 解析该项目已有 agent 会话(无会话=无图片 → 404),交 agentattach.ServeSessionImage 回写。
func (h *Handler) GetSessionImage(c *gin.Context) {
	if h.uploader == nil {
		utils.Error(c, http.StatusServiceUnavailable, "附件能力未启用")
		return
	}
	p, _, ok := h.ownedProject(c)
	if !ok {
		return // ownedProject 已写响应
	}
	sessionID := ""
	if p.AgentSessionID != nil {
		sessionID = strings.TrimSpace(*p.AgentSessionID)
	}
	if sessionID == "" {
		utils.NotFound(c, "文件不存在")
		return
	}
	agentattach.ServeSessionImage(c, h.uploader.Feature(), sessionID, c.Query("path"))
}
