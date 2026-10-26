package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPMetricsUseBoundedStatusClassLabels(t *testing.T) {
	m := New()
	handler := m.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNotFound) }))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/users/private-id", nil))
	recorder := httptest.NewRecorder()
	m.ServeHTTP(recorder, nil)
	body := recorder.Body.String()
	if !strings.Contains(body, `status_class="4xx"} 1`) {
		t.Fatalf("missing bounded status metric: %s", body)
	}
	for _, sensitive := range []string{"private-id", "secret-token-value", "identity_id=", "object_key="} {
		if strings.Contains(body, sensitive) {
			t.Fatalf("metrics leaked %q", sensitive)
		}
	}
}
