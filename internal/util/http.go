package util

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/rs/zerolog"
)

type HTTPRequest struct {
	URL     string
	Method  string
	Headers http.Header
	Query   url.Values
	Form    url.Values
	JSON    url.Values
}

func MakeHTTPRequest(ctx context.Context, client *http.Client, httpReq *HTTPRequest) (*http.Response, []byte, error) {
	method := httpReq.Method
	if httpReq.Method == "" {
		method = http.MethodGet
	}

	log := zerolog.Ctx(ctx).With().
		Str("url", httpReq.URL).
		Str("method", httpReq.Method).
		Logger()

	log.Trace().Msg("Make HTTP request")

	if httpReq.Query != nil {
		httpReq.URL = httpReq.URL + "?" + httpReq.Query.Encode()
	}

	var body []byte
	if httpReq.Form != nil {
		body = []byte(httpReq.Form.Encode())

	} else if httpReq.JSON != nil {
		flattened := make(map[string]string, len(httpReq.JSON))
		for key := range httpReq.JSON {
			flattened[key] = httpReq.JSON.Get(key)
		}
		if b, err := json.Marshal(flattened); err != nil {
			panic(err)
		} else {
			body = b
		}
	}

	req, err := http.NewRequestWithContext(ctx, method, httpReq.URL, bytes.NewBuffer(body))
	if err != nil {
		return nil, nil, err
	}

	// Add headers
	for k, v := range httpReq.Headers {
		for _, s := range v {
			req.Header.Add(k, s)
		}
	}
	if httpReq.Form != nil {
		req.Header.Add("Content-Type", "application/x-www-form-urlencoded")
	}

	resp, err := client.Do(req)
	if err != nil {
		return resp, nil, err
	}
	defer resp.Body.Close()
	log.Trace().Int("status_code", resp.StatusCode).Msg("Got HTTP response")

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp, nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != 200 {
		return resp, b, fmt.Errorf("invalid status code: %d", resp.StatusCode)
	}

	return resp, b, nil
}

func MakeHTTPRequestJSON(ctx context.Context, client *http.Client, httpReq *HTTPRequest) (map[string]any, error) {
	_, b, err := MakeHTTPRequest(ctx, client, httpReq)

	var data map[string]any
	if jErr := json.Unmarshal(b, &data); jErr != nil {
		// Prefer the original error here, if we didn't get valid JSON
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("invalid JSON response: %w", jErr)
	}

	zerolog.Ctx(ctx).Trace().Any("url", httpReq.URL).Any("data", data).Msg("Got JSON data")
	return data, err
}
