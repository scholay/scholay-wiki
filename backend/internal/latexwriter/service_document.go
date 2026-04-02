// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

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
