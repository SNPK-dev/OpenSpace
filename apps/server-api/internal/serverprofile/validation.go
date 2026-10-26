package serverprofile

import (
	"net/url"
	"strings"
)

const (
	MaxNameLength        = 100
	MaxDescriptionLength = 500
	MaxPublicURLLength   = 2048
	MaxAvatarURLLength   = 512 * 1024
)

func ValidateName(value string) bool {
	name := strings.TrimSpace(value)
	return name != "" && len(name) <= MaxNameLength
}

func ValidateDescription(value string) bool {
	return len(strings.TrimSpace(value)) <= MaxDescriptionLength
}

func ValidatePublicURL(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return true
	}
	if len(trimmed) > MaxPublicURLLength {
		return false
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return false
	}
	return parsed.Scheme == "http" || parsed.Scheme == "https"
}

func ValidateAvatarURL(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return true
	}
	if len(trimmed) > MaxAvatarURLLength {
		return false
	}
	return strings.HasPrefix(trimmed, "http://") ||
		strings.HasPrefix(trimmed, "https://") ||
		strings.HasPrefix(trimmed, "data:image/png;") ||
		strings.HasPrefix(trimmed, "data:image/jpeg;") ||
		strings.HasPrefix(trimmed, "data:image/jpg;") ||
		strings.HasPrefix(trimmed, "data:image/gif;") ||
		strings.HasPrefix(trimmed, "data:image/webp;")
}

func OptionalString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
