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

// Load loads configuration from environment variables
func Load() *Config {
	// Try to load .env file (optional in production)
	_ = godotenv.Load()

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
			Secret: getEnv("JWT_SECRET", "default-secret-change-in-production"),
		},
		Admin: AdminConfig{
			InitialUsername: getEnv("ADMIN_INITIAL_USERNAME", "admin"),
			InitialPassword: getEnv("ADMIN_INITIAL_PASSWORD", "adminadmin"),
		},
		SigNoz: SigNozConfig{
			Endpoint:      getEnv("SIGNOZ_ENDPOINT", "198.44.187.186:4318"),
			ServiceName:   getEnv("SIGNOZ_SERVICE_NAME", "scholar-backend"),
			Environment:   getEnv("SIGNOZ_ENVIRONMENT", "production"),
			EnableTracing: getEnvAsBool("SIGNOZ_ENABLE_TRACING", true),
			EnableLogging: getEnvAsBool("SIGNOZ_ENABLE_LOGGING", true),
			EnableMetrics: getEnvAsBool("SIGNOZ_ENABLE_METRICS", true),
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
