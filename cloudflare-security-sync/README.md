# cloudflare-security-sync

Cloudflare Worker that receives security sync dispatch requests from the Vercel cron route and enqueues one queue message per owner config.

## Endpoints

- `GET /health` - health check
- Cron trigger (`0 */6 * * *`) — queries enabled owners from DB and enqueues sync messages

## Queue

- Producer binding: `SYNC_QUEUE`
- Consumer queue: `security-sync-jobs` (`security-sync-jobs-dev` in dev)
- DLQ: `security-sync-jobs-dlq`

The consumer calls `syncOwner` which fetches Dependabot alerts from GitHub, upserts findings into the database, and prunes stale repos from the config.
