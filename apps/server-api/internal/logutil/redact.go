package logutil

// Redact masks a sensitive string for safe diagnostic logging.
// Returns the first 4 characters followed by "***" if len >= 8, otherwise "***".
func Redact(s string) string {
	if len(s) >= 8 {
		return s[:4] + "***"
	}
	return "***"
}
