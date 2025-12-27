// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package websocket

import (
	"encoding/json"
	"time"
)

// MessageType 消息类型
type MessageType string

const (
	// 系统消息类型
	MessageTypePing  MessageType = "ping"
	MessageTypePong  MessageType = "pong"
	MessageTypeError MessageType = "error"

	// 业务消息类型
	MessageTypeNotification MessageType = "notification" // 站内信通知
	MessageTypeUnreadCount  MessageType = "unread_count" // 未读消息数量更新
	MessageTypeToast        MessageType = "toast"        // 纯 toast 提示（无站内信记录，不可点击）
)

// Message WebSocket 消息基础结构
type Message struct {
	Type MessageType     `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// NotificationData 站内信通知数据
type NotificationData struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Category  string    `json:"category"`
	LinkURL   string    `json:"link_url,omitempty"`
	LinkText  string    `json:"link_text,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// UnreadCountData 未读消息数量数据
type UnreadCountData struct {
	Count int `json:"count"`
}

// ToastData 纯 toast 提示数据（无站内信记录，不可点击）
type ToastData struct {
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Category  string    `json:"category"`
	CreatedAt time.Time `json:"created_at"`
}

// ErrorData 错误数据
type ErrorData struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// NewMessage 创建消息
func NewMessage(msgType MessageType, data interface{}) (*Message, error) {
	var rawData json.RawMessage
	if data != nil {
		bytes, err := json.Marshal(data)
		if err != nil {
			return nil, err
		}
		rawData = bytes
	}
	return &Message{
		Type: msgType,
		Data: rawData,
	}, nil
}

// NewNotificationMessage 创建站内信通知消息
func NewNotificationMessage(id uint, title, content, category, linkURL, linkText string) (*Message, error) {
	return NewMessage(MessageTypeNotification, NotificationData{
		ID:        id,
		Title:     title,
		Content:   content,
		Category:  category,
		LinkURL:   linkURL,
		LinkText:  linkText,
		CreatedAt: time.Now(),
	})
}

// NewUnreadCountMessage 创建未读数量消息
func NewUnreadCountMessage(count int) (*Message, error) {
	return NewMessage(MessageTypeUnreadCount, UnreadCountData{
		Count: count,
	})
}

// NewToastMessage 创建纯 toast 提示消息（无站内信记录，不可点击）
func NewToastMessage(title, content, category string) (*Message, error) {
	return NewMessage(MessageTypeToast, ToastData{
		Title:     title,
		Content:   content,
		Category:  category,
		CreatedAt: time.Now(),
	})
}

// NewPongMessage 创建 Pong 消息
func NewPongMessage() (*Message, error) {
	return NewMessage(MessageTypePong, nil)
}

// NewErrorMessage 创建错误消息
func NewErrorMessage(code int, message string) (*Message, error) {
	return NewMessage(MessageTypeError, ErrorData{
		Code:    code,
		Message: message,
	})
}

// ToJSON 将消息序列化为 JSON
func (m *Message) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

// ParseMessage 解析消息
func ParseMessage(data []byte) (*Message, error) {
	var msg Message
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}
