// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package wechatofficial

import (
	"encoding/xml"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

// Handler handles HTTP requests for WeChat Official Account
type Handler struct {
	service *Service
}

// NewHandler creates a new handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// HandleVerification handles WeChat server verification (GET request)
func (h *Handler) HandleVerification(c *gin.Context) {
	signature := c.Query("signature")
	timestamp := c.Query("timestamp")
	nonce := c.Query("nonce")
	echostr := c.Query("echostr")

	// Get config to retrieve token
	config, err := h.service.GetConfig()
	if err != nil {
		slog.Error("failed to get WeChat config", "err", err)
		c.String(http.StatusInternalServerError, "加载配置失败,请稍后重试")
		return
	}

	// Verify signature
	if h.service.VerifySignature(signature, timestamp, nonce, config.Token) {
		slog.Info("WeChat verification successful")
		c.String(http.StatusOK, echostr)
	} else {
		slog.Warn("WeChat verification failed")
		c.String(http.StatusUnauthorized, "Verification failed")
	}
}

// HandleMessage handles WeChat messages (POST request)
func (h *Handler) HandleMessage(c *gin.Context) {
	// Read request body
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		slog.Error("failed to read WeChat message body", "err", err)
		c.String(http.StatusBadRequest, "读取请求内容失败")
		return
	}

	slog.Debug("received WeChat message", "body", string(body))

	// Parse XML to determine message type
	var baseMsg struct {
		MsgType string `xml:"MsgType"`
	}
	if err := xml.Unmarshal(body, &baseMsg); err != nil {
		slog.Error("failed to parse WeChat XML", "err", err)
		c.String(http.StatusBadRequest, "解析消息失败")
		return
	}

	slog.Debug("WeChat message type", "msg_type", baseMsg.MsgType)

	var reply string
	var toUser, fromUser string

	switch baseMsg.MsgType {
	case "text":
		// Handle text message
		var msg WeChatTextMessage
		if err := xml.Unmarshal(body, &msg); err != nil {
			slog.Error("failed to parse WeChat text message", "err", err)
			c.String(http.StatusBadRequest, "解析文本消息失败")
			return
		}

		slog.Debug("WeChat text message", "from", msg.FromUserName, "content", msg.Content)

		toUser = msg.FromUserName
		fromUser = msg.ToUserName

		// Get AI reply (text only)
		reply, err = h.service.GetAIReply(msg.Content, "")
		if err != nil {
			slog.Error("failed to get AI reply", "err", err)
			reply = "抱歉，我暂时无法处理您的消息，请稍后再试。"
		}

	case "image":
		// Handle image message
		var msg WeChatImageMessage
		if err := xml.Unmarshal(body, &msg); err != nil {
			slog.Error("failed to parse WeChat image message", "err", err)
			c.String(http.StatusBadRequest, "解析图片消息失败")
			return
		}

		slog.Debug("WeChat image message", "from", msg.FromUserName, "pic_url", msg.PicUrl, "media_id", msg.MediaId)

		toUser = msg.FromUserName
		fromUser = msg.ToUserName

		// Download image from WeChat
		base64Image, err := h.service.DownloadImage(msg.MediaId)
		if err != nil {
			slog.Error("failed to download WeChat image", "err", err)
			reply = "抱歉，我无法处理这张图片，请稍后再试。"
		} else {
			// Get AI reply with image
			userMessage := "请分析这张图片并回答相关问题。"
			reply, err = h.service.GetAIReplyWithImage(userMessage, base64Image, "")
			if err != nil {
				slog.Error("failed to get AI reply with image", "err", err)
				reply = "抱歉，我暂时无法处理您的图片，请稍后再试。"
			}
		}

	default:
		// Ignore other message types
		slog.Debug("ignoring WeChat message type", "msg_type", baseMsg.MsgType)
		c.String(http.StatusOK, "success")
		return
	}

	slog.Debug("WeChat AI reply", "reply", reply)

	// Build response
	response := WeChatTextResponse{
		ToUserName:   toUser,
		FromUserName: fromUser,
		CreateTime:   time.Now().Unix(),
		MsgType:      "text",
		Content:      reply,
	}

	// Convert to XML
	xmlData, err := xml.Marshal(response)
	if err != nil {
		slog.Error("failed to marshal WeChat XML response", "err", err)
		c.String(http.StatusInternalServerError, "生成回复失败")
		return
	}

	slog.Debug("sending WeChat response", "xml", string(xmlData))

	// Return XML response
	c.Header("Content-Type", "application/xml")
	c.String(http.StatusOK, string(xmlData))
}

// GetConfig handles GET /api/v1/admin/wechat-official/config
func (h *Handler) GetConfig(c *gin.Context) {
	config, err := h.service.GetConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载配置失败,请稍后重试")
		return
	}

	// Check if request wants to show sensitive data
	showSensitive := c.Query("show_sensitive") == "true"

	if showSensitive {
		// Return real values without masking
		utils.SuccessResponse(c, http.StatusOK, "success", config)
	} else {
		// Mask sensitive fields for display
		maskedConfig := config.MaskSensitiveData()
		utils.SuccessResponse(c, http.StatusOK, "success", maskedConfig)
	}
}

// UpdateConfig handles PUT /api/v1/admin/wechat-official/config
func (h *Handler) UpdateConfig(c *gin.Context) {
	var config WeChatOfficialConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数有误")
		return
	}

	if err := h.service.UpdateConfig(&config); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "保存配置失败,请稍后重试")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Config updated successfully", gin.H{"message": "Config updated successfully"})
}
