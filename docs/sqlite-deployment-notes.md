# SQLite Deployment Notes

Manager Server stores its data in a local SQLite database (Docker default `/data/usage.sqlite`, native default `./data/usage.sqlite`). Standard Docker, Compose, and native deployments already satisfy the requirements below. They matter when you harden the runtime yourself, for example with a read-only root filesystem or a non-root user.

## Writable temporary directory

SQLite writes temporary files (sorters, vacuum and rebuild working sets) to a writable temporary directory. When the root filesystem is read-only — for example a Kubernetes pod with `readOnlyRootFilesystem: true` and no writable `/tmp` — opening or migrating the database fails at startup:

```text
open sqlite: ... : disk I/O error (6410)
```

The `6410` is SQLite's `SQLITE_IOERR_GETTEMPPATH`: no writable temporary directory could be found. If you enable a read-only root filesystem, provide one, either by mounting an ephemeral volume at `/tmp`:

```yaml
volumeMounts:
  - name: tmp
    mountPath: /tmp

volumes:
  - name: tmp
    emptyDir:
      sizeLimit: 64Mi
```

or by setting `SQLITE_TMPDIR` to any writable ephemeral path (it can live on the same volume as the database). CPAMP does not relocate the temporary directory or set `SQLITE_TMPDIR` on its own.

## Writable database file

The Manager Server process needs read and write access to the database file and its `usage.sqlite-wal` / `usage.sqlite-shm` siblings. When the file is owned by a different user — for example root-owned `0644` while the process runs as uid `1000` — startup fails with:

```text
open sqlite: ... : attempt to write a readonly database (8)
```

The `8` is SQLite's `SQLITE_READONLY`. Fix the ownership or permissions of the files on the volume, or run the process as a user that owns them. CPAMP never changes file permissions on its own.
