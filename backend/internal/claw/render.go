// ============================================================================
// 数学公式渲染代理 —— POST /user/render/math
//
// 小程序 rich-text 跑不了 KaTeX;这里把一段 TeX 代理到 agent 容器的 /render/math
// (MathJax → SVG → PNG),再做 Redis 缓存(同一公式全站复用,渲染是纯函数)。
// TeX 解析失败(agent 422)→ 回 400,前端据此回退成"原样展示 LaTeX 文本"。
//
// 挂在 claw.Handler 上纯粹为了复用 feature.AgentClient();与会话/归属无关(无需 session)。
// ============================================================================

package claw

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/utils"
)

const (
	mathRenderCacheTTL = 30 * 24 * time.Hour // 公式→图是纯函数,长缓存
	mathTexMaxLen      = 4000                // 与 agent 侧上限一致
)

type renderMathRequest struct {
	Tex     string `json:"tex"`
	Display *bool  `json:"display"` // 缺省视为块级(true)
}

// RenderMath 把一段 TeX 渲染成 PNG。命中 Redis 直接回;未命中调 agent 渲染后回填。
func (h *Handler) RenderMath(c *gin.Context) {
	var req renderMathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "参数错误")
		return
	}
	tex := strings.TrimSpace(req.Tex)
	if tex == "" || len(tex) > mathTexMaxLen {
		utils.BadRequest(c, "公式为空或过长")
		return
	}
	display := true
	if req.Display != nil {
		display = *req.Display
	}

	ctx := c.Request.Context()
	key := mathCacheKey(tex, display)

	// 命中缓存直接回。
	var cached agent.MathRenderResult
	if err := cache.Get(ctx, key, &cached); err == nil && cached.PNG != "" {
		utils.Success(c, cached)
		return
	}

	out, err := h.feature.AgentClient().RenderMath(ctx, tex, display)
	if err != nil {
		// agent 422 = TeX 无法解析:让前端回退成文本,不算服务器错误(不打 5xx 噪声)。
		var hErr *agent.HTTPError
		if errors.As(err, &hErr) && hErr.StatusCode == http.StatusUnprocessableEntity {
			utils.BadRequest(c, "公式无法渲染")
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "公式渲染服务暂时不可用", err)
		return
	}

	_ = cache.Set(ctx, key, out, mathRenderCacheTTL)
	utils.Success(c, out)
}

// mathCacheKey：block/inline + tex 的 sha256 → 稳定 key。
func mathCacheKey(tex string, display bool) string {
	sum := sha256.Sum256([]byte(tex))
	mode := "b"
	if !display {
		mode = "i"
	}
	return "mathrender:v1:" + mode + ":" + hex.EncodeToString(sum[:])
}

const (
	mermaidRenderCacheTTL = 30 * 24 * time.Hour // 图表→图是纯函数,长缓存
	mermaidCodeMaxLen     = 20000               // 与 agent 侧上限一致
)

type renderMermaidRequest struct {
	Code string `json:"code"`
}

// RenderMermaid 把一段 mermaid 源码渲染成 PNG。命中 Redis 直接回;未命中调 agent 渲染后回填。
// 渲染重(headless Chromium),同一图全站只渲一次。
func (h *Handler) RenderMermaid(c *gin.Context) {
	var req renderMermaidRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "参数错误")
		return
	}
	code := strings.TrimSpace(req.Code)
	if code == "" || len(code) > mermaidCodeMaxLen {
		utils.BadRequest(c, "图表源码为空或过长")
		return
	}

	ctx := c.Request.Context()
	sum := sha256.Sum256([]byte(code))
	key := "mermaidrender:v1:" + hex.EncodeToString(sum[:])

	var cached agent.MermaidRenderResult
	if err := cache.Get(ctx, key, &cached); err == nil && cached.PNG != "" {
		utils.Success(c, cached)
		return
	}

	out, err := h.feature.AgentClient().RenderMermaid(ctx, code)
	if err != nil {
		// agent 422 = mermaid 语法无法解析:前端回退成源码卡,不打 5xx 噪声。
		var hErr *agent.HTTPError
		if errors.As(err, &hErr) && hErr.StatusCode == http.StatusUnprocessableEntity {
			utils.BadRequest(c, "图表无法渲染")
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "图表渲染服务暂时不可用", err)
		return
	}

	_ = cache.Set(ctx, key, out, mermaidRenderCacheTTL)
	utils.Success(c, out)
}
