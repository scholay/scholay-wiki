// ============================================================================
// Scholay学术 V1.0
// Handler - 个人资料、绑定/解绑、可用性检查、任务历史
// ============================================================================

package user

import (
	"encoding/json"
	"strconv"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// ========== Request/Response 类型 ==========

// BindPhoneRequest represents a bind phone request
type BindPhoneRequest struct {
	Phone string `json:"phone" binding:"required,len=11"`
	Code  string `json:"code" binding:"required,len=6"`
}

// BindEmailRequest represents a bind email request
type BindEmailRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6"`
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

// BindEmailWithPasswordRequest represents email binding with password request
type BindEmailWithPasswordRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Code     string `json:"code" binding:"required,len=6"`
}

// BindPhoneWithPasswordRequest represents phone binding with password request
type BindPhoneWithPasswordRequest struct {
	Phone    string `json:"phone" binding:"required,len=11"`
	Password string `json:"password" binding:"required,min=8"`
	Code     string `json:"code" binding:"required,len=6"`
}

// CheckEmailAvailabilityRequest represents email availability check request
type CheckEmailAvailabilityRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// CheckPhoneAvailabilityRequest represents phone availability check request
type CheckPhoneAvailabilityRequest struct {
	Phone string `json:"phone" binding:"required,len=11"`
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
		utils.Error(c, 2004, "Failed to get profile")
		return
	}

	if user == nil {
		utils.Error(c, 2005, "User not found")
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
		utils.Error(c, 2006, err.Error())
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

	err := h.service.BindPhone(userID, req.Phone, req.Code)
	if err != nil {
		utils.Error(c, 2024, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Phone bound successfully", nil)
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

	err := h.service.BindEmail(userID, req.Email, req.Code)
	if err != nil {
		utils.Error(c, 2025, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Email bound successfully", nil)
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

	err := h.service.UnbindPhone(userID, req.Code)
	if err != nil {
		utils.Error(c, 2026, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Phone unbound successfully", nil)
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

	err := h.service.UnbindEmail(userID, req.Code)
	if err != nil {
		utils.Error(c, 2027, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Email unbound successfully", nil)
}

// UnbindWeChat handles unbinding WeChat from user account
func (h *Handler) UnbindWeChat(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	err := h.service.UnbindWeChat(userID)
	if err != nil {
		utils.Error(c, 2028, err.Error())
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
		utils.Error(c, 2029, err.Error())
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
		utils.Error(c, 2029, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "恩特学术账号已解绑", nil)
}

// BindEmailWithPassword binds email to WeChat user with password (first-time binding)
// POST /api/v1/user/bind-email-with-password
func (h *Handler) BindEmailWithPassword(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req BindEmailWithPasswordRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	if err := h.service.BindEmailWithPassword(userID, req.Email, req.Password, req.Code); err != nil {
		utils.Error(c, 2010, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Email and password set successfully"})
}

// BindPhoneWithPassword binds phone to WeChat user with password (first-time binding)
// POST /api/v1/user/bind-phone-with-password
func (h *Handler) BindPhoneWithPassword(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req BindPhoneWithPasswordRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	if err := h.service.BindPhoneWithPassword(userID, req.Phone, req.Password, req.Code); err != nil {
		utils.Error(c, 2020, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Phone and password set successfully"})
}

// ========== 可用性检查 ==========

// CheckEmailAvailability checks if an email is available for binding
func (h *Handler) CheckEmailAvailability(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req CheckEmailAvailabilityRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	available, err := h.service.CheckEmailAvailability(req.Email, userID)
	if err != nil {
		utils.Error(c, 2029, "Failed to check email availability")
		return
	}

	utils.Success(c, gin.H{
		"available": available,
		"email":     req.Email,
	})
}

// CheckPhoneAvailability checks if a phone is available for binding
func (h *Handler) CheckPhoneAvailability(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req CheckPhoneAvailabilityRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	available, err := h.service.CheckPhoneAvailability(req.Phone, userID)
	if err != nil {
		utils.Error(c, 2030, "Failed to check phone availability")
		return
	}

	utils.Success(c, gin.H{
		"available": available,
		"phone":     req.Phone,
	})
}

// ========== 任务历史 ==========

// GetTaskHistory gets unified task history for the current user, grouped by day
// GET /api/v1/user/task-history?days=3&limit_per_day=20
func (h *Handler) GetTaskHistory(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	// 获取参数：最近几天，每天最多多少条
	days, _ := strconv.Atoi(c.DefaultQuery("days", "3"))
	if days < 1 || days > 7 {
		days = 3
	}
	limitPerDay, _ := strconv.Atoi(c.DefaultQuery("limit_per_day", "20"))
	if limitPerDay < 1 || limitPerDay > 50 {
		limitPerDay = 20
	}

	// 计算时间范围：最近N天
	now := time.Now()
	startOfToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	startDate := startOfToday.AddDate(0, 0, -(days - 1)) // 包含今天

	// Query conversations via service layer
	var allItems []TaskHistoryItem
	uid := userID

	if h.conversationQuery != nil {
		convItems, _ := h.conversationQuery.GetRecentByUser(c.Request.Context(), uid, "search", startDate)
		for _, conv := range convItems {
			allItems = append(allItems, TaskHistoryItem{
				ID:        conv.ID,
				Type:      "smart_analysis",
				Title:     conv.Title,
				Status:    "completed",
				UpdatedAt: conv.UpdatedAt,
			})
		}
	}

	// Query peer review tasks via service layer
	if h.peerReviewQuery != nil {
		prItems, _ := h.peerReviewQuery.GetRecentNonDraftTasks(uid, startDate)
		for _, task := range prItems {
			title := task.Title
			if title == "" {
				title = "AI审稿任务"
			}
			allItems = append(allItems, TaskHistoryItem{
				ID:        task.ID,
				Type:      "peer_review",
				Title:     title,
				Status:    task.Status,
				UpdatedAt: task.UpdatedAt,
			})
		}
	}

	// 按天分组
	dayGroups := make(map[string][]TaskHistoryItem)
	dayOrder := make([]string, 0, days) // 保持天的顺序

	for _, item := range allItems {
		itemDate := time.Date(item.UpdatedAt.Year(), item.UpdatedAt.Month(), item.UpdatedAt.Day(), 0, 0, 0, 0, now.Location())
		diffDays := int(startOfToday.Sub(itemDate).Hours() / 24)

		var dateLabel string
		switch diffDays {
		case 0:
			dateLabel = "今天"
		case 1:
			dateLabel = "昨天"
		default:
			dateLabel = strconv.Itoa(diffDays) + "天前"
		}

		if _, exists := dayGroups[dateLabel]; !exists {
			dayOrder = append(dayOrder, dateLabel)
		}
		dayGroups[dateLabel] = append(dayGroups[dateLabel], item)
	}

	// 对每天的任务按时间排序，并限制数量
	result := make([]TaskHistoryDayGroup, 0, len(dayOrder))

	// 按照 今天 -> 昨天 -> N天前 的顺序排序
	sortedDays := []string{"今天", "昨天"}
	for i := 2; i < days; i++ {
		sortedDays = append(sortedDays, strconv.Itoa(i)+"天前")
	}

	for _, dateLabel := range sortedDays {
		tasks, exists := dayGroups[dateLabel]
		if !exists || len(tasks) == 0 {
			continue
		}

		// 对该天的任务按时间倒序排序
		for i := 0; i < len(tasks)-1; i++ {
			for j := i + 1; j < len(tasks); j++ {
				if tasks[j].UpdatedAt.After(tasks[i].UpdatedAt) {
					tasks[i], tasks[j] = tasks[j], tasks[i]
				}
			}
		}

		totalCount := len(tasks)
		// 限制每天的任务数量
		if len(tasks) > limitPerDay {
			tasks = tasks[:limitPerDay]
		}

		result = append(result, TaskHistoryDayGroup{
			Date:  dateLabel,
			Tasks: tasks,
			Total: totalCount,
		})
	}

	utils.Success(c, gin.H{
		"groups": result,
	})
}
