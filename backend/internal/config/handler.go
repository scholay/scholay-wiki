package config

import (
	"fmt"
	"strings"

	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for configuration operations
type Handler struct {
	service *Service
}

// NewHandler creates a new config handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
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

	// Mask the password for security
	config.SMTPPassword = "********"
	utils.Success(c, config)
}

// UpdateEmailConfigRequest represents an update email config request
type UpdateEmailConfigRequest struct {
	SMTPHost     string `json:"smtpHost" binding:"required"`
	SMTPPort     int    `json:"smtpPort" binding:"required"`
	SMTPUser     string `json:"smtpUser" binding:"required"`
	SMTPPassword string `json:"smtpPassword" binding:"required"`
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

	config := &model.EmailConfig{
		SMTPHost:     req.SMTPHost,
		SMTPPort:     req.SMTPPort,
		SMTPUser:     req.SMTPUser,
		SMTPPassword: req.SMTPPassword,
		FromEmail:    req.FromEmail,
		FromName:     req.FromName,
		IsActive:     true,
	}

	err := h.service.CreateEmailConfig(config)
	if err != nil {
		utils.Error(c, 3002, "Failed to update email configuration")
		return
	}

	utils.SuccessWithMessage(c, "Email configuration updated successfully", config)
}

// TestEmailConfigRequest represents a test email config request
type TestEmailConfigRequest struct {
	SMTPHost     string `json:"smtpHost" binding:"required"`
	SMTPPort     int    `json:"smtpPort" binding:"required"`
	SMTPUser     string `json:"smtpUser" binding:"required"`
	SMTPPassword string `json:"smtpPassword" binding:"required"`
	FromEmail    string `json:"fromEmail" binding:"required,email"`
	FromName     string `json:"fromName" binding:"required"`
	TestEmail    string `json:"testEmail" binding:"required,email"`
}

// TestEmailConfig handles testing email configuration by sending a test email
func (h *Handler) TestEmailConfig(c *gin.Context) {
	var req TestEmailConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Prepare email content
	subject := "Scholar 邮箱配置测试"
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
	`, req.SMTPHost, req.SMTPPort, req.FromEmail, req.FromName)

	// Send email with TLS/SSL support using shared utility
	emailConfig := utils.EmailConfig{
		SMTPHost:     req.SMTPHost,
		SMTPPort:     req.SMTPPort,
		SMTPUser:     req.SMTPUser,
		SMTPPassword: req.SMTPPassword,
		FromEmail:    req.FromEmail,
		FromName:     req.FromName,
	}

	err := utils.SendEmailWithTLS(emailConfig, []string{req.TestEmail}, subject, body)
	if err != nil {
		utils.Error(c, 3005, fmt.Sprintf("Failed to send test email: %v", err))
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

	utils.Success(c, config)
}

// UpdateSystemConfigRequest represents an update system config request
type UpdateSystemConfigRequest struct {
	RequireEmailVerification bool `json:"require_email_verification"`
}

// UpdateSystemConfig handles updating system configuration (admin only)
func (h *Handler) UpdateSystemConfig(c *gin.Context) {
	var req UpdateSystemConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.UpdateSystemConfig(req.RequireEmailVerification)
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

	// Mask the access secret for security
	config.AccessSecret = "********"
	utils.Success(c, config)
}

// UpdateSMSConfigRequest represents an update SMS config request
type UpdateSMSConfigRequest struct {
	AccessKeyID     string `json:"access_key_id" binding:"required"`
	AccessSecret    string `json:"access_secret" binding:"required"`
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

	endpoint := req.Endpoint
	if endpoint == "" {
		endpoint = "dypnsapi.aliyuncs.com" // Phone Number Service for verification codes
	}

	// Trim whitespace from all string fields to avoid issues
	config := &model.SMSConfig{
		AccessKeyID:     strings.TrimSpace(req.AccessKeyID),
		AccessSecret:    strings.TrimSpace(req.AccessSecret),
		SignName:        strings.TrimSpace(req.SignName),
		TemplateCode:    strings.TrimSpace(req.TemplateCode),
		TemplateContent: strings.TrimSpace(req.TemplateContent),
		Endpoint:        strings.TrimSpace(endpoint),
		IsActive:        true,
	}

	err := h.service.CreateSMSConfig(config)
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
			testParams["product"] = "Scholar"
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

// RegisterRoutes registers config routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	config := router.Group("/config")
	{
		config.GET("/privacy-policy", h.GetPrivacyPolicy)
		config.GET("/system", h.GetSystemConfig)
	}
}
