package derivedmaintenance

import (
	"bytes"
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
)

func TestRunFinalizesPairedAndOrphanMonitoringFTSJobs(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "usage.sqlite")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if err := st.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open cleanup fixture: %v", err)
	}
	for _, statement := range []string{
		`create table usage_monitoring_event_projection_v1_legacy_g000001 (
			event_id integer primary key, search_text text not null
		)`,
		`create virtual table usage_monitoring_event_search_v1_legacy_g000001 using fts5(
			search_text,
			content = 'usage_monitoring_event_projection_v1_legacy_g000001',
			content_rowid = 'event_id', columnsize = 0, detail = 'none', tokenize = 'trigram'
		)`,
		`insert into usage_monitoring_event_projection_v1_legacy_g000001 values (1, 'first searchable row'), (2, 'second searchable row')`,
		`insert into usage_monitoring_event_search_v1_legacy_g000001(rowid, search_text)
			select event_id, search_text from usage_monitoring_event_projection_v1_legacy_g000001`,
		`insert into usage_derived_cleanup_jobs (
			generation, kind, status, projection_table, fts_table,
			processed_rows, created_at_ms, updated_at_ms
		) values (1, 'monitoring_fts', 'online_cleanup',
			'usage_monitoring_event_projection_v1_legacy_g000001',
			'usage_monitoring_event_search_v1_legacy_g000001', 0, 1, 1)`,
		`create virtual table usage_monitoring_event_search_v1_legacy_g000002 using fts5(search_text)`,
		`insert into usage_derived_cleanup_jobs (
			generation, kind, status, projection_table, fts_table,
			processed_rows, created_at_ms, updated_at_ms
		) values (2, 'monitoring_fts', 'offline_required', null,
			'usage_monitoring_event_search_v1_legacy_g000002', 0, 1, 1)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			_ = db.Close()
			t.Fatalf("prepare cleanup fixture: %v", err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close cleanup fixture: %v", err)
	}

	var stdout, stderr bytes.Buffer
	if err := Run(context.Background(), []string{"--db-path", dbPath}, &stdout, &stderr); err != nil {
		t.Fatalf("run derived cleanup: %v stderr=%s", err, stderr.String())
	}
	if !strings.Contains(stdout.String(), "jobs=2") || !strings.Contains(stdout.String(), "processed_rows=2") {
		t.Fatalf("cleanup output = %q", stdout.String())
	}
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("reopen cleanup database: %v", err)
	}
	defer db.Close()
	var completed, retained int
	if err := db.QueryRow(`select count(*) from usage_derived_cleanup_jobs where status = 'completed'`).Scan(&completed); err != nil {
		t.Fatalf("count completed jobs: %v", err)
	}
	if err := db.QueryRow(`select count(*) from sqlite_master where type = 'table' and name in (
		'usage_monitoring_event_projection_v1_legacy_g000001',
		'usage_monitoring_event_search_v1_legacy_g000001',
		'usage_monitoring_event_search_v1_legacy_g000002'
	)`).Scan(&retained); err != nil {
		t.Fatalf("count retained cleanup tables: %v", err)
	}
	if completed != 2 || retained != 0 {
		t.Fatalf("cleanup state = completed:%d retained:%d", completed, retained)
	}
}

func TestRunRejectsMissingDatabase(t *testing.T) {
	var stdout, stderr bytes.Buffer
	err := Run(context.Background(), []string{"--db-path", filepath.Join(t.TempDir(), "missing.sqlite")}, &stdout, &stderr)
	if err == nil || !strings.Contains(err.Error(), "SQLite database not found") {
		t.Fatalf("error = %v", err)
	}
}
