package httputil

import (
	"encoding/json"
	"net/http"
)

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func WriteError(w http.ResponseWriter, status int, code string) {
	WriteJSON(w, status, map[string]string{"error": code})
}

func WriteValidationError(w http.ResponseWriter, field string) {
	WriteJSON(w, http.StatusBadRequest, map[string]string{
		"error": "validation_error",
		"field": field,
	})
}
