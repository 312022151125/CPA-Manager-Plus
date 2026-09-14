package usage

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strings"
	"unicode"
)

// ErrInvalidEventHash is returned when a new usage event does not contain a canonical
// 64-character SHA-256 hexadecimal hash.
var ErrInvalidEventHash = errors.New("invalid usage event hash")

const (
	secretKeyPattern = `(?:cpa[-_ ]?management[-_ ]?key|management[-_ ]?key|x[-_ ]?api[-_ ]?key|api[-_ ]?key|apikey|xapikey|cpamanagementkey|managementkey|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|auth[-_ ]?token|authtoken|session[-_ ]?token|sessiontoken|session|client[-_ ]?secret|clientsecret|private[-_ ]?key|privatekey|password|passwd|[a-z0-9_]+_secret|[a-z0-9]+Secret|secret|token)`
)

var (
	// authorizationHeaderRegex captures authorization headers across all schemes
	// (Bearer, Basic, Digest, AWS4-HMAC-SHA256, etc.) and replaces the credential value with [redacted].
	authorizationHeaderRegex = regexp.MustCompile(`(?i)\b(authorization\s*[:=]\s*["']?)(.+?)(["']?\s*(?:\r?\n|$))`)
	bearerTokenRegex         = regexp.MustCompile(`(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}`)
	cookieJSONRegex          = regexp.MustCompile(`(?i)("?(?:cookie|set[-_]?cookie)"?\s*:\s*")[^"]*(")`)
	cookieHeaderRegex        = regexp.MustCompile(`(?i)\b(cookie|set[-_]?cookie)\s*[:=]\s*[^,\r\n"}]+`)

	quotedSecretDoubleRegex = regexp.MustCompile(`(?i)("` + secretKeyPattern + `"\s*:\s*")(?:[^"\\]|\\.)*(")`)
	quotedSecretSingleRegex = regexp.MustCompile(`(?i)('` + secretKeyPattern + `'\s*:\s*')(?:[^'\\]|\\.)*(')`)
	unquotedSecretRegex     = regexp.MustCompile(`(?i)\b(` + secretKeyPattern + `)\b(\s*[:=]\s*["']?)([^"',\s&}\]\r\n]+)`)

	// strongTokenRegex matches authentic tokens without false-positiving on normal file identifiers
	// like sk-account.json, cpamp_account_backup.json, or AIza_account.json.
	strongTokenRegex = regexp.MustCompile(`(?i)\b(sk-proj-[A-Za-z0-9_-]{15,}|sk-ant-[A-Za-z0-9_-]{15,}|sk-[A-Za-z0-9_-]{15,}|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{15,}|AIza[0-9A-Za-z_-]{20,}|hf_[A-Za-z0-9]{15,}|sess-[A-Za-z0-9_-]{15,}|pk_(?:live|test)_[0-9a-zA-Z]{15,}|pk_[0-9a-zA-Z_-]{15,}|rk_(?:live|test)_[0-9a-zA-Z]{15,}|rk_[0-9a-zA-Z_-]{15,}|cpamp_[A-Za-z0-9_-]{32,})\b`)
)

var secretExactKeys = map[string]bool{
	"api_key":             true,
	"apikey":              true,
	"x_api_key":           true,
	"xapi_key":            true,
	"xapikey":             true,
	"management_key":      true,
	"managementkey":       true,
	"cpa_management_key":  true,
	"cpamanagementkey":    true,
	"authorization":       true,
	"authorization_error": true,
	"cookie":              true,
	"set_cookie":          true,
	"access_token":        true,
	"refresh_token":       true,
	"id_token":            true,
	"token":               true,
	"client_secret":       true,
	"clientsecret":        true,
	"private_key":         true,
	"privatekey":          true,
	"secret":              true,
	"password":            true,
	"passwd":              true,
	"auth_token":          true,
	"authtoken":           true,
	"session":             true,
	"session_token":       true,
	"sessiontoken":        true,
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// IsCanonicalSHA256Hex checks whether a string is a canonical 64-character SHA-256 hex string.
func IsCanonicalSHA256Hex(value string) bool {
	if len(value) != 64 {
		return false
	}
	for i := 0; i < len(value); i++ {
		b := value[i]
		if (b >= '0' && b <= '9') || (b >= 'a' && b <= 'f') || (b >= 'A' && b <= 'F') {
			continue
		}
		return false
	}
	return true
}

// NormalizeOpaqueHashForPersistence ensures that opaque hash fields (such as SourceHash
// and APIKeyHash) do not leak raw credentials.
// - empty => ""
// - valid 64-char SHA-256 hex => preserve exactly (lowercase or uppercase)
// - any other non-empty value => SHA-256(trimmed), lowercase hex
func NormalizeOpaqueHashForPersistence(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if IsCanonicalSHA256Hex(trimmed) {
		return trimmed
	}
	return sha256Hex(trimmed)
}

// isSecretFieldKey checks whether a field/property name represents a secret.
func isSecretFieldKey(key string) bool {
	normalized := normalizeSecretKey(key)
	if secretExactKeys[normalized] {
		return true
	}
	if strings.HasSuffix(normalized, "_secret") || strings.HasPrefix(normalized, "secret_") {
		return true
	}
	return false
}

// normalizeSecretKey normalizes a key (handling camelCase, hyphens, and spaces) to snake_case.
func normalizeSecretKey(key string) string {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return ""
	}
	var builder strings.Builder
	runes := []rune(trimmed)
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		if unicode.IsUpper(r) {
			if i > 0 {
				prev := runes[i-1]
				if !unicode.IsUpper(prev) && prev != '_' && prev != '-' && prev != ' ' {
					builder.WriteRune('_')
				} else if i+1 < len(runes) && unicode.IsLower(runes[i+1]) && prev != '_' && prev != '-' && prev != ' ' {
					builder.WriteRune('_')
				}
			}
			builder.WriteRune(unicode.ToLower(r))
		} else if r == '-' || r == ' ' {
			builder.WriteRune('_')
		} else {
			builder.WriteRune(r)
		}
	}
	return strings.Trim(builder.String(), "_")
}

// ContainsCredentialToken reports whether value contains an explicit strong token credential.
func ContainsCredentialToken(value string) bool {
	return strongTokenRegex.MatchString(value) || bearerTokenRegex.MatchString(value)
}

// ContainsCredential reports whether value contains credentials (tokens, headers, or secret key-values).
func ContainsCredential(value string) bool {
	return ContainsCredentialToken(value) ||
		authorizationHeaderRegex.MatchString(value) ||
		cookieJSONRegex.MatchString(value) ||
		cookieHeaderRegex.MatchString(value) ||
		quotedSecretDoubleRegex.MatchString(value) ||
		quotedSecretSingleRegex.MatchString(value) ||
		unquotedSecretRegex.MatchString(value)
}

// SanitizeCredentialText scrubs credentials from text or malformed JSON payloads.
func SanitizeCredentialText(value string) string {
	if value == "" {
		return ""
	}
	res := authorizationHeaderRegex.ReplaceAllString(value, `${1}[redacted]${3}`)
	res = bearerTokenRegex.ReplaceAllString(res, `Bearer [redacted]`)
	res = cookieJSONRegex.ReplaceAllString(res, `${1}[redacted]${2}`)
	res = cookieHeaderRegex.ReplaceAllString(res, `${1}: [redacted]`)
	res = quotedSecretDoubleRegex.ReplaceAllString(res, `${1}[redacted]${2}`)
	res = quotedSecretSingleRegex.ReplaceAllString(res, `${1}[redacted]${2}`)
	res = unquotedSecretRegex.ReplaceAllString(res, `${1}${2}[redacted]`)
	res = strongTokenRegex.ReplaceAllString(res, `[redacted]`)
	return res
}

// SanitizeJSONForPersistence parses raw JSON (using json.Number for precision) and recursively
// redacts secrets from keys, values, and diagnostic strings.
// It verifies that raw contains exactly one valid JSON value (EOF check).
// If raw is not a complete, valid JSON value, it falls back to FailSummaryFromBody(trimmed) (<= 4096 bytes).
func SanitizeJSONForPersistence(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	decoder := json.NewDecoder(strings.NewReader(trimmed))
	decoder.UseNumber()
	var payload any
	if err := decoder.Decode(&payload); err == nil {
		var trailing any
		if err := decoder.Decode(&trailing); errors.Is(err, io.EOF) {
			sanitized := sanitizeJSONValueWithContext("", payload, 0)
			out, err := json.Marshal(sanitized)
			if err == nil {
				return string(out)
			}
		}
	}
	return FailSummaryFromBody(trimmed)
}

func sanitizeJSONValue(value any) any {
	return sanitizeJSONValueWithContext("", value, 0)
}

func sanitizeJSONValueWithContext(parentKey string, value any, depth int) any {
	switch v := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(v))
		for key, child := range v {
			sanitizedKey := key
			if ContainsCredential(key) {
				sanitizedKey = "[redacted-key:" + sha256Hex(key) + "]"
			}

			normalizedKey := normalizeSecretKey(key)

			// Root-level "key" in usage payload is treated as API key alias
			if depth == 0 && normalizedKey == "key" {
				result[sanitizedKey] = "[redacted]"
				continue
			}

			if isSecretFieldKey(key) {
				result[sanitizedKey] = "[redacted]"
				continue
			}

			if maxBytes, ok := requestMetadataMaxBytes(normalizedKey); ok {
				cleaned := SanitizeCredentialText(stringValue(child))
				result[sanitizedKey] = sanitizeRequestMetadata(cleaned, maxBytes)
				continue
			}

			if normalizedKey == "fail_body" || (parentKey == "fail" && normalizedKey == "body") {
				result[sanitizedKey] = FailSummaryFromBody(stringValue(child))
				continue
			}

			result[sanitizedKey] = sanitizeJSONValueWithContext(normalizedKey, child, depth+1)
		}
		return result
	case []any:
		result := make([]any, len(v))
		for i, child := range v {
			result[i] = sanitizeJSONValueWithContext(parentKey, child, depth+1)
		}
		return result
	case string:
		return SanitizeCredentialText(v)
	case json.Number, bool, nil:
		return v
	default:
		return v
	}
}

// SanitizeDiagnosticBody sanitizes failure bodies without truncating to 4096 bytes.
// It verifies that body is exactly one complete JSON value.
// If malformed or mixed text, it falls back to SanitizeCredentialText(full input) without truncation.
func SanitizeDiagnosticBody(body string) string {
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return ""
	}
	decoder := json.NewDecoder(strings.NewReader(trimmed))
	decoder.UseNumber()
	var payload any
	if err := decoder.Decode(&payload); err == nil {
		var trailing any
		if err := decoder.Decode(&trailing); errors.Is(err, io.EOF) {
			sanitized := sanitizeDiagnosticJSONValue(payload)
			if out, err := json.Marshal(sanitized); err == nil {
				return string(out)
			}
		}
	}
	return SanitizeCredentialText(trimmed)
}

func sanitizeDiagnosticJSONValue(value any) any {
	switch v := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(v))
		for key, child := range v {
			sanitizedKey := key
			if ContainsCredential(key) {
				sanitizedKey = "[redacted-key:" + sha256Hex(key) + "]"
			}

			if isSecretFieldKey(key) {
				result[sanitizedKey] = "[redacted]"
				continue
			}

			result[sanitizedKey] = sanitizeDiagnosticJSONValue(child)
		}
		return result
	case []any:
		result := make([]any, len(v))
		for i, child := range v {
			result[i] = sanitizeDiagnosticJSONValue(child)
		}
		return result
	case string:
		return SanitizeCredentialText(v)
	case json.Number, bool, nil:
		return v
	default:
		return v
	}
}

// PrepareSensitiveFieldsForPersistence enforces the persistence security boundary on an Event
// before saving it to SQLite. Business and account semantics are strictly preserved.
func PrepareSensitiveFieldsForPersistence(event Event) Event {
	// 1. Normalize opaque hashes first
	event.SourceHash = NormalizeOpaqueHashForPersistence(event.SourceHash)
	event.APIKeyHash = NormalizeOpaqueHashForPersistence(event.APIKeyHash)

	// 2. Correlation pseudonymization for Source
	trimmedSource := strings.TrimSpace(event.Source)
	if trimmedSource != "" {
		sourceSHA := sha256Hex(trimmedSource)
		if ContainsCredential(trimmedSource) || (event.APIKeyHash != "" && sourceSHA == event.APIKeyHash) {
			event.Source = "h:" + sourceSHA
			event.SourceHash = sourceSHA
		}
	}

	// 3. Diagnostics payloads
	if event.FailBody != "" {
		event.FailBody = SanitizeDiagnosticBody(event.FailBody)
	}

	if event.FailSummary != "" {
		event.FailSummary = FailSummaryFromBody(event.FailSummary)
	} else if event.FailBody != "" {
		event.FailSummary = FailSummaryFromBody(event.FailBody)
	}

	if event.RawJSON != "" {
		event.RawJSON = SanitizeJSONForPersistence(event.RawJSON)
	}

	if event.ResponseMetadataJSON != "" {
		event.ResponseMetadataJSON = SanitizeJSONForPersistence(event.ResponseMetadataJSON)
	}

	if event.ResponseMetadata != nil {
		sanitizeResponseHeaderMetadata(event.ResponseMetadata)
	}

	// 4. Standalone persistence scalar string fields that may carry query/path/diagnostic secrets
	if event.Endpoint != "" {
		event.Endpoint = SanitizeCredentialText(event.Endpoint)
	}
	if event.Path != "" {
		event.Path = SanitizeCredentialText(event.Path)
	}
	if event.ClientIP != "" {
		event.ClientIP = SanitizeCredentialText(event.ClientIP)
	}
	if event.XForwardedFor != "" {
		event.XForwardedFor = SanitizeCredentialText(event.XForwardedFor)
	}
	if event.UserAgent != "" {
		event.UserAgent = SanitizeCredentialText(event.UserAgent)
	}
	if event.HeaderQuotaPlanType != "" {
		event.HeaderQuotaPlanType = SanitizeCredentialText(event.HeaderQuotaPlanType)
	}
	if event.HeaderErrorKind != "" {
		event.HeaderErrorKind = SanitizeCredentialText(event.HeaderErrorKind)
	}
	if event.HeaderErrorCode != "" {
		event.HeaderErrorCode = SanitizeCredentialText(event.HeaderErrorCode)
	}
	if event.HeaderTraceID != "" {
		event.HeaderTraceID = SanitizeCredentialText(event.HeaderTraceID)
	}

	return event
}
