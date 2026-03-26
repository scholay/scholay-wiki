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

// htmlCacheEntry stores a cached HTML page with its expiry time
type htmlCacheEntry struct {
	html      string
	fetchedAt time.Time
}

// Handler handles HTTP requests for configuration operations
type Handler struct {
	service *Service

	// SSR code snippet injection fields - 按路由缓存 HTML
	htmlCacheMap map[string]*htmlCacheEntry // key: request path (e.g. "/about"), value: cached HTML
	htmlCacheMu  sync.RWMutex              // Mutex for cache access
	frontendURL  string                     // URL to fetch HTML from frontend container

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
		service:      service,
		frontendURL:  frontendURL,
		htmlCacheMap: make(map[string]*htmlCacheEntry),
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

// isSuspiciousPath returns true for paths that are clearly not valid frontend routes
// (e.g., scanner/bot probes like .php, .asp, .env, wp-admin, etc.)
func isSuspiciousPath(path string) bool {
	suspiciousSuffixes := []string{
		".php", ".asp", ".aspx", ".jsp", ".cgi", ".pl",
		".env", ".git", ".bak", ".sql", ".yml", ".yaml",
		".xml", ".log", ".ini", ".conf", ".config",
	}
	suspiciousPrefixes := []string{
		"/wp-", "/wordpress", "/admin/", "/cgi-bin/",
		"/.well-known/", "/vendor/", "/node_modules/",
	}
	lowerPath := strings.ToLower(path)
	for _, suffix := range suspiciousSuffixes {
		if strings.HasSuffix(lowerPath, suffix) {
			return true
		}
	}
	for _, prefix := range suspiciousPrefixes {
		if strings.HasPrefix(lowerPath, prefix) {
			return true
		}
	}
	return false
}

// ServeIndexHTML serves the route-specific HTML with code snippets injected.
// For each request path (e.g. /about, /privacy), it fetches the corresponding
// pre-rendered HTML from the frontend container, which has unique title,
// description, canonical URL and noscript content for SEO/AdSense compliance.
func (h *Handler) ServeIndexHTML(c *gin.Context) {
	requestPath := c.Request.URL.Path
	if requestPath == "" {
		requestPath = "/"
	}

	if isSuspiciousPath(requestPath) {
		c.String(http.StatusNotFound, "Not Found")
		return
	}

	// Get the route-specific HTML content from frontend
	pageHTML, err := h.getPageHTML(requestPath)
	if err != nil {
		log.Printf("Failed to get HTML for %s: %v", requestPath, err)
		// Fallback: proxy to frontend container directly
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
		c.String(http.StatusOK, pageHTML)
		return
	}

	// Inject code snippets into HTML
	modifiedHTML := h.injectCodeSnippets(pageHTML, snippetsGrouped)

	// Inject route-specific noscript content for SEO (Google AdSense compliance)
	modifiedHTML = injectRouteNoscript(modifiedHTML, requestPath)

	// Return the modified HTML
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Header("Cache-Control", "no-cache, must-revalidate")
	c.String(http.StatusOK, modifiedHTML)
}

// ssrHTTPClient is a shared HTTP client for SSR fetches with sensible limits
var ssrHTTPClient = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        20,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     60 * time.Second,
	},
}

// getPageHTML fetches and caches the HTML for a specific route from the frontend container.
// Each route (e.g. /about, /privacy) may have its own pre-rendered HTML with unique
// meta tags (title, description, canonical) and noscript content for SEO.
func (h *Handler) getPageHTML(requestPath string) (string, error) {
	if requestPath == "" {
		requestPath = "/"
	}

	// Check cache first (read lock)
	h.htmlCacheMu.RLock()
	if entry, ok := h.htmlCacheMap[requestPath]; ok && time.Since(entry.fetchedAt) < indexHTMLCacheTTL {
		cached := entry.html
		h.htmlCacheMu.RUnlock()
		return cached, nil
	}
	h.htmlCacheMu.RUnlock()

	// Fetch from frontend WITHOUT holding the lock to avoid blocking all requests
	fetchURL := h.frontendURL + requestPath
	resp, err := ssrHTTPClient.Get(fetchURL)
	if err != nil {
		return "", fmt.Errorf("failed to fetch HTML for %s from frontend: %w", requestPath, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		return "", fmt.Errorf("frontend returned status %d for %s", resp.StatusCode, requestPath)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return "", fmt.Errorf("failed to read HTML body for %s: %w", requestPath, err)
	}

	html := string(body)

	// Now take write lock only for the cache update (fast operation)
	h.htmlCacheMu.Lock()
	h.htmlCacheMap[requestPath] = &htmlCacheEntry{
		html:      html,
		fetchedAt: time.Now(),
	}
	h.htmlCacheMu.Unlock()

	log.Printf("HTML for %s cached successfully (%d bytes)", requestPath, len(body))
	return html, nil
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

// injectRouteNoscript injects route-specific SEO text into the #seo-fallback div.
// The div uses display:none so JS-enabled browsers never render it;
// a <noscript><style> override makes it visible when JS is unavailable.
// This is critical for Google AdSense "low value content" compliance.
func injectRouteNoscript(html string, path string) string {
	routeContent := getRouteNoscriptContent(path)
	if routeContent == "" {
		return html
	}

	// Insert before the #seo-js-notice paragraph inside #seo-fallback
	marker := `<p id="seo-js-notice"`
	if idx := strings.Index(html, marker); idx > 0 {
		return html[:idx] + routeContent + "\n" + html[idx:]
	}

	// Fallback: insert before closing </div> of #seo-fallback
	fallbackEnd := `</div>` + "\n" + `    <noscript>`
	if idx := strings.Index(html, fallbackEnd); idx > 0 {
		return html[:idx] + routeContent + "\n" + html[idx:]
	}

	return html
}

// getRouteNoscriptContent returns route-specific HTML for noscript injection
func getRouteNoscriptContent(path string) string {
	baseStyle := `style="max-width: 1000px; margin: 20px auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e0e0e0;"`
	headingStyle := `style="color: #ffffff; border-bottom: 1px solid #424242; padding-bottom: 10px;"`
	textStyle := `style="color: #bdbdbd; line-height: 1.8; margin-bottom: 12px;"`

	switch {
	case path == "/resources":
		return fmt.Sprintf(`<section %s>
<h2 %s>学术资源中心</h2>
<p %s>Scholay 学术资源中心提供原创学术指南，涵盖文献检索技巧、论文写作方法、引用格式规范、研究方法论和 AI 学术工具使用教程，助力科研工作者提升效率。</p>
<ul style="color: #bdbdbd; line-height: 2; padding-left: 24px;">
<li><a href="/resources/how-to-search" style="color: #64b5f6;">如何高效检索学术文献：从入门到精通</a> - 掌握布尔运算符、关键词策略和数据库筛选技巧</li>
<li><a href="/resources/literature-review-guide" style="color: #64b5f6;">文献综述撰写全攻略</a> - 结构、方法与常见误区</li>
<li><a href="/resources/paper-writing-tips" style="color: #64b5f6;">学术论文写作技巧</a> - 从标题构思到结论撰写的实用指南</li>
<li><a href="/resources/citation-guide" style="color: #64b5f6;">学术引用格式完全指南</a> - APA、MLA、Chicago 与 IEEE 格式对比</li>
<li><a href="/resources/research-methodology" style="color: #64b5f6;">研究方法论入门</a> - 定量、定性与混合方法的选择</li>
<li><a href="/resources/ai-in-research" style="color: #64b5f6;">AI 在学术研究中的应用</a> - 机遇、实践与伦理思考</li>
<li><a href="/resources/peer-review-guide" style="color: #64b5f6;">同行评审完全指南</a> - 如何写出高质量的审稿意见</li>
<li><a href="/resources/latex-tutorial" style="color: #64b5f6;">LaTeX 入门教程</a> - 学术排版的必备技能</li>
<li><a href="/resources/ai-review-tutorial" style="color: #64b5f6;">AI 智能审稿使用教程</a> - 从上传到获取专业审稿报告</li>
<li><a href="/resources/online-latex-quickstart" style="color: #64b5f6;">在线 LaTeX 编辑器快速入门</a> - ScholayPrism 使用指南</li>
<li><a href="/resources/academic-ai-tools-compliance-guide" style="color: #64b5f6;">学术 AI 工具合规使用指南</a> - 伦理与最佳实践</li>
</ul>
</section>`, baseStyle, headingStyle, textStyle)

	case strings.HasPrefix(path, "/resources/"):
		slug := strings.TrimPrefix(path, "/resources/")
		return getArticleNoscript(slug, baseStyle, headingStyle, textStyle)

	case path == "/help":
		return fmt.Sprintf(`<section %s>
<h2 %s>帮助中心</h2>
<p %s>了解 Scholay 的核心功能和使用方法。Scholay 是一个 AI 驱动的学术搜索平台，整合了 Semantic Scholar 超过 2 亿篇学术论文资源。</p>
<h3 style="color: #ffffff;">核心功能</h3>
<ul style="color: #bdbdbd; line-height: 2; padding-left: 24px;">
<li><strong>学术文献检索</strong> - 直接检索和智能检索两种模式，支持布尔运算符和自然语言查询</li>
<li><strong>AI 论文分析</strong> - 利用大语言模型提供论文的深度分析报告，包含核心贡献、方法论和创新点</li>
<li><strong>AI 学术聊天</strong> - 与 AI 助手进行学术对话，获取研究灵感和论文写作辅助</li>
<li><strong>AI 智能审稿</strong> - 上传论文获取 AI 生成的专业审稿意见和改进建议</li>
<li><strong>ScholayPrism LaTeX 编辑器</strong> - 在线 LaTeX 学术写作工作空间，集成 AI 辅助写作</li>
</ul>
<h3 style="color: #ffffff;">常见问题</h3>
<dl style="color: #bdbdbd; line-height: 1.8;">
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">Scholay 是免费的吗？</dt>
<dd>Scholay 提供免费基础版，包含学术检索和有限次数的 AI 分析功能。高级功能需要订阅付费方案。</dd>
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">如何注册和登录？</dt>
<dd>支持邮箱注册、GitHub 账号登录和微信登录三种方式。</dd>
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">AI 分析结果准确吗？</dt>
<dd>AI 分析基于先进的大语言模型，能较好地理解学术论文，但仅供参考，建议结合原文进行人工验证。</dd>
</dl>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/assistant":
		return fmt.Sprintf(`<section %s>
<h2 %s>精品 AI 工具</h2>
<p %s>Scholay 将先进的人工智能技术与学术研究深度融合，打造了一套专业的 AI 学术工具集。</p>
<dl style="color: #bdbdbd; line-height: 1.8;">
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">智能助手</dt>
<dd>支持多种大语言模型，帮助解答学术问题、讨论研究方向、分析论文观点、生成文献综述。</dd>
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">智能审稿</dt>
<dd>AI 从论文结构、方法论、论证逻辑等多维度进行全面评估，提供专业修改意见和改进建议。</dd>
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">ScholayPrism LaTeX 编辑器</dt>
<dd>原生支持 LaTeX 的在线学术写作工作空间，实时编译预览，内置多种学术模板。</dd>
</dl>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/search-results":
		return fmt.Sprintf(`<section %s>
<h2 %s>学术搜索</h2>
<p %s>Scholay 学术搜索覆盖超过 2 亿篇学术论文，支持直接检索和 AI 智能检索两种模式。使用布尔运算符（AND、OR、NOT）和精确短语检索提升搜索精度。结果可按相关度、被引次数和发表时间排序，并支持按年份、领域、论文类型等条件筛选。</p>
<p %s>热门研究领域包括：深度学习、量子计算、CRISPR 基因编辑、气候变化、大语言模型、新能源技术、计算机视觉、自然语言处理、生物信息学等。</p>
</section>`, baseStyle, headingStyle, textStyle, textStyle)

	case path == "/chat":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 学术聊天</h2>
<p %s>Scholay AI 助手可以帮您解答学术问题、讨论研究方向、分析论文观点、生成文献综述等。支持多种 AI 模型选择，对话内容支持上下文连续交流。您可以直接粘贴论文片段让 AI 解读，或请 AI 帮助改善论文表达。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/peer-review":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 智能审稿</h2>
<p %s>Scholay 智能审稿服务模拟同行评审流程，从论文结构、方法论严谨性、论证逻辑、写作质量等多个维度对论文进行全面评估。支持 PDF 上传和文本粘贴两种方式提交论文，审稿报告按问题严重性分级，并提供具体的修改建议和改进方向。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/features/ai-review":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 智能审稿 - Scholay 学术论文审稿工具</h2>
<p %s>Scholay AI 智能审稿工具为研究人员提供专业的论文评估服务。上传 PDF 或粘贴文本，AI 将从论文结构、方法论严谨性、论证逻辑、统计分析、参考文献质量等多维度进行全面评估。支持 SCI/SSCI 期刊投稿标准审查，生成结构化审稿报告，帮助研究者在正式提交前发现并修正论文不足。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/features/ai-search":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 学术搜索 - 智能文献检索引擎</h2>
<p %s>Scholay AI 学术搜索整合超过 2 亿篇学术论文，支持自然语言查询和语义检索。通过 AI 理解研究意图，自动展开同义词和相关概念搜索，提供精准的学术文献推荐。支持按引用网络发现关键论文，帮助快速构建完整的文献图谱。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/features/ai-writing":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 学术写作助手 - ScholayPrism LaTeX 编辑器</h2>
<p %s>ScholayPrism 是 Scholay 推出的在线 LaTeX 学术写作工作空间，集成 AI 辅助写作功能。支持实时编译预览、多种学术期刊模板、智能公式补全、参考文献自动管理。AI 可协助润色学术表达、检查语法错误、优化段落结构，帮助研究者高效完成高质量学术论文。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/features/ai-translation":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 学术翻译 - 专业论文翻译工具</h2>
<p %s>Scholay AI 学术翻译专为学术场景优化，准确翻译论文摘要、全文和技术术语。支持中英双向翻译，保持学术文体和专业表达，自动识别并保留公式、引用格式和专有名词。适用于论文投稿前的英文润色、外文文献快速阅读和跨语言学术交流。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/features/data-extraction":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 数据提取 - 学术论文表格与数据提取工具</h2>
<p %s>Scholay AI 数据提取工具自动识别论文中的表格、图表和实验数据，将其转换为结构化格式（CSV/Excel）。支持从 PDF 论文中批量提取统计数据、实验结果和对比表格，帮助研究者快速完成系统综述和荟萃分析的数据收集工作。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/features/journal-matcher":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 期刊推荐 - 智能期刊匹配工具</h2>
<p %s>Scholay AI 期刊推荐系统分析论文的研究主题、方法论和目标受众，智能匹配最适合投稿的学术期刊。提供期刊影响因子、审稿周期、接收率等关键信息，帮助研究者选择合适的 SCI/SSCI/EI 期刊，提升投稿成功率。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/review":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 深度审稿 - Scholay V2 学术论文审稿工具</h2>
<p %s>Scholay V2 AI 深度审稿工具利用先进的 AI Agent 技术和联网搜索能力，对学术论文进行五维度深度审查。与传统 AI 审稿不同，Scholay 可以实时联网验证每一条参考文献的真实性，检测伪造引用；搜索该领域的里程碑论文，发现文献覆盖度不足；并从方法论严谨性、统计分析合理性、逻辑推理完整性等维度进行尖锐评估。审稿报告按严重程度分级，给出明确的发表建议（Accept/Revision/Reject）。支持 PDF、DOCX、LaTeX 格式论文上传，适用于 SCI/SSCI/EI 期刊投稿前的自查。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/features/ai-assistant":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 学术对话 - 智能研究助手</h2>
<p %s>Scholay AI 学术对话助手支持自然语言交互，帮助研究者解答学术问题、讨论研究方向、分析论文观点、生成文献综述。支持多种大语言模型选择，可进行连续上下文对话，理解复杂的学术讨论。适用于科研灵感探索、论文写作辅导和学术概念解释。</p>
</section>`, baseStyle, headingStyle, textStyle)

	default:
		return ""
	}
}

// getArticleNoscript returns noscript HTML for specific article pages
func getArticleNoscript(slug, baseStyle, headingStyle, textStyle string) string {
	articleMeta := map[string][2]string{
		"how-to-search":          {"如何高效检索学术文献：从入门到精通", "学术文献检索是每位研究者的基本功。本文系统介绍学术文献检索的方法论和实用技巧，包括如何明确检索目标、掌握布尔检索逻辑、选择合适的学术数据库、评估文献质量和管理检索结果。掌握这些技巧能大幅提升科研效率，帮助你更快找到高质量的学术论文。"},
		"literature-review-guide": {"文献综述撰写全攻略：结构、方法与常见误区", "文献综述是学术论文中最基础也最重要的组成部分。本文详细介绍叙述性综述、系统性综述和元分析三种类型的写作要点，以及系统化的文献收集策略、文献综述的结构组织方法、批判性分析技巧和常见写作误区的解决方案。"},
		"paper-writing-tips":      {"学术论文写作技巧：如何让你的研究脱颖而出", "从标题构思到结论撰写，本文分享学术论文各部分的实用写作技巧。包括如何撰写吸引人的标题和摘要、使用倒漏斗结构写好引言、确保方法部分的可重复性、客观呈现结果并深入讨论，以及学术写作的风格和语言建议。"},
		"citation-guide":          {"学术引用格式完全指南：APA、MLA、Chicago 与 IEEE", "详细对比四大主流引用格式的使用规则与适用场景。涵盖 APA 第 7 版、MLA 第 9 版、Chicago 第 17 版和 IEEE 格式的核心特点、内文引用方式和参考文献列表格式，以及如何根据学科和期刊要求选择合适的引用格式。"},
		"research-methodology":    {"研究方法论入门：定量、定性与混合方法的选择", "系统介绍三大研究方法范式的核心理念、适用场景和实施步骤。包括定量研究的实验设计和样本量计算、定性研究的扎根理论和现象学方法、混合方法的设计类型，以及如何根据研究问题选择最合适的方法和研究伦理考量。"},
		"ai-in-research":          {"AI 在学术研究中的应用：机遇、实践与伦理思考", "探讨人工智能如何改变学术研究的方方面面。从 AI 驱动的语义检索到辅助论文分析、从机器学习数据分析到 AI 辅助写作，以及使用 AI 工具时需要注意的学术诚信、数据隐私和偏见等伦理问题和最佳实践。"},
		"peer-review-guide":       {"同行评审完全指南：如何写出高质量的审稿意见", "从审稿人视角解析同行评审流程。包括审稿前的准备工作和评审清单、论文评审的核心标准、如何撰写具体且建设性的审稿意见、保持客观和专业的原则，以及如何利用 AI 工具辅助审稿提升效率。"},
		"latex-tutorial":                      {"LaTeX 入门教程：学术排版的必备技能", "从零开始学习 LaTeX 学术排版。涵盖 LaTeX 的基本概念与环境搭建、文档结构与章节组织、数学公式排版、图表与浮动体插入、BibTeX 参考文献管理，以及中文支持和常见问题解决等实用技巧。"},
		"ai-review-tutorial":                  {"AI 智能审稿使用教程：从上传到获取专业审稿报告", "详细介绍如何使用 Scholay AI 智能审稿功能，包括支持的文件格式、审稿维度解析、报告解读方法和常见问题解答，帮助研究者在投稿前全面优化论文质量。"},
		"online-latex-quickstart":             {"在线 LaTeX 编辑器快速入门：ScholayPrism 使用指南", "从零开始使用 ScholayPrism 在线 LaTeX 编辑器的完整教程，涵盖项目创建、模板选择、实时预览、AI 辅助写作功能和协作编辑等核心功能的使用方法。"},
		"academic-ai-tools-compliance-guide":  {"学术 AI 工具合规使用指南：伦理与最佳实践", "系统介绍在学术研究中合规使用 AI 工具的原则和方法，包括各大出版商的 AI 使用政策、论文中 AI 辅助的披露规范、避免学术不端的最佳实践，以及 AI 时代的学术诚信建设。"},
	}

	meta, ok := articleMeta[slug]
	if !ok {
		return ""
	}

	return fmt.Sprintf(`<article %s>
<h2 %s>%s</h2>
<p %s>%s</p>
<p style="color: #9e9e9e; font-size: 0.9rem;">作者：Scholay 学术团队 | <a href="/resources" style="color: #64b5f6;">返回资源中心</a></p>
</article>`, baseStyle, headingStyle, meta[0], textStyle, meta[1])
}

// proxyToFrontend proxies the request to the frontend container
func (h *Handler) proxyToFrontend(c *gin.Context) {
	resp, err := ssrHTTPClient.Get(h.frontendURL + c.Request.URL.Path)
	if err != nil {
		c.String(http.StatusBadGateway, "Failed to proxy to frontend")
		return
	}
	defer resp.Body.Close()

	for key, values := range resp.Header {
		for _, value := range values {
			c.Header(key, value)
		}
	}

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), body)
}

// InvalidateIndexHTMLCache invalidates all cached HTML pages.
// Call this when code snippets are updated to ensure fresh content.
func (h *Handler) InvalidateIndexHTMLCache() {
	h.htmlCacheMu.Lock()
	defer h.htmlCacheMu.Unlock()
	h.htmlCacheMap = make(map[string]*htmlCacheEntry)
	log.Println("All HTML page caches invalidated")
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
		{"/about", "monthly", "0.6"},
		{"/privacy", "monthly", "0.5"},
		{"/terms", "monthly", "0.5"},
		{"/feedback", "monthly", "0.5"},
		{"/contact", "monthly", "0.6"},
		{"/disclaimer", "monthly", "0.5"},
		{"/resources", "weekly", "0.8"},
		{"/resources/how-to-search", "monthly", "0.7"},
		{"/resources/literature-review-guide", "monthly", "0.7"},
		{"/resources/paper-writing-tips", "monthly", "0.7"},
		{"/resources/citation-guide", "monthly", "0.7"},
		{"/resources/research-methodology", "monthly", "0.7"},
		{"/resources/ai-in-research", "monthly", "0.7"},
		{"/resources/peer-review-guide", "monthly", "0.7"},
		{"/resources/latex-tutorial", "monthly", "0.7"},
		{"/resources/ai-review-tutorial", "monthly", "0.7"},
		{"/resources/online-latex-quickstart", "monthly", "0.7"},
		{"/resources/academic-ai-tools-compliance-guide", "monthly", "0.7"},
		{"/help", "monthly", "0.7"},
		// V2 Feature Pages
		{"/features/ai-review", "monthly", "0.8"},
		{"/features/ai-search", "monthly", "0.8"},
		{"/features/ai-writing", "monthly", "0.8"},
		{"/features/ai-translation", "monthly", "0.8"},
		{"/features/data-extraction", "monthly", "0.8"},
		{"/features/journal-matcher", "monthly", "0.8"},
		{"/features/ai-assistant", "monthly", "0.8"},
		// Old Feature Pages
		{"/features/search", "monthly", "0.7"},
		{"/features/peer-review", "monthly", "0.7"},
		{"/features/latex-writer", "monthly", "0.7"},
		// V2 Review
		{"/review", "monthly", "0.8"},
		// Blog
		{"/blog", "weekly", "0.8"},
		{"/blog/ai-peer-review-tools-guide", "monthly", "0.7"},
		{"/blog/online-latex-editor-comparison", "monthly", "0.7"},
		{"/blog/ai-paper-search-tools-2026", "monthly", "0.7"},
		{"/blog/systematic-review-meta-analysis-practical", "monthly", "0.7"},
		{"/blog/how-to-write-peer-review-comments", "monthly", "0.7"},
		{"/blog/sci-submission-ai-compliance-2026", "monthly", "0.7"},
		{"/blog/academic-ai-workflow-complete-guide", "monthly", "0.7"},
		{"/blog/thesis-latex-or-word-2026", "monthly", "0.7"},
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
