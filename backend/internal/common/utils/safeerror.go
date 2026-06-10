// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

import (
	"context"
	"errors"
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

// SafeError 给用户面回错的「安全回显」入口,取代散落各处的 utils.Error(c, code, err.Error())。
//
// 问题:很多 handler 直接把 service 返回的 err 原样回显,而 service 的错误是混合的 ——
// 业务错误(「邮箱已注册」「验证码错误」,应当展示)与基础设施错误(DB/Redis/agent 故障时
// 被 %w 包装的 `dial tcp ... connection refused`、内部容器主机名 `http://agent:3000` 等,
// 绝不能上脸)。MySQL/Redis 抖动时,登录框直接显示 dial tcp 既泄露内部拓扑又吓用户。
//
// 本助手:
//   - 基础设施形态的错误 → 替换成通用友好文案 + 把原始 err 记 slog(可排查),HTTP 5xx;
//   - 其余(业务错误)→ 原样展示 err.Error(),保留 code 推导的 HTTP 状态。
//
// 注:这是「保守的启发式」——只对**明确的**基础设施信号(typed net/context 错误 + 一小撮
// 绝不会出现在中文业务文案里的英文片段)做脱敏,业务消息一律透传,不会误伤。
// 更彻底的做法是 service 层返回 typed 业务哨兵 + handler errors.Is 分支(prism mapXxxErr 范式),
// 可在此基础上逐步收敛。
func SafeError(c *gin.Context, code int, err error) {
	if err == nil {
		Error(c, code, "操作失败")
		return
	}
	if isInfraError(err) {
		// 复用 InternalError:记原始 err + 回通用文案 + 5xx。
		InternalError(c, 500, "服务暂时不可用,请稍后重试", err)
		return
	}
	Error(c, code, err.Error())
}

// SafeBadRequest 等价于 SafeError(c, 400, err):基础设施错误脱敏,业务错误透传,HTTP 400。
// 给原来 utils.BadRequest(c, err.Error()) 的位点用,免去调用方 import net/http 取 400。
func SafeBadRequest(c *gin.Context, err error) {
	if err == nil {
		BadRequest(c, "请求参数有误")
		return
	}
	if isInfraError(err) {
		InternalError(c, 500, "服务暂时不可用,请稍后重试", err)
		return
	}
	BadRequest(c, err.Error())
}

// infraErrorSubstrings 是「绝不会出现在中文业务文案里」的基础设施错误特征片段。
var infraErrorSubstrings = []string{
	"dial tcp",
	"connection refused",
	"connection reset",
	"i/o timeout",
	"no such host",
	"context deadline exceeded",
	"context canceled",
	"broken pipe",
	"http://",  // 内部容器主机名(http://agent:3000 / http://umami:3000 ...)
	"https://", // 同上(上游 base_url 泄露)
	"EOF",
	"sql:",   // database/sql 错误
	"gorm:",  // gorm 包装
	"redis:", // go-redis 包装
}

// isInfraError 判断 err 是否是基础设施形态(应脱敏)。保守:只认 typed 网络/超时错误
// 与上面那批明确片段;其余视为业务错误透传。
func isInfraError(err error) bool {
	if err == nil {
		return false
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return true
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return true
	}
	msg := strings.ToLower(err.Error())
	for _, s := range infraErrorSubstrings {
		if strings.Contains(msg, strings.ToLower(s)) {
			return true
		}
	}
	return false
}
