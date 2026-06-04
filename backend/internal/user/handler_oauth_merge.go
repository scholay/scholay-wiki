// ============================================================================
// Scholay学术 V1.0
// Handler - OAuth 邮箱冲突合并确认中间页
// ============================================================================

package user

import (
	"net/http"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// GetPendingOAuthMerge GET /api/v1/user/oauth/pending-merge?token=xxx
// 前端拿 callback 返回的 merge_token 调本接口,拉合并目标的摘要展示。
// 无需 auth(merge_token 本身就是临时凭据)。
func (h *Handler) GetPendingOAuthMerge(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "token is required")
		return
	}
	m, err := h.service.GetPendingMerge(c.Request.Context(), token)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "failed to read merge state")
		return
	}
	if m == nil {
		utils.ErrorResponse(c, http.StatusNotFound, "merge token expired or invalid")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"provider":            m.Provider,
		"target_email":        m.TargetEmail,
		"provider_email":      m.ProviderEmail,
		"provider_display":    m.ProviderDisplayName,
		"provider_avatar_url": m.ProviderAvatarURL,
	})
}

// ConfirmPendingOAuthMergeRequest 确认 / 取消都用这个体
type ConfirmPendingOAuthMergeRequest struct {
	Token string `json:"token" binding:"required"`
}

// ConfirmPendingOAuthMerge POST /api/v1/user/oauth/confirm-merge
// 用户「确认合并」分支:把 provider 链接到 target 用户上。
//
// 受保护路由(UserAuthMiddleware):必须先以目标账号本人身份登录,
// FinalizePendingMerge 会校验 JWT 里的 userID == pending.TargetUserID。
// 只持有 merge_token 不足以合并 —— 防止只控制第三方身份的攻击者接管同邮箱的本地账号。
func (h *Handler) ConfirmPendingOAuthMerge(c *gin.Context) {
	var req ConfirmPendingOAuthMergeRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	authUserID, ok := utils.GetUserID(c)
	if !ok {
		utils.ErrorResponse(c, http.StatusUnauthorized, "请先登录目标账号再确认绑定")
		return
	}
	user, token, err := h.service.FinalizePendingMerge(c.Request.Context(), req.Token, authUserID, c.ClientIP())
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	// 复用 OAuth 成功响应,前端处理路径与正常登录一致
	respondOAuthSuccess(c, token, user, false)
}

// CancelPendingOAuthMerge POST /api/v1/user/oauth/cancel-merge
// 用户「新建独立账号」分支:基于 ProviderData 建一个全新 user(无 email,
// 避免与 target 冲突),然后登入。前端应在 UI 里提示「新账号将无法用邮箱登录」。
func (h *Handler) CancelPendingOAuthMerge(c *gin.Context) {
	var req ConfirmPendingOAuthMergeRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	user, token, err := h.service.CancelPendingMergeAndCreateUser(c.Request.Context(), req.Token, c.ClientIP())
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	respondOAuthSuccess(c, token, user, true)
}
