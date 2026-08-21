package managerdatasnapshot

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/processlock"
)

const manifestVersion = 1

var snapshotFiles = []snapshotFile{
	{Name: "database", DatabaseSuffix: ""},
	{Name: "database-wal", DatabaseSuffix: "-wal"},
	{Name: "database-shm", DatabaseSuffix: "-shm"},
	{Name: "database-journal", DatabaseSuffix: "-journal"},
	{Name: "data-key", DataKey: true},
}

type snapshotFile struct {
	Name           string
	DatabaseSuffix string
	DataKey        bool
}

type manifest struct {
	Version int                      `json:"version"`
	Files   map[string]manifestEntry `json:"files"`
}

type manifestEntry struct {
	Existed bool   `json:"existed"`
	Mode    uint32 `json:"mode,omitempty"`
	Size    int64  `json:"size,omitempty"`
	SHA256  string `json:"sha256,omitempty"`
}

type options struct {
	Action      string
	DBPath      string
	DataKeyPath string
	SnapshotDir string
}

func Run(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) error {
	opts, err := parseArgs(args, stderr)
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}

	switch opts.Action {
	case "create":
		if err := withDatabaseLock(opts.DBPath, func(dbPath string) error {
			return create(ctx, dbPath, opts.DataKeyPath, opts.SnapshotDir)
		}); err != nil {
			return err
		}
		_, _ = fmt.Fprintf(stdout, "Manager data snapshot created at %s.\n", opts.SnapshotDir)
	case "restore":
		if err := withDatabaseLock(opts.DBPath, func(dbPath string) error {
			return restore(ctx, dbPath, opts.DataKeyPath, opts.SnapshotDir)
		}); err != nil {
			return err
		}
		_, _ = fmt.Fprintf(stdout, "Manager data restored from %s.\n", opts.SnapshotDir)
	case "delete":
		if err := deleteSnapshot(opts.SnapshotDir); err != nil {
			return err
		}
		_, _ = fmt.Fprintf(stdout, "Manager data snapshot deleted at %s.\n", opts.SnapshotDir)
	default:
		return fmt.Errorf("unsupported action %q", opts.Action)
	}
	return nil
}

func parseArgs(args []string, stderr io.Writer) (options, error) {
	if len(args) == 0 {
		return options{}, errors.New("snapshot action is required: create, restore, or delete")
	}
	opts := options{Action: args[0]}
	fs := flag.NewFlagSet("manager-data-snapshot "+opts.Action, flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.StringVar(&opts.DBPath, "db-path", "", "SQLite database path")
	fs.StringVar(&opts.DataKeyPath, "data-key-path", "", "data.key path")
	fs.StringVar(&opts.SnapshotDir, "snapshot-dir", "", "private snapshot directory")
	fs.Usage = func() {
		_, _ = fmt.Fprintln(stderr, "Usage: cpa-manager-plus manager-data-snapshot <create|restore|delete> --snapshot-dir PATH [--db-path PATH --data-key-path PATH]")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args[1:]); err != nil {
		return options{}, err
	}
	if fs.NArg() > 0 {
		return options{}, fmt.Errorf("unexpected argument %q", fs.Arg(0))
	}
	opts.DBPath = strings.TrimSpace(opts.DBPath)
	opts.DataKeyPath = strings.TrimSpace(opts.DataKeyPath)
	opts.SnapshotDir = strings.TrimSpace(opts.SnapshotDir)
	if opts.SnapshotDir == "" {
		return options{}, errors.New("--snapshot-dir is required")
	}
	if opts.Action == "create" || opts.Action == "restore" {
		if opts.DBPath == "" {
			return options{}, errors.New("--db-path is required")
		}
		if opts.DataKeyPath == "" {
			return options{}, errors.New("--data-key-path is required")
		}
	}
	return opts, nil
}

func withDatabaseLock(dbPath string, fn func(string) error) error {
	databaseLock, err := processlock.Acquire(dbPath)
	if err != nil {
		return fmt.Errorf("acquire Manager data snapshot lock; stop Manager Server and retry: %w", err)
	}
	defer func() { _ = databaseLock.Close() }()
	return fn(databaseLock.DatabasePath())
}

func create(ctx context.Context, dbPath string, dataKeyPath string, snapshotDir string) (returnErr error) {
	absSnapshotDir, err := filepath.Abs(snapshotDir)
	if err != nil {
		return fmt.Errorf("resolve snapshot directory: %w", err)
	}
	if _, err := os.Lstat(absSnapshotDir); err == nil {
		return fmt.Errorf("snapshot directory already exists: %s", absSnapshotDir)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("inspect snapshot directory %s: %w", absSnapshotDir, err)
	}
	parent := filepath.Dir(absSnapshotDir)
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return fmt.Errorf("create snapshot parent %s: %w", parent, err)
	}
	tempDir, err := os.MkdirTemp(parent, ".cpamp-manager-snapshot-tmp-")
	if err != nil {
		return fmt.Errorf("create temporary snapshot directory: %w", err)
	}
	defer func() {
		if returnErr != nil {
			_ = os.RemoveAll(tempDir)
		}
	}()
	if err := os.Chmod(tempDir, 0o700); err != nil {
		return fmt.Errorf("protect temporary snapshot directory: %w", err)
	}

	m := manifest{Version: manifestVersion, Files: make(map[string]manifestEntry, len(snapshotFiles))}
	for _, item := range snapshotFiles {
		source := sourcePath(item, dbPath, dataKeyPath)
		entry, err := snapshotOne(ctx, source, filepath.Join(tempDir, item.Name))
		if err != nil {
			return fmt.Errorf("snapshot %s: %w", source, err)
		}
		m.Files[item.Name] = entry
	}
	manifestData, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Errorf("encode snapshot manifest: %w", err)
	}
	manifestData = append(manifestData, '\n')
	if err := writeNewFile(filepath.Join(tempDir, "manifest.json"), manifestData, 0o600); err != nil {
		return fmt.Errorf("write snapshot manifest: %w", err)
	}
	if err := os.Rename(tempDir, absSnapshotDir); err != nil {
		return fmt.Errorf("publish snapshot directory %s: %w", absSnapshotDir, err)
	}
	return nil
}

func snapshotOne(ctx context.Context, source string, target string) (manifestEntry, error) {
	info, err := os.Lstat(source)
	if os.IsNotExist(err) {
		return manifestEntry{}, nil
	}
	if err != nil {
		return manifestEntry{}, err
	}
	if !info.Mode().IsRegular() {
		return manifestEntry{}, fmt.Errorf("source is not a regular file")
	}
	digest, size, err := copyFile(ctx, source, target, 0o600)
	if err != nil {
		return manifestEntry{}, err
	}
	return manifestEntry{
		Existed: true,
		Mode:    uint32(info.Mode().Perm()),
		Size:    size,
		SHA256:  digest,
	}, nil
}

func restore(ctx context.Context, dbPath string, dataKeyPath string, snapshotDir string) error {
	absSnapshotDir, m, err := loadManifest(snapshotDir)
	if err != nil {
		return err
	}
	staged := make(map[string]string)
	defer func() {
		for _, path := range staged {
			_ = os.Remove(path)
		}
	}()
	for _, item := range snapshotFiles {
		entry := m.Files[item.Name]
		if !entry.Existed {
			continue
		}
		source := filepath.Join(absSnapshotDir, item.Name)
		target := sourcePath(item, dbPath, dataKeyPath)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return fmt.Errorf("create restore directory for %s: %w", target, err)
		}
		temp, err := os.CreateTemp(filepath.Dir(target), ".cpamp-restore-*")
		if err != nil {
			return fmt.Errorf("create restore file for %s: %w", target, err)
		}
		tempPath := temp.Name()
		if err := temp.Close(); err != nil {
			_ = os.Remove(tempPath)
			return fmt.Errorf("close restore file for %s: %w", target, err)
		}
		if err := os.Remove(tempPath); err != nil {
			return fmt.Errorf("prepare restore file for %s: %w", target, err)
		}
		digest, size, err := copyFile(ctx, source, tempPath, os.FileMode(entry.Mode))
		if err != nil {
			return fmt.Errorf("stage restore for %s: %w", target, err)
		}
		if size != entry.Size || digest != entry.SHA256 {
			return fmt.Errorf("snapshot file %s failed integrity validation", item.Name)
		}
		staged[target] = tempPath
	}
	for _, item := range snapshotFiles {
		entry := m.Files[item.Name]
		target := sourcePath(item, dbPath, dataKeyPath)
		if !entry.Existed {
			if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("remove post-snapshot file %s: %w", target, err)
			}
			continue
		}
		if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("replace %s: %w", target, err)
		}
		if err := os.Rename(staged[target], target); err != nil {
			return fmt.Errorf("restore %s: %w", target, err)
		}
		delete(staged, target)
	}
	return nil
}

func loadManifest(snapshotDir string) (string, manifest, error) {
	absSnapshotDir, err := filepath.Abs(snapshotDir)
	if err != nil {
		return "", manifest{}, fmt.Errorf("resolve snapshot directory: %w", err)
	}
	info, err := os.Lstat(absSnapshotDir)
	if err != nil {
		return "", manifest{}, fmt.Errorf("inspect snapshot directory %s: %w", absSnapshotDir, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", manifest{}, fmt.Errorf("snapshot path is not a directory: %s", absSnapshotDir)
	}
	data, err := os.ReadFile(filepath.Join(absSnapshotDir, "manifest.json"))
	if err != nil {
		return "", manifest{}, fmt.Errorf("read snapshot manifest: %w", err)
	}
	var m manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return "", manifest{}, fmt.Errorf("decode snapshot manifest: %w", err)
	}
	if m.Version != manifestVersion || len(m.Files) != len(snapshotFiles) {
		return "", manifest{}, errors.New("unsupported or incomplete snapshot manifest")
	}
	for _, item := range snapshotFiles {
		entry, ok := m.Files[item.Name]
		if !ok {
			return "", manifest{}, fmt.Errorf("snapshot manifest is missing %s", item.Name)
		}
		if entry.Existed && (entry.SHA256 == "" || entry.Size < 0 || entry.Mode > 0o777) {
			return "", manifest{}, fmt.Errorf("snapshot manifest has invalid metadata for %s", item.Name)
		}
	}
	return absSnapshotDir, m, nil
}

func deleteSnapshot(snapshotDir string) error {
	absSnapshotDir, _, err := loadManifest(snapshotDir)
	if err != nil {
		return err
	}
	allowed := map[string]bool{"manifest.json": true}
	for _, item := range snapshotFiles {
		allowed[item.Name] = true
	}
	entries, err := os.ReadDir(absSnapshotDir)
	if err != nil {
		return fmt.Errorf("inspect snapshot directory %s: %w", absSnapshotDir, err)
	}
	for _, entry := range entries {
		if !allowed[entry.Name()] {
			return fmt.Errorf("snapshot directory contains unexpected entry %s", entry.Name())
		}
	}
	for _, item := range snapshotFiles {
		if err := os.Remove(filepath.Join(absSnapshotDir, item.Name)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("delete snapshot file %s: %w", item.Name, err)
		}
	}
	if err := os.Remove(filepath.Join(absSnapshotDir, "manifest.json")); err != nil {
		return fmt.Errorf("delete snapshot manifest: %w", err)
	}
	if err := os.Remove(absSnapshotDir); err != nil {
		return fmt.Errorf("delete snapshot directory %s: %w", absSnapshotDir, err)
	}
	return nil
}

func sourcePath(item snapshotFile, dbPath string, dataKeyPath string) string {
	if item.DataKey {
		return dataKeyPath
	}
	return dbPath + item.DatabaseSuffix
}

func copyFile(ctx context.Context, source string, target string, mode os.FileMode) (string, int64, error) {
	input, err := os.Open(source)
	if err != nil {
		return "", 0, err
	}
	defer input.Close()
	output, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode.Perm())
	if err != nil {
		return "", 0, err
	}
	removeTarget := true
	defer func() {
		_ = output.Close()
		if removeTarget {
			_ = os.Remove(target)
		}
	}()
	hash := sha256.New()
	written, err := copyWithContext(ctx, io.MultiWriter(output, hash), input)
	if err != nil {
		return "", 0, err
	}
	if err := output.Sync(); err != nil {
		return "", 0, err
	}
	if err := output.Close(); err != nil {
		return "", 0, err
	}
	removeTarget = false
	return hex.EncodeToString(hash.Sum(nil)), written, nil
}

func copyWithContext(ctx context.Context, dst io.Writer, src io.Reader) (int64, error) {
	buffer := make([]byte, 1024*1024)
	var written int64
	for {
		select {
		case <-ctx.Done():
			return written, ctx.Err()
		default:
		}
		read, readErr := src.Read(buffer)
		if read > 0 {
			count, writeErr := dst.Write(buffer[:read])
			written += int64(count)
			if writeErr != nil {
				return written, writeErr
			}
			if count != read {
				return written, io.ErrShortWrite
			}
		}
		if errors.Is(readErr, io.EOF) {
			return written, nil
		}
		if readErr != nil {
			return written, readErr
		}
	}
}

func writeNewFile(path string, data []byte, mode os.FileMode) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	return file.Close()
}
