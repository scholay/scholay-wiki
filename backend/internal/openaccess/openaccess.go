// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package openaccess 提供「合法开放获取(OA)全文查找」:给定 DOI,查 Unpaywall
// 返回一个合法的免费全文链接(绿色 OA / 出版社 OA / 仓储版本)。
//
// 铁律(合规):只返回 Unpaywall 给出的**合法** OA 副本链接,绝不托管 / 代理 /
// 抓取任何受版权保护或盗版全文。本模块只做「DOI → 合法免费链接」的发现与转发。
//
// 设计与 minicod 上游调用一致:共享短连接 http client + 熔断器 + Redis 缓存
// (命中正缓存 14 天 / 负缓存 3 天;瞬时错误不写缓存,避免毒化)。
package openaccess

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/common/httpclient"
)

const (
	unpaywallBase = "https://api.unpaywall.org/v2"
	// Unpaywall 要求带 email(礼貌池,非鉴权)。换成机构真实邮箱可提升稳定性。
	unpaywallEmail = "support@scholay.com"

	cacheKeyPrefix = "oa:upw:"
	ttlPositive    = 14 * 24 * time.Hour
	ttlNegative    = 3 * 24 * time.Hour
)

// doiPattern 粗校验 DOI 形状,顺带挡住把任意字符串塞进上游 URL。
var doiPattern = regexp.MustCompile(`^10\.\d{4,9}/\S+$`)

// Result 是返回给前端的精简结构。IsOA=false 时其余字段为空。
type Result struct {
	DOI      string `json:"doi"`
	IsOA     bool   `json:"is_oa"`
	URL      string `json:"url,omitempty"`       // 合法免费全文链接(优先 PDF 直链,否则落地页)
	IsPDF    bool   `json:"is_pdf,omitempty"`    // URL 是否为 PDF 直链
	HostType string `json:"host_type,omitempty"` // publisher / repository
	Version  string `json:"version,omitempty"`   // publishedVersion / acceptedVersion / submittedVersion
	License  string `json:"license,omitempty"`   // cc-by 等(可能为空)
}

// unpaywallResp 是 Unpaywall /v2/{doi} 响应里我们用到的子集。
type unpaywallResp struct {
	DOI            string             `json:"doi"`
	IsOA           bool               `json:"is_oa"`
	BestOALocation *unpaywallLocation `json:"best_oa_location"`
}

type unpaywallLocation struct {
	URL       string `json:"url"`
	URLForPDF string `json:"url_for_pdf"`
	HostType  string `json:"host_type"`
	Version   string `json:"version"`
	License   string `json:"license"`
}

// NormalizeDOI 把 URL / "doi:" 前缀 / 大小写归一成裸 DOI(小写)。
func NormalizeDOI(input string) string {
	s := strings.TrimSpace(input)
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "dx.doi.org/")
	s = strings.TrimPrefix(s, "doi.org/")
	s = strings.TrimPrefix(s, "doi:")
	s = strings.TrimSpace(s)
	return strings.ToLower(s)
}

// ValidDOI 报告归一后的 DOI 是否形状合法。
func ValidDOI(doi string) bool {
	return doiPattern.MatchString(doi)
}

// ErrInvalidDOI 表示 DOI 形状非法(调用方应回 400)。
var ErrInvalidDOI = errors.New("invalid doi")

// Resolve 查 DOI 的合法 OA 全文。先读缓存,miss 则查 Unpaywall;只对「确定结果」
// (200 / 404)写缓存,瞬时错误(网络 / 熔断)返回 IsOA=false 但不写缓存。
func Resolve(ctx context.Context, rawDOI string) (*Result, error) {
	doi := NormalizeDOI(rawDOI)
	if !ValidDOI(doi) {
		return nil, ErrInvalidDOI
	}

	key := cacheKeyPrefix + doi
	var cached Result
	if err := cache.Get(ctx, key, &cached); err == nil {
		return &cached, nil
	}

	res, definitive := fetchUnpaywall(ctx, doi)
	res.DOI = doi
	if definitive {
		ttl := ttlNegative
		if res.IsOA {
			ttl = ttlPositive
		}
		if err := cache.Set(ctx, key, res, ttl); err != nil {
			slog.Warn("openaccess cache set failed", "doi", doi, "err", err)
		}
	}
	return res, nil
}

// fetchUnpaywall 调上游;第二个返回值表示结果是否「确定」(可缓存)。
func fetchUnpaywall(ctx context.Context, doi string) (*Result, bool) {
	url := fmt.Sprintf("%s/%s?email=%s", unpaywallBase, doi, unpaywallEmail)

	out, err := circuitbreaker.UnpaywallBreaker.Execute(func() (any, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/json")
		resp, err := httpclient.OAuthClient.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		// 404 = Unpaywall 无此 DOI 记录 → 确定的「无 OA」,正常返回空体。
		if resp.StatusCode == http.StatusNotFound {
			return &unpaywallResp{IsOA: false}, nil
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("unpaywall status %d", resp.StatusCode)
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		if err != nil {
			return nil, err
		}
		var parsed unpaywallResp
		if err := json.Unmarshal(body, &parsed); err != nil {
			return nil, err
		}
		return &parsed, nil
	})

	if err != nil {
		// 网络 / 熔断 / 非 2xx:非确定结果,不缓存,前端按「无免费全文」处理。
		slog.Warn("openaccess unpaywall lookup failed", "doi", doi, "err", err)
		return &Result{IsOA: false}, false
	}

	parsed := out.(*unpaywallResp)
	return toResult(parsed), true
}

func toResult(r *unpaywallResp) *Result {
	if r == nil || !r.IsOA || r.BestOALocation == nil {
		return &Result{IsOA: false}
	}
	loc := r.BestOALocation
	url, isPDF := loc.URL, false
	if loc.URLForPDF != "" {
		url, isPDF = loc.URLForPDF, true
	}
	if url == "" {
		return &Result{IsOA: false}
	}
	return &Result{
		IsOA:     true,
		URL:      url,
		IsPDF:    isPDF,
		HostType: loc.HostType,
		Version:  loc.Version,
		License:  loc.License,
	}
}
