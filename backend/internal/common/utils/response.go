// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

type Response struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// httpStatusFromCode maps a business error code to an appropriate HTTP status.
// The business code is still returned in the JSON body for frontend routing.
func httpStatusFromCode(code int) int {
	// Standard HTTP codes used directly
	switch code {
	case 400:
		return http.StatusBadRequest
	case 401:
		return http.StatusUnauthorized
	case 403:
		return http.StatusForbidden
	case 404:
		return http.StatusNotFound
	case 429:
		return http.StatusTooManyRequests
	case 500:
		return http.StatusInternalServerError
	}
	// Business error code ranges → HTTP status
	switch {
	case code >= 1001 && code <= 1099: // admin auth errors
		return http.StatusUnauthorized
	case code >= 2000 && code <= 2099: // user module errors
		switch code {
		case 2019: // session kicked (logged in elsewhere)
			return http.StatusConflict
		case 2016: // session expired
			return http.StatusUnauthorized
		default:
			return http.StatusBadRequest
		}
	case code >= 3000 && code <= 3099: // config/payment errors
		return http.StatusBadRequest
	case code >= 4001 && code <= 4099: // API / validation errors
		switch code {
		case 4005: // forbidden
			return http.StatusForbidden
		default:
			return http.StatusBadRequest
		}
	case code >= 4404 && code <= 4499: // not found
		return http.StatusNotFound
	case code >= 5000 && code <= 5099: // server-side errors
		return http.StatusInternalServerError
	case code >= 6000 && code <= 6099: // external service errors
		return http.StatusBadGateway
	}
	// Fallback: treat unknown codes as bad request
	return http.StatusBadRequest
}

// Success sends a success response
func Success(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Response{
		Code:    0,
		Message: "success",
		Data:    data,
	})
}

// SuccessWithMessage sends a success response with custom message
func SuccessWithMessage(c *gin.Context, message string, data any) {
	c.JSON(http.StatusOK, Response{
		Code:    0,
		Message: message,
		Data:    data,
	})
}

// Error sends an error response with a proper HTTP status code derived from
// the business error code. The business code is preserved in the JSON body
// so the frontend can still distinguish specific error types.
func Error(c *gin.Context, code int, message string) {
	c.JSON(httpStatusFromCode(code), Response{
		Code:    code,
		Message: message,
	})
}

// ErrorWithData sends an error response with data and proper HTTP status.
func ErrorWithData(c *gin.Context, code int, message string, data any) {
	c.JSON(httpStatusFromCode(code), Response{
		Code:    code,
		Message: message,
		Data:    data,
	})
}

// NotFound sends a 404 response
func NotFound(c *gin.Context, message string) {
	c.JSON(http.StatusNotFound, Response{
		Code:    404,
		Message: message,
	})
}

// Forbidden sends a 403 response
func Forbidden(c *gin.Context, message string) {
	c.JSON(http.StatusForbidden, Response{
		Code:    403,
		Message: message,
	})
}

// ServerError sends a 500 response
func ServerError(c *gin.Context, message string) {
	c.JSON(http.StatusInternalServerError, Response{
		Code:    500,
		Message: message,
	})
}

// TooManyRequests sends a 429 response
func TooManyRequests(c *gin.Context, message string) {
	c.JSON(http.StatusTooManyRequests, Response{
		Code:    429,
		Message: message,
	})
}

// Unauthorized sends an unauthorized response
func Unauthorized(c *gin.Context, message string) {
	c.JSON(http.StatusUnauthorized, Response{
		Code:    401,
		Message: message,
	})
}

// BadRequest sends a bad request response
func BadRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, Response{
		Code:    400,
		Message: message,
	})
}

// PaymentRequired 发送 402 余额不足响应
func PaymentRequired(c *gin.Context, message string, data any) {
	c.JSON(http.StatusPaymentRequired, Response{
		Code:    4020,
		Message: message,
		Data:    data,
	})
}

// InternalError logs the real error server-side and returns a safe message
// with proper HTTP status derived from the business code.
func InternalError(c *gin.Context, code int, userMessage string, err error) {
	slog.Error(userMessage, "err", err, "path", c.Request.URL.Path)
	c.JSON(httpStatusFromCode(code), Response{
		Code:    code,
		Message: userMessage,
	})
}

// InternalServerError logs the real error and returns HTTP 500 with a safe message.
func InternalServerError(c *gin.Context, userMessage string, err error) {
	slog.Error(userMessage, "err", err, "path", c.Request.URL.Path)
	c.JSON(http.StatusInternalServerError, Response{
		Code:    500,
		Message: userMessage,
	})
}

// ErrorResponse sends an error response with custom status code
func ErrorResponse(c *gin.Context, statusCode int, message string) {
	c.JSON(statusCode, Response{
		Code:    statusCode,
		Message: message,
	})
}

// SuccessResponse sends a success response with custom status code and data
func SuccessResponse(c *gin.Context, statusCode int, message string, data any) {
	c.JSON(statusCode, Response{
		Code:    0,
		Message: message,
		Data:    data,
	})
}
