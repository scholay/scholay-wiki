// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	JWT      JWTConfig
	Admin    AdminConfig
	SigNoz   SigNozConfig
}

type ServerConfig struct {
	Port string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
	DB       int
}

type JWTConfig struct {
	Secret string
}

type AdminConfig struct {
	InitialUsername string
	InitialPassword string
}

type SigNozConfig struct {
	Endpoint      string
	ServiceName   string
	Environment   string
	EnableTracing bool
	EnableLogging bool
	EnableMetrics bool
	SamplingRate  float64
}

var AppConfig *Config

const defaultJWTSecret = "default-secret-change-in-production"

// Load loads configuration from environment variables
func Load() *Config {
	// Try to load .env file (optional in production)
	_ = godotenv.Load()

	jwtSecret := getEnv("JWT_SECRET", defaultJWTSecret)
	env := getEnv("SIGNOZ_ENVIRONMENT", "production")

	if env == "production" && (jwtSecret == defaultJWTSecret || len(jwtSecret) < 16) {
		log.Fatal("FATAL: JWT_SECRET must be set to a strong value (>=16 chars) in production. " +
			"Set the JWT_SECRET environment variable.")
	}

	if jwtSecret == defaultJWTSecret {
		log.Println("WARNING: Using default JWT secret — do NOT use this in production")
	}

	AppConfig = &Config{
		Server: ServerConfig{
			Port: getEnv("SERVER_PORT", "8080"),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "3306"),
			User:     getEnv("DB_USER", "scholar_user"),
			Password: getEnv("DB_PASSWORD", "scholar_pass"),
			DBName:   getEnv("DB_NAME", "scholar"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnv("REDIS_PORT", "6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvAsInt("REDIS_DB", 0),
		},
		JWT: JWTConfig{
			Secret: jwtSecret,
		},
		Admin: AdminConfig{
			InitialUsername: getEnv("ADMIN_INITIAL_USERNAME", "admin"),
			InitialPassword: getEnv("ADMIN_INITIAL_PASSWORD", "adminadmin"),
		},
		SigNoz: SigNozConfig{
			Endpoint:      getEnv("SIGNOZ_ENDPOINT", ""),
			ServiceName:   getEnv("SIGNOZ_SERVICE_NAME", "scholar-backend"),
			Environment:   env,
			EnableTracing: getEnvAsBool("SIGNOZ_ENABLE_TRACING", false),
			EnableLogging: getEnvAsBool("SIGNOZ_ENABLE_LOGGING", false),
			EnableMetrics: getEnvAsBool("SIGNOZ_ENABLE_METRICS", false),
			SamplingRate:  getEnvAsFloat("SIGNOZ_SAMPLING_RATE", 1.0),
		},
	}

	log.Println("Configuration loaded successfully")
	return AppConfig
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsBool(key string, defaultValue bool) bool {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.ParseBool(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsFloat(key string, defaultValue float64) float64 {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.ParseFloat(valueStr, 64)
	if err != nil {
		return defaultValue
	}
	return value
}
