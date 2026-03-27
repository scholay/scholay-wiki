package logger

import (
	"log/slog"
	"os"

	"scholar-backend/internal/common/config"
)

// Init 初始化全局 slog 日志
// release 模式输出 JSON 格式，其他模式输出可读文本格式
func Init() {
	var handler slog.Handler
	isRelease := false
	if config.AppConfig != nil {
		isRelease = config.AppConfig.App.IsRelease
	}
	if isRelease {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	}
	slog.SetDefault(slog.New(handler))
}
