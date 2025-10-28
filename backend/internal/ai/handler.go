package ai

import (
	"scholar-backend/internal/common/utils"
	"strconv"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

// ListPromptTemplates lists all prompt templates
func (h *Handler) ListPromptTemplates(c *gin.Context) {
	templates, err := h.service.ListPromptTemplates()
	if err != nil {
		utils.Error(c, 500, "Failed to list templates: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"templates": templates,
		"total":     len(templates),
	})
}

// GetPromptTemplate gets a prompt template by ID
func (h *Handler) GetPromptTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid template ID")
		return
	}

	template, err := h.service.GetPromptTemplateByID(uint(id))
	if err != nil {
		utils.Error(c, 404, "Template not found")
		return
	}

	utils.Success(c, template)
}

// CreatePromptTemplate creates a new prompt template
func (h *Handler) CreatePromptTemplate(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Key         string `json:"key" binding:"required"`
		Template    string `json:"template" binding:"required"`
		Description string `json:"description"`
		IsActive    bool   `json:"is_active"` // Frontend sends bool, we'll convert
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	isActive := 0
	if req.IsActive {
		isActive = 1
	}

	template := &PromptTemplate{
		Name:        req.Name,
		Key:         req.Key,
		Template:    req.Template,
		Description: req.Description,
		IsActive:    isActive,
	}

	if err := h.service.CreatePromptTemplate(template); err != nil {
		utils.Error(c, 500, "Failed to create template: "+err.Error())
		return
	}

	utils.Success(c, template)
}

// UpdatePromptTemplate updates a prompt template
func (h *Handler) UpdatePromptTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid template ID")
		return
	}

	var req struct {
		Name        string `json:"name" binding:"required"`
		Template    string `json:"template" binding:"required"`
		Description string `json:"description"`
		IsActive    bool   `json:"is_active"` // Frontend sends bool, we'll convert
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	template, err := h.service.GetPromptTemplateByID(uint(id))
	if err != nil {
		utils.Error(c, 404, "Template not found")
		return
	}

	isActive := 0
	if req.IsActive {
		isActive = 1
	}

	template.Name = req.Name
	template.Template = req.Template
	template.Description = req.Description
	template.IsActive = isActive

	if err := h.service.UpdatePromptTemplate(template); err != nil {
		utils.Error(c, 500, "Failed to update template: "+err.Error())
		return
	}

	utils.Success(c, template)
}

// DeletePromptTemplate deletes a prompt template
func (h *Handler) DeletePromptTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid template ID")
		return
	}

	if err := h.service.DeletePromptTemplate(uint(id)); err != nil {
		utils.Error(c, 500, "Failed to delete template: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Template deleted successfully"})
}
