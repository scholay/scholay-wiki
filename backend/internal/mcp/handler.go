// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package mcp

import (
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/semanticscholar"

	"github.com/gin-gonic/gin"
)

// Handler handles MCP HTTP requests
type Handler struct {
	server *MCPServer
}

// NewHandler creates a new MCP handler
func NewHandler(manager *semanticscholar.Manager) *Handler {
	return &Handler{
		server: NewMCPServer(manager),
	}
}

// ListTools handles GET /api/v1/mcp/tools
func (h *Handler) ListTools(c *gin.Context) {
	tools := h.server.ListTools()
	utils.Success(c, map[string]interface{}{
		"tools": tools,
	})
}

// CallTool handles POST /api/v1/mcp/call
func (h *Handler) CallTool(c *gin.Context) {
	var req ToolRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 5001, "Invalid request body: "+err.Error())
		return
	}

	result, err := h.server.CallTool(req)
	if err != nil {
		utils.Error(c, 5002, "Tool call failed: "+err.Error())
		return
	}

	utils.Success(c, result)
}
