# Gmail Push - Cloudflare Worker

Receives Gmail push notifications from Google Cloud Pub/Sub and forwards them to the user's kiloclaw bot controller, waking the bot's main session when new emails arrive.

## Architecture

```
Gmail API → Pub/Sub topic → Push subscription → this worker
  → service binding → kiloclaw DO (status + gateway token lookup)
  → fly-force-instance-id → controller /_kilo/gmail-pubsub
  → gog gmail watch serve (localhost:3002)
```

## Authentication

Push requests are authenticated via **Google OIDC JWT** (mandatory). The Pub/Sub subscription is configured with `--push-auth-service-account` and `--push-auth-token-audience`, so Google signs every push request with a JWT. The worker validates the token against Google's JWKS, checking issuer, audience, email claim, and email_verified.

## API Endpoints

| Endpoint             | Method | Auth     | Description          |
| -------------------- | ------ | -------- | -------------------- |
| `/health`            | GET    | None     | Health check         |
| `/push/user/:userId` | POST   | OIDC JWT | Receive Pub/Sub push |

## Development

### Local Secrets Setup

Copy `.dev.vars.example` to `.dev.vars` and fill in the secret values:

```bash
cp .dev.vars.example .dev.vars
```

### Running Tests

```bash
pnpm test
```

### Linting & Type Checking

```bash
pnpm lint
pnpm typecheck
```

### Local E2E Testing

Requires: kiloclaw worker running locally, a provisioned bot on Fly with the gmail-push controller image, and a Cloudflare Tunnel for public ingress.

**Terminal 1** - Run kiloclaw worker locally:

```bash
cd kiloclaw && wrangler dev --env dev
```

**Terminal 2** - Run this worker locally (service binding auto-discovers local kiloclaw):

```bash
cd cloudflare-gmail-push && wrangler dev --env dev
```

**Terminal 3** - Expose via CF tunnel:

```bash
cloudflared tunnel --url http://localhost:8787
```

**Push the controller image** (needed for the Fly machine to have the gmail-push route):

```bash
cd kiloclaw && ./scripts/push-dev.sh kiloclaw-machines-dev
```

**Connect Google account** with Pub/Sub setup by passing this env var to the setup container:

```bash
GMAIL_PUSH_WORKER_URL=https://<tunnel-hostname>.trycloudflare.com
```

Then enable notifications in the Settings UI and send an email to the connected Gmail account.

### Quick Smoke Test (no Pub/Sub needed)

Curl the local worker directly (OIDC validation is skipped in local dev when no auth header is present):

```bash
curl -X POST "http://localhost:8787/push/user/<your-user-id>" \
  -H 'Content-Type: application/json' \
  -d '{"message":{"data":"eyJoaXN0b3J5SWQiOjEyMzR9","messageId":"test-123"}}'
```

Expected: `{"ok":true}` if the bot is running, `{"ok":true,"skipped":"machine-not-running"}` if not.

### Tunnel URL changes

If you restart `cloudflared`, update the Pub/Sub subscription to point to the new URL:

```bash
gcloud pubsub subscriptions update gog-gmail-push \
  --push-endpoint="https://<new-tunnel>.trycloudflare.com/push/user/<userId>"
```

Use a named tunnel with a stable hostname to avoid this.

## Deployment

### Development

```bash
wrangler deploy --env dev
```

Deploys to: `cloudflare-gmail-push-dev`

### Production

```bash
wrangler deploy
```

Deploys to: `cloudflare-gmail-push`

## Secrets (via Secrets Store)

| Secret                | Description                            |
| --------------------- | -------------------------------------- |
| `INTERNAL_API_SECRET` | Shared secret for service binding auth |

## Environment Variables

| Variable        | Description                                     |
| --------------- | ----------------------------------------------- |
| `OIDC_AUDIENCE` | Expected audience claim for OIDC JWT validation |

## Service Bindings

| Binding    | Target Worker  | Environment |
| ---------- | -------------- | ----------- |
| `KILOCLAW` | `kiloclaw`     | Production  |
| `KILOCLAW` | `kiloclaw-dev` | Development |
