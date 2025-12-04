// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

import (
	"strings"
)

// 设备类型常量
const (
	DeviceTypePC     = "pc"
	DeviceTypeMobile = "mobile"
)

// 移动设备关键词
var mobileKeywords = []string{
	"mobile",
	"iphone",
	"ipod",
	"blackberry",
	"windows phone",
	"opera mini",
	"opera mobi",
	"iemobile",
	"wpdesktop",
	"webos",
	"palm",
	"symbian",
	"nokia",
	"lg-",
	"htc",
	"mot-",
	"zte-",
	"huawei",
	"xiaomi",
	"redmi",
	"oppo",
	"vivo",
	"oneplus",
	"meizu",
	"realme",
}

// 平板设备关键词（视为移动端）
var tabletKeywords = []string{
	"tablet",
	"ipad",
	"playbook",
	"kindle",
	"silk",
}

// ParseDeviceType 根据 User-Agent 判断设备类型
// 返回 "pc" 或 "mobile"
func ParseDeviceType(userAgent string) string {
	if userAgent == "" {
		return DeviceTypePC
	}

	ua := strings.ToLower(userAgent)

	// 检查是否是平板设备（视为移动端）
	for _, keyword := range tabletKeywords {
		if strings.Contains(ua, keyword) {
			return DeviceTypeMobile
		}
	}

	// 检查是否包含移动设备关键词
	for _, keyword := range mobileKeywords {
		if strings.Contains(ua, keyword) {
			return DeviceTypeMobile
		}
	}

	// 特殊处理 Android：如果包含 android 但不包含 mobile，可能是平板
	// 如果包含 android 和 mobile，则是手机
	if strings.Contains(ua, "android") {
		// Android 设备默认视为移动端
		return DeviceTypeMobile
	}

	// 默认为 PC 端
	return DeviceTypePC
}

// IsMobileDevice 判断是否是移动设备
func IsMobileDevice(userAgent string) bool {
	return ParseDeviceType(userAgent) == DeviceTypeMobile
}

// IsPCDevice 判断是否是 PC 设备
func IsPCDevice(userAgent string) bool {
	return ParseDeviceType(userAgent) == DeviceTypePC
}

