// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - 邮件 SMTP / 短信 SMS
// ============================================================================

package config

import (
	"fmt"
	"strings"

	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// ========== Email ==========

// UpdateEmailConfigRequest represents an update email config request
type UpdateEmailConfigRequest struct {
	SMTPHost     string `json:"smtpHost" binding:"required"`
	SMTPPort     int    `json:"smtpPort" binding:"required"`
	SMTPUser     string `json:"smtpUser" binding:"required"`
	SMTPPassword string `json:"smtpPassword"` // 不设置 required，允许留空
	FromEmail    string `json:"fromEmail" binding:"required,email"`
	FromName     string `json:"fromName" binding:"required"`
	// 邮件通道总开关 —— 语义同 UpdateSMSConfigRequest.IsActive,见那里的说明
	IsActive *bool `json:"is_active"`
}

// TestEmailConfigRequest represents a test email config request
type TestEmailConfigRequest struct {
	TestEmail string `json:"testEmail" binding:"required,email"`
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

	maskSecret(&config.SMTPPassword, isShowSensitive(c, "show_password"))
	utils.Success(c, config)
}

// UpdateEmailConfig handles updating email configuration (admin only)
func (h *Handler) UpdateEmailConfig(c *gin.Context) {
	var req UpdateEmailConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Get existing config to check if this is an update
	existingConfig, err := h.service.GetActiveEmailConfig()
	if err != nil {
		utils.Error(c, 3002, "Failed to get existing email configuration")
		return
	}

	existingPassword := ""
	if existingConfig != nil {
		existingPassword = existingConfig.SMTPPassword
	}
	password, ok := preserveSecretOnEmpty(c, req.SMTPPassword, existingPassword, existingConfig != nil, "Password")
	if !ok {
		return
	}

	config := &model.EmailConfig{
		SMTPHost:     req.SMTPHost,
		SMTPPort:     req.SMTPPort,
		SMTPUser:     req.SMTPUser,
		SMTPPassword: password,
		FromEmail:    req.FromEmail,
		FromName:     req.FromName,
		// 没传 → 沿用旧行为(启用);传了 → 尊重管理员的选择
		IsActive: req.IsActive == nil || *req.IsActive,
	}

	err = h.service.CreateEmailConfig(config)
	if err != nil {
		utils.Error(c, 3002, "Failed to update email configuration")
		return
	}

	utils.SuccessWithMessage(c, "Email configuration updated successfully", config)
}

// TestEmailConfig handles testing email configuration by sending a test email
// This endpoint uses the currently saved email configuration from database
// Admin must save the configuration first before testing
func (h *Handler) TestEmailConfig(c *gin.Context) {
	var req TestEmailConfigRequest
	if !utils.BindJSON(c, &req) {
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

	// Prepare email content(统一品牌模板)
	subject := "Scholay 邮箱配置测试"
	body := utils.RenderBrandedEmail(utils.EmailContent{
		Title: "邮箱配置测试成功",
		Intro: "您的 SMTP 邮箱配置已成功通过测试。能收到这封邮件,说明发信配置正确。",
		Rows: [][2]string{
			{"SMTP 服务器", emailConfig.SMTPHost},
			{"SMTP 端口", fmt.Sprintf("%d", emailConfig.SMTPPort)},
			{"发件邮箱", emailConfig.FromEmail},
			{"发件人名称", emailConfig.FromName},
		},
		Note: "这是一封自动发送的测试邮件。",
	})

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

// ========== SMS ==========

// UpdateSMSConfigRequest represents an update SMS config request
type UpdateSMSConfigRequest struct {
	AccessKeyID     string `json:"access_key_id" binding:"required"`
	AccessSecret    string `json:"access_secret"` // 不设置 required，允许留空
	SignName        string `json:"sign_name" binding:"required"`
	TemplateCode    string `json:"template_code" binding:"required"`
	TemplateContent string `json:"template_content" binding:"required"`
	Endpoint        string `json:"endpoint"`
	// 短信通道总开关。指针 = 可区分「没传」与「传了 false」——
	// 老客户端不传时保持既有行为(启用)，不破坏兼容。
	//
	// 之前这里没有这个字段、下面写死 IsActive: true，于是后台那个「启用短信通道」开关
	// 是个纯摆设：管理员关掉它、点保存、看到绿色「已保存」，通道其实照常启用，
	// 重新拉取后开关还会自己弹回「开」。界面不能承诺不会发生的事。
	IsActive *bool `json:"is_active"`
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

	maskSecret(&config.AccessSecret, isShowSensitive(c, "show_secret"))
	utils.Success(c, config)
}

// UpdateSMSConfig handles updating SMS configuration (admin only)
func (h *Handler) UpdateSMSConfig(c *gin.Context) {
	var req UpdateSMSConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Get existing config to check if this is an update
	existingConfig, err := h.service.GetActiveSMSConfig()
	if err != nil {
		utils.Error(c, 3008, "Failed to get existing SMS configuration")
		return
	}

	existingSecret := ""
	if existingConfig != nil {
		existingSecret = existingConfig.AccessSecret
	}
	accessSecret, ok := preserveSecretOnEmpty(c, req.AccessSecret, existingSecret, existingConfig != nil, "Access secret")
	if !ok {
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
		// 没传 → 沿用旧行为(启用);传了 → 尊重管理员的选择
		IsActive: req.IsActive == nil || *req.IsActive,
	}

	err = h.service.CreateSMSConfig(config)
	if err != nil {
		utils.Error(c, 3008, "Failed to update SMS configuration")
		return
	}

	utils.SuccessWithMessage(c, "SMS configuration updated successfully", config)
}

// TestSMSConfig handles testing SMS configuration by sending a test SMS
func (h *Handler) TestSMSConfig(c *gin.Context) {
	var req TestSMSConfigRequest
	if !utils.BindJSON(c, &req) {
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
