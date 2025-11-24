package utils

import (
	"strings"

	"github.com/mileusna/useragent"
)

// DeviceInfo represents parsed user agent information
type DeviceInfo struct {
	DeviceType string `json:"device_type"` // Desktop, Mobile, Tablet, Bot
	OS         string `json:"os"`          // Windows, macOS, Linux, iOS, Android, etc.
	OSVersion  string `json:"os_version"`
	Browser    string `json:"browser"`      // Chrome, Firefox, Safari, etc.
	BrowserVersion string `json:"browser_version"`
	Platform   string `json:"platform"`     // windows, mac, linux, ios, android
	IsBot      bool   `json:"is_bot"`
	IsMobile   bool   `json:"is_mobile"`
	IsTablet   bool   `json:"is_tablet"`
	IsDesktop  bool   `json:"is_desktop"`
}

// ParseUserAgent parses user agent string into structured device info
func ParseUserAgent(uaString string) *DeviceInfo {
	if uaString == "" {
		return &DeviceInfo{
			DeviceType: "未知",
			OS:         "未知",
			Browser:    "未知",
			Platform:   "unknown",
		}
	}

	ua := useragent.Parse(uaString)

	deviceType := "桌面"
	if ua.Bot {
		deviceType = "机器人"
	} else if ua.Mobile {
		deviceType = "手机"
	} else if ua.Tablet {
		deviceType = "平板"
	} else if ua.Desktop {
		deviceType = "桌面"
	}

	// Get OS name in Chinese
	osName := getOSName(ua.OS, ua.OSVersion)
	
	// Get browser name
	browserName := getBrowserName(ua.Name, ua.Version)

	return &DeviceInfo{
		DeviceType:     deviceType,
		OS:             osName,
		OSVersion:      ua.OSVersion,
		Browser:        browserName,
		BrowserVersion: ua.Version,
		Platform:       strings.ToLower(ua.OS),
		IsBot:          ua.Bot,
		IsMobile:       ua.Mobile,
		IsTablet:       ua.Tablet,
		IsDesktop:      ua.Desktop,
	}
}

// getOSName returns Chinese OS name
func getOSName(os, version string) string {
	osLower := strings.ToLower(os)
	
	switch {
	case strings.Contains(osLower, "windows"):
		if version != "" {
			// Map Windows versions
			switch {
			case strings.Contains(version, "10"):
				return "Windows 10"
			case strings.Contains(version, "11"):
				return "Windows 11"
			case strings.Contains(version, "8"):
				return "Windows 8"
			case strings.Contains(version, "7"):
				return "Windows 7"
			default:
				return "Windows " + version
			}
		}
		return "Windows"
	case strings.Contains(osLower, "mac") || strings.Contains(osLower, "darwin"):
		return "macOS"
	case strings.Contains(osLower, "ios"):
		if version != "" {
			return "iOS " + version
		}
		return "iOS"
	case strings.Contains(osLower, "android"):
		if version != "" {
			return "Android " + version
		}
		return "Android"
	case strings.Contains(osLower, "linux"):
		return "Linux"
	case strings.Contains(osLower, "ubuntu"):
		return "Ubuntu"
	case strings.Contains(osLower, "chromeos"):
		return "Chrome OS"
	default:
		if os != "" {
			return os
		}
		return "未知系统"
	}
}

// getBrowserName returns browser display name
func getBrowserName(browser, version string) string {
	browserLower := strings.ToLower(browser)
	
	var displayName string
	switch {
	case strings.Contains(browserLower, "chrome"):
		displayName = "Chrome"
	case strings.Contains(browserLower, "firefox"):
		displayName = "Firefox"
	case strings.Contains(browserLower, "safari"):
		displayName = "Safari"
	case strings.Contains(browserLower, "edge"):
		displayName = "Edge"
	case strings.Contains(browserLower, "opera"):
		displayName = "Opera"
	case strings.Contains(browserLower, "ie") || strings.Contains(browserLower, "internet explorer"):
		displayName = "IE"
	case strings.Contains(browserLower, "wechat"):
		displayName = "微信浏览器"
	case strings.Contains(browserLower, "qq"):
		displayName = "QQ浏览器"
	default:
		if browser != "" {
			displayName = browser
		} else {
			displayName = "未知浏览器"
		}
	}

	// Add version if available and major version only
	if version != "" {
		// Extract major version (first number before dot)
		majorVersion := strings.Split(version, ".")[0]
		return displayName + " " + majorVersion
	}

	return displayName
}

// GetDeviceString returns a formatted device string for display
func GetDeviceString(info *DeviceInfo) string {
	if info == nil {
		return "未知设备"
	}

	if info.IsBot {
		return "机器人"
	}

	// Format: "设备类型 | 操作系统 | 浏览器"
	parts := []string{}
	
	if info.DeviceType != "" && info.DeviceType != "未知" {
		parts = append(parts, info.DeviceType)
	}
	
	if info.OS != "" && info.OS != "未知系统" {
		parts = append(parts, info.OS)
	}
	
	if info.Browser != "" && info.Browser != "未知浏览器" {
		parts = append(parts, info.Browser)
	}

	if len(parts) == 0 {
		return "未知设备"
	}

	return strings.Join(parts, " | ")
}

// GetSimpleDeviceString returns a shorter device description
func GetSimpleDeviceString(info *DeviceInfo) string {
	if info == nil {
		return "未知"
	}

	if info.IsBot {
		return "机器人"
	}

	// Format: "操作系统 浏览器"
	os := info.OS
	if os == "未知系统" || os == "" {
		os = info.DeviceType
	}

	browser := info.Browser
	if browser == "未知浏览器" || browser == "" {
		return os
	}

	return os + " " + browser
}

