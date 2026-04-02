// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// BindJSON binds JSON request body to the given struct and sends a
// BadRequest response on failure. Returns true if binding succeeded.
//
// Usage:
//
//	var req CreateRequest
//	if !utils.BindJSON(c, &req) { return }
func BindJSON(c *gin.Context, obj any) bool {
	if err := c.ShouldBindJSON(obj); err != nil {
		BadRequest(c, "Invalid request: "+err.Error())
		return false
	}
	return true
}

// GetUserID extracts the authenticated user ID from the Gin context.
// Sends an Unauthorized response if the user is not authenticated.
// Returns (userID, ok).
func GetUserID(c *gin.Context) (uint, bool) {
	id, exists := c.Get("user_id")
	if !exists {
		Unauthorized(c, "Unauthorized")
		return 0, false
	}
	uid, ok := id.(uint)
	if !ok {
		Unauthorized(c, "Unauthorized")
		return 0, false
	}
	return uid, true
}

// ParseUintParam parses a URL path parameter as uint.
// Sends a BadRequest response on failure. Returns (value, ok).
func ParseUintParam(c *gin.Context, name string) (uint, bool) {
	val := c.Param(name)
	id, err := strconv.ParseUint(val, 10, 64)
	if err != nil {
		BadRequest(c, "Invalid "+name)
		return 0, false
	}
	return uint(id), true
}

// ParseIntQuery parses a query string parameter as int with a default value.
func ParseIntQuery(c *gin.Context, name string, defaultVal int) int {
	val := c.Query(name)
	if val == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return n
}
