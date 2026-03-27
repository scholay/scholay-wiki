// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 文件操作 MCP 工具
// 提供 LaTeX 项目文件的读写、管理功能

package mcp

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"gorm.io/gorm"
)

// FileToolProvider 文件工具提供者
type FileToolProvider struct {
	db *gorm.DB
}

// NewFileToolProvider 创建文件工具提供者
func NewFileToolProvider(db *gorm.DB) *FileToolProvider {
	return &FileToolProvider{
		db: db,
	}
}

// GetCategory 返回工具分类
func (p *FileToolProvider) GetCategory() ToolCategory {
	return CategoryFile
}

// GetTools 返回工具定义列表
func (p *FileToolProvider) GetTools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "read_document",
			Description: "读取 LaTeX 文档内容",
			Category:    CategoryFile,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"document_id": map[string]any{
						"type":        "integer",
						"description": "文档 ID",
					},
				},
				"required": []string{"document_id"},
			},
			ReadOnlyHint: true,
		},
		{
			Name:        "write_document",
			Description: "写入/更新 LaTeX 文档内容",
			Category:    CategoryFile,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"document_id": map[string]any{
						"type":        "integer",
						"description": "文档 ID",
					},
					"content": map[string]any{
						"type":        "string",
						"description": "文档内容",
					},
				},
				"required": []string{"document_id", "content"},
			},
			DestructiveHint: true,
		},
		{
			Name:        "list_documents",
			Description: "列出用户的 LaTeX 文档",
			Category:    CategoryFile,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"user_id": map[string]any{
						"type":        "integer",
						"description": "用户 ID",
					},
					"project_id": map[string]any{
						"type":        "integer",
						"description": "项目 ID（可选，筛选特定项目）",
					},
				},
				"required": []string{"user_id"},
			},
			ReadOnlyHint: true,
		},
		{
			Name:        "get_document_info",
			Description: "获取文档的详细信息（不包含内容）",
			Category:    CategoryFile,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"document_id": map[string]any{
						"type":        "integer",
						"description": "文档 ID",
					},
				},
				"required": []string{"document_id"},
			},
			ReadOnlyHint: true,
		},
		{
			Name:        "search_in_documents",
			Description: "在文档中搜索内容",
			Category:    CategoryFile,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"user_id": map[string]any{
						"type":        "integer",
						"description": "用户 ID",
					},
					"query": map[string]any{
						"type":        "string",
						"description": "搜索关键词",
					},
					"document_id": map[string]any{
						"type":        "integer",
						"description": "限定在特定文档中搜索（可选）",
					},
				},
				"required": []string{"user_id", "query"},
			},
			ReadOnlyHint: true,
		},
	}
}

// ExecuteTool 执行工具
func (p *FileToolProvider) ExecuteTool(ctx context.Context, name string, args map[string]any) (*ToolResult, error) {
	switch name {
	case "read_document":
		return p.readDocument(ctx, args)
	case "write_document":
		return p.writeDocument(ctx, args)
	case "list_documents":
		return p.listDocuments(ctx, args)
	case "get_document_info":
		return p.getDocumentInfo(ctx, args)
	case "search_in_documents":
		return p.searchInDocuments(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// LatexDocument 文档模型（简化版，与 latexwriter 模块共用）
type LatexDocument struct {
	ID        uint   `json:"id"`
	UserID    uint   `json:"user_id"`
	ProjectID *uint  `json:"project_id"`
	Title     string `json:"title"`
	Filename  string `json:"filename"`
	Content   string `json:"content"`
	FileType  string `json:"file_type"`
	ParentID  *uint  `json:"parent_id"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// readDocument 读取文档
func (p *FileToolProvider) readDocument(ctx context.Context, args map[string]any) (*ToolResult, error) {
	docID, ok := args["document_id"].(float64)
	if !ok {
		return CreateErrorResult(fmt.Errorf("document_id is required")), nil
	}

	var doc LatexDocument
	if err := p.db.Table("latex_documents").Where("id = ?", uint(docID)).First(&doc).Error; err != nil {
		return CreateErrorResult(fmt.Errorf("document not found: %w", err)), nil
	}

	return CreateSuccessResult(map[string]any{
		"id":       doc.ID,
		"title":    doc.Title,
		"filename": doc.Filename,
		"content":  doc.Content,
		"type":     doc.FileType,
	}), nil
}

// writeDocument 写入文档
func (p *FileToolProvider) writeDocument(ctx context.Context, args map[string]any) (*ToolResult, error) {
	docID, ok := args["document_id"].(float64)
	if !ok {
		return CreateErrorResult(fmt.Errorf("document_id is required")), nil
	}

	content, ok := args["content"].(string)
	if !ok {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	// 更新文档内容
	result := p.db.Table("latex_documents").Where("id = ?", uint(docID)).Update("content", content)
	if result.Error != nil {
		return CreateErrorResult(fmt.Errorf("failed to update document: %w", result.Error)), nil
	}

	if result.RowsAffected == 0 {
		return CreateErrorResult(fmt.Errorf("document not found")), nil
	}

	return CreateSuccessResult(map[string]any{
		"success":     true,
		"document_id": uint(docID),
		"message":     "Document updated successfully",
	}), nil
}

// listDocuments 列出文档
func (p *FileToolProvider) listDocuments(ctx context.Context, args map[string]any) (*ToolResult, error) {
	userID, ok := args["user_id"].(float64)
	if !ok {
		return CreateErrorResult(fmt.Errorf("user_id is required")), nil
	}

	query := p.db.Table("latex_documents").Where("user_id = ?", uint(userID))

	if projectID, ok := args["project_id"].(float64); ok {
		query = query.Where("project_id = ?", uint(projectID))
	}

	var docs []LatexDocument
	if err := query.Select("id, user_id, project_id, title, filename, file_type, created_at, updated_at").Find(&docs).Error; err != nil {
		return CreateErrorResult(fmt.Errorf("failed to list documents: %w", err)), nil
	}

	// 构建文件树结构
	fileList := make([]map[string]any, 0, len(docs))
	for _, doc := range docs {
		fileList = append(fileList, map[string]any{
			"id":         doc.ID,
			"title":      doc.Title,
			"filename":   doc.Filename,
			"type":       doc.FileType,
			"project_id": doc.ProjectID,
			"created_at": doc.CreatedAt,
			"updated_at": doc.UpdatedAt,
		})
	}

	return CreateSuccessResult(map[string]any{
		"count": len(fileList),
		"files": fileList,
	}), nil
}

// getDocumentInfo 获取文档信息
func (p *FileToolProvider) getDocumentInfo(ctx context.Context, args map[string]any) (*ToolResult, error) {
	docID, ok := args["document_id"].(float64)
	if !ok {
		return CreateErrorResult(fmt.Errorf("document_id is required")), nil
	}

	var doc LatexDocument
	if err := p.db.Table("latex_documents").Select("id, user_id, project_id, title, filename, file_type, created_at, updated_at").Where("id = ?", uint(docID)).First(&doc).Error; err != nil {
		return CreateErrorResult(fmt.Errorf("document not found: %w", err)), nil
	}

	// 获取文件大小（内容长度）
	var contentLength int64
	p.db.Table("latex_documents").Where("id = ?", uint(docID)).Select("LENGTH(content)").Scan(&contentLength)

	return CreateSuccessResult(map[string]any{
		"id":           doc.ID,
		"title":        doc.Title,
		"filename":     doc.Filename,
		"type":         doc.FileType,
		"project_id":   doc.ProjectID,
		"size":         contentLength,
		"extension":    filepath.Ext(doc.Filename),
		"created_at":   doc.CreatedAt,
		"updated_at":   doc.UpdatedAt,
	}), nil
}

// searchInDocuments 在文档中搜索
func (p *FileToolProvider) searchInDocuments(ctx context.Context, args map[string]any) (*ToolResult, error) {
	userID, ok := args["user_id"].(float64)
	if !ok {
		return CreateErrorResult(fmt.Errorf("user_id is required")), nil
	}

	query, ok := args["query"].(string)
	if !ok || query == "" {
		return CreateErrorResult(fmt.Errorf("query is required")), nil
	}

	dbQuery := p.db.Table("latex_documents").Where("user_id = ? AND content LIKE ?", uint(userID), "%"+query+"%")

	if docID, ok := args["document_id"].(float64); ok {
		dbQuery = dbQuery.Where("id = ?", uint(docID))
	}

	var docs []LatexDocument
	if err := dbQuery.Find(&docs).Error; err != nil {
		return CreateErrorResult(fmt.Errorf("search failed: %w", err)), nil
	}

	results := make([]map[string]any, 0, len(docs))
	for _, doc := range docs {
		// 查找匹配的行
		matches := findMatchingLines(doc.Content, query)
		results = append(results, map[string]any{
			"document_id": doc.ID,
			"title":       doc.Title,
			"filename":    doc.Filename,
			"matches":     matches,
		})
	}

	return CreateSuccessResult(map[string]any{
		"query":   query,
		"count":   len(results),
		"results": results,
	}), nil
}

// findMatchingLines 查找匹配的行
func findMatchingLines(content, query string) []map[string]any {
	lines := strings.Split(content, "\n")
	matches := []map[string]any{}
	queryLower := strings.ToLower(query)

	for i, line := range lines {
		if strings.Contains(strings.ToLower(line), queryLower) {
			matches = append(matches, map[string]any{
				"line":    i + 1,
				"content": strings.TrimSpace(line),
			})
			// 限制返回数量
			if len(matches) >= 10 {
				break
			}
		}
	}

	return matches
}
