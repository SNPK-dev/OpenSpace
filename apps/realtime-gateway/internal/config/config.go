package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
)

type Config struct {
	DatabaseURL    string
	RedisURL       string
	Port           string
	AllowedOrigins []string
}

func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		return nil, errors.New("REDIS_URL is required")
	}
	if os.Getenv("APP_ENV") == "production" {
		if err := validateProductionRedis(redisURL, os.Getenv("REDIS_TRUST_BOUNDARY")); err != nil {
			return nil, err
		}
	}
	port := os.Getenv("GATEWAY_PORT")
	if port == "" {
		port = "3001"
	}
	origins := strings.Split(os.Getenv("WS_ALLOWED_ORIGINS"), ",")
	return &Config{DatabaseURL: dbURL, RedisURL: redisURL, Port: port, AllowedOrigins: origins}, nil
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
