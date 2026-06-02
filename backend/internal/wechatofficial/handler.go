// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package wechatofficial

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/prompts"
)

// dedupMsgTTL — MsgId 去重闸的存活时长。覆盖 WeChat 5s 超时后的 3 次重投递窗口即可。
const dedupMsgTTL = 5 * time.Minute

// isDuplicateMessage 用 Redis SETNX 给每条 MsgId 上一次性闸。
// WeChat 在 5s 内没收到回复会重投同一条消息(MsgId 不变),不去重就会重复跑 AI、重复回复。
// 命中已存在的键 → 返回 true 表示"已处理过, 跳过"。Redis 不可用时返回 false 放行,
// 不因去重设施故障而拒服务(最坏退回到原有的"可能重复"行为)。
func (h *Handler) isDuplicateMessage(ctx context.Context, msgID int64) bool {
	if msgID == 0 {
		return false
	}
	rdb := cache.GetRedis()
	if rdb == nil {
		return false
	}
	ok, err := rdb.SetNX(ctx, fmt.Sprintf("wechat_oa:msg:%d", msgID), "1", dedupMsgTTL).Result()
	if err != nil {
		slog.Warn("wechat oa: dedup setnx failed", "msg_id", msgID, "err", err)
		return false
	}
	return !ok // ok=false → 键已存在 → 重复投递
}

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
	// POST 回调也必须验签 —— 跟 GET HandleVerification 同一套 (token/timestamp/nonce 排序 SHA1)。
	// 之前只在 GET 验签, POST 裸收 XML: 任何人都能伪造消息打这个公开 endpoint, 冒充用户触发 AI 回复。
	config, err := h.service.GetConfig()
	if err != nil {
		slog.Error("wechat oa: load config for POST verify failed", "err", err)
		c.String(http.StatusInternalServerError, "加载配置失败")
		return
	}
	if !h.service.VerifySignature(c.Query("signature"), c.Query("timestamp"), c.Query("nonce"), config.Token) {
		slog.Warn("wechat oa: POST signature verification failed", "ip", c.ClientIP())
		c.String(http.StatusUnauthorized, "signature verification failed")
		return
	}

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

		// 重投递去重:命中已处理过的 MsgId 直接回 success, 不再跑 AI / 重复回复
		if h.isDuplicateMessage(c.Request.Context(), msg.MsgID) {
			slog.Info("wechat oa: duplicate text message skipped", "msg_id", msg.MsgID)
			c.String(http.StatusOK, "success")
			return
		}

		toUser = msg.FromUserName
		fromUser = msg.ToUserName

		// Get AI reply (text only) — 透传 gin 请求 ctx, service 自己再加超时
		reply, err = h.service.GetAIReply(c.Request.Context(), msg.Content, "")
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

		// 重投递去重:命中已处理过的 MsgId 直接回 success
		if h.isDuplicateMessage(c.Request.Context(), msg.MsgID) {
			slog.Info("wechat oa: duplicate image message skipped", "msg_id", msg.MsgID)
			c.String(http.StatusOK, "success")
			return
		}

		toUser = msg.FromUserName
		fromUser = msg.ToUserName

		// Download image from WeChat —— 复用请求 ctx, service 内部自加 15s 上限
		base64Image, err := h.service.DownloadImage(c.Request.Context(), msg.MediaId)
		if err != nil {
			slog.Error("failed to download WeChat image", "err", err)
			reply = "抱歉，我无法处理这张图片，请稍后再试。"
		} else {
			// Get AI reply with image
			userMessage := prompts.WechatOfficialImageUserPrompt
			reply, err = h.service.GetAIReplyWithImage(c.Request.Context(), userMessage, base64Image, "")
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

	// 密钥字段"留空 / 仍是遮罩 → 保留旧值"。MaskSensitiveData 用的是
	// <前4><****><后4> 部分遮罩格式, 检测 contains "****" 比精确字符串更稳。
	// 老逻辑直接 binding+save, 用户改个 SystemPrompt 都会把三个密钥全洗成遮罩字符串。
	if existing, err := h.service.GetConfig(); err == nil && existing != nil {
		if config.AppSecret == "" || strings.Contains(config.AppSecret, "****") {
			config.AppSecret = existing.AppSecret
		}
		if config.Token == "" || strings.Contains(config.Token, "****") {
			config.Token = existing.Token
		}
		if config.EncodingAESKey == "" || strings.Contains(config.EncodingAESKey, "****") {
			config.EncodingAESKey = existing.EncodingAESKey
		}
	}

	if err := h.service.UpdateConfig(&config); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "保存配置失败,请稍后重试")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Config updated successfully", gin.H{"message": "Config updated successfully"})
}
