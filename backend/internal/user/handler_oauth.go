// ============================================================================
// Scholay学术 V1.0
// Handler - 第三方 OAuth（微信登录/绑定）
// ============================================================================

package user

import (
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// WeChatCallbackRequest represents WeChat OAuth callback request
type WeChatCallbackRequest struct {
	Code           string `json:"code" binding:"required"`
	State          string `json:"state" binding:"required"`
	InvitationCode string `json:"invitation_code"` // 邀请码（可选）
}

// BindWeChatRequest represents WeChat binding request
type BindWeChatRequest struct {
	Code  string `json:"code" binding:"required"`
	State string `json:"state" binding:"required"`
}

// WeChatCallback handles WeChat OAuth callback for login/register
// POST /api/v1/user/wechat/callback
func (h *Handler) WeChatCallback(c *gin.Context) {
	var req WeChatCallbackRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Get WeChat service (needs to be injected)
	wechatService := h.wechatService
	if wechatService == nil {
		utils.Error(c, 5000, "微信服务暂不可用")
		return
	}

	// Exchange code for access token
	accessToken, openID, unionID1, err := wechatService.GetAccessToken(req.Code)
	if err != nil {
		utils.InternalError(c, 5001, "获取微信访问令牌失败", err)
		return
	}

	// Get user info
	nickname, headImgURL, unionID2, err := wechatService.GetUserInfo(accessToken, openID)
	if err != nil {
		utils.InternalError(c, 5002, "获取微信用户信息失败", err)
		return
	}

	// Use unionID from GetUserInfo if available, otherwise from GetAccessToken
	unionID := unionID2
	if unionID == "" {
		unionID = unionID1
	}

	// Login or register user
	ip := c.ClientIP()
	user, token, isNewUser, err := h.service.LoginOrRegisterWithWeChat(
		openID,
		unionID,
		nickname,
		headImgURL,
		ip,
		req.InvitationCode, // 传递邀请码
	)
	if err != nil {
		utils.InternalError(c, 5003, "微信登录失败", err)
		return
	}

	// Create session (30 days session, token expires in 2 hours)
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour)

	utils.Success(c, gin.H{
		"token":       token,
		"user":        user,
		"is_new_user": isNewUser,
	})
}

// BindWeChatAccount binds WeChat account to current user
// POST /api/v1/user/bind-wechat
func (h *Handler) BindWeChatAccount(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req BindWeChatRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Get WeChat service
	wechatService := h.wechatService
	if wechatService == nil {
		utils.Error(c, 5000, "微信服务暂不可用")
		return
	}

	// Exchange code for access token
	accessToken, openID, unionID1, err := wechatService.GetAccessToken(req.Code)
	if err != nil {
		utils.InternalError(c, 5001, "获取微信访问令牌失败", err)
		return
	}

	// Get user info
	nickname, headImgURL, unionID2, err := wechatService.GetUserInfo(accessToken, openID)
	if err != nil {
		utils.InternalError(c, 5002, "获取微信用户信息失败", err)
		return
	}

	// Use unionID from GetUserInfo if available, otherwise from GetAccessToken
	unionID := unionID2
	if unionID == "" {
		unionID = unionID1
	}

	// Bind WeChat to user
	if err := h.service.BindWeChat(
		userID,
		openID,
		unionID,
		nickname,
		headImgURL,
	); err != nil {
		utils.InternalError(c, 5003, "微信绑定失败", err)
		return
	}

	utils.Success(c, gin.H{"message": "WeChat account bound successfully"})
}
