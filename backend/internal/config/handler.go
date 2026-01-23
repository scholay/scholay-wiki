// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package config

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// UsageLogService 定义 usagelog service 接口（避免循环依赖）
type UsageLogService interface {
	GetPopularPaperIDs(days int, limit int) ([]PopularPaper, error)
}

// PopularPaper 热门论文记录（从 usagelog 包复制，避免循环依赖）
type PopularPaper struct {
	PaperID string `json:"paper_id"`
	Count   int64  `json:"count"`
}

// Handler handles HTTP requests for configuration operations
type Handler struct {
	service *Service

	// SSR code snippet injection fields
	indexHTMLCache     string       // Cached original index.html content
	indexHTMLCacheMu   sync.RWMutex // Mutex for cache access
	indexHTMLCacheTime time.Time    // When cache was last updated
	frontendURL        string       // URL to fetch index.html from frontend container

	// Dynamic sitemap fields
	usageLogService UsageLogService // 用于获取热门论文
}

// NewHandler creates a new config handler
func NewHandler(service *Service) *Handler {
	// Get frontend URL from environment or use default
	// Note: Use Docker Compose service name (frontend-user), not container_name
	frontendURL := os.Getenv("FRONTEND_USER_URL")
	if frontendURL == "" {
		frontendURL = "http://frontend-user:80"
	}

	return &Handler{
		service:     service,
		frontendURL: frontendURL,
	}
}

// SetUsageLogService 设置 usagelog service（用于动态 sitemap 生成）
func (h *Handler) SetUsageLogService(service UsageLogService) {
	h.usageLogService = service
}

// GetPrivacyPolicy handles getting active privacy policy
func (h *Handler) GetPrivacyPolicy(c *gin.Context) {
	policy, err := h.service.GetActivePrivacyPolicy()
	if err != nil {
		utils.Error(c, 3000, "Failed to get privacy policy")
		return
	}

	utils.Success(c, policy)
}

// GetTermsOfService handles getting active terms of service
func (h *Handler) GetTermsOfService(c *gin.Context) {
	terms, err := h.service.GetActiveTermsOfService()
	if err != nil {
		utils.Error(c, 3012, "Failed to get terms of service")
		return
	}

	utils.Success(c, terms)
}

// UpdatePrivacyPolicyRequest represents an update privacy policy request
type UpdatePrivacyPolicyRequest struct {
	Content string `json:"content" binding:"required"`
	Version string `json:"version" binding:"required"`
}

// UpdatePrivacyPolicy handles updating privacy policy (admin only)
func (h *Handler) UpdatePrivacyPolicy(c *gin.Context) {
	var req UpdatePrivacyPolicyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	policy := &model.PrivacyPolicy{
		Content:  req.Content,
		Version:  req.Version,
		IsActive: true,
	}

	err := h.service.CreatePrivacyPolicy(policy)
	if err != nil {
		utils.Error(c, 3001, "Failed to update privacy policy")
		return
	}

	utils.SuccessWithMessage(c, "Privacy policy updated successfully", policy)
}

// UpdateTermsOfServiceRequest represents an update terms of service request
type UpdateTermsOfServiceRequest struct {
	Content string `json:"content" binding:"required"`
	Version string `json:"version" binding:"required"`
}

// UpdateTermsOfService handles updating terms of service (admin only)
func (h *Handler) UpdateTermsOfService(c *gin.Context) {
	var req UpdateTermsOfServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	terms := &model.TermsOfService{
		Content:  req.Content,
		Version:  req.Version,
		IsActive: true,
	}

	err := h.service.CreateTermsOfService(terms)
	if err != nil {
		utils.Error(c, 3013, "Failed to update terms of service")
		return
	}

	utils.SuccessWithMessage(c, "Terms of service updated successfully", terms)
}

// GetEmailConfig handles getting active email configuration (admin only)
func (h *Handler) GetEmailConfig(c *gin.Context) {
	config, err := h.service.GetActiveEmailConfig()
	if err != nil {
		utils.Error(c, 3006, "Failed to get email configuration")
		return
	}

	if config == nil {
		// Return empty config if not found
		utils.Success(c, nil)
		return
	}

	// Check if client requests unmasked password (via query parameter)
	showPassword := c.Query("show_password") == "true"

	if !showPassword {
		// Mask the password for security
		config.SMTPPassword = "********"
	}
	// If show_password=true, return the real password (client should verify admin first)

	utils.Success(c, config)
}

// UpdateEmailConfigRequest represents an update email config request
type UpdateEmailConfigRequest struct {
	SMTPHost     string `json:"smtpHost" binding:"required"`
	SMTPPort     int    `json:"smtpPort" binding:"required"`
	SMTPUser     string `json:"smtpUser" binding:"required"`
	SMTPPassword string `json:"smtpPassword"` // 不设置 required，允许留空
	FromEmail    string `json:"fromEmail" binding:"required,email"`
	FromName     string `json:"fromName" binding:"required"`
}

// UpdateEmailConfig handles updating email configuration (admin only)
func (h *Handler) UpdateEmailConfig(c *gin.Context) {
	var req UpdateEmailConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get existing config to check if this is an update
	existingConfig, err := h.service.GetActiveEmailConfig()
	if err != nil {
		utils.Error(c, 3002, "Failed to get existing email configuration")
		return
	}

	// If password is empty and config exists, keep the old password
	password := req.SMTPPassword
	if password == "" && existingConfig != nil {
		password = existingConfig.SMTPPassword
	} else if password == "" && existingConfig == nil {
		// New config must have password
		utils.BadRequest(c, "Password is required for new email configuration")
		return
	}

	config := &model.EmailConfig{
		SMTPHost:     req.SMTPHost,
		SMTPPort:     req.SMTPPort,
		SMTPUser:     req.SMTPUser,
		SMTPPassword: password,
		FromEmail:    req.FromEmail,
		FromName:     req.FromName,
		IsActive:     true,
	}

	err = h.service.CreateEmailConfig(config)
	if err != nil {
		utils.Error(c, 3002, "Failed to update email configuration")
		return
	}

	utils.SuccessWithMessage(c, "Email configuration updated successfully", config)
}

// TestEmailConfigRequest represents a test email config request
type TestEmailConfigRequest struct {
	TestEmail string `json:"testEmail" binding:"required,email"`
}

// TestEmailConfig handles testing email configuration by sending a test email
// This endpoint uses the currently saved email configuration from database
// Admin must save the configuration first before testing
func (h *Handler) TestEmailConfig(c *gin.Context) {
	var req TestEmailConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get active email configuration from database
	emailConfig, err := h.service.GetActiveEmailConfig()
	if err != nil {
		utils.Error(c, 3005, "Failed to get email configuration")
		return
	}

	if emailConfig == nil {
		utils.Error(c, 3006, "No email configuration found. Please save configuration first.")
		return
	}

	// Prepare email content
	subject := "Scholay 邮箱配置测试"
	body := fmt.Sprintf(`
	<html>
	<body style="font-family: Arial, sans-serif; padding: 20px;">
		<h2 style="color: #2563eb;">邮箱配置测试成功！</h2>
		<p>您的 SMTP 邮箱配置已成功通过测试。</p>
		<hr style="border: 1px solid #e2e8f0; margin: 20px 0;">
		<h3>配置信息：</h3>
		<ul>
			<li><strong>SMTP服务器：</strong> %s</li>
			<li><strong>SMTP端口：</strong> %d</li>
			<li><strong>发件邮箱：</strong> %s</li>
			<li><strong>发件人名称：</strong> %s</li>
		</ul>
		<p style="color: #64748b; font-size: 0.875rem; margin-top: 20px;">
			这是一封自动发送的测试邮件，如果您收到此邮件，说明邮箱配置正确。
		</p>
	</body>
	</html>
	`, emailConfig.SMTPHost, emailConfig.SMTPPort, emailConfig.FromEmail, emailConfig.FromName)

	// Send email with TLS/SSL support using shared utility
	config := utils.EmailConfig{
		SMTPHost:     emailConfig.SMTPHost,
		SMTPPort:     emailConfig.SMTPPort,
		SMTPUser:     emailConfig.SMTPUser,
		SMTPPassword: emailConfig.SMTPPassword,
		FromEmail:    emailConfig.FromEmail,
		FromName:     emailConfig.FromName,
	}

	err = utils.SendEmailWithTLS(config, []string{req.TestEmail}, subject, body)
	if err != nil {
		utils.Error(c, 3007, fmt.Sprintf("Failed to send test email: %v", err))
		return
	}

	utils.SuccessWithMessage(c, "Test email sent successfully", nil)
}

// GetSystemConfig handles getting system configuration
func (h *Handler) GetSystemConfig(c *gin.Context) {
	config, err := h.service.GetSystemConfig()
	if err != nil {
		utils.Error(c, 3003, "Failed to get system configuration")
		return
	}

	if config == nil {
		// Return default if not found
		config = &model.SystemConfig{
			RequireEmailVerification: true,
		}
	}

	// Get GitHub OAuth configuration
	githubConfig, err := h.service.GetGithubOAuthConfig()
	if err != nil {
		// Log error but don't fail the request
		// GitHub config is optional
		githubConfig = nil
	}

	// Build response with system config and GitHub config
	response := map[string]interface{}{
		"id":                         config.ID,
		"require_email_verification": config.RequireEmailVerification,
		"enable_turnstile":           config.EnableTurnstile,
		"turnstile_site_key":         config.TurnstileSiteKey,
		"turnstile_secret_key":       config.TurnstileSecretKey,
		"created_at":                 config.CreatedAt,
		"updated_at":                 config.UpdatedAt,
	}

	// Add GitHub client_id if configured and enabled
	if githubConfig != nil && githubConfig.Enabled && githubConfig.ClientID != "" {
		response["github_client_id"] = githubConfig.ClientID
	}

	utils.Success(c, response)
}

// UpdateSystemConfigRequest represents an update system config request
// Using pointers for optional fields to distinguish between "not provided" and "empty string"
type UpdateSystemConfigRequest struct {
	RequireEmailVerification *bool   `json:"require_email_verification"`
	EnableTurnstile          *bool   `json:"enable_turnstile"`
	TurnstileSiteKey         *string `json:"turnstile_site_key"`
	TurnstileSecretKey       *string `json:"turnstile_secret_key"`
}

// UpdateSystemConfig handles updating system configuration (admin only)
// This endpoint supports partial updates - only provided fields will be updated
func (h *Handler) UpdateSystemConfig(c *gin.Context) {
	var req UpdateSystemConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Convert handler request to service request
	serviceReq := &SystemConfigPartialUpdate{
		RequireEmailVerification: req.RequireEmailVerification,
		EnableTurnstile:          req.EnableTurnstile,
		TurnstileSiteKey:         req.TurnstileSiteKey,
		TurnstileSecretKey:       req.TurnstileSecretKey,
	}

	err := h.service.UpdateSystemConfigPartial(serviceReq)
	if err != nil {
		utils.Error(c, 3004, "Failed to update system configuration")
		return
	}

	utils.SuccessWithMessage(c, "System configuration updated successfully", nil)
}

// GetSMSConfig handles getting active SMS configuration (admin only)
func (h *Handler) GetSMSConfig(c *gin.Context) {
	config, err := h.service.GetActiveSMSConfig()
	if err != nil {
		utils.Error(c, 3007, "Failed to get SMS configuration")
		return
	}

	if config == nil {
		// Return empty config if not found
		utils.Success(c, nil)
		return
	}

	// Check if client requests unmasked secret (via query parameter)
	showSecret := c.Query("show_secret") == "true"

	if !showSecret {
		// Mask the access secret for security
		config.AccessSecret = "********"
	}
	// If show_secret=true, return the real secret (client should verify admin first)

	utils.Success(c, config)
}

// UpdateSMSConfigRequest represents an update SMS config request
type UpdateSMSConfigRequest struct {
	AccessKeyID     string `json:"access_key_id" binding:"required"`
	AccessSecret    string `json:"access_secret"` // 不设置 required，允许留空
	SignName        string `json:"sign_name" binding:"required"`
	TemplateCode    string `json:"template_code" binding:"required"`
	TemplateContent string `json:"template_content" binding:"required"`
	Endpoint        string `json:"endpoint"`
}

// UpdateSMSConfig handles updating SMS configuration (admin only)
func (h *Handler) UpdateSMSConfig(c *gin.Context) {
	var req UpdateSMSConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get existing config to check if this is an update
	existingConfig, err := h.service.GetActiveSMSConfig()
	if err != nil {
		utils.Error(c, 3008, "Failed to get existing SMS configuration")
		return
	}

	// If access secret is empty and config exists, keep the old secret
	accessSecret := req.AccessSecret
	if accessSecret == "" && existingConfig != nil {
		accessSecret = existingConfig.AccessSecret
	} else if accessSecret == "" && existingConfig == nil {
		// New config must have access secret
		utils.BadRequest(c, "Access secret is required for new SMS configuration")
		return
	}

	endpoint := req.Endpoint
	if endpoint == "" {
		endpoint = "dypnsapi.aliyuncs.com" // Phone Number Service for verification codes
	}

	// Trim whitespace from all string fields to avoid issues
	config := &model.SMSConfig{
		AccessKeyID:     strings.TrimSpace(req.AccessKeyID),
		AccessSecret:    strings.TrimSpace(accessSecret),
		SignName:        strings.TrimSpace(req.SignName),
		TemplateCode:    strings.TrimSpace(req.TemplateCode),
		TemplateContent: strings.TrimSpace(req.TemplateContent),
		Endpoint:        strings.TrimSpace(endpoint),
		IsActive:        true,
	}

	err = h.service.CreateSMSConfig(config)
	if err != nil {
		utils.Error(c, 3008, "Failed to update SMS configuration")
		return
	}

	utils.SuccessWithMessage(c, "SMS configuration updated successfully", config)
}

// TestSMSConfigRequest represents a test SMS config request
type TestSMSConfigRequest struct {
	AccessKeyID     string `json:"access_key_id"`
	AccessSecret    string `json:"access_secret"`
	SignName        string `json:"sign_name"`
	TemplateCode    string `json:"template_code"`
	TemplateContent string `json:"template_content"`
	Endpoint        string `json:"endpoint"`
	PhoneNumber     string `json:"phone_number" binding:"required"`
	UseSavedConfig  bool   `json:"use_saved_config"` // 是否使用已保存的配置
}

// TestSMSConfig handles testing SMS configuration by sending a test SMS
func (h *Handler) TestSMSConfig(c *gin.Context) {
	var req TestSMSConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	var smsConfig utils.SMSConfig
	var templateContent string

	// If using saved config, load from database
	if req.UseSavedConfig || req.AccessSecret == "" || req.AccessSecret == "********" {
		savedConfig, err := h.service.GetActiveSMSConfig()
		if err != nil {
			utils.Error(c, 3010, "Failed to get saved SMS configuration")
			return
		}
		if savedConfig == nil {
			utils.Error(c, 3011, "No saved SMS configuration found")
			return
		}

		// Use saved config
		endpoint := savedConfig.Endpoint
		if endpoint == "" {
			endpoint = "dypnsapi.aliyuncs.com"
		}

		smsConfig = utils.SMSConfig{
			AccessKeyID:     savedConfig.AccessKeyID,
			AccessSecret:    savedConfig.AccessSecret, // Use real secret from DB
			SignName:        savedConfig.SignName,
			TemplateCode:    savedConfig.TemplateCode,
			TemplateContent: savedConfig.TemplateContent,
			Endpoint:        endpoint,
		}
		templateContent = savedConfig.TemplateContent
	} else {
		// Use provided config (editing mode)
		endpoint := req.Endpoint
		if endpoint == "" {
			endpoint = "dypnsapi.aliyuncs.com"
		}

		smsConfig = utils.SMSConfig{
			AccessKeyID:     req.AccessKeyID,
			AccessSecret:    req.AccessSecret,
			SignName:        req.SignName,
			TemplateCode:    req.TemplateCode,
			TemplateContent: req.TemplateContent,
			Endpoint:        endpoint,
		}
		templateContent = req.TemplateContent
	}

	// Extract template variables from template content
	variables := utils.ExtractTemplateVariables(templateContent)

	// Build test parameters based on detected variables
	testParams := make(map[string]string)
	for _, varName := range variables {
		switch varName {
		case "code":
			testParams["code"] = "123456"
		case "min", "minute", "minutes":
			testParams[varName] = "5"
		case "product":
			testParams["product"] = "Scholay"
		default:
			// For unknown variables, use a placeholder
			testParams[varName] = "测试值"
		}
	}

	// Send test SMS using PNS CallApi method
	err := utils.SendSMSVerifyCodePNS(smsConfig, req.PhoneNumber, testParams)
	if err != nil {
		utils.Error(c, 3009, fmt.Sprintf("Failed to send test SMS: %v", err))
		return
	}

	utils.SuccessWithMessage(c, "Test SMS sent successfully", nil)
}

// ============================================
// GitHub OAuth Configuration Handlers
// ============================================

// GetGithubOAuthConfig handles getting GitHub OAuth configuration
func (h *Handler) GetGithubOAuthConfig(c *gin.Context) {
	config, err := h.service.GetGithubOAuthConfig()
	if err != nil {
		utils.Error(c, 3020, "Failed to get GitHub OAuth configuration")
		return
	}

	if config == nil {
		// Return default empty config if not found
		config = &model.GithubOAuthConfig{
			ClientID:     "",
			ClientSecret: "",
			RedirectURI:  "",
			Enabled:      false,
		}
	}

	utils.Success(c, config)
}

// UpdateGithubOAuthConfigRequest represents an update GitHub OAuth config request
type UpdateGithubOAuthConfigRequest struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RedirectURI  string `json:"redirect_uri"`
	Enabled      bool   `json:"enabled"`
}

// UpdateGithubOAuthConfig handles updating GitHub OAuth configuration (admin only)
func (h *Handler) UpdateGithubOAuthConfig(c *gin.Context) {
	var req UpdateGithubOAuthConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Generate full callback URL from base domain
	callbackURL := req.RedirectURI
	if callbackURL != "" && !strings.HasSuffix(callbackURL, "/github/callback") {
		callbackURL = strings.TrimSuffix(callbackURL, "/") + "/github/callback"
	}

	err := h.service.UpdateGithubOAuthConfig(req.ClientID, req.ClientSecret, callbackURL, req.Enabled)
	if err != nil {
		utils.Error(c, 3021, "Failed to update GitHub OAuth configuration")
		return
	}

	utils.SuccessWithMessage(c, "GitHub OAuth configuration updated successfully", nil)
}

// ============================================
// Code Snippets (SEO/广告) Handler Methods
// ============================================

// CreateCodeSnippetRequest 创建代码片段请求
type CreateCodeSnippetRequest struct {
	Name        string   `json:"name" binding:"required"`
	CodeKey     string   `json:"code_key" binding:"required"`
	Category    string   `json:"category" binding:"required,oneof=seo analytics ad social other"`
	Position    string   `json:"position" binding:"required,oneof=head body_start body_end"`
	CodeContent string   `json:"code_content" binding:"required"`
	Description string   `json:"description"`
	IsEnabled   bool     `json:"is_enabled"`
	Priority    int      `json:"priority"`
	Pages       []string `json:"pages"`
}

// UpdateCodeSnippetRequest 更新代码片段请求
type UpdateCodeSnippetRequest struct {
	Name        string   `json:"name"`
	Category    string   `json:"category" binding:"omitempty,oneof=seo analytics ad social other"`
	Position    string   `json:"position" binding:"omitempty,oneof=head body_start body_end"`
	CodeContent string   `json:"code_content"`
	Description string   `json:"description"`
	IsEnabled   *bool    `json:"is_enabled"`
	Priority    *int     `json:"priority"`
	Pages       []string `json:"pages"`
}

// ListCodeSnippets 获取代码片段列表（管理端）
func (h *Handler) ListCodeSnippets(c *gin.Context) {
	category := c.Query("category")
	snippets, err := h.service.ListCodeSnippets(category)
	if err != nil {
		utils.Error(c, 3030, "获取代码片段列表失败")
		return
	}
	utils.Success(c, snippets)
}

// GetCodeSnippet 获取单个代码片段（管理端）
func (h *Handler) GetCodeSnippet(c *gin.Context) {
	var id uint
	if _, err := fmt.Sscanf(c.Param("id"), "%d", &id); err != nil {
		utils.BadRequest(c, "无效的ID")
		return
	}

	snippet, err := h.service.GetCodeSnippetByID(id)
	if err != nil {
		utils.Error(c, 3031, "代码片段不存在")
		return
	}
	utils.Success(c, snippet)
}

// CreateCodeSnippet 创建代码片段（管理端）
func (h *Handler) CreateCodeSnippet(c *gin.Context) {
	var req CreateCodeSnippetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数无效: "+err.Error())
		return
	}

	snippet := &model.CodeSnippet{
		Name:        req.Name,
		CodeKey:     req.CodeKey,
		Category:    model.CodeSnippetCategory(req.Category),
		Position:    model.CodeSnippetPosition(req.Position),
		CodeContent: req.CodeContent,
		Description: req.Description,
		IsEnabled:   req.IsEnabled,
		Priority:    req.Priority,
		Pages:       req.Pages,
	}

	if err := h.service.CreateCodeSnippet(snippet); err != nil {
		if strings.Contains(err.Error(), "Duplicate") || strings.Contains(err.Error(), "uk_code_key") {
			utils.Error(c, 3032, "代码标识键已存在")
			return
		}
		utils.Error(c, 3033, "创建代码片段失败")
		return
	}

	// Invalidate index.html cache to reflect new code snippet
	h.InvalidateIndexHTMLCache()

	utils.SuccessWithMessage(c, "代码片段创建成功", snippet)
}

// UpdateCodeSnippet 更新代码片段（管理端）
func (h *Handler) UpdateCodeSnippet(c *gin.Context) {
	var id uint
	if _, err := fmt.Sscanf(c.Param("id"), "%d", &id); err != nil {
		utils.BadRequest(c, "无效的ID")
		return
	}

	var req UpdateCodeSnippetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数无效: "+err.Error())
		return
	}

	snippet, err := h.service.GetCodeSnippetByID(id)
	if err != nil {
		utils.Error(c, 3031, "代码片段不存在")
		return
	}

	// 更新字段
	if req.Name != "" {
		snippet.Name = req.Name
	}
	if req.Category != "" {
		snippet.Category = model.CodeSnippetCategory(req.Category)
	}
	if req.Position != "" {
		snippet.Position = model.CodeSnippetPosition(req.Position)
	}
	if req.CodeContent != "" {
		snippet.CodeContent = req.CodeContent
	}
	if req.Description != "" {
		snippet.Description = req.Description
	}
	if req.IsEnabled != nil {
		snippet.IsEnabled = *req.IsEnabled
	}
	if req.Priority != nil {
		snippet.Priority = *req.Priority
	}
	if req.Pages != nil {
		snippet.Pages = req.Pages
	}

	if err := h.service.UpdateCodeSnippet(snippet); err != nil {
		utils.Error(c, 3034, "更新代码片段失败")
		return
	}

	// Invalidate index.html cache to reflect updated code snippet
	h.InvalidateIndexHTMLCache()

	utils.SuccessWithMessage(c, "代码片段更新成功", snippet)
}

// DeleteCodeSnippet 删除代码片段（管理端）
func (h *Handler) DeleteCodeSnippet(c *gin.Context) {
	var id uint
	if _, err := fmt.Sscanf(c.Param("id"), "%d", &id); err != nil {
		utils.BadRequest(c, "无效的ID")
		return
	}

	if err := h.service.DeleteCodeSnippet(id); err != nil {
		utils.Error(c, 3035, "删除代码片段失败")
		return
	}

	// Invalidate index.html cache to reflect deleted code snippet
	h.InvalidateIndexHTMLCache()

	utils.SuccessWithMessage(c, "代码片段删除成功", nil)
}

// GetCodeSnippetsForUser 获取用户端代码片段（公开接口，用于用户端前端注入）
func (h *Handler) GetCodeSnippetsForUser(c *gin.Context) {
	result, err := h.service.GetCodeSnippetsGrouped()
	if err != nil {
		utils.Error(c, 3036, "获取代码片段失败")
		return
	}
	utils.Success(c, result)
}

// ============================================
// SSR Code Snippet Injection Methods
// 服务端渲染代码片段注入 - 让代码在网页源码中可见
// ============================================

const (
	// indexHTMLCacheTTL is how long to cache the original index.html
	indexHTMLCacheTTL = 5 * time.Minute
)

// ServeIndexHTML serves the index.html with code snippets injected
// This enables SSR-like behavior for code snippets, making them visible in page source
func (h *Handler) ServeIndexHTML(c *gin.Context) {
	// Get the original index.html content
	indexHTML, err := h.getIndexHTML()
	if err != nil {
		log.Printf("Failed to get index.html: %v", err)
		// Fallback: proxy to frontend container
		h.proxyToFrontend(c)
		return
	}

	// Get code snippets from database
	snippetsGrouped, err := h.service.GetCodeSnippetsGrouped()
	if err != nil {
		log.Printf("Failed to get code snippets: %v", err)
		// Return original HTML without snippets
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.Header("Cache-Control", "no-cache, must-revalidate")
		c.String(http.StatusOK, indexHTML)
		return
	}

	// Inject code snippets into HTML
	modifiedHTML := h.injectCodeSnippets(indexHTML, snippetsGrouped)

	// Return the modified HTML
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Header("Cache-Control", "no-cache, must-revalidate")
	c.String(http.StatusOK, modifiedHTML)
}

// getIndexHTML fetches and caches the original index.html from the frontend container
func (h *Handler) getIndexHTML() (string, error) {
	h.indexHTMLCacheMu.RLock()
	if h.indexHTMLCache != "" && time.Since(h.indexHTMLCacheTime) < indexHTMLCacheTTL {
		cached := h.indexHTMLCache
		h.indexHTMLCacheMu.RUnlock()
		return cached, nil
	}
	h.indexHTMLCacheMu.RUnlock()

	// Fetch from frontend container
	h.indexHTMLCacheMu.Lock()
	defer h.indexHTMLCacheMu.Unlock()

	// Double-check after acquiring write lock
	if h.indexHTMLCache != "" && time.Since(h.indexHTMLCacheTime) < indexHTMLCacheTTL {
		return h.indexHTMLCache, nil
	}

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get(h.frontendURL + "/")
	if err != nil {
		return "", fmt.Errorf("failed to fetch index.html from frontend: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("frontend returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read index.html body: %w", err)
	}

	h.indexHTMLCache = string(body)
	h.indexHTMLCacheTime = time.Now()

	log.Printf("index.html cached successfully (%d bytes)", len(body))
	return h.indexHTMLCache, nil
}

// injectCodeSnippets injects code snippets into the HTML at appropriate positions
func (h *Handler) injectCodeSnippets(html string, snippets *model.CodeSnippetsGroupedResponse) string {
	if snippets == nil {
		return html
	}

	result := html

	// Build head snippets content
	if len(snippets.Head) > 0 {
		var headContent strings.Builder
		headContent.WriteString("\n<!-- SSR Code Snippets: head -->\n")
		headContent.WriteString("<script>window.__SSR_SNIPPETS_INJECTED__=true;</script>\n")
		for _, s := range snippets.Head {
			headContent.WriteString(s.CodeContent)
			headContent.WriteString("\n")
		}
		headContent.WriteString("<!-- End SSR Code Snippets: head -->\n")

		// Inject before </head>
		result = strings.Replace(result, "</head>", headContent.String()+"</head>", 1)
	} else {
		// Still add the flag even if no head snippets
		flagScript := "\n<!-- SSR Code Snippets -->\n<script>window.__SSR_SNIPPETS_INJECTED__=true;</script>\n<!-- End SSR Code Snippets -->\n"
		result = strings.Replace(result, "</head>", flagScript+"</head>", 1)
	}

	// Build body_start snippets content
	if len(snippets.BodyStart) > 0 {
		var bodyStartContent strings.Builder
		bodyStartContent.WriteString("\n<!-- SSR Code Snippets: body_start -->\n")
		for _, s := range snippets.BodyStart {
			bodyStartContent.WriteString(s.CodeContent)
			bodyStartContent.WriteString("\n")
		}
		bodyStartContent.WriteString("<!-- End SSR Code Snippets: body_start -->\n")

		// Inject after <body> (handle potential attributes on body tag)
		bodyTagRegex := regexp.MustCompile(`(?i)(<body[^>]*>)`)
		result = bodyTagRegex.ReplaceAllString(result, "${1}"+bodyStartContent.String())
	}

	// Build body_end snippets content
	if len(snippets.BodyEnd) > 0 {
		var bodyEndContent strings.Builder
		bodyEndContent.WriteString("\n<!-- SSR Code Snippets: body_end -->\n")
		for _, s := range snippets.BodyEnd {
			bodyEndContent.WriteString(s.CodeContent)
			bodyEndContent.WriteString("\n")
		}
		bodyEndContent.WriteString("<!-- End SSR Code Snippets: body_end -->\n")

		// Inject before </body>
		result = strings.Replace(result, "</body>", bodyEndContent.String()+"</body>", 1)
	}

	return result
}

// proxyToFrontend proxies the request to the frontend container
func (h *Handler) proxyToFrontend(c *gin.Context) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	resp, err := client.Get(h.frontendURL + c.Request.URL.Path)
	if err != nil {
		c.String(http.StatusBadGateway, "Failed to proxy to frontend")
		return
	}
	defer resp.Body.Close()

	// Copy headers
	for key, values := range resp.Header {
		for _, value := range values {
			c.Header(key, value)
		}
	}

	body, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), body)
}

// InvalidateIndexHTMLCache invalidates the cached index.html
// Call this when code snippets are updated to ensure fresh content
func (h *Handler) InvalidateIndexHTMLCache() {
	h.indexHTMLCacheMu.Lock()
	defer h.indexHTMLCacheMu.Unlock()
	h.indexHTMLCache = ""
	h.indexHTMLCacheTime = time.Time{}
	log.Println("index.html cache invalidated")
}

// RegisterRoutes registers config routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	config := router.Group("/config")
	{
		// Public endpoints
		config.GET("/privacy-policy", h.GetPrivacyPolicy)
		config.GET("/terms-of-service", h.GetTermsOfService)
		config.GET("/system", h.GetSystemConfig)
		// 用户端代码片段（公开接口）
		config.GET("/code-snippets", h.GetCodeSnippetsForUser)
	}
}

// ============================================
// Dynamic Sitemap Generation
// 动态 sitemap 生成 - 包含热门论文页面
// ============================================

// ServeDynamicSitemap 生成并返回动态 sitemap（XML 格式）
// 包含静态页面和热门论文页面
func (h *Handler) ServeDynamicSitemap(c *gin.Context) {
	baseURL := "https://www.scholay.com"
	today := time.Now().Format("2006-01-02")

	var sitemapBuilder strings.Builder
	sitemapBuilder.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
`)

	// 静态页面
	staticPages := []struct {
		Path       string
		ChangeFreq string
		Priority   string
	}{
		{"/", "daily", "1.0"},
		{"/search-results", "daily", "0.9"},
		{"/chat", "weekly", "0.8"},
		{"/assistant", "weekly", "0.8"},
		{"/peer-review", "weekly", "0.8"},
		{"/pricing", "monthly", "0.7"},
		{"/fund-center", "weekly", "0.6"},
		{"/about", "monthly", "0.6"},
		{"/privacy", "monthly", "0.5"},
		{"/terms", "monthly", "0.5"},
		{"/feedback", "monthly", "0.5"},
		{"/contact", "monthly", "0.6"},
		{"/disclaimer", "monthly", "0.5"},
	}

	for _, page := range staticPages {
		sitemapBuilder.WriteString(fmt.Sprintf(`
  <url>
    <loc>%s%s</loc>
    <lastmod>%s</lastmod>
    <changefreq>%s</changefreq>
    <priority>%s</priority>
  </url>`, baseURL, page.Path, today, page.ChangeFreq, page.Priority))
	}

	// 动态论文页面（基于访问统计）
	if h.usageLogService != nil {
		papers, err := h.usageLogService.GetPopularPaperIDs(30, 200) // 最近30天，最多200篇
		if err != nil {
			log.Printf("Failed to get popular papers for sitemap: %v", err)
		} else {
			sitemapBuilder.WriteString(`

  <!-- Popular Paper Pages (dynamically generated based on access statistics) -->`)
			for i, paper := range papers {
				// 根据访问量设置优先级
				priority := "0.6"
				if i < 10 {
					priority = "0.8"
				} else if i < 50 {
					priority = "0.7"
				}

				sitemapBuilder.WriteString(fmt.Sprintf(`
  <url>
    <loc>%s/paper/%s</loc>
    <lastmod>%s</lastmod>
    <changefreq>weekly</changefreq>
    <priority>%s</priority>
  </url>`, baseURL, paper.PaperID, today, priority))
			}
		}
	}

	sitemapBuilder.WriteString(`
</urlset>
`)

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=3600") // 缓存1小时
	c.String(http.StatusOK, sitemapBuilder.String())
}

// ServeSitemapIndex 生成 sitemap 索引文件
// 用于当 sitemap 太大时分割成多个文件
func (h *Handler) ServeSitemapIndex(c *gin.Context) {
	baseURL := "https://www.scholay.com"
	today := time.Now().Format("2006-01-02")

	sitemapIndex := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>%s/sitemap.xml</loc>
    <lastmod>%s</lastmod>
  </sitemap>
  <sitemap>
    <loc>%s/sitemap-papers.xml</loc>
    <lastmod>%s</lastmod>
  </sitemap>
</sitemapindex>
`, baseURL, today, baseURL, today)

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=86400") // 缓存24小时
	c.String(http.StatusOK, sitemapIndex)
}
