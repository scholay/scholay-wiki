// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - 隐私政策 / 服务条款
// ============================================================================

package config

import (
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// UpdatePrivacyPolicyRequest represents an update privacy policy request
type UpdatePrivacyPolicyRequest struct {
	Content string `json:"content" binding:"required"`
	Version string `json:"version" binding:"required"`
}

// UpdateTermsOfServiceRequest represents an update terms of service request
type UpdateTermsOfServiceRequest struct {
	Content string `json:"content" binding:"required"`
	Version string `json:"version" binding:"required"`
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

// UpdatePrivacyPolicy handles updating privacy policy (admin only)
func (h *Handler) UpdatePrivacyPolicy(c *gin.Context) {
	var req UpdatePrivacyPolicyRequest
	if !utils.BindJSON(c, &req) {
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

// UpdateTermsOfService handles updating terms of service (admin only)
func (h *Handler) UpdateTermsOfService(c *gin.Context) {
	var req UpdateTermsOfServiceRequest
	if !utils.BindJSON(c, &req) {
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
