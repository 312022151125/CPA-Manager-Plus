package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

type recordingInspectionStopper struct {
	calls       int
	firstErr    error
	hasDeadline bool
}

func (s *recordingInspectionStopper) StopAndWait(ctx context.Context) error {
	s.calls++
	_, s.hasDeadline = ctx.Deadline()
	return s.firstErr
}

func TestNewPprofServer(t *testing.T) {
	tests := []struct {
		name    string
		addr    string
		wantNil bool
		wantErr bool
	}{
		{name: "disabled", wantNil: true},
		{name: "ipv4 loopback", addr: "127.0.0.1:6060"},
		{name: "ipv6 loopback", addr: "[::1]:6060"},
		{name: "localhost", addr: "localhost:6060"},
		{name: "all interfaces", addr: ":6060", wantErr: true},
		{name: "public address", addr: "0.0.0.0:6060", wantErr: true},
		{name: "invalid", addr: "localhost", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, err := newPprofServer(tt.addr)
			if (err != nil) != tt.wantErr {
				t.Fatalf("newPprofServer(%q) error = %v", tt.addr, err)
			}
			if tt.wantNil && server != nil {
				t.Fatalf("newPprofServer(%q) = %#v, want nil", tt.addr, server)
			}
			if !tt.wantNil && !tt.wantErr && server == nil {
				t.Fatalf("newPprofServer(%q) = nil", tt.addr)
			}
		})
	}
}

func TestStopCodexInspectionWorkerRemainsBoundedAfterTimeout(t *testing.T) {
	stopper := &recordingInspectionStopper{firstErr: context.DeadlineExceeded}
	stopCodexInspectionWorker(stopper, time.Millisecond)
	if stopper.calls != 1 || !stopper.hasDeadline {
		t.Fatalf("stop calls = %d hasDeadline=%v, want one bounded stop", stopper.calls, stopper.hasDeadline)
	}
}

func TestStopCodexInspectionWorkerDoesNotDrainAfterCleanStop(t *testing.T) {
	stopper := &recordingInspectionStopper{}
	stopCodexInspectionWorker(stopper, time.Millisecond)
	if stopper.calls != 1 {
		t.Fatalf("stop calls = %d, want 1", stopper.calls)
	}
}

func TestDerivedMigrationsStartAfterHTTPListenerIsBound(t *testing.T) {
	content, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	source := string(content)
	listenAt := strings.Index(source, `net.Listen("tcp", cfg.HTTPAddr)`)
	listeningLogAt := strings.Index(source, `log.Printf("cpa-manager-plus listening on %s", listener.Addr())`)
	serveAt := strings.Index(source, "server.Serve(listener)")
	if listenAt < 0 || listeningLogAt < listenAt || serveAt < listeningLogAt {
		t.Fatalf("HTTP listener ordering not found: listen=%d log=%d serve=%d", listenAt, listeningLogAt, serveAt)
	}
	for _, startCall := range []string{
		"db.RunDerivedStartupMaintenance(ctx)",
		"automationRuntime.Start(ctx)",
		"codexInspectionWorker.Start(ctx)",
		"accountHistoryRollupWorker.Start(ctx)",
		"usageDerivedRollupWorker.Start(ctx)",
		"usageHourlyAggregateWorker.Start(ctx)",
		"db.StartDerivedMaintenance(ctx)",
		"collectorWorker.Start(ctx)",
		"NewLegacyQuotaSnapshotMigrationWorker(db).Start(ctx)",
	} {
		startAt := strings.Index(source, startCall)
		if startAt < serveAt {
			t.Fatalf("%s starts before HTTP Serve is launched: start=%d serve=%d", startCall, startAt, serveAt)
		}
	}
	maintenanceAt := strings.Index(source, "db.RunDerivedStartupMaintenance(ctx)")
	collectorAt := strings.Index(source, "collectorWorker.Start(ctx)")
	if maintenanceAt < serveAt || collectorAt < maintenanceAt {
		t.Fatalf("startup maintenance/collector ordering invalid: serve=%d maintenance=%d collector=%d", serveAt, maintenanceAt, collectorAt)
	}
	if !strings.Contains(source, "continuing without blocking background workers") {
		t.Fatal("post-listen index failure does not explicitly preserve background worker startup")
	}
}
