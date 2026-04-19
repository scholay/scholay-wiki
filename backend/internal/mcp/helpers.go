// ============================================================================
// Scholay学术 V1.0
// MCP 工具调用：参数解析与响应构造的纯辅助函数
// ============================================================================

package mcp

import (
	"encoding/json"
	"fmt"
	"log/slog"
)

func getIntArg(args map[string]any, key string, defaultValue int) int {
	if val, ok := args[key]; ok {
		switch v := val.(type) {
		case float64:
			return int(v)
		case int:
			return v
		}
	}
	return defaultValue
}

func getStringArg(args map[string]any, key string, defaultValue string) string {
	if val, ok := args[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return defaultValue
}

func interfaceSliceToStringSlice(slice []any) []string {
	result := make([]string, 0, len(slice))
	for _, item := range slice {
		if str, ok := item.(string); ok {
			result = append(result, str)
		}
	}
	return result
}

func createJSONResponse(data any) (*ToolResponse, error) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		slog.Error("failed to marshal response", "err", err)
		return nil, fmt.Errorf("failed to marshal response: %w", err)
	}

	return &ToolResponse{
		Content: []map[string]any{
			{
				"type": "text",
				"text": string(jsonData),
			},
		},
	}, nil
}
