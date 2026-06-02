// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package prompts

// WechatOfficialDefaultSystemPrompt 公众号自动回复的兜底 system prompt。
// 仅当 admin 后台未配置 wechat_official_config.system_prompt(为空)时使用;
// DB 有值优先,空才落到此默认值 —— 取舍逻辑在 wechatofficial service 层。
const WechatOfficialDefaultSystemPrompt = "你是一个友好的助手，请简洁准确地回答用户的问题。回复不要超过200字。"

// WechatOfficialImageUserPrompt 公众号收到纯图片消息(无文字)时,
// 与图片一起发给多模态(vision)模型的固定 user 指令。
const WechatOfficialImageUserPrompt = "请分析这张图片并回答相关问题。"
