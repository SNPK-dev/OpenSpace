package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Event is a single push notification targeted at one device token.
type Event struct {
	Type       string `json:"type"`
	IdentityID string `json:"identity_id"`
	Platform   string `json:"platform"`
	Token      string `json:"token"`
	Title      string `json:"title"`
	Body       string `json:"body"`
}

// Dispatcher sends a batch of push notification events.
type Dispatcher interface {
	Dispatch(ctx context.Context, events []Event) error
}

// NoOpDispatcher discards all events. Used when no webhook is configured.
type NoOpDispatcher struct{}

func (NoOpDispatcher) Dispatch(_ context.Context, _ []Event) error { return nil }

// WebhookDispatcher POSTs a JSON array of Events to a webhook URL.
// The webhook is responsible for calling FCM, APNS, or any other push provider.
type WebhookDispatcher struct {
	url    string
	client *http.Client
}

func NewWebhookDispatcher(url string) *WebhookDispatcher {
	return &WebhookDispatcher{
		url:    url,
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

func (d *WebhookDispatcher) Dispatch(ctx context.Context, events []Event) error {
	b, err := json.Marshal(events)
	if err != nil {
		return fmt.Errorf("marshal events: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.url, bytes.NewReader(b))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("dispatch webhook: %w", err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned %d", resp.StatusCode)
	}
	return nil
}
