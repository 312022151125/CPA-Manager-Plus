# Grok Account Inspection

Grok Account Inspection checks xAI/Grok auth files through **billing** weekly and monthly usage (cli-chat-proxy APIs). It is **local-only**: it runs in the current browser session, stores last-run results in localStorage, and does not schedule work on Manager Server.

For free-tier chat exhaustion (`subscription:free-usage-exhausted`), use Configuration → **Grok/xAI Free-Usage Cooldown**. That path is separate from this page.

## What It Checks

- Weekly and monthly billing usage windows from `fetchXaiQuota`.
- Whether usage crossed the disable threshold (default 100% = fully exhausted).
- Whether a disabled file looks recovered and can be re-enabled.
- Whether billing returns 401/403 (suggest reauth via [OAuth Login](./oauth.md)).
- Probe failures stay **keep** with error detail — no auto-delete on billing errors.

## Suggested Actions

- **Keep**: healthy or already handled.
- **Disable**: usage ≥ threshold and the file is still enabled.
- **Enable**: file disabled and usage is under the threshold.
- **Reauth**: billing auth failed; open OAuth, then re-run inspection.
- **Delete**: only when you choose delete for reauth files (manual confirm).

Actions execute through existing Auth Files APIs after confirmation.

## Settings

Local browser settings only:

- Quota threshold (%)
- Sample size (`0` = all xAI files)
- Probe workers / retries / timeout metadata
- Auto-action mode (none / enable / disable / delete)

## Related

- [Auth Files](./auth-files.md)
- [OAuth Login](./oauth.md)
- [Quota](./quota.md)
- [Codex Inspection](./codex-inspection.md) (Codex-only; unchanged)
