// ============================================================================
// Scholay学术 V1.0
// 用户模块业务错误码统一定义。所有 handler 必须引用这里的常量,
// 禁止再在 handler 里写裸数字(便于追踪/重构/给前端生成枚举)。
//
// 编号规则:
//   2000-2099  email 通道
//   2100-2199  phone 通道
//   2200-2299  token / session
//   2300-2399  profile / 绑定
//   4001       turnstile 人机失败
//   5000       系统级 / 配置缺失
// ============================================================================

package user

const (
	// ---- email 通道 ----
	CodeCheckEmailFailed = 2000
	CodeSendCodeFailed   = 2001
	CodeRegisterFailed   = 2002
	CodeLoginFailed      = 2003

	CodeChangePasswordInvalid = 2012
	CodeChangePasswordFailed  = 2013
	CodeResetPasswordFailed   = 2014
	// 邮箱验证码登录失败 = 输入错误(验证码错/过期/超频),属客户端错误 → 映射 400。
	// 曾误用 2016(与 CodeSessionExpired 共号 → 映射 401),导致"登录失败被当成会话过期、
	// 触发全局登出 + 双 toast"。改用独立的 2004(2000-2099 默认 400)。
	CodeLoginWithCodeFailed = 2004

	// ---- phone 通道 ----
	CodeCheckPhoneFailed         = 2020
	CodeSendPhoneCodeFailed      = 2021
	CodeRegisterPhoneFailed      = 2022
	CodeLoginPhoneFailed         = 2023
	// 手机验证码登录失败 = 客户端输入错误(验证码错/过期/超频)→ 映射 400(2000-2099 默认)。
	// 曾误用 2017(与 token/session 段的 CodeRefreshTokenFailed 重号);虽然两者当前都落 400、
	// 无行为差异,但同值常量是隐患(将来谁给 2017 加特判会一锅端)。独立成 phone 段的 2024。
	CodeLoginPhoneWithCodeFailed = 2024
	CodeResetPasswordPhoneFailed = 2015

	// ---- token / session ----
	CodeLogoutFailed             = 2010
	CodeSessionExpired           = 2016 // 会话过期 → 映射 401(LoginWithCodeFailed 已迁出 2016,不再共号)
	CodeRefreshTokenFailed       = 2017
	CodeSessionTakenByOtherLogin = 2019
	CodeTokenInfoFailed          = 2018

	// ---- 平台横切 ----
	CodeTurnstileFailed   = 4001
	CodeSystemConfigError = 5000
)
