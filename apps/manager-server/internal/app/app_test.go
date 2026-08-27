package app

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/config"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/security"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
)

func TestNewDoesNotGenerateDataKeyOverExistingEncryptedCPAConnection(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "usage.sqlite")
	protector, err := security.NewProtector([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("create protector: %v", err)
	}
	legacy, err := store.Open(dbPath, protector)
	if err != nil {
		t.Fatalf("open protected fixture: %v", err)
	}
	if err := legacy.SaveManagerConfig(context.Background(), store.ManagerConfig{
		CPAConnection: store.ManagerCPAConnectionConfig{
			CPABaseURL:    "http://cpa.local:8317",
			ManagementKey: "stored-management-key",
		},
	}); err != nil {
		_ = legacy.Close()
		t.Fatalf("save protected fixture: %v", err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatalf("close protected fixture: %v", err)
	}

	dataKeyPath := filepath.Join(t.TempDir(), "missing-data.key")
	_, err = New(context.Background(), config.Config{
		DBPath:      dbPath,
		DataKeyPath: dataKeyPath,
	}, Options{})
	if err == nil || !strings.Contains(err.Error(), "data key is missing") {
		t.Fatalf("New() error = %v, want missing data key failure", err)
	}
	if _, statErr := os.Stat(dataKeyPath); !os.IsNotExist(statErr) {
		t.Fatalf("New() created replacement data key: %v", statErr)
	}
}
