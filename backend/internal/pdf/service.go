// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package pdf

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// 外部 PDF 服务地址
const ExternalPDFServiceURL = "https://pdf.scholay.com/api/v1/pdf"

// Service PDF 服务（代理模式）
type Service struct {
	httpClient *http.Client
	cache      *Cache
}

// NewService 创建 PDF 服务
func NewService(unpaywallEmail string) *Service {
	return &Service{
		httpClient: &http.Client{
			Timeout: 120 * time.Second, // PDF 文件可能较大，增加超时
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		cache: NewCache(24 * time.Hour), // 缓存 24 小时
	}
}

// GetPDF 获取 PDF（代理到外部服务）
// 1. 检查本地缓存
// 2. 转发请求到外部 PDF 服务
// 3. 缓存结果
func (s *Service) GetPDF(ctx context.Context, req *PDFRequest) (*PDFResult, error) {
	if req.DOI == "" {
		return nil, fmt.Errorf("DOI is required")
	}

	// 标准化 DOI
	doi := normalizeDOI(req.DOI)
	slog.Info("PDF request", "doi", doi, "pdf_url", req.PDFURL)

	// 1. 检查本地缓存
	cacheKey := doi
	if req.PDFURL != "" {
		cacheKey = doi + "_" + req.PDFURL // 不同 URL 分别缓存
	}
	
	if cached, ok := s.cache.Get(cacheKey); ok {
		slog.Debug("PDF cache hit", "doi", doi)
		return &PDFResult{
			Data:        cached.Data,
			Source:      cached.Source,
			CacheStatus: CacheHit,
			ContentType: cached.ContentType,
			Size:        cached.Size,
		}, nil
	}
	slog.Debug("PDF cache miss", "doi", doi)

	// 2. 转发请求到外部 PDF 服务
	result, err := s.forwardToExternalService(ctx, doi, req.PDFURL)
	if err != nil {
		return nil, err
	}

	// 3. 缓存结果
	s.cacheResult(cacheKey, result)
	return result, nil
}

// forwardToExternalService 转发请求到外部 PDF 服务
func (s *Service) forwardToExternalService(ctx context.Context, doi string, pdfURL string) (*PDFResult, error) {
	// 构建请求体
	requestBody := map[string]string{"doi": doi}
	if pdfURL != "" {
		requestBody["pdf_url"] = pdfURL
	}

	jsonBody, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request failed: %v", err)
	}

	slog.Info("forwarding to external PDF service", "url", ExternalPDFServiceURL, "body", string(jsonBody))

	req, err := http.NewRequestWithContext(ctx, "POST", ExternalPDFServiceURL, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request failed: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Scholay-Backend/1.0")
	req.Header.Set("Accept", "application/pdf,*/*")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("external service request failed: %v", err)
	}
	defer resp.Body.Close()

	// 读取外部服务的响应头
	externalSource := resp.Header.Get("X-PDF-Source")
	externalCache := resp.Header.Get("X-Cache")
	slog.Info("external PDF service response", "status", resp.StatusCode, "source", externalSource, "cache", externalCache)

	if resp.StatusCode != http.StatusOK {
		// 读取错误信息
		body, _ := io.ReadAll(resp.Body)
		slog.Error("external PDF service error", "body", string(body))
		return nil, fmt.Errorf("external service returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response failed: %v", err)
	}

	slog.Info("received PDF data from external service", "bytes", len(data))

	// 验证是否为 PDF
	if !isPDFMagicBytes(data) {
		return nil, fmt.Errorf("external service did not return a valid PDF")
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/pdf"
	}

	// 使用外部服务返回的来源信息
	source := PDFSource(externalSource)
	if externalSource == "" {
		source = SourceUnknown
	}

	return &PDFResult{
		Data:        data,
		Source:      source,
		CacheStatus: CacheMiss, // 本地缓存未命中
		ContentType: contentType,
		Size:        int64(len(data)),
	}, nil
}

// cacheResult 缓存结果
func (s *Service) cacheResult(cacheKey string, result *PDFResult) {
	s.cache.Set(cacheKey, &PDFCacheEntry{
		DOI:         cacheKey,
		Data:        result.Data,
		Source:      result.Source,
		ContentType: result.ContentType,
		Size:        result.Size,
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	})
	slog.Info("PDF cached", "key", cacheKey, "source", result.Source, "size", result.Size)
}

// normalizeDOI 标准化 DOI
func normalizeDOI(doi string) string {
	doi = strings.TrimPrefix(doi, "https://doi.org/")
	doi = strings.TrimPrefix(doi, "http://doi.org/")
	doi = strings.TrimPrefix(doi, "doi:")
	doi = strings.TrimSpace(doi)
	return doi
}

// isPDFMagicBytes 检查文件是否以 PDF 魔术字节开头
func isPDFMagicBytes(data []byte) bool {
	if len(data) < 5 {
		return false
	}
	// PDF 文件以 %PDF- 开头
	return data[0] == '%' && data[1] == 'P' && data[2] == 'D' && data[3] == 'F' && data[4] == '-'
}
