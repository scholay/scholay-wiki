// ============================================================================
// Scholay学术 V1.0
// Handler - 第三方 OAuth（微信登录/绑定）
// ============================================================================

package user

import (
	"context"
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
		"wechat",           // 注册来源:微信网页扫码
	)
	if err != nil {
		utils.InternalError(c, 5003, "微信登录失败", err)
		return
	}

	utils.Success(c, gin.H{
		"token":       token,
		"user":        user,
		"is_new_user": isNewUser,
	})
}

// MiniProgramLoginRequest 小程序 wx.login 一键登录请求。
type MiniProgramLoginRequest struct {
	Code string `json:"code" binding:"required"` // wx.login 返回的临时登录凭证 js_code(5min 有效、一次性)
}

// MiniProgramLogin handles WeChat Mini Program one-tap login via wx.login code.
// POST /api/v1/user/wechat/miniprogram/login
//
// 流程:前端 wx.login 拿 code → 后端 jscode2session 换 openid/unionid →
// 复用 LoginOrRegisterWithWeChat(与 PC 扫码同一归一逻辑:unionid 命中即同号)。
// 小程序不返回昵称/头像,传空由下游生成随机用户名占位。
func (h *Handler) MiniProgramLogin(c *gin.Context) {
	var req MiniProgramLoginRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	wechatService := h.wechatService
	if wechatService == nil {
		utils.Error(c, 5000, "微信服务暂不可用")
		return
	}

	openID, unionID, _, err := wechatService.Code2Session(req.Code)
	if err != nil {
		utils.InternalError(c, 5001, "微信小程序登录失败", err)
		return
	}

	ip := c.ClientIP()
	user, token, isNewUser, err := h.service.LoginOrRegisterWithWeChat(
		openID,
		unionID,
		"", // nickname —— 小程序 jscode2session 不返回,占位
		"", // avatarURL —— 同上
		ip,
		"",                   // invitationCode —— 邀请业务已移除
		"wechat_miniprogram", // 注册来源:微信小程序(区别于网页扫码)
	)
	if err != nil {
		utils.InternalError(c, 5003, "微信登录失败", err)
		return
	}

	utils.Success(c, gin.H{
		"token":       token,
		"user":        user,
		"is_new_user": isNewUser,
	})
}

// BindMiniProgramPhoneRequest 小程序手机号绑定请求。
type BindMiniProgramPhoneRequest struct {
	Code string `json:"code" binding:"required"` // wx.getPhoneNumber 返回的 phoneCode(动态令牌)
}

// BindMiniProgramPhone 用小程序 getPhoneNumber code 换手机号并绑定到当前账号。
// POST /api/v1/user/wechat/miniprogram/bind-phone(受保护)
func (h *Handler) BindMiniProgramPhone(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req BindMiniProgramPhoneRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	if h.wechatService == nil {
		utils.Error(c, 5000, "微信服务暂不可用")
		return
	}
	phone, err := h.wechatService.GetPhoneByCode(req.Code)
	if err != nil {
		utils.InternalError(c, 5001, "获取手机号失败", err)
		return
	}
	if err := h.service.BindVerifiedPhone(userID, phone); err != nil {
		// 绑定失败多为用户可见原因(已被占用等),按 2xxx 用户模块码返回友好文案。
		utils.Error(c, 2001, err.Error())
		return
	}
	utils.SuccessWithMessage(c, "已绑定手机号", gin.H{"phone_verified": true})
}

// CheckContentRequest 内容安全预检请求。
type CheckContentRequest struct {
	Content string `json:"content" binding:"required"`
}

// CheckContent 小程序内容安全预检(UGC 发送前调用,违规拦在发送前)。
// POST /api/v1/user/wechat/msg-check
//
// fail-open:服务不可用 / 无 openid / 上游失败 → 一律 {pass:true},不因内容安全设施
// 故障拦正常用户;仅明确 risky 才 {pass:false}。
func (h *Handler) CheckContent(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req CheckContentRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	if h.wechatService == nil {
		utils.Success(c, gin.H{"pass": true})
		return
	}
	// 取该用户的小程序 openid(msgSecCheck v2 需要);非微信登录用户无 openid → 放行。
	openid := ""
	if ap, err := h.service.FindAuthProviderByUserAndProvider(userID, "wechat"); err == nil && ap != nil {
		openid = ap.ProviderUserID
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	pass, suggest, err := h.wechatService.CheckText(ctx, openid, req.Content)
	if err != nil {
		utils.Success(c, gin.H{"pass": true})
		return
	}
	utils.Success(c, gin.H{"pass": pass, "suggest": suggest})
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
