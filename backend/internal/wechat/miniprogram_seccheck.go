// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 微信小程序内容安全(msgSecCheck)—— UGC / AI 文本过检,过审硬前置。
//
// access_token:小程序全局 token(cgi-bin/token),两层缓存(进程内 + Redis)防 token
// 接口调用配额被打爆;msgSecCheck v2 需要用户 openid(近 2h 访问过小程序)+ scene。
//
// fail-open 策略:配置缺失 / 上游失败 / token 拿不到 → 一律放行(Pass=true)+ 日志。
// 内容安全设施故障不该拦正常用户(与全站配额 / 去重的 fail-open 口径一致);
// 只有明确判定为 risky 才拦。

package wechat

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/common/cache"
)

const mpAccessTokenCacheKey = "wechat_mp:access_token"

// 进程内二级缓存 —— Redis 不可用时兜底,避免每请求都打 token 接口(有日调用上限)。
var (
	mpTokenMu  sync.Mutex
	mpTokenVal string
	mpTokenExp time.Time
)

type mpTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	ErrCode     int    `json:"errcode"`
	ErrMsg      string `json:"errmsg"`
}

// getMiniProgramAccessToken 取小程序全局 access_token(进程内 → Redis → 拉取,回写两层)。
func (s *Service) getMiniProgramAccessToken(ctx context.Context) (string, error) {
	// 1) 进程内
	mpTokenMu.Lock()
	if mpTokenVal != "" && time.Now().Before(mpTokenExp) {
		tok := mpTokenVal
		mpTokenMu.Unlock()
		return tok, nil
	}
	mpTokenMu.Unlock()

	// 2) Redis
	rdb := cache.GetRedis()
	if rdb != nil {
		if tok, err := rdb.Get(ctx, mpAccessTokenCacheKey).Result(); err == nil && tok != "" {
			mpTokenMu.Lock()
			mpTokenVal, mpTokenExp = tok, time.Now().Add(5*time.Minute)
			mpTokenMu.Unlock()
			return tok, nil
		}
	}

	// 3) 拉取
	cfg, err := s.repo.GetMiniProgramConfig()
	if err != nil {
		return "", fmt.Errorf("小程序配置不可用: %w", err)
	}
	if cfg.AppID == "" || cfg.AppSecret == "" {
		return "", errors.New("小程序 AppID/AppSecret 未配置")
	}
	var resp mpTokenResponse
	if err := wxUpstream().GetJSON(ctx, "/cgi-bin/token", url.Values{
		"grant_type": {"client_credential"},
		"appid":      {cfg.AppID},
		"secret":     {cfg.AppSecret},
	}, &resp); err != nil {
		return "", fmt.Errorf("获取 access_token 失败: %w", err)
	}
	if resp.ErrCode != 0 || resp.AccessToken == "" {
		return "", fmt.Errorf("微信 token 接口错误: %s (code: %d)", resp.ErrMsg, resp.ErrCode)
	}

	ttl := resp.ExpiresIn - 200
	if ttl < 60 {
		ttl = 60
	}
	if rdb != nil {
		_ = rdb.Set(ctx, mpAccessTokenCacheKey, resp.AccessToken, time.Duration(ttl)*time.Second).Err()
	}
	mpTokenMu.Lock()
	mpTokenVal, mpTokenExp = resp.AccessToken, time.Now().Add(time.Duration(ttl)*time.Second)
	mpTokenMu.Unlock()
	return resp.AccessToken, nil
}

// invalidateMiniProgramAccessToken token 失效(40001)时清两层缓存,下次重取。
func (s *Service) invalidateMiniProgramAccessToken(ctx context.Context) {
	mpTokenMu.Lock()
	mpTokenVal, mpTokenExp = "", time.Time{}
	mpTokenMu.Unlock()
	if rdb := cache.GetRedis(); rdb != nil {
		_ = rdb.Del(ctx, mpAccessTokenCacheKey).Err()
	}
}

// SecCheckResult 文本安全检测结果。
type SecCheckResult struct {
	Pass    bool
	Suggest string // pass / review / risky
	Label   int
}

type msgSecCheckResponse struct {
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
	Result  struct {
		Suggest string `json:"suggest"`
		Label   int    `json:"label"`
	} `json:"result"`
}

// CheckText 文本内容安全(msgSecCheck v2)。
//   - openid 空 / 上游失败 / 配置缺失 → fail-open(Pass=true)。
//   - 仅 suggest=risky(或 v1 语义 errcode=87014)判为不通过;review 放行(误伤率高)。
func (s *Service) CheckText(ctx context.Context, openid, content string) (SecCheckResult, error) {
	pass := SecCheckResult{Pass: true, Suggest: "pass"}
	content = strings.TrimSpace(content)
	if content == "" || openid == "" {
		return pass, nil
	}
	token, err := s.getMiniProgramAccessToken(ctx)
	if err != nil {
		slog.Warn("wechat sec: access_token unavailable, fail-open", "err", err)
		return pass, nil
	}

	body := map[string]any{
		"content": content,
		"version": 2,
		"scene":   3, // 3 = 论坛 / 评论 / 对话
		"openid":  openid,
	}
	var resp msgSecCheckResponse
	if err := wxUpstream().PostJSON(ctx, "/wxa/msg_sec_check?access_token="+url.QueryEscape(token), body, &resp); err != nil {
		slog.Warn("wechat sec: msg_sec_check call failed, fail-open", "err", err)
		return pass, nil
	}

	// 87014 = 内容含违规(v1 语义);v2 走 result.suggest。
	if resp.ErrCode == 87014 || resp.Result.Suggest == "risky" {
		return SecCheckResult{Pass: false, Suggest: "risky", Label: resp.Result.Label}, nil
	}
	if resp.ErrCode == 40001 {
		// token 过期 → 清缓存,本次放行,下次自愈。
		s.invalidateMiniProgramAccessToken(ctx)
		slog.Warn("wechat sec: access_token expired, invalidated, fail-open")
		return pass, nil
	}
	if resp.ErrCode != 0 {
		slog.Warn("wechat sec: msg_sec_check errcode, fail-open", "errcode", resp.ErrCode, "errmsg", resp.ErrMsg)
		return pass, nil
	}
	suggest := resp.Result.Suggest
	if suggest == "" {
		suggest = "pass"
	}
	return SecCheckResult{Pass: suggest != "risky", Suggest: suggest, Label: resp.Result.Label}, nil
}

// CheckText implements user.WeChatService interface(内容安全预检)。
func (a *ServiceAdapter) CheckText(ctx context.Context, openid, content string) (pass bool, suggest string, err error) {
	r, err := a.service.CheckText(ctx, openid, content)
	return r.Pass, r.Suggest, err
}
