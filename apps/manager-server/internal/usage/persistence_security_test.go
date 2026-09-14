package usage

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestNormalizeOpaqueHashForPersistence(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "whitespace only",
			input:    "   \t\n",
			expected: "",
		},
		{
			name:     "canonical lowercase 64-hex",
			input:    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			expected: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		},
		{
			name:     "canonical uppercase 64-hex preserved exactly",
			input:    "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
			expected: "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
		},
		{
			name:     "ordinary-unprefixed-key hashed",
			input:    "ordinary-unprefixed-key",
			expected: sha256Hex("ordinary-unprefixed-key"),
		},
		{
			name:     "source-safe-hash hashed",
			input:    "source-safe-hash",
			expected: sha256Hex("source-safe-hash"),
		},
		{
			name:     "credential-looking raw value hashed",
			input:    "sk-proj-raw-secret-1234567890",
			expected: sha256Hex("sk-proj-raw-secret-1234567890"),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := NormalizeOpaqueHashForPersistence(tc.input)
			if got != tc.expected {
				t.Fatalf("NormalizeOpaqueHashForPersistence(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestSharedCredentialTaxonomy(t *testing.T) {
	secretKeys := []string{
		"api_key",
		"apiKey",
		"apikey",
		"x-api-key",
		"x_api_key",
		"xApiKey",
		"XAPIKey",
		"management_key",
		"managementKey",
		"cpa_management_key",
		"cpaManagementKey",
		"cpa-management-key",
		"access_token",
		"accessToken",
		"refresh_token",
		"refreshToken",
		"id_token",
		"idToken",
		"auth_token",
		"authToken",
		"session",
		"session_token",
		"sessionToken",
		"client_secret",
		"clientSecret",
		"private_key",
		"privateKey",
		"password",
		"passwd",
		"secret",
		"custom_secret",
		"mySecret",
		"token",
		"cookie",
		"set-cookie",
		"authorization",
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

func TestAuthorizationSchemesRedaction(t *testing.T) {
	schemes := []struct {
		name   string
		input  string
		secret string
	}{
		{
			name:   "Bearer token",
			input:  "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.secret",
			secret: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.secret",
		},
		{
			name:   "Basic auth",
			input:  "Authorization: Basic dXNlcjpwYXNz",
			secret: "dXNlcjpwYXNz",
		},
		{
			name:   "Digest auth",
			input:  `Authorization: Digest username="Mufasa", realm="myrealm", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093"`,
			secret: "Mufasa",
		},
		{
			name:   "AWS4 auth",
			input:  "Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
			secret: "AKIAIOSFODNN7EXAMPLE",
		},
		{
			name:   "Authorization with equals",
			input:  "request header Authorization=Basic dXNlcjpwYXNz logged",
			secret: "dXNlcjpwYXNz",
		},
	}

	for _, tc := range schemes {
		t.Run(tc.name, func(t *testing.T) {
			sanitized := SanitizeCredentialText(tc.input)
			if strings.Contains(sanitized, tc.secret) {
				t.Fatalf("SanitizeCredentialText leaked %s in: %s", tc.secret, sanitized)
			}
			if !strings.Contains(sanitized, "[redacted]") {
				t.Fatalf("expected [redacted] in: %s", sanitized)
			}
		})
	}
}

func TestPlainTextKeyWithSpaces(t *testing.T) {
	cases := []struct {
		input  string
		secret string
	}{
		{
			input:  "error: api key=my-secret-token-12345",
			secret: "my-secret-token-12345",
		},
		{
			input:  "header api key: my-secret-token-67890",
			secret: "my-secret-token-67890",
		},
		{
			input:  "cpa management key=cpa-admin-secret-99999",
			secret: "cpa-admin-secret-99999",
		},
	}

	for _, tc := range cases {
		cleaned := SanitizeCredentialText(tc.input)
		if strings.Contains(cleaned, tc.secret) {
			t.Fatalf("leaked secret from %q: %s", tc.input, cleaned)
		}
	}
}

func TestJSONObjectKeyAndPropertyNameRedaction(t *testing.T) {
	// 1. Property name containing full credential expression must be pseudonymized
	propNameSecret := "api_key=ordinary-unprefixed-key"
	expectedPropPseudonym := "[redacted-key:" + sha256Hex(propNameSecret) + "]"

	inputJSON := fmt.Sprintf(`{
		"%s": {
			"status": "active"
		},
		"api_key": "ordinary-unprefixed-key",
		"normal_field": "keep_me"
	}`, propNameSecret)

	sanitized := SanitizeJSONForPersistence(inputJSON)
	if strings.Contains(sanitized, "ordinary-unprefixed-key") {
		t.Fatalf("sanitized JSON leaked secret: %s", sanitized)
	}
	if strings.Contains(sanitized, propNameSecret) {
		t.Fatalf("property name with credential not redacted: %s", sanitized)
	}
	if !strings.Contains(sanitized, expectedPropPseudonym) {
		t.Fatalf("expected property pseudonym %q in: %s", expectedPropPseudonym, sanitized)
	}
	// Regular secret field name must stay "api_key" (not replaced with redacted-key)
	if !strings.Contains(sanitized, `"api_key":"[redacted]"`) {
		t.Fatalf("regular secret field name was altered or not redacted: %s", sanitized)
	}
	if !strings.Contains(sanitized, `"normal_field":"keep_me"`) {
		t.Fatalf("normal field corrupted: %s", sanitized)
	}
}

func TestUsagePayloadRootKeyAlias(t *testing.T) {
	// Root level "key" in usage payload must be treated as secret
	rootKeyJSON := `{"key":"ordinary-unprefixed-key","model":"gpt-test"}`
	sanitizedRoot := SanitizeJSONForPersistence(rootKeyJSON)
	if strings.Contains(sanitizedRoot, "ordinary-unprefixed-key") {
		t.Fatalf("root-level 'key' was not redacted: %s", sanitizedRoot)
	}
	if !strings.Contains(sanitizedRoot, `"[redacted]"`) {
		t.Fatalf("root-level 'key' value not set to [redacted]: %s", sanitizedRoot)
	}

	// Nested "key" in arbitrary business JSON should NOT be unconditionally wiped
	nestedKeyJSON := `{"config":{"key":"safe-config-identifier","timeout":30}}`
	sanitizedNested := SanitizeJSONForPersistence(nestedKeyJSON)
	if !strings.Contains(sanitizedNested, "safe-config-identifier") {
		t.Fatalf("nested 'key' false positive wiped: %s", sanitizedNested)
	}
}

func TestJSONEOFValidationAndTrailingText(t *testing.T) {
	// Valid JSON prefix followed by trailing diagnostic text must NOT drop the trailing text
	input := `{"error":"failed"} trailing diagnostic information sk-proj-123456789012345678901234`
	sanitizedBody := SanitizeDiagnosticBody(input)
	if !strings.Contains(sanitizedBody, "trailing diagnostic information") {
		t.Fatalf("SanitizeDiagnosticBody dropped trailing text: %s", sanitizedBody)
	}
	if strings.Contains(sanitizedBody, "sk-proj-123456789012345678901234") {
		t.Fatalf("SanitizeDiagnosticBody leaked secret in trailing text: %s", sanitizedBody)
	}

	sanitizedRaw := SanitizeJSONForPersistence(input)
	if !strings.Contains(sanitizedRaw, "trailing diagnostic information") {
		t.Fatalf("SanitizeJSONForPersistence dropped trailing text on fallback: %s", sanitizedRaw)
	}
	if strings.Contains(sanitizedRaw, "sk-proj-123456789012345678901234") {
		t.Fatalf("SanitizeJSONForPersistence leaked secret in fallback: %s", sanitizedRaw)
	}
}

func TestMalformedRawJSONBoundedAndFailBodyFull(t *testing.T) {
	// Build a large malformed string > 8000 bytes
	var sb strings.Builder
	sb.WriteString("{not-valid-json: ")
	for i := 0; i < 200; i++ {
		sb.WriteString(fmt.Sprintf("item_%04d_diagnostic_content_xyz_", i))
	}
	sb.WriteString(" token=sk-proj-tailSecretKey12345678901234567890 ")
	for i := 0; i < 50; i++ {
		sb.WriteString(fmt.Sprintf("trailing_%04d_text_", i))
	}
	malformed := sb.String()

	if len(malformed) <= 4096 {
		t.Fatalf("precondition failed: length %d <= 4096", len(malformed))
	}

	// RawJSON fallback MUST be bounded to <= 4096 bytes
	sanitizedRaw := SanitizeJSONForPersistence(malformed)
	if len(sanitizedRaw) > 4096 {
		t.Fatalf("malformed RawJSON fallback exceeded 4096 bytes: len = %d", len(sanitizedRaw))
	}
	if strings.Contains(sanitizedRaw, "sk-proj-tailSecretKey12345678901234567890") {
		t.Fatalf("malformed RawJSON leaked secret: %s", sanitizedRaw)
	}

	// FailBody MUST retain full length without 4096 truncation
	sanitizedFailBody := SanitizeDiagnosticBody(malformed)
	if len(sanitizedFailBody) < 4096 {
		t.Fatalf("FailBody was truncated unexpectedly: len = %d", len(sanitizedFailBody))
	}
	if strings.Contains(sanitizedFailBody, "sk-proj-tailSecretKey12345678901234567890") {
		t.Fatalf("FailBody leaked secret at tail: %s", sanitizedFailBody)
	}
	if !strings.Contains(sanitizedFailBody, "trailing_0049_text_") {
		t.Fatalf("FailBody lost tail diagnostics: %s", sanitizedFailBody)
	}
}

func TestRawJSONRequestMetadataCredentialSanitization(t *testing.T) {
	inputJSON := `{
		"user_agent": "Mozilla/5.0 Bearer very-secret-bearer-token-12345",
		"client_ip": "1.2.3.4 api_key=plain-unprefixed-secret",
		"x_forwarded_for": "5.6.7.8, Bearer sk-ant-secret12345678901234567890"
	}`

	sanitized := SanitizeJSONForPersistence(inputJSON)
	if strings.Contains(sanitized, "very-secret-bearer-token-12345") {
		t.Fatalf("user_agent bypassed credential redactor: %s", sanitized)
	}
	if strings.Contains(sanitized, "plain-unprefixed-secret") {
		t.Fatalf("client_ip bypassed credential redactor: %s", sanitized)
	}
	if strings.Contains(sanitized, "sk-ant-secret12345678901234567890") {
		t.Fatalf("x_forwarded_for bypassed credential redactor: %s", sanitized)
	}
}

func TestRequestMetadataTruncateNoDoubleMinus3(t *testing.T) {
	longUA := strings.Repeat("a", 1050)
	cleaned := sanitizeRequestMetadata(longUA, maxUserAgentBytes)
	if len(cleaned) > maxUserAgentBytes {
		t.Fatalf("sanitizeRequestMetadata exceeded maxUserAgentBytes %d: got %d", maxUserAgentBytes, len(cleaned))
	}
	if !strings.HasSuffix(cleaned, "...") {
		t.Fatalf("expected suffix '...', got: %q", cleaned[len(cleaned)-10:])
	}
	// Max length must be exactly maxUserAgentBytes (1024), not 1021
	if len(cleaned) != maxUserAgentBytes {
		t.Fatalf("sanitizeRequestMetadata double subtracted 3 bytes: len = %d, want %d", len(cleaned), maxUserAgentBytes)
	}
}

func TestJSONBigIntFidelity(t *testing.T) {
	const bigIntStr = "9223372036854775807"
	const bigTimestampStr = "1741857948123456789"

	inputJSON := fmt.Sprintf(`{
		"id": %s,
		"high_precision_ts": %s,
		"api_key": "sk-proj-secret12345678901234567890",
		"normal_float": 12.345
	}`, bigIntStr, bigTimestampStr)

	sanitized := SanitizeJSONForPersistence(inputJSON)
	if strings.Contains(sanitized, "sk-proj-secret12345678901234567890") {
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

func TestFalsePositiveProtection(t *testing.T) {
	safeNames := []string{
		"cpamp_account.json",
		"cpamp_account_backup.json",
		"ghp_account.json",
		"hf_account.json",
		"pk_account.json",
		"rk_account.json",
		"sess-account.json",
		"sk-account.json",
		"sk-proj-account.json",
		"sk-ant-account.json",
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
			cleaned := SanitizeCredentialText(name)
			if cleaned != name {
				t.Fatalf("SanitizeCredentialText altered safe identifier %q -> %q", name, cleaned)
			}
		})
	}

	// Test Event fields preservation: business identity fields must remain byte-for-byte unchanged
	ev := Event{
		EventHash:             "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Provider:              "sk-account.json",
		ExecutorType:          "codex",
		Model:                 "gpt-4o",
		AnalyticsModel:        "gpt-4o",
		RequestedModel:        "gpt-4o",
		ResolvedModel:         "gpt-4o",
		AuthType:              "oauth",
		AuthIndex:             "auth-0",
		AuthFileSnapshot:      "sk-account.json",
		AuthProviderSnapshot:  "codex",
		AuthAccountIDSnapshot: "acc-sk-123",
		AuthProjectIDSnapshot: "proj-ghp-456",
		AccountSnapshot:       "sk-account.json",
		AuthLabelSnapshot:     "my-sk-label",
		ReasoningEffort:       "medium",
		ServiceTier:           "priority",
		RequestServiceTier:    "priority",
		ResponseServiceTier:   "priority",
		Source:                "sk-account.json",
		SourceHash:            "source-safe-hash",
		APIKeyHash:            "apikey-safe-hash",
		Endpoint:              "POST /v1/chat/completions?api_key=plain-unprefixed-secret",
		Path:                  "/v1/chat/completions?api_key=plain-unprefixed-secret",
		HeaderTraceID:         "trace-api_key=secret-trace-key",
		HeaderErrorKind:       "auth_error",
		HeaderErrorCode:       "invalid_token",
		HeaderQuotaPlanType:   "team",
	}

	prep := PrepareSensitiveFieldsForPersistence(ev)

	// Business identity fields: byte-for-byte unchanged
	if prep.Provider != ev.Provider {
		t.Fatalf("Provider corrupted: %q != %q", prep.Provider, ev.Provider)
	}
	if prep.ExecutorType != ev.ExecutorType {
		t.Fatalf("ExecutorType corrupted: %q != %q", prep.ExecutorType, ev.ExecutorType)
	}
	if prep.Model != ev.Model {
		t.Fatalf("Model corrupted: %q != %q", prep.Model, ev.Model)
	}
	if prep.AnalyticsModel != ev.AnalyticsModel {
		t.Fatalf("AnalyticsModel corrupted: %q != %q", prep.AnalyticsModel, ev.AnalyticsModel)
	}
	if prep.RequestedModel != ev.RequestedModel {
		t.Fatalf("RequestedModel corrupted: %q != %q", prep.RequestedModel, ev.RequestedModel)
	}
	if prep.ResolvedModel != ev.ResolvedModel {
		t.Fatalf("ResolvedModel corrupted: %q != %q", prep.ResolvedModel, ev.ResolvedModel)
	}
	if prep.AuthType != ev.AuthType {
		t.Fatalf("AuthType corrupted: %q != %q", prep.AuthType, ev.AuthType)
	}
	if prep.AuthIndex != ev.AuthIndex {
		t.Fatalf("AuthIndex corrupted: %q != %q", prep.AuthIndex, ev.AuthIndex)
	}
	if prep.AuthFileSnapshot != ev.AuthFileSnapshot {
		t.Fatalf("AuthFileSnapshot corrupted: %q != %q", prep.AuthFileSnapshot, ev.AuthFileSnapshot)
	}
	if prep.AuthProviderSnapshot != ev.AuthProviderSnapshot {
		t.Fatalf("AuthProviderSnapshot corrupted: %q != %q", prep.AuthProviderSnapshot, ev.AuthProviderSnapshot)
	}
	if prep.AuthAccountIDSnapshot != ev.AuthAccountIDSnapshot {
		t.Fatalf("AuthAccountIDSnapshot corrupted: %q != %q", prep.AuthAccountIDSnapshot, ev.AuthAccountIDSnapshot)
	}
	if prep.AuthProjectIDSnapshot != ev.AuthProjectIDSnapshot {
		t.Fatalf("AuthProjectIDSnapshot corrupted: %q != %q", prep.AuthProjectIDSnapshot, ev.AuthProjectIDSnapshot)
	}
	if prep.AccountSnapshot != ev.AccountSnapshot {
		t.Fatalf("AccountSnapshot corrupted: %q != %q", prep.AccountSnapshot, ev.AccountSnapshot)
	}
	if prep.AuthLabelSnapshot != ev.AuthLabelSnapshot {
		t.Fatalf("AuthLabelSnapshot corrupted: %q != %q", prep.AuthLabelSnapshot, ev.AuthLabelSnapshot)
	}
	if prep.ReasoningEffort != ev.ReasoningEffort {
		t.Fatalf("ReasoningEffort corrupted: %q != %q", prep.ReasoningEffort, ev.ReasoningEffort)
	}
	if prep.ServiceTier != ev.ServiceTier {
		t.Fatalf("ServiceTier corrupted: %q != %q", prep.ServiceTier, ev.ServiceTier)
	}
	if prep.RequestServiceTier != ev.RequestServiceTier {
		t.Fatalf("RequestServiceTier corrupted: %q != %q", prep.RequestServiceTier, ev.RequestServiceTier)
	}
	if prep.ResponseServiceTier != ev.ResponseServiceTier {
		t.Fatalf("ResponseServiceTier corrupted: %q != %q", prep.ResponseServiceTier, ev.ResponseServiceTier)
	}

	// Safe filename source must stay unchanged
	if prep.Source != "sk-account.json" {
		t.Fatalf("Source false positive redacted: %q", prep.Source)
	}

	// Noncanonical hashes normalized with sha256
	if prep.SourceHash != sha256Hex("source-safe-hash") {
		t.Fatalf("SourceHash not normalized to sha256: got %q, want %q", prep.SourceHash, sha256Hex("source-safe-hash"))
	}
	if prep.APIKeyHash != sha256Hex("apikey-safe-hash") {
		t.Fatalf("APIKeyHash not normalized to sha256: got %q, want %q", prep.APIKeyHash, sha256Hex("apikey-safe-hash"))
	}

	// Scalar query/path/diagnostic fields sanitized
	if strings.Contains(prep.Endpoint, "plain-unprefixed-secret") {
		t.Fatalf("Endpoint leaked secret: %s", prep.Endpoint)
	}
	if strings.Contains(prep.Path, "plain-unprefixed-secret") {
		t.Fatalf("Path leaked secret: %s", prep.Path)
	}
	if strings.Contains(prep.HeaderTraceID, "secret-trace-key") {
		t.Fatalf("HeaderTraceID leaked secret: %s", prep.HeaderTraceID)
	}
}

func TestPrepareSensitiveFieldsForPersistenceEndToEnd(t *testing.T) {
	rawSecretSource := "sk-proj-verySecretSourceKey99999999999999999"
	sourceHex := sha256Hex(rawSecretSource)
	ev := Event{
		EventHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Source:    rawSecretSource,
		FailBody:  `{"cpaManagementKey":"secret-cpa-12345","error":"failed"}`,
		RawJSON:   `{"apiKey":"sk-proj-plainSecretKey12345678901234567890","tokens":10}`,
		ResponseMetadata: &ResponseHeaderMetadata{
			Response: &HeaderResponseMetadata{
				ContentType: "application/json",
			},
		},
		ResponseMetadataJSON: `{"quota":{"plan_type":"pro","token":"sk-proj-quotaSecretToken1234512345"}}`,
	}

	prep := PrepareSensitiveFieldsForPersistence(ev)

	// Source pseudonymized
	expectedPseudonym := "h:" + sourceHex
	if prep.Source != expectedPseudonym {
		t.Fatalf("Source not pseudonymized: got %q, want %q", prep.Source, expectedPseudonym)
	}
	if strings.Contains(prep.Source, "verySecretSourceKey") {
		t.Fatalf("Source leaked plaintext secret: %q", prep.Source)
	}
	if prep.SourceHash != sourceHex {
		t.Fatalf("SourceHash not populated with pseudonym hash: %q", prep.SourceHash)
	}

	// FailBody sanitized
	if strings.Contains(prep.FailBody, "secret-cpa-12345") {
		t.Fatalf("FailBody leaked cpaManagementKey: %s", prep.FailBody)
	}

	// RawJSON sanitized
	if strings.Contains(prep.RawJSON, "plainSecretKey12345678901234567890") {
		t.Fatalf("RawJSON leaked apiKey: %s", prep.RawJSON)
	}

	// ResponseMetadataJSON sanitized
	if strings.Contains(prep.ResponseMetadataJSON, "quotaSecretToken1234512345") {
		t.Fatalf("ResponseMetadataJSON leaked secret: %s", prep.ResponseMetadataJSON)
	}

	// ResponseMetadata preserved
	if prep.ResponseMetadata == nil || prep.ResponseMetadata.Response == nil || prep.ResponseMetadata.Response.ContentType != "application/json" {
		t.Fatalf("ResponseMetadata corrupted: %#v", prep.ResponseMetadata)
	}
}

func TestFalsePositiveProtectionLongFilenamesMatrix(t *testing.T) {
	matrix := []string{
		"sk-account-production.json",
		"sk-proj-account-backup1.json",
		"sk-proj-production-account.json",
		"sk-ant-account-production.json",
		"sk-ant-backup-account.json",
		"ghp_account_production.json",
		"hf_account_production.json",
		"sess-account-production.json",
		"cpamp_account_production_backup.json",
	}

	for _, filename := range matrix {
		t.Run(filename, func(t *testing.T) {
			if ContainsCredential(filename) {
				t.Fatalf("ContainsCredential false positive on safe filename: %q", filename)
			}
			cleaned := SanitizeCredentialText(filename)
			if cleaned != filename {
				t.Fatalf("SanitizeCredentialText altered safe filename: got %q, want %q", cleaned, filename)
			}
			cleanedDiag := SanitizeDiagnosticBody(filename)
			if cleanedDiag != filename {
				t.Fatalf("SanitizeDiagnosticBody altered safe filename: got %q, want %q", cleanedDiag, filename)
			}
		})
	}
}

func TestSafeAssignmentsPreserved(t *testing.T) {
	safeAssignments := []string{
		"max_token=1000",
		"token_count=20",
		"cache_key=model-cache",
		"routing_key=node-a",
		"session_id=session-a",
		"model_key=gpt-5",
	}

	for _, safe := range safeAssignments {
		t.Run(safe, func(t *testing.T) {
			cleaned := SanitizeCredentialText(safe)
			if cleaned != safe {
				t.Fatalf("SanitizeCredentialText corrupted safe assignment: got %q, want %q", cleaned, safe)
			}
			cleanedDiag := SanitizeDiagnosticBody(safe)
			if cleanedDiag != safe {
				t.Fatalf("SanitizeDiagnosticBody corrupted safe assignment: got %q, want %q", cleanedDiag, safe)
			}
		})
	}
}

func TestNamespacedStructuredAndTextSecretKeys(t *testing.T) {
	namespacedKeys := []string{
		"openai_api_key",
		"anthropic_api_key",
		"service_management_key",
		"oauth_access_token",
		"openai_refresh_token",
		"provider_id_token",
		"anthropic_auth_token",
		"provider_session_token",
		"service_client_secret",
		"ssh_private_key",
		"db_password",
		"database_passwd",
		"custom_secret",
		"secret_key",
		"secret_token",
		"secret_value",
	}

	for _, key := range namespacedKeys {
		t.Run(key, func(t *testing.T) {
			if !isSecretFieldKey(key) {
				t.Fatalf("key %q must be recognized as secret", key)
			}

			// Structured JSON sanitization
			jsonPayload := fmt.Sprintf(`{"%s":"ordinary-secret-12345","diagnostics":"normal"}`, key)
			sanitizedJSON := SanitizeJSONForPersistence(jsonPayload)
			if strings.Contains(sanitizedJSON, "ordinary-secret-12345") {
				t.Fatalf("SanitizeJSONForPersistence leaked secret for key %q: %s", key, sanitizedJSON)
			}
			if !strings.Contains(sanitizedJSON, `"[redacted]"`) {
				t.Fatalf("SanitizeJSONForPersistence missing [redacted] for key %q: %s", key, sanitizedJSON)
			}
			if !strings.Contains(sanitizedJSON, "normal") {
				t.Fatalf("SanitizeJSONForPersistence dropped diagnostic field: %s", sanitizedJSON)
			}

			// Plain-text assignment sanitization
			textPayload := fmt.Sprintf("failed with %s=ordinary-secret-12345 trailing", key)
			sanitizedText := SanitizeCredentialText(textPayload)
			if strings.Contains(sanitizedText, "ordinary-secret-12345") {
				t.Fatalf("SanitizeCredentialText leaked secret for key %q: %s", key, sanitizedText)
			}
			if !strings.Contains(sanitizedText, fmt.Sprintf("%s=[redacted]", key)) {
				t.Fatalf("SanitizeCredentialText unexpected redaction for key %q: %s", key, sanitizedText)
			}
			if !strings.Contains(sanitizedText, "trailing") {
				t.Fatalf("SanitizeCredentialText lost trailing diagnostic: %s", sanitizedText)
			}
		})
	}

	// Quoted plain-text assignments
	quotedCases := []struct {
		name     string
		input    string
		secret   string
		expected string
	}{
		{
			name:     "double quoted key and double quoted secret",
			input:    `error: "api_key"="ordinary-secret" details`,
			secret:   "ordinary-secret",
			expected: `error: "api_key"="[redacted]" details`,
		},
		{
			name:     "single quoted secret",
			input:    `connecting with password='hello world secret' status=error`,
			secret:   "hello world secret",
			expected: `connecting with password='[redacted]' status=error`,
		},
		{
			name:     "double quoted secret with commas",
			input:    `env client_secret="abc,def,ghi" next=done`,
			secret:   "abc,def,ghi",
			expected: `env client_secret="[redacted]" next=done`,
		},
	}

	for _, tc := range quotedCases {
		t.Run(tc.name, func(t *testing.T) {
			sanitized := SanitizeCredentialText(tc.input)
			if strings.Contains(sanitized, tc.secret) {
				t.Fatalf("SanitizeCredentialText leaked secret %q in: %s", tc.secret, sanitized)
			}
			if sanitized != tc.expected {
				t.Fatalf("SanitizeCredentialText(%q) = %q, want %q", tc.input, sanitized, tc.expected)
			}
		})
	}
}

func TestPEMPrivateKeyBlockSanitizer(t *testing.T) {
	blocks := []struct {
		name       string
		pem        string
		diagnostic string
	}{
		{
			name: "BEGIN PRIVATE KEY (PKCS#8)",
			pem: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC6g5c7Y9z8j3L8
0abcdef123456789+deadbeef/fakepemdataforunittestingonly==
-----END PRIVATE KEY-----`,
			diagnostic: "failed to load pkcs8 key: invalid format",
		},
		{
			name: "BEGIN RSA PRIVATE KEY (PKCS#1)",
			pem: `-----BEGIN RSA PRIVATE KEY-----
Proc-Type: 4,ENCRYPTED
DEK-Info: DES-EDE3-CBC,1234567890ABCDEF

MIIEowIBAAKCAQEA123456789fakeRSAkeymaterialforunittesting==
-----END RSA PRIVATE KEY-----`,
			diagnostic: "handshake failed with remote peer status=502",
		},
		{
			name: "BEGIN EC PRIVATE KEY (SEC1)",
			pem: `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIPfakesec1eckeymaterialforunittestingonly12345
-----END EC PRIVATE KEY-----`,
			diagnostic: "ec curve mismatch error code 400",
		},
		{
			name: "BEGIN OPENSSH PRIVATE KEY",
			pem: `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
c2gtZWQyNTUxOQAAACDummyKeyMaterialForTestingOnly==
-----END OPENSSH PRIVATE KEY-----`,
			diagnostic: "ssh host key verification failed",
		},
	}

	for _, tc := range blocks {
		t.Run(tc.name, func(t *testing.T) {
			fullText := fmt.Sprintf("prefix error info\n%s\n%s", tc.pem, tc.diagnostic)

			// 1. SanitizeDiagnosticBody
			cleanedDiag := SanitizeDiagnosticBody(fullText)
			if strings.Contains(cleanedDiag, tc.pem) {
				t.Fatalf("SanitizeDiagnosticBody leaked PEM block: %s", cleanedDiag)
			}
			if !strings.Contains(cleanedDiag, "[redacted]") {
				t.Fatalf("SanitizeDiagnosticBody did not contain [redacted]: %s", cleanedDiag)
			}
			if !strings.Contains(cleanedDiag, tc.diagnostic) {
				t.Fatalf("SanitizeDiagnosticBody dropped diagnostic info: %s", cleanedDiag)
			}
			if !strings.Contains(cleanedDiag, "prefix error info") {
				t.Fatalf("SanitizeDiagnosticBody dropped prefix info: %s", cleanedDiag)
			}

			// 2. SanitizeCredentialText
			cleanedText := SanitizeCredentialText(fullText)
			if strings.Contains(cleanedText, tc.pem) {
				t.Fatalf("SanitizeCredentialText leaked PEM block: %s", cleanedText)
			}
			if !strings.Contains(cleanedText, tc.diagnostic) {
				t.Fatalf("SanitizeCredentialText dropped diagnostic info: %s", cleanedText)
			}

			// 3. In JSON structure
			jsonBody := fmt.Sprintf(`{"error":%q,"status":500}`, fullText)
			cleanedJSON := SanitizeJSONForPersistence(jsonBody)
			if strings.Contains(cleanedJSON, "MIIE") || strings.Contains(cleanedJSON, "b3BlbnNza") || strings.Contains(cleanedJSON, "MHcCAQEEI") {
				t.Fatalf("SanitizeJSONForPersistence leaked PEM data: %s", cleanedJSON)
			}
			if !strings.Contains(cleanedJSON, tc.diagnostic) {
				t.Fatalf("SanitizeJSONForPersistence dropped diagnostic info: %s", cleanedJSON)
			}
		})
	}
}

func TestRawJSONUsageKeyAliasAndNested(t *testing.T) {
	// 1. Valid root "key" in JSON
	validRoot := `{"key":"ordinary-unprefixed-secret","model":"gpt-4"}`
	sanitizedRoot := SanitizeJSONForPersistence(validRoot)
	if strings.Contains(sanitizedRoot, "ordinary-unprefixed-secret") {
		t.Fatalf("SanitizeJSONForPersistence leaked root key: %s", sanitizedRoot)
	}
	if !strings.Contains(sanitizedRoot, `"key":"[redacted]"`) {
		t.Fatalf("SanitizeJSONForPersistence did not redact root key: %s", sanitizedRoot)
	}

	// 2. Malformed JSON with root-level "key"
	malformed := `{"key":"ordinary-unprefixed-secret","model":broken json syntax...`
	sanitizedMalformed := SanitizeJSONForPersistence(malformed)
	if strings.Contains(sanitizedMalformed, "ordinary-unprefixed-secret") {
		t.Fatalf("SanitizeJSONForPersistence fallback leaked malformed root key: %s", sanitizedMalformed)
	}
	if !strings.Contains(sanitizedMalformed, `"key":"[redacted]"`) {
		t.Fatalf("SanitizeJSONForPersistence fallback did not redact root key: %s", sanitizedMalformed)
	}

	// 3. Valid nested "key" in JSON
	nested := `{"provider":{"key":"safe-config-key-ident","version":"v1"}}`
	sanitizedNested := SanitizeJSONForPersistence(nested)
	if !strings.Contains(sanitizedNested, "safe-config-key-ident") {
		t.Fatalf("SanitizeJSONForPersistence wiped nested key: %s", sanitizedNested)
	}
}

func TestAuthorizationErrorPreservation(t *testing.T) {
	// Diagnostic error string containing authorization_error / cpaManagementKey
	input := "HTTP 401 cpaManagementKey=my-super-cpa-secret auth failed: invalid signature"
	sanitized := SanitizeDiagnosticBody(input)
	if strings.Contains(sanitized, "my-super-cpa-secret") {
		t.Fatalf("SanitizeDiagnosticBody leaked secret: %s", sanitized)
	}
	if !strings.Contains(sanitized, "HTTP 401") {
		t.Fatalf("SanitizeDiagnosticBody dropped HTTP 401 status: %s", sanitized)
	}
	if !strings.Contains(sanitized, "auth failed: invalid signature") {
		t.Fatalf("SanitizeDiagnosticBody dropped diagnostic error details: %s", sanitized)
	}
	if !strings.Contains(sanitized, "cpaManagementKey=[redacted]") {
		t.Fatalf("SanitizeDiagnosticBody did not redact cpaManagementKey properly: %s", sanitized)
	}

	// In ResponseHeaderMetadata JSON
	metaJSON := `{"authorization_error":"cpaManagementKey=my-super-cpa-secret token rejected","status_code":401}`
	sanitizedMeta := SanitizeJSONForPersistence(metaJSON)
	if strings.Contains(sanitizedMeta, "my-super-cpa-secret") {
		t.Fatalf("SanitizeJSONForPersistence leaked secret in authorization_error: %s", sanitizedMeta)
	}
	if !strings.Contains(sanitizedMeta, "token rejected") {
		t.Fatalf("SanitizeJSONForPersistence dropped diagnostic message inside authorization_error: %s", sanitizedMeta)
	}
	if !strings.Contains(sanitizedMeta, "authorization_error") {
		t.Fatalf("authorization_error key was erroneously stripped: %s", sanitizedMeta)
	}
}

func TestUppercaseAPIKeyHashCorrelation(t *testing.T) {
	plainKey := "ordinary-unprefixed-source-key"
	lowerHash := sha256Hex(plainKey)
	upperHash := strings.ToUpper(lowerHash)

	ev := Event{
		EventHash:  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Source:     plainKey,
		APIKeyHash: upperHash, // Parser produced uppercase hash
	}

	prep := PrepareSensitiveFieldsForPersistence(ev)

	expectedPseudonym := "h:" + lowerHash
	if prep.Source != expectedPseudonym {
		t.Fatalf("Source not pseudonymized: got %q, want %q", prep.Source, expectedPseudonym)
	}
	// APIKeyHash must preserve its original uppercase value
	if prep.APIKeyHash != upperHash {
		t.Fatalf("APIKeyHash uppercase not preserved: got %q, want %q", prep.APIKeyHash, upperHash)
	}
	// SourceHash must be canonical lowercase SHA-256
	if prep.SourceHash != lowerHash {
		t.Fatalf("SourceHash not lowercase sha256: got %q, want %q", prep.SourceHash, lowerHash)
	}
}

func TestSafeSourceFilenameRegression(t *testing.T) {
	safeSource := "sk-account-production.json"
	ev := Event{
		EventHash:  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Source:     safeSource,
		APIKeyHash: "", // No matching hash
	}

	prep := PrepareSensitiveFieldsForPersistence(ev)
	if prep.Source != safeSource {
		t.Fatalf("safe filename source was erroneously modified: got %q, want %q", prep.Source, safeSource)
	}
}
