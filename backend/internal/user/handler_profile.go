// ============================================================================
// Scholay学术 V1.0
// Handler - 个人资料、绑定/解绑、可用性检查、任务历史
// ============================================================================

package user

import (
	"encoding/json"
	"time"

	"scholar-backend/internal/admin"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// ========== Request/Response 类型 ==========

// BindPhoneRequest represents a bind phone request.
// OldPhoneCode 仅在「换绑」场景必填(当前 user 已有 phone,新号与之不同) ——
// 用于证明用户掌控旧手机,防止 session 被偷后被改手机号夺号。与 BindEmail 对称。
type BindPhoneRequest struct {
	Phone        string `json:"phone" binding:"required,len=11"`
	Code         string `json:"code" binding:"required,len=6"`
	OldPhoneCode string `json:"old_phone_code"`
}

// BindEmailRequest represents a bind email request.
// OldEmailCode 仅在「换绑」场景必填(当前 user 已有 email,新邮箱与之不同) ——
// 用于证明用户掌控旧邮箱,防止 session 被偷后被改邮箱夺号。首次绑定可留空。
type BindEmailRequest struct {
	Email        string `json:"email" binding:"required,email"`
	Code         string `json:"code" binding:"required,len=6"`
	OldEmailCode string `json:"old_email_code"`
}

// UnbindRequest represents an unbind request (requires verification code)
type UnbindRequest struct {
	Code string `json:"code" binding:"required,len=6"`
}

// UpdateProfileRequest represents an update profile request
type UpdateProfileRequest struct {
	Username  *string `json:"username"`
	AvatarURL *string `json:"avatar_url"`
	Bio       *string `json:"bio"`
}

// UserProfileResponse represents an extended user profile response with auth providers
type UserProfileResponse struct {
	ID             uint       `json:"id"`
	Username       *string    `json:"username"`
	Email          *string    `json:"email"`
	Phone          *string    `json:"phone"`
	AvatarURL      *string    `json:"avatar_url"`
	Bio            *string    `json:"bio"`
	Role           string     `json:"role"`
	// Permissions 该角色的权限点集合(admin.PermissionsForRole,单一真源)。
	// 前端后台用它过滤菜单/按钮 —— 普通用户为空数组,不影响用户端。
	Permissions    []string   `json:"permissions"`
	Status         int8       `json:"status"`
	EmailVerified  bool       `json:"email_verified"`
	PhoneVerified  bool       `json:"phone_verified"`
	WeChatOpenID   *string    `json:"wechat_openid"`   // WeChat OpenID if bound
	WeChatName     *string    `json:"wechat_name"`     // WeChat nickname if bound
	GitHubID       *string    `json:"github_id"`       // GitHub ID if bound
	GitHubLogin    *string    `json:"github_login"`    // GitHub login username if bound
	GoogleID       *string    `json:"google_id"`       // Google sub ID if bound
	GoogleEmail    *string    `json:"google_email"`    // Google email if bound
	AppleID        *string    `json:"apple_id"`        // Apple sub ID if bound
	OrcidID        *string    `json:"orcid_id"`        // ORCID iD if bound
	MicrosoftID    *string    `json:"microsoft_id"`    // Microsoft ID if bound
	MicrosoftEmail *string    `json:"microsoft_email"` // Microsoft email if bound
	DiscourseID    *string    `json:"discourse_id"`    // Discourse external ID if bound
	LastLoginAt    *time.Time `json:"last_login_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// TaskHistoryItem represents a unified task history item
type TaskHistoryItem struct {
	ID        uint      `json:"id"`
	Type      string    `json:"type"`       // "smart_analysis" | "peer_review"
	Title     string    `json:"title"`
	Status    string    `json:"status"`     // 任务状态
	UpdatedAt time.Time `json:"updated_at"`
}

// TaskHistoryDayGroup represents tasks grouped by day
type TaskHistoryDayGroup struct {
	Date  string            `json:"date"`  // 日期标签: "今天", "昨天", "2天前" 等
	Tasks []TaskHistoryItem `json:"tasks"` // 该天的任务列表
	Total int               `json:"total"` // 该天任务总数
}

// ========== Profile ==========

// GetProfile handles getting user profile
func (h *Handler) GetProfile(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	user, err := h.service.GetProfile(userID)
	if err != nil {
		utils.Error(c, 2004, "加载个人资料失败,请稍后重试")
		return
	}

	if user == nil {
		utils.Error(c, 2005, "用户不存在")
		return
	}

	// Check if WeChat is bound
	var wechatOpenID *string
	var wechatName *string
	wechatProvider, err := h.service.FindAuthProviderByUserAndProvider(userID, "wechat")
	if err == nil && wechatProvider != nil {
		wechatOpenID = &wechatProvider.ProviderUserID
		// Try to get WeChat nickname from provider_data first
		if wechatProvider.ProviderData != nil {
			// Parse JSON to extract nickname field
			// Expected format: {"nickname":"xxx","avatar_url":"xxx"}
			var providerData map[string]any
			if err := json.Unmarshal([]byte(*wechatProvider.ProviderData), &providerData); err == nil {
				if nickname, ok := providerData["nickname"].(string); ok && nickname != "" {
					wechatName = &nickname
				}
			}
		}
		// Fallback to username if provider_data doesn't have nickname
		if wechatName == nil && user.Username != nil && *user.Username != "" {
			wechatName = user.Username
		}
	}

	// Check if GitHub is bound
	var githubID *string
	var githubLogin *string
	githubProvider, err := h.service.FindAuthProviderByUserAndProvider(userID, "github")
	if err == nil && githubProvider != nil {
		githubID = &githubProvider.ProviderUserID
		// Try to extract GitHub login from provider_data JSON
		if githubProvider.ProviderData != nil {
			// Parse JSON to extract login field
			// Expected format: {"login":"username","name":"Full Name","avatar_url":"..."}
			var providerData map[string]any
			if err := json.Unmarshal([]byte(*githubProvider.ProviderData), &providerData); err == nil {
				if login, ok := providerData["login"].(string); ok && login != "" {
					githubLogin = &login
				}
			}
		}
	}

	// Check if Google is bound
	var googleID *string
	var googleEmail *string
	googleProvider, err := h.service.FindAuthProviderByUserAndProvider(userID, "google")
	if err == nil && googleProvider != nil {
		googleID = &googleProvider.ProviderUserID
		if googleProvider.ProviderData != nil {
			var providerData map[string]any
			if err := json.Unmarshal([]byte(*googleProvider.ProviderData), &providerData); err == nil {
				if email, ok := providerData["email"].(string); ok && email != "" {
					googleEmail = &email
				}
			}
		}
	}

	// Check if Apple is bound
	var appleID *string
	appleProvider, err := h.service.FindAuthProviderByUserAndProvider(userID, "apple")
	if err == nil && appleProvider != nil {
		appleID = &appleProvider.ProviderUserID
	}

	// Check if ORCID is bound
	var orcidID *string
	orcidProvider, err := h.service.FindAuthProviderByUserAndProvider(userID, "orcid")
	if err == nil && orcidProvider != nil {
		orcidID = &orcidProvider.ProviderUserID
	}

	// Check if Microsoft is bound
	var microsoftID *string
	var microsoftEmail *string
	microsoftProvider, err := h.service.FindAuthProviderByUserAndProvider(userID, "microsoft")
	if err == nil && microsoftProvider != nil {
		microsoftID = &microsoftProvider.ProviderUserID
		if microsoftProvider.ProviderData != nil {
			var providerData map[string]any
			if err := json.Unmarshal([]byte(*microsoftProvider.ProviderData), &providerData); err == nil {
				if email, ok := providerData["email"].(string); ok && email != "" {
					microsoftEmail = &email
				}
			}
		}
	}

	// Check Discourse binding
	var discourseID *string
	discourseProvider, err := h.service.FindAuthProviderByUserAndProvider(userID, "discourse")
	if err == nil && discourseProvider != nil {
		discourseID = &discourseProvider.ProviderUserID
	}

	// Build extended response
	response := UserProfileResponse{
		ID:             user.ID,
		Username:       user.Username,
		Email:          user.Email,
		Phone:          user.Phone,
		AvatarURL:      user.AvatarURL,
		Bio:            user.Bio,
		Role:           user.Role,
		Permissions:    admin.PermissionsForRole(user.Role),
		Status:         user.Status,
		EmailVerified:  user.EmailVerified,
		PhoneVerified:  user.PhoneVerified,
		WeChatOpenID:   wechatOpenID,
		WeChatName:     wechatName,
		GitHubID:       githubID,
		GitHubLogin:    githubLogin,
		GoogleID:       googleID,
		GoogleEmail:    googleEmail,
		AppleID:        appleID,
		OrcidID:        orcidID,
		MicrosoftID:    microsoftID,
		MicrosoftEmail: microsoftEmail,
		DiscourseID:    discourseID,
		LastLoginAt:    user.LastLoginAt,
		CreatedAt:      user.CreatedAt,
		UpdatedAt:      user.UpdatedAt,
	}

	utils.Success(c, response)
}

// UpdateProfile handles updating user profile
func (h *Handler) UpdateProfile(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req UpdateProfileRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.UpdateProfile(userID, req.Username, req.AvatarURL, req.Bio)
	if err != nil {
		utils.SafeError(c, 2006, err)
		return
	}

	utils.SuccessWithMessage(c, "Profile updated successfully", nil)
}

// ========== 绑定 / 解绑 ==========

// BindPhone handles binding phone to user account
func (h *Handler) BindPhone(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req BindPhoneRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.BindPhone(c.Request.Context(), userID, req.Phone, req.Code, req.OldPhoneCode)
	if err != nil {
		utils.SafeError(c, 2024, err)
		return
	}

	utils.SuccessWithMessage(c, "手机号绑定成功", nil)
}

// BindEmail handles binding email to user account
func (h *Handler) BindEmail(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req BindEmailRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.BindEmail(c.Request.Context(), userID, req.Email, req.Code, req.OldEmailCode)
	if err != nil {
		utils.SafeError(c, 2025, err)
		return
	}

	utils.SuccessWithMessage(c, "邮箱绑定成功", nil)
}

// UnbindPhone handles unbinding phone from user account
func (h *Handler) UnbindPhone(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req UnbindRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.UnbindPhone(c.Request.Context(), userID, req.Code)
	if err != nil {
		utils.SafeError(c, 2026, err)
		return
	}

	utils.SuccessWithMessage(c, "手机号已解绑", nil)
}

// UnbindEmail handles unbinding email from user account
func (h *Handler) UnbindEmail(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req UnbindRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.UnbindEmail(c.Request.Context(), userID, req.Code)
	if err != nil {
		utils.SafeError(c, 2027, err)
		return
	}

	utils.SuccessWithMessage(c, "邮箱已解绑", nil)
}

// UnbindWeChat handles unbinding WeChat from user account
func (h *Handler) UnbindWeChat(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	err := h.service.UnbindWeChat(userID)
	if err != nil {
		utils.SafeError(c, 2028, err)
		return
	}

	utils.SuccessWithMessage(c, "WeChat unbound successfully", nil)
}

// UnbindGitHub handles unbinding GitHub from user account
func (h *Handler) UnbindGitHub(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	err := h.service.UnbindGitHub(userID)
	if err != nil {
		utils.SafeError(c, 2029, err)
		return
	}

	utils.SuccessWithMessage(c, "GitHub unbound successfully", nil)
}

// UnbindDiscourse handles unbinding Discourse from user account
func (h *Handler) UnbindDiscourse(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	err := h.service.UnbindDiscourse(userID)
	if err != nil {
		utils.SafeError(c, 2029, err)
		return
	}

	utils.SuccessWithMessage(c, "恩特学术账号已解绑", nil)
}


