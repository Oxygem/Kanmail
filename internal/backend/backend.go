package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/constants"
)

var httpClient *http.Client
var sessionID string
var sessionIDOnce sync.Once
var appVersion string

func SetAppVersion(version string) {
	appVersion = version
}

func init() {
	httpClient = &http.Client{
		Timeout: 10 * time.Second,
	}
}

func doBackendRequest(ctx context.Context, method, endpoint string, payload any) (*http.Response, error) {
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal analytics payload: %w", err)
	}

	url := constants.ENV_BACKEND_API_URL + endpoint
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create analytics request: %w", err)
	}

	req.Header.Set("Authorization", constants.BACKEND_API_KEY)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Kanmail/v2")

	return httpClient.Do(req)
}

func SendAnalytics(ctx context.Context, deviceID, event string, properties map[string]any) error {
	sessionIDOnce.Do(func() {
		if uuid, err := uuid.NewV7(); err != nil {
			zerolog.Ctx(ctx).Err(err).Msg("Failed to generate new session ID")
		} else {
			sessionID = uuid.String()
		}
	})
	properties["$device_id"] = deviceID
	if sessionID != "" {
		properties["$session_id"] = sessionID
	}
	if appVersion != "" {
		properties["$app_version"] = appVersion
	}

	payload := map[string]any{
		"events": []map[string]any{
			{
				"event_name": event,
				"data":       properties,
			},
		},
	}

	resp, err := doBackendRequest(ctx, http.MethodPost, "/api/v1/track", payload)
	if err != nil {
		return fmt.Errorf("failed to send analytics request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("analytics request failed with status %d", resp.StatusCode)
	}

	return nil
}

func CheckLicense(ctx context.Context, deviceID, licenseKey string) (bool, error) {
	payload := map[string]string{
		"device_id":   deviceID,
		"license_key": licenseKey,
	}

	resp, err := doBackendRequest(ctx, http.MethodPost, "/api/v1/license/check", payload)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		return true, nil
	case http.StatusUnauthorized, http.StatusForbidden:
		return false, nil
	default:
		return false, fmt.Errorf("license check failed with status %d", resp.StatusCode)
	}
}

type Version struct {
	Version   int    `json:"version"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	Link      string `json:"link"`
	SHA256Sum string `json:"sha256sum"`
}

func GetVersions(ctx context.Context, deviceID string) ([]Version, error) {
	resp, err := doBackendRequest(ctx, http.MethodGet, "/api/v1/versions", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("invalid backend response status: %d", resp.StatusCode)
	}

	d, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	data := make([]Version, 0, 6) // 2 os * 3 arch
	err = json.Unmarshal(d, &data)
	return data, err
}
