// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package pdf

import "time"

// PDFRequest 定义 PDF 获取请求
type PDFRequest struct {
	DOI    string `json:"doi" binding:"required"` // DOI，必填
	PDFURL string `json:"pdf_url"`                // 可选：已知的 PDF URL（开放获取）
}

// PDFSource PDF 来源类型（由外部服务返回）
type PDFSource string

const (
	SourceDirect  PDFSource = "direct"  // 直接 URL
	SourceCache   PDFSource = "cache"   // 本地缓存
	SourceUnknown PDFSource = "unknown" // 未知/外部服务
)

// CacheStatus 缓存状态
type CacheStatus string

const (
	CacheHit  CacheStatus = "HIT"  // 缓存命中
	CacheMiss CacheStatus = "MISS" // 缓存未命中
)

// PDFResult PDF 获取结果
type PDFResult struct {
	Data        []byte      `json:"-"`            // PDF 二进制数据
	Source      PDFSource   `json:"source"`       // 数据来源
	CacheStatus CacheStatus `json:"cache_status"` // 缓存状态
	ContentType string      `json:"content_type"` // Content-Type
	Size        int64       `json:"size"`         // 文件大小
}

// PDFCacheEntry 缓存条目
type PDFCacheEntry struct {
	DOI         string    `json:"doi"`
	Data        []byte    `json:"data"`
	Source      PDFSource `json:"source"`
	ContentType string    `json:"content_type"`
	Size        int64     `json:"size"`
	CreatedAt   time.Time `json:"created_at"`
	ExpiresAt   time.Time `json:"expires_at"`
}
