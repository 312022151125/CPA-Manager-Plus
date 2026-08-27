package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/security"
)

// RequireExistingDataKeyForEncryptedCPAConnection prevents startup from
// generating a replacement data.key when the existing Manager database already
// contains a structurally valid encrypted CPA connection. A missing key is
// recoverable only when the database contains no encrypted connection value;
// valid-shaped values must fail closed so a lost or wrong key cannot silently
// orphan the stored secret.
func RequireExistingDataKeyForEncryptedCPAConnection(ctx context.Context, databasePath, rawDataKey, dataKeyPath string) error {
	if strings.TrimSpace(rawDataKey) != "" || strings.TrimSpace(databasePath) == "" {
		return nil
	}
	if _, err := os.Stat(dataKeyPath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat data key %s: %w", dataKeyPath, err)
	}
	protected, err := HasPersistedEncryptedCPAConnection(ctx, databasePath)
	if err != nil {
		return err
	}
	if protected {
		return fmt.Errorf("encrypted CPA connection exists but data key is missing at %s", dataKeyPath)
	}
	return nil
}

// HasPersistedEncryptedCPAConnection inspects only the raw connection rows;
// it deliberately does not open the normal migrated Store because this guard
// must run before LoadOrCreateDataKey and before any database migration can
// create or alter state.
func HasPersistedEncryptedCPAConnection(ctx context.Context, databasePath string) (bool, error) {
	info, err := os.Stat(databasePath)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("stat sqlite %s: %w", databasePath, err)
	}
	if !info.Mode().IsRegular() {
		return false, fmt.Errorf("SQLite database path is not a regular file: %s", databasePath)
	}
	if info.Size() == 0 {
		return false, nil
	}

	dsn, err := readOnlyDataSourceName(databasePath)
	if err != nil {
		return false, fmt.Errorf("prepare read-only sqlite inspection %s: %w", databasePath, err)
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return false, fmt.Errorf("open sqlite %s for data-key inspection: %w", databasePath, err)
	}
	defer db.Close()

	var tableExists int
	if err := db.QueryRowContext(ctx, `select exists(select 1 from sqlite_schema where type = 'table' and name = 'settings')`).Scan(&tableExists); err != nil {
		return false, fmt.Errorf("inspect sqlite settings table %s: %w", databasePath, err)
	}
	if tableExists == 0 {
		return false, nil
	}

	rows, err := db.QueryContext(ctx, `select key, value from settings where key in ('setup', 'manager_config_v1')`)
	if err != nil {
		return false, fmt.Errorf("inspect encrypted CPA connection in %s: %w", databasePath, err)
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var raw string
		if err := rows.Scan(&key, &raw); err != nil {
			return false, fmt.Errorf("scan encrypted CPA connection in %s: %w", databasePath, err)
		}
		managementKey := persistedManagementKey(key, raw)
		if security.IsValidProtectedEnvelope(managementKey) {
			return true, nil
		}
	}
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("read encrypted CPA connection in %s: %w", databasePath, err)
	}
	return false, nil
}

func readOnlyDataSourceName(databasePath string) (string, error) {
	dsn := dataSourceName(databasePath)
	parsed, err := url.Parse(dsn)
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	query.Set("mode", "ro")
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func persistedManagementKey(key, raw string) string {
	switch key {
	case "setup":
		var setup struct {
			ManagementKey string `json:"managementKey"`
		}
		if err := json.Unmarshal([]byte(raw), &setup); err != nil {
			return ""
		}
		return setup.ManagementKey
	case "manager_config_v1":
		var cfg struct {
			CPAConnection struct {
				ManagementKey string `json:"managementKey"`
			} `json:"cpaConnection"`
		}
		if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
			return ""
		}
		return cfg.CPAConnection.ManagementKey
	default:
		return ""
	}
}
