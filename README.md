# Repo Watcher

Watches one branch each on an external **frontend** repo and an external **backend** repo.
On every push it fetches the diff, sends it to Claude twice — once to *revise* that repo's
feature documentation, once to generate the QA test cases for the change — and stores the
results for two read-only React pages.

> **Two different things called "frontend" and "backend" live in this doc.** `apps/web` and
> `apps/server` are *this* tool's own code. The repos it monitors belong to a different
> project entirely and are configured at runtime on the Settings page.

## Status: scaffold

The skeleton is wired end to end and verified: webhook in → job queued → worker picks it up →
Mongo written → frontend renders it.

**The Claude calls are stubs.** `apps/worker/src/llm/client.ts` returns correctly-shaped
placeholder data and logs a loud `LLM STUB` warning instead of calling the API. Everything
around it is real. That file is the next thing to implement.

---

## Layout

```
apps/server      Express: health check, GitHub webhook, read API for the UI
apps/worker      BullMQ consumer: fetches diffs, calls the LLM (stubbed), writes to Mongo
apps/web         React + Vite: Features, Test Cases, Settings
packages/shared  Types shared by all three, plus the Mongoose models and schemas
```

npm workspaces. `packages/shared` has two entry points on purpose:

- `@watcher/shared` — types and constants only. This is what `apps/web` imports, so mongoose
  never reaches the browser bundle.
- `@watcher/shared/models` — the Mongoose models, imported by the server and worker only.
  They live here rather than in one app because both processes read and write the same
  collections and the schemas must not drift.

---

## Prerequisites

- **Node 18.17+** (works on 18; 20+ is fine)
- **MongoDB** and **Redis** running locally
- A **GitHub personal access token** with `repo` scope (for the compare API)

### Mongo and Redis

Docker is the quickest route:

```bash
docker run -d --name watcher-mongo -p 27017:27017 mongo:7
docker run -d --name watcher-redis -p 6379:6379 redis:7
```

Check both:

```bash
docker exec watcher-mongo mongosh --quiet --eval 'db.runCommand({ping:1})'
docker exec watcher-redis redis-cli ping     # -> PONG
```

If you'd rather install natively: `brew services start mongodb-community redis`, or on
Ubuntu `sudo apt install mongodb redis-server && sudo systemctl start mongod redis-server`.

---

## Setup

```bash
npm install                 # also builds packages/shared via postinstall
cp .env.example .env        # then edit it
```

Every secret comes from `.env` at the repo root — nothing is hardcoded and nothing has a
dev fallback. Both the server and worker load that one file. If a required variable is
missing the process refuses to boot and names it.

Generate the shared API token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put it in `API_TOKEN`, then paste the same value into the app's **Settings** page once the
UI is running — that's what authorises the browser against `/api`.

---

## Running

All three at once:

```bash
npm run dev
```

Or in separate terminals, which makes the logs much easier to follow:

```bash
npm run dev:server     # http://localhost:4000
npm run dev:worker     # no HTTP port; watches the queue
npm run dev:web        # http://localhost:5173
```

Sanity check:

```bash
curl -s localhost:4000/health
# {"ok":true,"mongo":"connected","redis":"connected",...}
```

The Vite dev server proxies `/api` and `/health` to the API, so there's no CORS config and
no API URL in the frontend. Point it elsewhere with `VITE_API_PROXY_TARGET`.

For production: `npm run build`, then `npm start -w @watcher/server` and
`npm start -w @watcher/worker`, and serve `apps/web/dist` as static files.

---

## Testing against a real GitHub repo with ngrok

GitHub needs a public URL to deliver webhooks to. `ngrok` gives you one.

**1. Expose the API server** (the server, not the Vite dev server):

```bash
ngrok http 4000
```

Copy the `https://` forwarding URL, e.g. `https://a1b2-34-56.ngrok-free.app`. The free tier
issues a new URL every restart — you'll have to update the webhook each time.

**2. Pick a webhook secret** and keep it handy:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

**3. Register the repo in the app.** Open http://localhost:5173 → Settings → paste your
`API_TOKEN`, then add the repo:

| Field          | Value                                             |
| -------------- | ------------------------------------------------- |
| Repo URL       | `https://github.com/your-org/your-frontend-repo`   |
| Target branch  | the one branch to watch, e.g. `develop`            |
| Type           | `frontend` or `backend`                            |
| Webhook secret | the secret from step 2                             |

Leave the secret blank to fall back to `GITHUB_WEBHOOK_SECRET` from `.env` — handy when both
repos share one secret.

**4. Add the webhook on GitHub.** Repo → Settings → Webhooks → Add webhook:

- **Payload URL**: `https://<your-ngrok-subdomain>.ngrok-free.app/webhooks/github`
- **Content type**: either works — `application/json` or GitHub's default `application/x-www-form-urlencoded`
- **Secret**: the same secret
- **Events**: *Just the push event*

GitHub immediately sends a `ping`, which should come back `200 {"ok":true,"pong":true}` under
*Recent Deliveries*.

**5. Push to the watched branch** and follow the logs. The server logs `push enqueued`, then
the worker logs `job started` → `diff fetched` → `LLM STUB` → `job succeeded`. Refresh the
Features and Test Cases pages.

### Reading the webhook responses

The endpoint answers in a few milliseconds and always tells you what it decided:

| Response                                | Meaning                                              |
| --------------------------------------- | ---------------------------------------------------- |
| `200 {"deduped":false}`                 | Accepted and queued                                   |
| `200 {"deduped":true}`                  | Already seen this commit; ignored                     |
| `202 {"ignored":"branch_not_watched"}`  | Push was to some other branch                         |
| `401 {"error":"invalid_signature"}`     | The secret in GitHub doesn't match the one this app has   |
| `404 {"error":"repo_not_configured"}`   | No RepoConfig for that repo — add it on Settings      |

### Testing without ngrok

You can fake a delivery locally. The signature is an HMAC of the **exact bytes** of the body:

```bash
BODY='{"ref":"refs/heads/main","before":"1111111111111111111111111111111111111111","after":"2222222222222222222222222222222222222222","repository":{"full_name":"your-org/your-repo"}}'
SECRET='your-webhook-secret'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.*= //')"

curl -X POST localhost:4000/webhooks/github \
  -H 'content-type: application/json' \
  -H 'x-github-event: push' \
  -H "x-hub-signature-256: $SIG" \
  -d "$BODY"
```

The worker will then try to reach the real GitHub compare API for those SHAs, so use a repo
and commits that actually exist — or point `GITHUB_API_BASE` at a local stub.

---

## How it fits together

```
GitHub push
    │
    ▼
POST /webhooks/github          apps/server/src/routes/webhook.ts
    │  verify HMAC signature (against the raw body)
    │  match branch against RepoConfig.targetBranch
    │  enqueue, return 200          ← always a few ms; no network calls
    ▼
BullMQ "repo-push" queue (Redis)
    │
    ▼
Worker                          apps/worker/src/processor.ts
    │  claim (repo + SHA) for idempotency
    │  GET /repos/:owner/:name/compare/:before...:after
    │  updateFeatureDoc(currentContent, diff)   ← STUB
    │  generateTestCases(doc, diff)             ← STUB
    │  upsert FeatureDoc, insert TestCases
    ▼
MongoDB ──► GET /api/features, /api/test-cases ──► React
```

### The bits worth knowing

**The webhook never blocks.** It only verifies, filters and enqueues. Diff fetching and LLM
calls happen in the worker, so a slow model can't cause GitHub to time out and retry.

**Idempotency has two layers.** The BullMQ job id is `repo@sha`, so a redelivery is dropped
at enqueue. That only holds while the job is retained in Redis, so the worker also claims
`(repoFullName, commitSha)` in the `processed_events` collection behind a unique index
before doing any work. A *succeeded* claim is permanent; a *failed* one, or one left stuck
by a crashed worker, can be reclaimed so genuine retries still go through.

**Feature docs are revised, never regenerated.** The worker reads the stored `FeatureDoc`
and passes it to the model *alongside* the diff. `FeatureDocUpdateInput.currentContent` is a
required field precisely so this can't be forgotten — regenerating from a diff alone would
silently drop every feature that push didn't touch. Each revision pushes the previous content
onto `history` (capped at the last 50, so the document can't approach Mongo's 16MB limit).

**Auth.** Everything under `/api` requires the shared token, compared in constant time, via
`Authorization: Bearer <token>` or `x-api-token`. `/health` is open for probes.
`/webhooks/github` is open because GitHub authenticates with the HMAC signature instead —
and it's mounted *before* `express.json()` so it still has the raw body to verify.

**Logging.** Structured JSON via pino (pretty-printed in dev): webhook receipt and decision,
job start/success/failure with repo and SHA, and LLM outcomes. Signature and token headers
are redacted.

---

## Data model

| Collection         | Shape                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `repo_configs`     | repo URL, `owner/name`, target branch, type, enabled, webhook secret (`select: false` — never leaves the DB)     |
| `feature_docs`     | one per repo: markdown `content`, `lastCommitSha`, `revisionCount`, `history[]`                                  |
| `test_cases`       | title, steps, expected result, status, kind, priority, area, repo, commit SHA, timestamps                        |
| `processed_events` | idempotency ledger, unique on `(repoFullName, commitSha)`                                                        |

## API

| Method   | Path                   | Auth   | Notes                                       |
| -------- | ---------------------- | ------ | ------------------------------------------- |
| `GET`    | `/health`              | none   | Mongo + Redis status                        |
| `POST`   | `/webhooks/github`     | HMAC   | Push events only                            |
| `GET`    | `/api/repos`           | token  |                                             |
| `POST`   | `/api/repos`           | token  | Accepts a URL, ssh remote or `owner/name`   |
| `PATCH`  | `/api/repos/:id`       | token  | Omit `webhookSecret` to keep the stored one |
| `DELETE` | `/api/repos/:id`       | token  |                                             |
| `GET`    | `/api/features`        | token  | `?repo=owner/name`                          |
| `GET`    | `/api/features/:id`    | token  | Includes full history                       |
| `GET`    | `/api/test-cases`      | token  | `?repo=&status=&commitSha=&limit=`          |
| `PATCH`  | `/api/test-cases/:id`  | token  | `{"status":"new"\|"in_progress"\|"done"}`   |

---

## Next: implementing the LLM calls

In `apps/worker/src/llm/client.ts`:

```bash
npm i @anthropic-ai/sdk -w @watcher/worker
```

Two contracts to keep:

1. `updateFeatureDoc` **must** put `input.currentContent` in the prompt next to the diff and
   ask for a revision of it.
2. `generateTestCases` should request structured JSON matching `GeneratedTestCase[]` (a tool
   call is the reliable way) and validate it with zod before it reaches Mongo.

The processor, models, retries and idempotency don't need to change.

## Troubleshooting

| Symptom                                 | Cause                                                                 |
| --------------------------------------- | --------------------------------------------------------------------- |
| `invalid_signature` on every delivery    | The GitHub webhook secret differs from `GITHUB_WEBHOOK_SECRET` (or the per-repo secret set on Settings, which wins when present) |
| Boot fails naming a variable             | Missing from `.env` — by design, there are no fallbacks                |
| Webhook 200s but nothing appears         | The worker isn't running, or `REDIS_URL` differs between the two       |
| `GitHub 404` in the worker logs          | `GITHUB_TOKEN` can't see that repo (private repos need `repo` scope)   |
| Pushing again does nothing               | Same commit SHA, so it deduped — check `processed_events`              |
| UI shows "No API token set"              | Paste `API_TOKEN` on the Settings page                                 |
