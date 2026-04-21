// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - 代码片段（SEO/广告/分析）
// ============================================================================

package config

import (
	"errors"
	"fmt"

	"github.com/go-sql-driver/mysql"

	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// CreateCodeSnippetRequest 创建代码片段请求
type CreateCodeSnippetRequest struct {
	Name        string   `json:"name" binding:"required"`
	CodeKey     string   `json:"code_key" binding:"required"`
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
	if !utils.BindJSON(c, &req) {
		return
	}

	snippet := &model.CodeSnippet{
		Name:        req.Name,
		CodeKey:     req.CodeKey,
		Category:    model.CategoryOther,
		Position:    model.CodeSnippetPosition(req.Position),
		CodeContent: req.CodeContent,
		Description: req.Description,
		IsEnabled:   req.IsEnabled,
		Priority:    req.Priority,
		Pages:       req.Pages,
	}

	if err := h.service.CreateCodeSnippet(snippet); err != nil {
		var mysqlErr *mysql.MySQLError
		if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
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
	if !utils.BindJSON(c, &req) {
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
