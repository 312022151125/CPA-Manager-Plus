# SQLite 部署说明

Manager Server 将数据存储在本地 SQLite 数据库中(Docker 默认 `/data/usage.sqlite`,原生部署默认 `./data/usage.sqlite`)。标准的 Docker、Compose 和原生部署天然满足下述要求;当你自行加固运行环境(例如只读根文件系统、非 root 用户)时,请留意这些事项。

## 可写的临时目录

SQLite 会把临时文件(排序、vacuum 与重建工作集)写入一个可写的临时目录。当根文件系统只读时——例如 Kubernetes Pod 设置了 `readOnlyRootFilesystem: true` 且没有可写的 `/tmp`——数据库在启动阶段的打开/迁移会失败:

```text
open sqlite: ... : disk I/O error (6410)
```

其中 `6410` 是 SQLite 的 `SQLITE_IOERR_GETTEMPPATH`:找不到可写的临时目录。如果启用只读根文件系统,请提供这样一个目录,既可以在 `/tmp` 挂载一个临时卷:

```yaml
volumeMounts:
  - name: tmp
    mountPath: /tmp

volumes:
  - name: tmp
    emptyDir:
      sizeLimit: 64Mi
```

也可以将 `SQLITE_TMPDIR` 指向任意可写的临时路径(可以与数据库位于同一个卷上)。CPAMP 不会自行迁移临时目录,也不会自行设置 `SQLITE_TMPDIR`。

## 可写的数据库文件

Manager Server 进程需要对数据库文件及其 `usage.sqlite-wal` / `usage.sqlite-shm` 伴生文件的读写权限。当文件属于其他用户时——例如文件为 root 属主 `0644`,而进程以 uid `1000` 运行——启动会失败:

```text
open sqlite: ... : attempt to write a readonly database (8)
```

其中 `8` 是 SQLite 的 `SQLITE_READONLY`。请修正卷上文件的所有权或权限,或让进程以文件属主用户运行。CPAMP 自身不会修改文件权限。
