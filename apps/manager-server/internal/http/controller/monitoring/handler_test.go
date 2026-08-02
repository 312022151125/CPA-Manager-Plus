package monitoring

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/app"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/config"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/security"
	adminauthsvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/adminauth"
	monitoringsvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/monitoring"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
)

func TestHandleAccountHistoryRejectsUnknownTargetFields(t *testing.T) {
	st := newHandlerTestStore(t)
	const adminKey = "cpamp_test_key"
	credential, err := security.NewAdminCredential(adminKey, "test")
	if err != nil {
		t.Fatalf("create admin credential: %v", err)
	}
	if err := st.SaveAdminCredential(context.Background(), credential); err != nil {
		t.Fatalf("save admin credential: %v", err)
	}
	handler := &Handler{App: &app.Context{
		AdminAuthService:  adminauthsvc.New(config.Config{}, st),
		MonitoringService: monitoringsvc.New(st),
	}}
	req := httptest.NewRequest(
		http.MethodPost,
		"/v0/management/monitoring/account-history",
		bytes.NewBufferString(`{"accounts":[{"source_hash":"source-only"}]}`),
	)
	req.Header.Set("Authorization", "Bearer "+adminKey)
	recorder := httptest.NewRecorder()

	handler.Handle(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "source_hash") {
		t.Fatalf("body = %s", recorder.Body.String())
	}
}

func TestHandleAccountWindowUsageRejectsUnknownTargetFields(t *testing.T) {
	st := newHandlerTestStore(t)
	const adminKey = "cpamp_test_key"
	credential, err := security.NewAdminCredential(adminKey, "test")
	if err != nil {
		t.Fatalf("create admin credential: %v", err)
	}
	if err := st.SaveAdminCredential(context.Background(), credential); err != nil {
		t.Fatalf("save admin credential: %v", err)
	}
	handler := &Handler{App: &app.Context{
		AdminAuthService:  adminauthsvc.New(config.Config{}, st),
		MonitoringService: monitoringsvc.New(st),
	}}
	req := httptest.NewRequest(
		http.MethodPost,
		"/v0/management/monitoring/account-window-usage",
		bytes.NewBufferString(`{"windows":[{"row_key":"row-1","window_key":"5h","from_ms":1,"to_ms":2,"source_hash":"source-only"}]}`),
	)
	req.Header.Set("Authorization", "Bearer "+adminKey)
	recorder := httptest.NewRecorder()

	handler.Handle(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "source_hash") {
		t.Fatalf("body = %s", recorder.Body.String())
	}
}

func TestHandleAccountHistoryValidatesRowKeysAndTargets(t *testing.T) {
	testCases := []struct {
		name        string
		body        string
		wantMessage string
	}{
		{
			name:        "missing row key",
			body:        `{"accounts":[{"auth_file_snapshot":"credential.json","auth_index":"auth-1"}]}`,
			wantMessage: "row_key is required",
		},
		{
			name:        "duplicate row key",
			body:        `{"accounts":[{"row_key":"row-1","auth_index":"auth-1"},{"row_key":"row-1","auth_index":"auth-2"}]}`,
			wantMessage: "row_key must be unique",
		},
		{
			name:        "missing target",
			body:        `{"accounts":[{"row_key":"row-1"}]}`,
			wantMessage: "at least one account target field is required",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := executeAuthorizedMonitoringRequest(
				t,
				"/v0/management/monitoring/account-history",
				testCase.body,
			)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
			}
			if !strings.Contains(recorder.Body.String(), testCase.wantMessage) {
				t.Fatalf("body = %s, want %q", recorder.Body.String(), testCase.wantMessage)
			}
		})
	}
}

func TestValidateAccountHistoryRequestTreatsRowKeysAsOpaque(t *testing.T) {
	err := validateAccountHistoryRequest(monitoringsvc.AccountHistoryRequest{
		Accounts: []monitoringsvc.AccountHistoryTarget{
			{RowKey: " row", AuthIndex: "auth-1"},
			{RowKey: "row", AuthIndex: "auth-2"},
		},
	})
	if err != nil {
		t.Fatalf("validate opaque row keys: %v", err)
	}
}

func executeAuthorizedMonitoringRequest(t *testing.T, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	st := newHandlerTestStore(t)
	const adminKey = "cpamp_test_key"
	credential, err := security.NewAdminCredential(adminKey, "test")
	if err != nil {
		t.Fatalf("create admin credential: %v", err)
	}
	if err := st.SaveAdminCredential(context.Background(), credential); err != nil {
		t.Fatalf("save admin credential: %v", err)
	}
	handler := &Handler{App: &app.Context{
		AdminAuthService:  adminauthsvc.New(config.Config{}, st),
		MonitoringService: monitoringsvc.New(st),
	}}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminKey)
	recorder := httptest.NewRecorder()
	handler.Handle(recorder, req)
	return recorder
}

func newHandlerTestStore(t testing.TB) *store.Store {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = st.Close()
	})
	return st
}
