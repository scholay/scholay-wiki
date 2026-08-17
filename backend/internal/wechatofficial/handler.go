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
	"strconv"
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

// AI 回复防滥用成本帽:公众号是**匿名入口、不扣任何用户每日额度**,任何能通过签名的请求方都能
// 驱动 LLM 花费(见 docs/research/ai-token-surface-2026-06 R1)。两道按天的闸把成本敞口封住:
//   - 单粉丝(OpenID)每日 AI 回复上限 —— 挡单用户/单脚本刷;
//   - 全局每日 AI 回复上限 —— 封顶整体成本,即便伪造多个 OpenID 也兜得住。
// 需要时可提升为 admin 可配(加 config 列 + 迁移);先用安全默认值堵住敞口。
const (
	aiReplyPerUserDaily = 30
	aiReplyGlobalDaily  = 8000
	// 🔴 单条消息的输入长度帽(2026-08-02 计费审计 P1-9)。
	// 上面两道帽都只数「调用次数」,对**单条消息的 token 量零约束** —— 而这是全站唯一
	// user_id=NULL、平台全额承担成本的 LLM 入口。一条 20 万字的消息(远低于 10MB BodyLimit)
	// 乘以全局 8000 次/日 ≈ 8 亿 input token 的上游账单,且全部落成 user_id=NULL 的账本行,
	// 不扣任何人额度、不触发任何配额告警。公众号消息本身的产品形态就是短问答,
	// 2000 字对真实用户绰绰有余,超出直接截断(不拒收 —— 拒收对误发长文的真实用户体验更差)。
	wechatInputMaxRunes = 2000
	// 验签时效窗口:微信的 signature 只由 token+timestamp+nonce 算出、**与 body 无关**,
	// 三元组会原样出现在 nginx access log 的 query string 里。不校验时效 = 一次泄露永久可用,
	// 攻击者可以带着同一组 query 反复换 body(自造 OpenID 绕过单粉丝帽)刷全局帽。
	wechatSignatureMaxSkew = 5 * time.Minute
	// 同一组签名只接受一次(配合时效窗口封死重放)。TTL 取窗口的 2 倍留出时钟偏差余量。
	wechatSignatureReplayTTL = 2 * wechatSignatureMaxSkew
)

// verifyRequestFresh 在验签之外再加两道:时间戳时效 + 同签名只用一次。
// 微信协议本身不对 body 签名,这是能在协议内做到的最强重放防护。
// Redis 不可用 → 只做时效校验(与本包其余配额设施一致的 fail-open 取舍;时效窗口本身已把
// 一次泄露的可利用期从「永久」压到 5 分钟)。
func (h *Handler) verifyRequestFresh(ctx context.Context, signature, timestamp string) bool {
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	if skew := time.Since(time.Unix(ts, 0)); skew > wechatSignatureMaxSkew || skew < -wechatSignatureMaxSkew {
		slog.Warn("wechat oa: signature timestamp out of window (replay?)", "skew_sec", int(skew.Seconds()))
		return false
	}
	rdb := cache.GetRedis()
	if rdb == nil || signature == "" {
		return true
	}
	ok, err := rdb.SetNX(ctx, "wechat_oa:sig:"+signature, "1", wechatSignatureReplayTTL).Result()
	if err != nil {
		slog.Warn("wechat oa: signature replay setnx failed", "err", err)
		return true // 设施故障不拒服务,时效窗口仍在
	}
	if !ok {
		slog.Warn("wechat oa: signature replayed within window, rejected")
	}
	return ok
}

// clampWechatInput 把用户输入截断到 wechatInputMaxRunes(按 rune,防切碎中文)。
func clampWechatInput(s string) string {
	r := []rune(s)
	if len(r) <= wechatInputMaxRunes {
		return s
	}
	slog.Warn("wechat oa: 入参超长已截断", "runes", len(r), "cap", wechatInputMaxRunes)
	return string(r[:wechatInputMaxRunes])
}

// wechatReplyRateLimited 命中成本帽时回给粉丝的友好提示(不消耗 LLM)。
const wechatReplyRateLimited = "今日消息已达上限,请明天再来。"

// allowAIReply 原子地为一次 AI 回复计数并判断是否在每日上限内。先判单粉丝(超限即拦,
// 不再累加全局),再判全局。Redis 不可用 → fail-open(不因配额设施故障拒服务,与系统其余
// 配额一致;全局闸同样依赖 Redis)。openID 为空 → 仅计全局。
func (h *Handler) allowAIReply(ctx context.Context, openID string) bool {
	rdb := cache.GetRedis()
	if rdb == nil {
		return true
	}
	day := time.Now().Format("20060102")
	if openID != "" {
		uk := "wechat_oa:ai:u:" + openID + ":" + day
		if n, err := rdb.Incr(ctx, uk).Result(); err == nil {
			if n == 1 {
				_ = rdb.Expire(ctx, uk, 25*time.Hour).Err()
			}
			if n > aiReplyPerUserDaily {
				slog.Info("wechat oa: per-user daily AI reply cap reached", "open_id", openID, "count", n, "cap", aiReplyPerUserDaily)
				return false
			}
		}
	}
	gk := "wechat_oa:ai:all:" + day
	if n, err := rdb.Incr(ctx, gk).Result(); err == nil {
		if n == 1 {
			_ = rdb.Expire(ctx, gk, 25*time.Hour).Err()
		}
		if n > aiReplyGlobalDaily {
			slog.Warn("wechat oa: global daily AI reply cap reached", "count", n, "cap", aiReplyGlobalDaily)
			return false
		}
	}
	return true
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
	// 还没配置过 —— 没有 token 就无从验签,直接拒;不能往下走(config 是 nil,解引用会 panic)
	if config == nil {
		slog.Warn("wechat oa: verification hit but config not set up yet")
		c.String(http.StatusServiceUnavailable, "公众号尚未配置")
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
	// 同 HandleVerification:没配置过就没有 token,解引用会 panic,且此时任何消息都不该被处理
	if config == nil {
		slog.Warn("wechat oa: message received but config not set up yet", "ip", c.ClientIP())
		c.String(http.StatusServiceUnavailable, "公众号尚未配置")
		return
	}
	if !h.service.VerifySignature(c.Query("signature"), c.Query("timestamp"), c.Query("nonce"), config.Token) {
		slog.Warn("wechat oa: POST signature verification failed", "ip", c.ClientIP())
		c.String(http.StatusUnauthorized, "signature verification failed")
		return
	}
	// 时效 + 一次性(审计 P1-9):微信的签名不覆盖 body,只验签等于「拿到一组三元组就能无限换 body 重放」。
	if !h.verifyRequestFresh(c.Request.Context(), c.Query("signature"), c.Query("timestamp")) {
		c.String(http.StatusUnauthorized, "signature expired or replayed")
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

		// 匿名成本帽:超过单粉丝/全局每日上限就回友好提示, 不再触发 LLM。
		if !h.allowAIReply(c.Request.Context(), msg.FromUserName) {
			reply = wechatReplyRateLimited
		} else {
			// Get AI reply (text only) — 透传 gin 请求 ctx, service 自己再加超时
			reply, err = h.service.GetAIReply(c.Request.Context(), clampWechatInput(msg.Content), "")
			if err != nil {
				slog.Error("failed to get AI reply", "err", err)
				reply = "暂时无法处理您的消息,请稍后重试。"
			}
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

		// 匿名成本帽:先判额度再下载/调 AI(图片走视觉模型更贵, 超限直接回提示, 省下载也省 LLM)。
		if !h.allowAIReply(c.Request.Context(), msg.FromUserName) {
			reply = wechatReplyRateLimited
		} else {
			// Download image from WeChat —— 复用请求 ctx, service 内部自加 15s 上限
			base64Image, derr := h.service.DownloadImage(c.Request.Context(), msg.MediaId)
			if derr != nil {
				slog.Error("failed to download WeChat image", "err", derr)
				reply = "暂时无法识别这张图片,请稍后重试。"
			} else {
				// Get AI reply with image
				userMessage := prompts.WechatOfficialImageUserPrompt
				reply, err = h.service.GetAIReplyWithImage(c.Request.Context(), userMessage, base64Image, "")
				if err != nil {
					slog.Error("failed to get AI reply with image", "err", err)
					reply = "暂时无法处理您的图片,请稍后重试。"
				}
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
	// 「还没配置过」返回一份空配置而不是错误 —— 与 config/handler_email_sms.go 的
	// email/sms 口径一致。后台的表单需要能渲染出来,管理员才做得了首次配置;
	// 回 500 的话前端的"加载失败就不渲染表单"守卫会把首次配置彻底堵死。
	if config == nil {
		utils.SuccessResponse(c, http.StatusOK, "success", &WeChatOfficialConfig{})
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
