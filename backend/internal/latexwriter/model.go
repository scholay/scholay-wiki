// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"time"
)

// LatexDocument 表示用户的 LaTeX 文档
type LatexDocument struct {
	ID        uint      `json:"id" gorm:"primarykey"`
	UserID    uint      `json:"user_id" gorm:"index;not null"`
	Title     string    `json:"title" gorm:"size:255;not null"`
	Content   string    `json:"content" gorm:"type:longtext"`
	ParentID  *uint     `json:"parent_id" gorm:"index"`
	IsFolder  bool      `json:"is_folder" gorm:"default:false"`
	SortOrder int       `json:"sort_order" gorm:"default:0"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName 指定表名
func (LatexDocument) TableName() string {
	return "latex_documents"
}

// ChatRequest 聊天请求
type ChatRequest struct {
	Prompt         string `json:"prompt" binding:"required"`
	Context        string `json:"context"`
	FullContent    string `json:"full_content"`
	ModelLevel     string `json:"model_level"`    // low, mid, high（兼容旧版）
	ModelID        uint   `json:"model_id"`       // 新版：指定模型 ID
	CursorPosition struct {
		Line int `json:"line"`
		Ch   int `json:"ch"`
	} `json:"cursor_position"`
}

// CreateDocumentRequest 创建文档请求
type CreateDocumentRequest struct {
	Title    string `json:"title" binding:"required"`
	Content  string `json:"content"`
	ParentID *uint  `json:"parent_id"`
	IsFolder bool   `json:"is_folder"`
}

// UpdateDocumentRequest 更新文档请求
type UpdateDocumentRequest struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

// DocumentResponse 文档响应
type DocumentResponse struct {
	ID        uint                `json:"id"`
	Title     string              `json:"title"`
	Content   string              `json:"content,omitempty"`
	ParentID  *uint               `json:"parent_id"`
	IsFolder  bool                `json:"is_folder"`
	SortOrder int                 `json:"sort_order"`
	Children  []*DocumentResponse `json:"children,omitempty"`
	CreatedAt time.Time           `json:"created_at"`
	UpdatedAt time.Time           `json:"updated_at"`
}

// CompileRequest LaTeX 编译请求
type CompileRequest struct {
	Content string `json:"content" binding:"required"`
	Engine  string `json:"engine"` // pdflatex, xelatex, lualatex
}

// CompileResponse LaTeX 编译响应
type CompileResponse struct {
	Success  bool   `json:"success"`
	PdfURL   string `json:"pdf_url,omitempty"`
	LogURL   string `json:"log_url,omitempty"`
	Error    string `json:"error,omitempty"`
	Duration int64  `json:"duration_ms"`
}
