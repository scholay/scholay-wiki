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
	CodeLoginWithCodeFailed   = 2016

	// ---- phone 通道 ----
	CodeCheckPhoneFailed         = 2020
	CodeSendPhoneCodeFailed      = 2021
	CodeRegisterPhoneFailed      = 2022
	CodeLoginPhoneFailed         = 2023
	CodeLoginPhoneWithCodeFailed = 2017
	CodeResetPasswordPhoneFailed = 2015

	// ---- token / session ----
	CodeLogoutFailed             = 2010
	CodeSessionExpired           = 2016 // 与 LoginWithCodeFailed 共号,但语义独立(historical)
	CodeRefreshTokenFailed       = 2017
	CodeSessionTakenByOtherLogin = 2019
	CodeTokenInfoFailed          = 2018

	// ---- 平台横切 ----
	CodeTurnstileFailed   = 4001
	CodeSystemConfigError = 5000
)
