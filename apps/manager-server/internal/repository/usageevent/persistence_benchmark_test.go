package usageevent

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	sqliterepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/sqlite"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usage"
)

func BenchmarkPrepareUsageEvent(b *testing.B) {
	db, err := sqliterepo.Open(filepath.Join(b.TempDir(), "usage.sqlite"))
	if err != nil {
		b.Fatalf("open database: %v", err)
	}
	b.Cleanup(func() { _ = db.Close() })
	repo := New(db).(*repository)

	event := usage.Event{
		EventHash:        canonicalTestHash("prep-bench"),
		TimestampMS:      time.Now().UnixMilli(),
		Timestamp:        time.Now().UTC().Format(time.RFC3339Nano),
		Provider:         "codex",
		Model:            "gpt-5",
		AuthFileSnapshot: "account.json",
		AuthIndex:        "auth-1",
		Source:           "account.json",
		InputTokens:      1500,
		OutputTokens:     300,
		TotalTokens:      1800,
		FailBody:         `{"cpaManagementKey":"secret-key-123","error":{"message":"rate limited","code":"rate_limit_exceeded"}}`,
		RawJSON:          `{"api_key":"sk-proj-testKey1234567890123","id":9223372036854775807}`,
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = repo.prepareUsageEvent(event)
	}
}

func BenchmarkInsertBatch(b *testing.B) {
	batchSizes := []int{1, 100, 256}
	scenarios := []string{"AllNew", "AllDuplicate", "Mixed50Percent"}

	for _, size := range batchSizes {
		for _, scenario := range scenarios {
			benchName := fmt.Sprintf("Size%d_%s", size, scenario)
			b.Run(benchName, func(b *testing.B) {
				db, err := sqliterepo.Open(filepath.Join(b.TempDir(), "usage.sqlite"))
				if err != nil {
					b.Fatalf("open database: %v", err)
				}
				b.Cleanup(func() { _ = db.Close() })
				repo := New(db)
				ctx := context.Background()

				baseTime := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

				// Pre-populate duplicate events if needed
				var duplicateEvents []usage.Event
				if scenario == "AllDuplicate" || scenario == "Mixed50Percent" {
					duplicateEvents = make([]usage.Event, size)
					for i := 0; i < size; i++ {
						duplicateEvents[i] = makeBaseTestEvent(
							canonicalTestHash(fmt.Sprintf("dup-%d-%d", size, i)),
							baseTime.Add(time.Duration(i)*time.Second).UnixMilli(),
						)
					}
					if _, err := repo.InsertBatch(ctx, duplicateEvents); err != nil {
						b.Fatalf("seed duplicate events: %v", err)
					}
				}

				b.ReportAllocs()
				b.ResetTimer()

				for iter := 0; iter < b.N; iter++ {
					b.StopTimer()
					batch := make([]usage.Event, size)
					for i := 0; i < size; i++ {
						switch scenario {
						case "AllNew":
							batch[i] = makeBaseTestEvent(
								canonicalTestHash(fmt.Sprintf("new-%d-%d-%d", size, iter, i)),
								baseTime.Add(time.Duration(iter*size+i)*time.Second).UnixMilli(),
							)
						case "AllDuplicate":
							batch[i] = duplicateEvents[i]
						case "Mixed50Percent":
							if i < size/2 {
								batch[i] = duplicateEvents[i]
							} else {
								batch[i] = makeBaseTestEvent(
									canonicalTestHash(fmt.Sprintf("mixed-%d-%d-%d", size, iter, i)),
									baseTime.Add(time.Duration(iter*size+i)*time.Second).UnixMilli(),
								)
							}
						}
					}
					b.StartTimer()

					_, err := repo.InsertBatch(ctx, batch)
					if err != nil {
						b.Fatalf("insert batch failed: %v", err)
					}
				}
			})
		}
	}
}
