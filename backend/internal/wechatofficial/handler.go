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

	// Parse XML message
	var msg WeChatTextMessage
	if err := xml.Unmarshal(body, &msg); err != nil {
		fmt.Printf("[WeChat] Failed to parse XML: %v\n", err)
		c.String(http.StatusBadRequest, "Failed to parse XML")
		return
	}

	fmt.Printf("[WeChat] Parsed message - From: %s, Content: %s, Type: %s\n", msg.FromUserName, msg.Content, msg.MsgType)

	// Only handle text messages
	if msg.MsgType != "text" {
		fmt.Printf("[WeChat] Ignoring non-text message type: %s\n", msg.MsgType)
		c.String(http.StatusOK, "success")
		return
	}

	// Get AI reply
	reply, err := h.service.GetAIReply(msg.Content, "")
	if err != nil {
		fmt.Printf("[WeChat] Failed to get AI reply: %v\n", err)
		// Return a default message on error
		reply = "抱歉，我暂时无法处理您的消息，请稍后再试。"
	}

	fmt.Printf("[WeChat] AI reply: %s\n", reply)

	// Build response
	response := WeChatTextResponse{
		ToUserName:   msg.FromUserName,
		FromUserName: msg.ToUserName,
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

	// Hide sensitive fields
	config.AppSecret = ""
	config.Token = ""
	config.EncodingAESKey = ""

	utils.SuccessResponse(c, http.StatusOK, "success", config)
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
