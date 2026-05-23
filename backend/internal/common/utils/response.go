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
	Code      int    `json:"code"`
	Message   string `json:"message"`
	Data      any    `json:"data,omitempty"`
	RequestID string `json:"request_id,omitempty"` // 便于用户反馈/日志排查时回溯
}

// requestIDFrom 从 gin.Context 中读取 RequestID(由 RequestIDMiddleware 注入)。
// 用于响应里回传给客户端,以便用户反馈时能在后端日志里精准定位这次请求。
func requestIDFrom(c *gin.Context) string {
	if c == nil {
		return ""
	}
	if v, ok := c.Get("RequestID"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
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

// autoLogIfServerError 当 HTTP 状态 ≥500(5xx 服务端错误 / 6xxx 上游服务失败) 时
// 自动写一条 slog.Error,确保 docker logs 里一定能搜到这次故障 —— caller 不需要
// 再手动 slog.Error(...) 一遍。4xx 客户端错误(参数校验 / 未授权 / 找不到等)不
// 自动写,避免日志风暴 —— 真要记录 4xx 内部异常请用 InternalError。
func autoLogIfServerError(c *gin.Context, httpStatus, code int, message string) {
	if httpStatus < 500 {
		return
	}
	reqID := requestIDFrom(c)
	path := ""
	method := ""
	if c != nil && c.Request != nil {
		path = c.Request.URL.Path
		method = c.Request.Method
	}
	slog.Error(message,
		"code", code,
		"http_status", httpStatus,
		"path", path,
		"method", method,
		"request_id", reqID,
	)
}

// Error sends an error response with a proper HTTP status code derived from
// the business error code. The business code is preserved in the JSON body
// so the frontend can still distinguish specific error types.
//
// 副作用:status ≥500 时自动 slog.Error,无需 caller 重复打日志。
func Error(c *gin.Context, code int, message string) {
	status := httpStatusFromCode(code)
	autoLogIfServerError(c, status, code, message)
	c.JSON(status, Response{
		Code:    code,
		Message: message,
	})
}

// ErrorWithData sends an error response with data and proper HTTP status.
func ErrorWithData(c *gin.Context, code int, message string, data any) {
	status := httpStatusFromCode(code)
	autoLogIfServerError(c, status, code, message)
	c.JSON(status, Response{
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

// ServerError sends a 500 response.
// 自动 slog.Error —— 5xx 必登记。
func ServerError(c *gin.Context, message string) {
	autoLogIfServerError(c, http.StatusInternalServerError, 500, message)
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
// 日志与响应里都带上 request_id，便于用户上报后快速定位到同一条日志/trace。
func InternalError(c *gin.Context, code int, userMessage string, err error) {
	reqID := requestIDFrom(c)
	slog.Error(userMessage, "err", err, "path", c.Request.URL.Path, "request_id", reqID)
	c.JSON(httpStatusFromCode(code), Response{
		Code:      code,
		Message:   userMessage,
		RequestID: reqID,
	})
}

// InternalServerError logs the real error and returns HTTP 500 with a safe message.
func InternalServerError(c *gin.Context, userMessage string, err error) {
	reqID := requestIDFrom(c)
	slog.Error(userMessage, "err", err, "path", c.Request.URL.Path, "request_id", reqID)
	c.JSON(http.StatusInternalServerError, Response{
		Code:      500,
		Message:   userMessage,
		RequestID: reqID,
	})
}

// ErrorResponse sends an error response with custom HTTP status code.
// 自动 slog.Error 当 statusCode ≥500。
func ErrorResponse(c *gin.Context, statusCode int, message string) {
	autoLogIfServerError(c, statusCode, statusCode, message)
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
