package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL            string
	RedisURL               string
	Port                   string
	LogLevel               string
	SessionTTLDays         int
	StorageEndpoint        string
	StoragePublicEndpoint  string
	StorageAccess          string
	StorageSecret          string
	StorageBucket          string
	StorageUseSSL          bool
	StoragePublicUseSSL    bool
	LiveKitURL             string
	LiveKitPublicURL       string
	LiveKitAPIKey          string
	LiveKitAPISecret       string
	TurnHost               string
	TurnPort               int
	TurnSecret             string
	RateDisabled           bool
	NotificationWebhookURL string
}

func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://redis:6379"
	}
	if os.Getenv("APP_ENV") == "production" {
		if err := validateProductionRedis(redisURL, os.Getenv("REDIS_TRUST_BOUNDARY")); err != nil {
			return nil, err
		}
	}

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "info"
	}

	ttlDays := 30
	if v := os.Getenv("SESSION_TTL_DAYS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return nil, fmt.Errorf("SESSION_TTL_DAYS must be a positive integer")
		}
		ttlDays = n
	}

	storageEndpoint := os.Getenv("STORAGE_ENDPOINT")
	if storageEndpoint == "" {
		storageEndpoint = "minio:9000"
	}
	storageBucket := os.Getenv("STORAGE_BUCKET")
	if storageBucket == "" {
		storageBucket = "openspace"
	}
	storageUseSSL := os.Getenv("STORAGE_USE_SSL") == "true"
	storagePublicEndpoint := os.Getenv("STORAGE_PUBLIC_ENDPOINT")
	if os.Getenv("APP_ENV") == "production" {
		if storagePublicEndpoint == "" {
			return nil, fmt.Errorf("STORAGE_PUBLIC_ENDPOINT is required in production")
		}
		if strings.Contains(storagePublicEndpoint, "://") || strings.Contains(storagePublicEndpoint, "/") {
			return nil, fmt.Errorf("STORAGE_PUBLIC_ENDPOINT must be a host[:port] without scheme or path")
		}
	}
	if storagePublicEndpoint == "" {
		storagePublicEndpoint = storageEndpoint
	}
	storagePublicUseSSL := os.Getenv("STORAGE_PUBLIC_USE_SSL") == "true"
	if os.Getenv("APP_ENV") == "production" && !storagePublicUseSSL {
		return nil, fmt.Errorf("STORAGE_PUBLIC_USE_SSL must be true in production")
	}

	liveKitURL := os.Getenv("LIVEKIT_URL")
	if liveKitURL == "" {
		liveKitURL = "ws://livekit:7880"
	}
	liveKitPublicURL := os.Getenv("LIVEKIT_PUBLIC_URL")
	if liveKitPublicURL == "" {
		liveKitPublicURL = liveKitURL
	}

	turnHost := os.Getenv("TURN_HOST")
	if turnHost == "" {
		turnHost = "localhost"
	}
	turnPort := 3478
	if v := os.Getenv("TURN_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			turnPort = n
		}
	}
	turnSecret := os.Getenv("TURN_SECRET")
	if turnSecret == "" {
		turnSecret = "devturn"
	}

	return &Config{
		DatabaseURL:            dbURL,
		RedisURL:               redisURL,
		Port:                   port,
		LogLevel:               logLevel,
		SessionTTLDays:         ttlDays,
		StorageEndpoint:        storageEndpoint,
		StoragePublicEndpoint:  storagePublicEndpoint,
		StorageAccess:          os.Getenv("STORAGE_ACCESS_KEY"),
		StorageSecret:          os.Getenv("STORAGE_SECRET_KEY"),
		StorageBucket:          storageBucket,
		StorageUseSSL:          storageUseSSL,
		StoragePublicUseSSL:    storagePublicUseSSL,
		LiveKitURL:             liveKitURL,
		LiveKitPublicURL:       liveKitPublicURL,
		LiveKitAPIKey:          os.Getenv("LIVEKIT_API_KEY"),
		LiveKitAPISecret:       os.Getenv("LIVEKIT_API_SECRET"),
		TurnHost:               turnHost,
		TurnPort:               turnPort,
		TurnSecret:             turnSecret,
		RateDisabled:           os.Getenv("RATE_DISABLED") == "true",
		NotificationWebhookURL: os.Getenv("NOTIFICATION_WEBHOOK_URL"),
	}, nil
}

func validateProductionRedis(rawURL, trustBoundary string) error {
	u, err := url.Parse(rawURL)
	if err != nil || u.Hostname() == "" {
		return fmt.Errorf("REDIS_URL must be a valid URL")
	}
	if trustBoundary == "compose-internal" && u.Scheme == "redis" && u.Hostname() == "redis" {
		return nil
	}
	password, hasPassword := u.User.Password()
	if u.Scheme != "rediss" || u.User.Username() == "" || !hasPassword || password == "" {
		return fmt.Errorf("external production Redis requires rediss:// with ACL username and password")
	}
	return nil
}
