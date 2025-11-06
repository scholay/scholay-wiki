package database

import (
	"fmt"
	"log"
	"scholar-backend/internal/common/config"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Initialize initializes the database connection
func Initialize(cfg *config.Config) error {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.DBName,
	)

	var err error
	DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
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

	log.Println("Database connection established successfully with optimized pool settings")
	return nil
}

// GetDB returns the database instance
func GetDB() *gorm.DB {
	return DB
}
