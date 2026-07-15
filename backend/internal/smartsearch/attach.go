// ============================================================================
// Scholay 智能搜索 — 输入框附件: 文件上传 + 引用文献集
//
// 2026-07-14 三 feature 输入框统一: 实现在 internal/agentattach (从 claw 泛化而来),
// 这里只是薄委托 (路由 + 响应包装), DTO 形状与 claw 完全一致 (前端 Composer 共用):
//
//   POST /smart-search/upload     multipart {file, session_id?}
//       → { sessionId, type:"image"|"file", name, mimeType, size, path }
//   POST /smart-search/reference  {session_id?, paper_ids[], folder_ids[]}
//       → { sessionId, items[], paperTotal }
//
// smart_search 单会话语义: session_id 缺省时复用当前会话 (GetOrCreateSession),
// 见 NewHandler 里 uploader/referencer 的装配注释。
// ============================================================================

package smartsearch

import (
	"strings"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agentattach"
	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
)

// codeAttachFailed — 上传/引用校验失败的业务码, 沿用 claw 的取值 (turnstile 段位 4001),
// 前端错误处理同一分支。
const codeAttachFailed = errcode.TurnstileFailed

// UploadAttachment — POST /smart-search/upload (multipart):
//
//	form field: file        — 文件本身 (图片 ≤5MB / 文件 ≤30MB)
//	form field: session_id  — 可选; 缺省复用当前会话
//
// 方案 B: backend 不抽文本, 把原始文件推到 agent 的会话隔离 cwd, 让大模型用 Read 原生分析。
// 返回 JSON, 前端把 path 放进下一条 user_message.attachments[].path。
func (h *Handler) UploadAttachment(c *gin.Context) {
	userID := c.GetUint("user_id")
	att, err := h.uploader.HandleUpload(c, userID)
	if err != nil {
		// HandleUpload 的错误是面向用户的校验反馈(类型不支持 / 超限),原样回显。
		utils.SafeError(c, codeAttachFailed, err)
		return
	}
	utils.Success(c, att)
}

// ReferenceLibrary — POST /smart-search/reference {session_id?, paper_ids[], folder_ids[]}:
// 把用户文献集里选中的论文 / 文件夹物化进会话 cwd 的 references/,返回 chip 元数据。
func (h *Handler) ReferenceLibrary(c *gin.Context) {
	userID := c.GetUint("user_id")
	res, err := h.referencer.HandleReference(c, userID)
	if err != nil {
		utils.SafeError(c, codeAttachFailed, err)
		return
	}
	utils.Success(c, res)
}

// GetSessionFile — GET /smart-search/session/file?session_id=<id>&path=<rel>
// 历史回放里图片缩略图/放大的取图代理(cookie 鉴权,<img src> 直接用)。校验会话归属后
// 交 agentattach.ServeSessionImage 回写图片字节。非图片/不属于你 → 404。
func (h *Handler) GetSessionFile(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := strings.TrimSpace(c.Query("session_id"))
	if sessionID == "" {
		utils.BadRequest(c, "missing session_id")
		return
	}
	feature := h.uploader.Feature()
	if feature == nil {
		utils.Error(c, 503, "附件能力未启用")
		return
	}
	owns, err := feature.OwnsSession(userID, sessionID)
	if err != nil {
		utils.InternalError(c, errcode.AgentUnreachable, "会话校验失败,请稍后重试", err)
		return
	}
	if !owns {
		utils.Error(c, 4404, "会话不存在或不属于你")
		return
	}
	agentattach.ServeSessionImage(c, feature, sessionID, c.Query("path"))
}
