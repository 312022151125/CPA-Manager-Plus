package usage

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"regexp"
	"strings"
	"unicode"
)

var (
	authorizationHeaderRegex = regexp.MustCompile(`(?i)\b(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,"'{}]+`)
	bearerTokenRegex         = regexp.MustCompile(`(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}`)
	cookieJSONRegex          = regexp.MustCompile(`(?i)("?(?:cookie|set[-_]?cookie)"?\s*:\s*")[^"]*(")`)
	cookieHeaderRegex        = regexp.MustCompile(`(?i)\b(cookie|set[-_]?cookie)\s*[:=]\s*[^,\r\n"}]+`)

	quotedSecretDoubleRegex = regexp.MustCompile(`(?i)("(?:\w*[-_])*(?:cpa[-_]?management[-_]?key|cpaManagementKey|cpamanagementkey|management[-_]?key|managementKey|managementkey|x[-_]?api[-_]?key|xApiKey|xapikey|api[-_]?key|apiKey|apikey|access[-_]?token|accessToken|refresh[-_]?token|refreshToken|id[-_]?token|idToken|client[-_]?secret|clientSecret|clientsecret|private[-_]?key|privateKey|privatekey|[a-z0-9_]+_secret|[a-z0-9]+Secret|secret|token)"\s*:\s*")(?:[^"\\]|\\.)*(")`)
	quotedSecretSingleRegex = regexp.MustCompile(`(?i)('(?:\w*[-_])*(?:cpa[-_]?management[-_]?key|cpaManagementKey|cpamanagementkey|management[-_]?key|managementKey|managementkey|x[-_]?api[-_]?key|xApiKey|xapikey|api[-_]?key|apiKey|apikey|access[-_]?token|accessToken|refresh[-_]?token|refreshToken|id[-_]?token|idToken|client[-_]?secret|clientSecret|clientsecret|private[-_]?key|privateKey|privatekey|[a-z0-9_]+_secret|[a-z0-9]+Secret|secret|token)'\s*:\s*')(?:[^'\\]|\\.)*(')`)
	unquotedSecretRegex     = regexp.MustCompile(`(?i)\b(cpa[-_]?management[-_]?key|cpaManagementKey|cpamanagementkey|management[-_]?key|managementKey|managementkey|x[-_]?api[-_]?key|xApiKey|xapikey|api[-_]?key|apiKey|apikey|access[-_]?token|accessToken|refresh[-_]?token|refreshToken|id[-_]?token|idToken|client[-_]?secret|clientSecret|clientsecret|private[-_]?key|privateKey|privatekey|[a-z0-9_]+_secret|[a-z0-9]+Secret|secret|token)\b(\s*[:=]\s*["']?)([^"',\s&}\]\r\n]+)`)

	strongTokenRegex = regexp.MustCompile(`(?i)\b(sk-proj-[A-Za-z0-9_-]{10,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{10,}|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{16,}|hf_[A-Za-z0-9]{10,}|sess-[A-Za-z0-9_-]{10,}|pk_(?:live|test)_[0-9a-zA-Z]{10,}|pk_[0-9a-zA-Z_-]{10,}|rk_(?:live|test)_[0-9a-zA-Z]{10,}|rk_[0-9a-zA-Z_-]{10,}|cpamp_[A-Za-z0-9_-]{10,})`)
)

var secretExactKeys = map[string]bool{
	"api_key":            true,
	"apikey":             true,
	"x_api_key":          true,
	"xapikey":            true,
	"management_key":     true,
	"managementkey":      true,
	"cpa_management_key": true,
	"cpamanagementkey":   true,
	"authorization":      true,
	"cookie":             true,
	"set_cookie":         true,
	"access_token":       true,
	"refresh_token":      true,
	"id_token":           true,
	"token":              true,
	"client_secret":      true,
	"clientsecret":       true,
	"private_key":        true,
	"privatekey":         true,
	"secret":             true,
	"password":           true,
	"passwd":             true,
	"auth_token":         true,
	"authtoken":          true,
	"session":            true,
	"session_token":      true,
	"sessiontoken":       true,
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
// and APIKeyHash) do not leak raw credentials. If a value contains credential patterns,
// it is deterministically hashed with SHA-256 hex; canonical hex hashes and harmless non-credential
// identifiers are preserved.
func NormalizeOpaqueHashForPersistence(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if IsCanonicalSHA256Hex(trimmed) {
		return trimmed
	}
	if ContainsCredential(trimmed) {
		sum := sha256.Sum256([]byte(trimmed))
		return hex.EncodeToString(sum[:])
	}
	return trimmed
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
	res := authorizationHeaderRegex.ReplaceAllString(value, `${1}[redacted]`)
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
// redacts secrets from keys, values, and diagnostic strings. If raw is not valid JSON,
// it falls back to SanitizeCredentialText.
func SanitizeJSONForPersistence(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	decoder := json.NewDecoder(strings.NewReader(trimmed))
	decoder.UseNumber()
	var payload any
	if err := decoder.Decode(&payload); err == nil {
		sanitized := sanitizeJSONValue(payload)
		out, err := json.Marshal(sanitized)
		if err == nil {
			return string(out)
		}
	}
	return SanitizeCredentialText(trimmed)
}

func sanitizeJSONValue(value any) any {
	return sanitizeJSONValueWithParent("", value)
}

func sanitizeJSONValueWithParent(parentKey string, value any) any {
	switch v := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(v))
		for key, child := range v {
			sanitizedKey := key
			if ContainsCredentialToken(key) {
				sum := sha256.Sum256([]byte(key))
				sanitizedKey = "[redacted-key:" + hex.EncodeToString(sum[:]) + "]"
			}

			normalizedKey := normalizeSecretKey(key)
			if isSecretFieldKey(key) {
				result[sanitizedKey] = "[redacted]"
				continue
			}

			if maxBytes, ok := requestMetadataMaxBytes(normalizedKey); ok {
				result[sanitizedKey] = sanitizeRequestMetadata(stringValue(child), maxBytes)
				continue
			}

			if normalizedKey == "fail_body" || (parentKey == "fail" && normalizedKey == "body") {
				result[sanitizedKey] = FailSummaryFromBody(stringValue(child))
				continue
			}

			result[sanitizedKey] = sanitizeJSONValueWithParent(normalizedKey, child)
		}
		return result
	case []any:
		result := make([]any, len(v))
		for i, child := range v {
			result[i] = sanitizeJSONValueWithParent(parentKey, child)
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
func SanitizeDiagnosticBody(body string) string {
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return ""
	}
	decoder := json.NewDecoder(strings.NewReader(trimmed))
	decoder.UseNumber()
	var payload any
	if err := decoder.Decode(&payload); err == nil {
		sanitized := sanitizeDiagnosticJSONValue(payload)
		if out, err := json.Marshal(sanitized); err == nil {
			return string(out)
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
			if ContainsCredentialToken(key) {
				sum := sha256.Sum256([]byte(key))
				sanitizedKey = "[redacted-key:" + hex.EncodeToString(sum[:]) + "]"
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
	if ContainsCredential(event.Source) {
		sum := sha256.Sum256([]byte(event.Source))
		hexHash := hex.EncodeToString(sum[:])
		event.Source = "h:" + hexHash
		event.SourceHash = hexHash
	}

	event.SourceHash = NormalizeOpaqueHashForPersistence(event.SourceHash)
	event.APIKeyHash = NormalizeOpaqueHashForPersistence(event.APIKeyHash)

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

	return event
}
