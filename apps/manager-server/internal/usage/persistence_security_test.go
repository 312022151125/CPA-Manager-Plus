package usage

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestSharedCredentialTaxonomy(t *testing.T) {
	secretKeys := []string{
		"cpaManagementKey",
		"cpa_management_key",
		"management_key",
		"managementKey",
		"apiKey",
		"api_key",
		"clientSecret",
		"client_secret",
		"secret",
		"password",
		"passwd",
		"token",
		"accessToken",
		"access_token",
		"refreshToken",
		"refresh_token",
		"authorization",
		"cookie",
		"session",
		"session_token",
		"sessionToken",
		"auth_token",
		"authToken",
		"private_key",
		"privateKey",
	}

	for _, key := range secretKeys {
		t.Run(key, func(t *testing.T) {
			if !isSecretFieldKey(key) {
				t.Fatalf("expected key %q to be recognized as secret", key)
			}
			rawJSON := fmt.Sprintf(`{"%s":"super-secret-value-123","normal_field":"safe_value"}`, key)
			sanitized := SanitizeJSONForPersistence(rawJSON)
			if strings.Contains(sanitized, "super-secret-value-123") {
				t.Fatalf("key %q value was not sanitized: %s", key, sanitized)
			}
			if !strings.Contains(sanitized, "safe_value") {
				t.Fatalf("safe_value was unexpectedly removed: %s", sanitized)
			}
		})
	}
}

func TestCamelCaseTextFallbackSanitization(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		contains string
		redacted string
	}{
		{
			name:     "cpaManagementKey unquoted",
			input:    "error: cpaManagementKey=admin-secret-token-xyz in config",
			contains: "admin-secret-token-xyz",
		},
		{
			name:     "cpaManagementKey quoted double",
			input:    `{"cpaManagementKey": "sk-admin-management-secret-456"}`,
			contains: "sk-admin-management-secret-456",
		},
		{
			name:     "clientSecret colon separated",
			input:    "clientSecret: super-client-secret-789",
			contains: "super-client-secret-789",
		},
		{
			name:     "bearer token in malformed text",
			input:    "upstream returned 401 with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.secret",
			contains: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.secret",
		},
		{
			name:     "cookie in raw string",
			input:    "Cookie: session_id=session-secret-cookie-value; theme=dark",
			contains: "session-secret-cookie-value",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Test SanitizeDiagnosticBody
			cleanedBody := SanitizeDiagnosticBody(tc.input)
			if strings.Contains(cleanedBody, tc.contains) {
				t.Fatalf("SanitizeDiagnosticBody leaked secret %q in %s", tc.contains, cleanedBody)
			}

			// Test FailSummaryFromBody
			summary := FailSummaryFromBody(tc.input)
			if strings.Contains(summary, tc.contains) {
				t.Fatalf("FailSummaryFromBody leaked secret %q in %s", tc.contains, summary)
			}
		})
	}
}

func TestJSONObjectKeyRedaction(t *testing.T) {
	secretToken1 := "sk-proj-superSecretOpenAIToken1234567890"
	secretToken2 := "ghp_PersonalAccessTokenGitHub9876543210"

	inputJSON := fmt.Sprintf(`{
		"tokens": {
			"%s": {"active": true, "count": 5},
			"%s": {"active": false, "count": 2}
		},
		"model": "gpt-5",
		"input_tokens": 100
	}`, secretToken1, secretToken2)

	sanitized := SanitizeJSONForPersistence(inputJSON)
	if strings.Contains(sanitized, secretToken1) {
		t.Fatalf("sanitized JSON leaked secret key 1: %s", sanitized)
	}
	if strings.Contains(sanitized, secretToken2) {
		t.Fatalf("sanitized JSON leaked secret key 2: %s", sanitized)
	}
	if !strings.Contains(sanitized, "[redacted-key:") {
		t.Fatalf("expected pseudonymized [redacted-key:<hash>] but got: %s", sanitized)
	}
	if !strings.Contains(sanitized, `"gpt-5"`) || !strings.Contains(sanitized, "100") {
		t.Fatalf("business values lost: %s", sanitized)
	}

	// Verify stability: running twice yields same pseudonym
	sanitized2 := SanitizeJSONForPersistence(inputJSON)
	if sanitized != sanitized2 {
		t.Fatalf("pseudonym was not deterministic: %s vs %s", sanitized, sanitized2)
	}
}

func TestJSONBigIntFidelity(t *testing.T) {
	const bigIntStr = "9223372036854775807"
	const bigTimestampStr = "1741857948123456789"

	inputJSON := fmt.Sprintf(`{
		"id": %s,
		"high_precision_ts": %s,
		"api_key": "sk-secret1234567890",
		"normal_float": 12.345
	}`, bigIntStr, bigTimestampStr)

	sanitized := SanitizeJSONForPersistence(inputJSON)
	if strings.Contains(sanitized, "sk-secret1234567890") {
		t.Fatalf("leaked secret: %s", sanitized)
	}

	if !strings.Contains(sanitized, bigIntStr) {
		t.Fatalf("bigint %s was altered or converted to float: %s", bigIntStr, sanitized)
	}
	if !strings.Contains(sanitized, bigTimestampStr) {
		t.Fatalf("big timestamp %s was altered or converted to float: %s", bigTimestampStr, sanitized)
	}

	// Verify valid JSON
	var parsed map[string]interface{}
	d := json.NewDecoder(strings.NewReader(sanitized))
	d.UseNumber()
	if err := d.Decode(&parsed); err != nil {
		t.Fatalf("sanitized output is not valid JSON: %v, raw: %s", err, sanitized)
	}
}

func TestFailBodyNoTruncationAndTailSanitization(t *testing.T) {
	// Build a large body > 8000 bytes
	var sb strings.Builder
	for i := 0; i < 200; i++ {
		sb.WriteString(fmt.Sprintf("line %04d: diagnostic log chunk containing non-sensitive info...\n", i))
	}
	const secretAtTail = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tailSecretToken1234567890"
	sb.WriteString("at tail: " + secretAtTail + "\n")
	for i := 0; i < 50; i++ {
		sb.WriteString(fmt.Sprintf("trailing line %04d: end of debug report...\n", i))
	}

	rawBody := sb.String()
	if len(rawBody) <= 4096 {
		t.Fatalf("test precondition failed: raw body length %d <= 4096", len(rawBody))
	}

	// SanitizeDiagnosticBody should NOT truncate
	sanitizedBody := SanitizeDiagnosticBody(rawBody)
	if len(sanitizedBody) < 4096 {
		t.Fatalf("SanitizeDiagnosticBody unexpectedly truncated body: len = %d", len(sanitizedBody))
	}
	if strings.Contains(sanitizedBody, "tailSecretToken1234567890") {
		t.Fatalf("SanitizeDiagnosticBody failed to sanitize secret beyond 4096 bytes: %s", sanitizedBody)
	}

	// FailSummaryFromBody MUST truncate to <= 4096 bytes
	summary := FailSummaryFromBody(rawBody)
	if len(summary) > 4096 {
		t.Fatalf("FailSummaryFromBody exceeded 4096 bytes: len = %d", len(summary))
	}
	if strings.Contains(summary, "tailSecretToken1234567890") {
		t.Fatalf("FailSummaryFromBody leaked secret: %s", summary)
	}
}

func TestFalsePositiveProtection(t *testing.T) {
	// File names, auth identifiers, and model names should not be touched
	safeNames := []string{
		"sk-account.json",
		"ghp_account.json",
		"codex-account.json",
		"AIza_account.json",
		"account-1.json",
		"gpt-4o",
		"claude-3-5-sonnet",
	}

	for _, name := range safeNames {
		t.Run(name, func(t *testing.T) {
			if ContainsCredential(name) {
				t.Fatalf("ContainsCredential false positive on safe identifier: %q", name)
			}
		})
	}

	// Test Event fields preservation
	ev := Event{
		EventHash:             "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Provider:              "sk-account.json",
		Model:                 "gpt-4o",
		AuthFileSnapshot:      "sk-account.json",
		AuthProviderSnapshot:  "codex",
		AuthAccountIDSnapshot: "acc-sk-123",
		AuthProjectIDSnapshot: "proj-ghp-456",
		Source:                "sk-account.json",
		SourceHash:            "source-safe-hash",
		APIKeyHash:            "apikey-safe-hash",
	}

	prep := PrepareSensitiveFieldsForPersistence(ev)
	if prep.Provider != ev.Provider {
		t.Fatalf("Provider corrupted: %q != %q", prep.Provider, ev.Provider)
	}
	if prep.AuthFileSnapshot != ev.AuthFileSnapshot {
		t.Fatalf("AuthFileSnapshot corrupted: %q != %q", prep.AuthFileSnapshot, ev.AuthFileSnapshot)
	}
	if prep.AuthAccountIDSnapshot != ev.AuthAccountIDSnapshot {
		t.Fatalf("AuthAccountIDSnapshot corrupted: %q != %q", prep.AuthAccountIDSnapshot, ev.AuthAccountIDSnapshot)
	}
	if prep.AuthProjectIDSnapshot != ev.AuthProjectIDSnapshot {
		t.Fatalf("AuthProjectIDSnapshot corrupted: %q != %q", prep.AuthProjectIDSnapshot, ev.AuthProjectIDSnapshot)
	}
	if prep.Source != "sk-account.json" {
		t.Fatalf("Source false positive redacted: %q", prep.Source)
	}
	if prep.SourceHash != "source-safe-hash" {
		t.Fatalf("SourceHash corrupted: %q", prep.SourceHash)
	}
	if prep.APIKeyHash != "apikey-safe-hash" {
		t.Fatalf("APIKeyHash corrupted: %q", prep.APIKeyHash)
	}
}

func TestPrepareSensitiveFieldsForPersistenceEndToEnd(t *testing.T) {
	rawSecretSource := "sk-proj-verySecretSourceKey99999999999"
	ev := Event{
		EventHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Source:    rawSecretSource,
		FailBody:  `{"cpaManagementKey":"secret-cpa-12345","error":"failed"}`,
		RawJSON:   `{"apiKey":"sk-plainSecretKey123456789","tokens":10}`,
		ResponseMetadata: &ResponseHeaderMetadata{
			Response: &HeaderResponseMetadata{
				ContentType: "application/json",
			},
		},
		ResponseMetadataJSON: `{"quota":{"plan_type":"pro","token":"sk-proj-quotaSecretToken12345"}}`,
	}

	prep := PrepareSensitiveFieldsForPersistence(ev)

	// Source pseudonymized
	if !strings.HasPrefix(prep.Source, "h:") {
		t.Fatalf("Source not pseudonymized: %q", prep.Source)
	}
	if strings.Contains(prep.Source, "sk-proj-verySecretSourceKey") {
		t.Fatalf("Source leaked plaintext secret: %q", prep.Source)
	}
	if prep.SourceHash == "" || prep.SourceHash != strings.TrimPrefix(prep.Source, "h:") {
		t.Fatalf("SourceHash not populated with pseudonym hash: %q", prep.SourceHash)
	}

	// FailBody sanitized
	if strings.Contains(prep.FailBody, "secret-cpa-12345") {
		t.Fatalf("FailBody leaked cpaManagementKey: %s", prep.FailBody)
	}

	// RawJSON sanitized
	if strings.Contains(prep.RawJSON, "sk-plainSecretKey123456789") {
		t.Fatalf("RawJSON leaked apiKey: %s", prep.RawJSON)
	}

	// ResponseMetadataJSON sanitized
	if strings.Contains(prep.ResponseMetadataJSON, "sk-proj-quotaSecretToken12345") {
		t.Fatalf("ResponseMetadataJSON leaked secret: %s", prep.ResponseMetadataJSON)
	}

	// ResponseMetadata preserved
	if prep.ResponseMetadata == nil || prep.ResponseMetadata.Response == nil || prep.ResponseMetadata.Response.ContentType != "application/json" {
		t.Fatalf("ResponseMetadata corrupted: %#v", prep.ResponseMetadata)
	}
}
