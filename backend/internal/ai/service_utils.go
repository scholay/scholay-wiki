// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

// ConvertMCPToolsToOpenAIFormat converts protocol-agnostic tool definitions
// to OpenAI function calling format.
func ConvertMCPToolsToOpenAIFormat(mcpTools []MCPToolDef) []Tool {
	tools := make([]Tool, 0, len(mcpTools))

	for _, mcpTool := range mcpTools {
		tool := Tool{
			Type: "function",
			Function: ToolFunction{
				Name:        mcpTool.Name,
				Description: mcpTool.Description,
				Parameters:  mcpTool.InputSchema,
			},
		}
		tools = append(tools, tool)
	}

	return tools
}
