// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package sse

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// SetHeaders 设置 SSE 标准响应头
func SetHeaders(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
}

// writeData 写入 SSE data 事件（内部使用）
func writeData(w io.Writer, data string) {
	fmt.Fprintf(w, "data: %s\n\n", data)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// WriteError 通过 SSE 发送错误消息
func WriteError(w io.Writer, errMsg string) {
	errJSON, _ := json.Marshal(map[string]string{"error": errMsg})
	writeData(w, string(errJSON))
}

// WriteMultilineData 处理包含换行符的内容，将 \n 替换为 <br> 以避免 SSE 协议冲突
func WriteMultilineData(w io.Writer, content string) {
	if content == "" {
		return
	}
	escaped := strings.ReplaceAll(content, "\n", "<br>")
	writeData(w, escaped)
}

// WriteDone 写入流结束标记
func WriteDone(w io.Writer) {
	writeData(w, "[DONE]")
}

// WriteDoneWithData 写入携带 JSON 数据的流结束标记
func WriteDoneWithData(w io.Writer, data any) {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		WriteDone(w)
		return
	}
	writeData(w, "[DONE] "+string(jsonBytes))
}

// WriteJSONEvent 将任意对象序列化为 JSON 并作为 SSE data 事件写入
func WriteJSONEvent(w io.Writer, data any) {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return
	}
	writeData(w, string(jsonBytes))
}

// WriteErrorText 写入纯文本错误（[ERROR] 前缀格式）
func WriteErrorText(w io.Writer, errMsg string) {
	writeData(w, "[ERROR] "+errMsg)
}
