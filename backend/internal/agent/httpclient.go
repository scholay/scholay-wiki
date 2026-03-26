// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agent

import (
	"net/http"
	"time"
)

const (
	defaultRequestTimeout = 30 * time.Second
	sseStreamTimeout      = 10 * time.Minute
	uploadTimeout         = 2 * time.Minute
)

var sharedTransport = &http.Transport{
	MaxIdleConns:          50,
	MaxIdleConnsPerHost:   10,
	MaxConnsPerHost:       50,
	IdleConnTimeout:       90 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ExpectContinueTimeout: 1 * time.Second,
	DisableKeepAlives:     false,
	DisableCompression:    false,
}

func newHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: sharedTransport,
	}
}

func newSSEHTTPClient() *http.Client {
	return &http.Client{
		Timeout:   sseStreamTimeout,
		Transport: sharedTransport,
	}
}
