// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package errcode — 集中的业务错误码表。
//
// **规则**:
//   - handler 返回 `utils.Error(c, errcode.XXX, msg)` 时只用本包常量, 禁止裸数字
//   - 各模块如果有强领域语义可以自定义子段位, 但必须在下面"段位规划"内, 不和别人撞码
//   - 前端 toApiError 只信本表; 0 = 成功, 非 0 一律错误
//
// **段位规划** (4 位, 也兼容 5 位扩展):
//
//   |  段位      | 类别                     | 备注                                |
//   |-----------|-------------------------|------------------------------------|
//   |     0     | 成功 (Success)           | utils.Success / utils.SuccessWithMessage 用 |
//   |   1xxx    | HTTP 协议级映射 (400/401/...) | utils.BadRequest / Unauthorized 自动用 |
//   |   2xxx    | 用户认证 / 资料 / 邀请       | 见 user/error_codes.go                |
//   |   3xxx    | 配额 / 订阅 / 计费 (预留)    | 现在 stranded, 后续再开             |
//   |  4001     | turnstile / 人机校验失败      | 跨模块共享                          |
//   |  4002-4019| 表单 / 校验 (预留)            |                                     |
//   |   402x    | 支付 / 钱包                  | 4020=余额不足, 4030+ 渠道相关        |
//   |   5xxx    | 系统级 / 配置 / 内部错        |                                     |
//   |   6xxx    | Agent / AI 模块             | 6001=Agent 不可达, 6002+ 子功能      |
//   |   7xxx    | 上传 / 存储 / 文件解析       |                                     |
//   |   8xxx    | 外部上游 (minicod / SS / pay 三方) |                              |
//   |  90xx     | 审稿 (peer review / pr2)    |                                     |
//   |  91xx     | LaTeX 写作                  |                                     |
//   |  92xx     | 文献集 (library)            |                                     |
//
// 同模块内部更细的子段位可以在模块自己的 error_codes.go 续 (e.g. user/error_codes.go),
// 但所有"跨模块共享"的码必须落到这个表。
package errcode

// ============================================================================
// 通用 / 横切错误码 (高复用, 放在 root 包导出, 各模块都能 import)
// ============================================================================
const (
	// Success 业务成功. utils.Success 默认就是这个。
	Success = 0

	// ---- 鉴权 (HTTP 协议级) ----

	// Unauthorized 未登录 / token 缺失 / token 解析失败. middleware 默认用。
	Unauthorized = 401
	// Forbidden 已登录但无权限 (角色 / 路由不匹配).
	Forbidden = 403
	// NotFound 资源不存在.
	NotFound = 404
	// TooManyRequests 限流触发.
	TooManyRequests = 429
	// InternalServerError 兜底 5xx.
	InternalServerError = 500

	// ---- 业务级鉴权细分 (2xxx) ----
	// 这一段位在 user/error_codes.go 也有定义; 这里只列跨模块用到的几个。

	// TokenRevoked JWT 被加入了 blacklist (改密 / 单端登出 / 封号), 前端应跳登录页。
	TokenRevoked = 2030
	// TokenExpired token 自然过期, 前端应跳登录页或触发 refresh。
	TokenExpired = 2031
	// SessionTakenByOtherLogin 同账号在别处登录, 当前 token 被踢。
	SessionTakenByOtherLogin = 2019

	// ---- 通用平台横切 ----

	// TurnstileFailed cloudflare turnstile 人机校验失败. 跨 user / feedback 用。
	TurnstileFailed = 4001
	// PaymentRequired 余额 / 配额不足. 触发付费弹窗。
	PaymentRequired = 4020

	// ---- Agent / AI 模块 (6xxx) ----

	// AgentUnreachable agent 容器 HTTP / WS 不可用.
	// smart_search / claw / peerreview / latexwriter 都用这个。
	AgentUnreachable = 6001
	// AgentQuotaExceeded 用户在该 feature 上的日 / 月配额耗尽.
	AgentQuotaExceeded = 6010
	// AgentSessionExpired agent 端 session 文件被清理, 需要前端重新建会话.
	AgentSessionExpired = 6020

	// ---- 上传 / 存储 (7xxx) ----

	// UploadTooLarge 文件超过 multipart 上限.
	UploadTooLarge = 7001
	// UploadInvalidType MIME / 后缀不在白名单.
	UploadInvalidType = 7002
	// UploadStorageFailed MinIO 落盘失败.
	UploadStorageFailed = 7003
)
