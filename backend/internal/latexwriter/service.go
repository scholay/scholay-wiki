// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"fmt"
	"io"
	"strings"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/thirdparty"
)

// Service 提供 LaTeX Writer 业务逻辑
type Service struct {
	repo       *Repository
	aiService  *ai.Service
}

// NewService 创建新的 Service
func NewService(db *gorm.DB, aiService *ai.Service) *Service {
	return &Service{
		repo:       NewRepository(db),
		aiService:  aiService,
	}
}

// StreamChat 流式 AI 对话
func (s *Service) StreamChat(req *ChatRequest, writer io.Writer) error {
	// 获取系统提示词（从代码中获取，不从数据库）
	systemPrompt := GetSystemPrompt("base")

	// 构建用户消息
	userMessage := req.Prompt
	if req.Context != "" {
		userMessage = fmt.Sprintf("以下是选中的 LaTeX 代码：\n\n```latex\n%s\n```\n\n用户请求：%s", req.Context, req.Prompt)
	}

	// 如果有完整内容的上下文
	if req.FullContent != "" && req.Context == "" {
		// 只有在没有选中内容时才提供完整文档上下文
		if len(req.FullContent) > 2000 {
			// 文档太长，只提供部分上下文
			userMessage = fmt.Sprintf("当前 LaTeX 文档（部分）：\n```latex\n%s...\n```\n\n用户请求：%s", 
				req.FullContent[:2000], req.Prompt)
		}
	}

	messages := []ai.ChatMessage{
		{
			Role:    "system",
			Content: systemPrompt,
		},
		{
			Role:    "user",
			Content: userMessage,
		},
	}

	// 确定模型级别
	modelLevel := thirdparty.ModelLevelMid
	switch req.ModelLevel {
	case "low":
		modelLevel = thirdparty.ModelLevelLow
	case "high":
		modelLevel = thirdparty.ModelLevelHigh
	}

	// 调用 AI 服务
	return s.aiService.StreamChatCompletionWithLevel(messages, writer, modelLevel)
}

// ExecuteTask 执行特定任务
func (s *Service) ExecuteTask(taskType string, content string, writer io.Writer, modelLevel string) error {
	// 获取任务提示词
	taskPrompt, ok := GetTaskPrompt(taskType)
	if !ok {
		return fmt.Errorf("未知的任务类型: %s", taskType)
	}

	// 替换内容占位符
	prompt := taskPrompt.Prompt
	prompt = replaceVariable(prompt, "content", content)

	// 获取系统提示词
	systemPrompt := GetSystemPrompt("base")

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	}

	// 确定模型级别
	level := thirdparty.ModelLevelMid
	switch modelLevel {
	case "low":
		level = thirdparty.ModelLevelLow
	case "high":
		level = thirdparty.ModelLevelHigh
	}

	return s.aiService.StreamChatCompletionWithLevel(messages, writer, level)
}

// ExecuteSectionTask 执行章节写作任务
func (s *Service) ExecuteSectionTask(sectionType string, content string, writer io.Writer, modelLevel string) error {
	// 获取章节提示词
	sectionPrompt, ok := GetSectionPrompt(sectionType)
	if !ok {
		return fmt.Errorf("未知的章节类型: %s", sectionType)
	}

	// 替换内容占位符
	prompt := sectionPrompt.Prompt
	prompt = replaceVariable(prompt, "content", content)

	// 获取系统提示词（使用写作专家）
	systemPrompt := GetSystemPrompt("writing_expert")

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	}

	// 章节写作默认使用高级模型
	level := thirdparty.ModelLevelHigh
	switch modelLevel {
	case "low":
		level = thirdparty.ModelLevelLow
	case "mid":
		level = thirdparty.ModelLevelMid
	}

	return s.aiService.StreamChatCompletionWithLevel(messages, writer, level)
}

// replaceVariable 替换模板中的变量
func replaceVariable(template, key, value string) string {
	placeholder := "{" + key + "}"
	return strings.Replace(template, placeholder, value, -1)
}

// CreateDocument 创建文档
func (s *Service) CreateDocument(userID uint, req *CreateDocumentRequest) (*LatexDocument, error) {
	doc := &LatexDocument{
		UserID:   userID,
		Title:    req.Title,
		Content:  req.Content,
		ParentID: req.ParentID,
		IsFolder: req.IsFolder,
	}

	if err := s.repo.CreateDocument(doc); err != nil {
		return nil, err
	}

	return doc, nil
}

// GetDocument 获取文档
func (s *Service) GetDocument(id uint, userID uint) (*LatexDocument, error) {
	return s.repo.GetDocumentByID(id, userID)
}

// GetUserDocuments 获取用户文档列表
func (s *Service) GetUserDocuments(userID uint) ([]LatexDocument, error) {
	return s.repo.GetDocumentsByUserID(userID)
}

// GetDocumentTree 获取文档树形结构
func (s *Service) GetDocumentTree(userID uint) ([]*DocumentResponse, error) {
	docs, err := s.repo.GetDocumentsByUserID(userID)
	if err != nil {
		return nil, err
	}

	return buildDocumentTree(docs), nil
}

// buildDocumentTree 构建文档树
func buildDocumentTree(docs []LatexDocument) []*DocumentResponse {
	// 创建 ID 到响应的映射
	responseMap := make(map[uint]*DocumentResponse)
	for _, doc := range docs {
		responseMap[doc.ID] = &DocumentResponse{
			ID:        doc.ID,
			Title:     doc.Title,
			Content:   doc.Content,
			ParentID:  doc.ParentID,
			IsFolder:  doc.IsFolder,
			SortOrder: doc.SortOrder,
			Children:  []*DocumentResponse{},
			CreatedAt: doc.CreatedAt,
			UpdatedAt: doc.UpdatedAt,
		}
	}

	// 构建树形结构
	var roots []*DocumentResponse
	for _, doc := range docs {
		resp := responseMap[doc.ID]
		if doc.ParentID == nil {
			roots = append(roots, resp)
		} else {
			if parent, ok := responseMap[*doc.ParentID]; ok {
				parent.Children = append(parent.Children, resp)
			}
		}
	}

	return roots
}

// UpdateDocument 更新文档
func (s *Service) UpdateDocument(id uint, userID uint, req *UpdateDocumentRequest) (*LatexDocument, error) {
	doc, err := s.repo.GetDocumentByID(id, userID)
	if err != nil {
		return nil, err
	}

	if req.Title != "" {
		doc.Title = req.Title
	}
	if req.Content != "" {
		doc.Content = req.Content
	}

	if err := s.repo.UpdateDocument(doc); err != nil {
		return nil, err
	}

	return doc, nil
}

// DeleteDocument 删除文档
func (s *Service) DeleteDocument(id uint, userID uint) error {
	// 检查文档是否存在
	doc, err := s.repo.GetDocumentByID(id, userID)
	if err != nil {
		return err
	}

	// 如果是文件夹，递归删除
	if doc.IsFolder {
		return s.repo.DeleteDocumentAndChildren(id, userID)
	}

	return s.repo.DeleteDocument(id, userID)
}
