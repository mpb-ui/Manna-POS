# Security baseline and recovery

## Login and sessions

- Five failed guesses on an account trigger 1 minute, the next five 5 minutes,
  and subsequent groups of five 15 minutes. Blocked requests do not prolong the
  timeout. A successful authentication or 30 minutes without another failure
  resets the account counter. A separate guard permits at most 40 reservations
  per source IP per 10-minute window before applying a 1-minute pause.
- Counters and sessions live in `pos_security`, separately from business
  data. PostgreSQL row locking serializes simultaneous guesses across processes.
  Restarting/redeploying does not clear limits or restore revoked sessions.
- Cookies contain a random 256-bit token; only an HMAC digest is stored. Cookies
  are HttpOnly/SameSite=Lax, Secure in production, and expire after 12 hours.
  CSRF headers are bound to each session; browser origins are also checked.
- **Owner manages PINs through Tambah/Edit User.** PINs contain 4–12 digits,
  including leading zeroes. Users cannot change their own PIN through account
  settings or API, including users with the custom `users.manage` permission.
  Only Owner can add a user and assign/reset a PIN. Leaving Edit User's PIN blank
  preserves it. A changed PIN or access version invalidates existing sessions.
- The forced default-PIN change, manual Kunci POS and idle lock are removed.
  Existing lock flags are ignored. Sessions still expire after 12 hours; logout
  and session revocation work as before. At most 10 sessions per account remain.
- Account menu → **Keamanan Akun** lists sessions. Users revoke their own sessions;
  Owner can revoke staff sessions, inspect failed logins, and unblock accounts
  after entering an explanation and the Owner's PIN. Admin cannot create or edit
  Owner access. Session versions are rechecked inside business mutation locks.
- Native print capabilities remain short-lived and single-use, and are refused
  after the source POS session expires, is revoked or its account version changes. No browser cookie is passed
  to the helper. Existing helper 1.0.1 remains compatible.

`SESSION_SECRET` must have at least 32 characters in production. A fresh database
also requires an Owner-selected initial `APP_PIN` of 4–12 digits; the local-only fallback remains for
development. Set `APP_ORIGIN` to the canonical HTTPS origin when using a custom
domain. Never place credentials, PINs, session tokens or backup passphrases in logs.

Cloudflare proxy ranges in `lib/client-address.js` were checked against
<https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6> on
2026-11-01. Render requests walk trusted proxies from right to left; incoming
leftmost forwarding values are not trusted. Recheck these ranges during maintenance.
Outside Render the socket address is used.

## Backups

- `pos_daily_backups` stores one verified atomic business snapshot per WITA day.
  Startup checks the current day's snapshot; an hourly timer handles day changes.
  Checksums use canonical JSON, so PostgreSQL key ordering does not affect them.
- Retention is **up to 30 days / 128 MB**, keeping the newest snapshot even when it
  exceeds the budget. Old daily snapshots can be pruned earlier for capacity.
  Existing pre-migration backups are preserved. Backup failures are visible to
  Owner under **Keamanan Akun → Backup data** and logged without business contents.
- Snapshots are in the same database and do not protect against deletion of the
  entire database. Paid Render Postgres additionally provides provider-managed
  PITR; confirm the current recovery window in Render's Recovery page. External
  database access stays disabled. No public database allowlist is opened for QA.
- Owner can download current data or a daily snapshot as `.mannabackup` after
  re-entering the PIN and choosing a passphrase of at least 12 characters.
  Exports use gzip + AES-256-GCM with scrypt-derived keys and randomized salt/IV.
  Each export is decrypted and checksum-verified before download. The passphrase
  is not retained. Losing it makes that export unusable.
- Export contains business state, including images, users/PIN hashes, and ledgers.
  It excludes active sessions and database/storage credentials. Store exports
  separately from the Render account and restrict access to the passphrase.
  Automated offsite copies will be configured with the later storage integration.

## Verify and restore

1. Download a backup and keep its passphrase in a password manager.
2. Run `npm run backup:verify -- /secure/path/file.mannabackup`. The CLI prompts
   without echoing the passphrase. For automation supply `MANNA_BACKUP_PASSPHRASE`
   from a secret manager; never put the passphrase in a command-line argument.
3. Restore into a **new empty database**, with a compatible application checkout.
   Supply `MANNA_RESTORE_DATABASE_URL`, `MANNA_BACKUP_PASSPHRASE`, and
   `MANNA_RESTORE_CONFIRM=EMPTY_DATABASE` through protected environment variables.
   Run `npm run backup:restore -- /secure/path/file.mannabackup`.
4. The restore refuses existing tables, writes in a transaction, and verifies the
   stored checksum before commit. It does not overwrite the production database.
5. Start an isolated POS using the restored database and verify invoice counts,
   payment/deposit ledgers, stock balances, PO images, and sample receipts. All
   users must sign in again; old sessions are intentionally absent.
6. Switch the service only after those checks. Keep the previous database intact
   until verification finishes. For recent production incidents prefer Render
   PITR into a separate instance, then validate before changing the connection.

CI runs a real PostgreSQL persistence/concurrency/restore test in an isolated
schema, the business regression suite, and an npm dependency audit. Weekly checks
run on Monday 07:25 WITA; they do not automatically modify dependencies or deploy.

## Images

R2 is deferred. `lib/media.js` is the upload/storage adapter. New PO/campaign
uploads are decoded, validated, re-encoded to WebP without metadata, and assigned
a checksum/reference. PO input stays limited to 2.5 MB; thumbnails to 1 MB before
optimization and 96 KB after. Animated, corrupt, mismatched and excessive-pixel
files are rejected. Decoding is serialized with a bounded queue to limit memory use. Existing images are not mass-migrated or deleted by this release.

## Release verification

Use a local/staging database for attack fixtures; never brute-force a production
account to test a cooldown. Verify security headers, origin/CSRF rejection,
logout/revocation, roles, lock/unlock, upload and printing workflows. Merge only
the tested tree, wait for Render `live`, then verify public health/static bytes
and deployment logs. Rotating the session secret signs every device out once.

## Owner PIN policy migration (2026-11-02)

Startup applies `owner-pin-policy-v1` once, under the business row lock. It saves
an atomic before-image in `app_state_backups`, removes obsolete forced-change
flags, and preserves current PINs unless an audited self-service PIN change can
be reversed safely. Recovery uses checksum-verified daily snapshots captured
between the last Owner assignment and the first subsequent self-service change.
Snapshot/user IDs and session-version increments must agree; unexplained changes
or missing/corrupt snapshots never trigger a guessed reset. A restored PIN
invalidates sessions issued under the changed credential. Orders, stock, payments,
customer balances and later Owner PIN assignments are preserved.

An unrecoverable self-service change keeps the current credential and marks the
user `pinRecoveryNeeded`; Owner sees a required PIN field and explanation in Edit
User. `ownerPinRecovery` health metadata contains only counts, never PINs/hashes.
The account settings screen has no PIN-change action, activity tracking, lock
overlay or inactivity timer. Removed lock APIs return 410 and the self-service
PIN API returns 403. Login throttling, CSRF, session revocation, uploads and backups
remain enabled.
