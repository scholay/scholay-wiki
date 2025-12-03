// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package wechatofficial

import (
	"encoding/xml"
	"fmt"
	"io"
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
		fmt.Printf("[WeChat] Failed to get config: %v\n", err)
		c.String(http.StatusInternalServerError, "Failed to get config")
		return
	}

	// Verify signature
	if h.service.VerifySignature(signature, timestamp, nonce, config.Token) {
		fmt.Printf("[WeChat] Verification successful\n")
		c.String(http.StatusOK, echostr)
	} else {
		fmt.Printf("[WeChat] Verification failed\n")
		c.String(http.StatusUnauthorized, "Verification failed")
	}
}

// HandleMessage handles WeChat messages (POST request)
func (h *Handler) HandleMessage(c *gin.Context) {
	// Read request body
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		fmt.Printf("[WeChat] Failed to read body: %v\n", err)
		c.String(http.StatusBadRequest, "Failed to read body")
		return
	}

	fmt.Printf("[WeChat] Received message: %s\n", string(body))

	// Parse XML to determine message type
	var baseMsg struct {
		MsgType string `xml:"MsgType"`
	}
	if err := xml.Unmarshal(body, &baseMsg); err != nil {
		fmt.Printf("[WeChat] Failed to parse XML: %v\n", err)
		c.String(http.StatusBadRequest, "Failed to parse XML")
		return
	}

	fmt.Printf("[WeChat] Message type: %s\n", baseMsg.MsgType)

	var reply string
	var toUser, fromUser string

	switch baseMsg.MsgType {
	case "text":
		// Handle text message
		var msg WeChatTextMessage
		if err := xml.Unmarshal(body, &msg); err != nil {
			fmt.Printf("[WeChat] Failed to parse text message: %v\n", err)
			c.String(http.StatusBadRequest, "Failed to parse text message")
			return
		}

		fmt.Printf("[WeChat] Text message - From: %s, Content: %s\n", msg.FromUserName, msg.Content)

		toUser = msg.FromUserName
		fromUser = msg.ToUserName

		// Get AI reply (text only)
		reply, err = h.service.GetAIReply(msg.Content, "")
		if err != nil {
			fmt.Printf("[WeChat] Failed to get AI reply: %v\n", err)
			reply = "抱歉，我暂时无法处理您的消息，请稍后再试。"
		}

	case "image":
		// Handle image message
		var msg WeChatImageMessage
		if err := xml.Unmarshal(body, &msg); err != nil {
			fmt.Printf("[WeChat] Failed to parse image message: %v\n", err)
			c.String(http.StatusBadRequest, "Failed to parse image message")
			return
		}

		fmt.Printf("[WeChat] Image message - From: %s, PicUrl: %s, MediaId: %s\n",
			msg.FromUserName, msg.PicUrl, msg.MediaId)

		toUser = msg.FromUserName
		fromUser = msg.ToUserName

		// Download image from WeChat
		base64Image, err := h.service.DownloadImage(msg.MediaId)
		if err != nil {
			fmt.Printf("[WeChat] Failed to download image: %v\n", err)
			reply = "抱歉，我无法处理这张图片，请稍后再试。"
		} else {
			// Get AI reply with image
			userMessage := "请分析这张图片并回答相关问题。"
			reply, err = h.service.GetAIReplyWithImage(userMessage, base64Image, "")
			if err != nil {
				fmt.Printf("[WeChat] Failed to get AI reply with image: %v\n", err)
				reply = "抱歉，我暂时无法处理您的图片，请稍后再试。"
			}
		}

	default:
		// Ignore other message types
		fmt.Printf("[WeChat] Ignoring message type: %s\n", baseMsg.MsgType)
		c.String(http.StatusOK, "success")
		return
	}

	fmt.Printf("[WeChat] AI reply: %s\n", reply)

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
		fmt.Printf("[WeChat] Failed to marshal XML: %v\n", err)
		c.String(http.StatusInternalServerError, "Failed to create response")
		return
	}

	fmt.Printf("[WeChat] Sending response: %s\n", string(xmlData))

	// Return XML response
	c.Header("Content-Type", "application/xml")
	c.String(http.StatusOK, string(xmlData))
}

// GetConfig handles GET /api/v1/admin/wechat-official/config
func (h *Handler) GetConfig(c *gin.Context) {
	config, err := h.service.GetConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get config")
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
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request")
		return
	}

	if err := h.service.UpdateConfig(&config); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to update config")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Config updated successfully", gin.H{"message": "Config updated successfully"})
}
