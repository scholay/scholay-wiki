// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package semanticscholar

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// GetRecommendationsForPaper gets paper recommendations based on a single paper
func (c *Client) GetRecommendationsForPaper(paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	if paperID == "" {
		return nil, fmt.Errorf("paperID is required")
	}

	// Build query parameters
	params := map[string]string{}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}
	if opts.Limit > 0 {
		params["limit"] = strconv.Itoa(opts.Limit)
	}

	// Build URL
	urlStr := c.recURL + "/papers/forpaper/" + paperID + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result RecommendationsResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// RecommendationRequest represents a recommendation request body
type RecommendationRequest struct {
	PositivePaperIDs []string `json:"positivePaperIds,omitempty"`
	NegativePaperIDs []string `json:"negativePaperIds,omitempty"`
}

// GetRecommendations gets paper recommendations based on positive and negative paper lists
func (c *Client) GetRecommendations(opts RecommendationsOptions) (*RecommendationsResponse, error) {
	if len(opts.PositivePaperIDs) == 0 {
		return nil, fmt.Errorf("at least one positive paper ID is required")
	}

	// Build query parameters
	params := map[string]string{}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}
	if opts.Limit > 0 {
		params["limit"] = strconv.Itoa(opts.Limit)
	}

	// Build request body
	reqBody := RecommendationRequest{
		PositivePaperIDs: opts.PositivePaperIDs,
		NegativePaperIDs: opts.NegativePaperIDs,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Build URL
	urlStr := c.recURL + "/papers" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("POST", urlStr, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	// Parse response
	var result RecommendationsResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}
