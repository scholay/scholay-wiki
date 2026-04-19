// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package database

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"os"
	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/safego"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Initialize initializes the database connection
func Initialize(cfg *config.Config) error {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&collation=utf8mb4_unicode_ci&parseTime=True&loc=Local",
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.DBName,
	)

	// Custom logger with slow query detection
	newLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		logger.Config{
			SlowThreshold:             200 * time.Millisecond, // Log queries slower than 200ms
			LogLevel:                  logger.Warn,            // Only log warnings and errors (including slow queries)
			IgnoreRecordNotFoundError: true,                   // Don't log "record not found" as errors
			Colorful:                  true,                   // Colorful output for better readability
		},
	)

	var err error
	DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: newLogger,
		// 性能优化配置
		PrepareStmt:            true, // 预编译SQL语句,提升性能
		SkipDefaultTransaction: true, // 跳过默认事务,读操作更快
	})

	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get database instance: %w", err)
	}

	// Set connection pool settings - 优化为更高的并发能力
	sqlDB.SetMaxIdleConns(25)                   // 增加空闲连接数,减少连接建立开销
	sqlDB.SetMaxOpenConns(200)                  // 增加最大连接数,支持更高并发
	sqlDB.SetConnMaxLifetime(time.Hour)         // 连接最大生命周期
	sqlDB.SetConnMaxIdleTime(10 * time.Minute) // 空闲连接最大存活时间

	slog.Info("Database connection established successfully with optimized pool settings")
	return nil
}

// GetDB returns the database instance
func GetDB() *gorm.DB {
	return DB
}

// StartConnectionPoolMonitoring starts a goroutine that logs connection pool stats
func StartConnectionPoolMonitoring(ctx context.Context, interval time.Duration) {
	sqlDB, err := DB.DB()
	if err != nil {
		slog.Warn("Failed to get database instance for monitoring", "err", err)
		return
	}

	ticker := time.NewTicker(interval)
	safego.Go("db-pool-monitor", func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				stats := sqlDB.Stats()
				slog.Info("DB Pool Stats",
					"open", stats.OpenConnections,
					"max", stats.MaxOpenConnections,
					"inUse", stats.InUse,
					"idle", stats.Idle,
					"waitCount", stats.WaitCount,
					"waitDuration", stats.WaitDuration,
					"maxIdleClosed", stats.MaxIdleClosed,
					"maxLifetimeClosed", stats.MaxLifetimeClosed,
				)

				if stats.WaitCount > 0 {
					slog.Warn("DB pool has waiting requests, consider increasing MaxOpenConns", "waitCount", stats.WaitCount)
				}
				if int(stats.OpenConnections) >= int(float64(stats.MaxOpenConnections)*0.9) {
					slog.Warn("DB pool near capacity",
						"percent", int(float64(stats.OpenConnections)/float64(stats.MaxOpenConnections)*100),
						"open", stats.OpenConnections,
						"max", stats.MaxOpenConnections,
					)
				}
			case <-ctx.Done():
				slog.Info("Database connection pool monitoring stopped")
				return
			}
		}
	})

	slog.Info("Database connection pool monitoring started", "interval", interval)
}
