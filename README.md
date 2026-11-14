# FlytBase Questathon CRM

A Next.js dashboard for account intelligence, evidence, renewal risks, live signals, and customer notes. It reads account and paperwork data from the Questathon MCP service, keeps claims separate from verified values, and links recommendations back to source records.

## Requirements

- Node.js 20 or newer
- npm
- A Questathon personal access token for MCP requests

The app can store data in local JSON files for development. For a deployed or shared instance, configure an Upstash Redis REST database.

## Setup

```powershell
npm install
Copy-Item .env.example .env.local
```

Open `.env.local` and set `AQ_TOKEN` to your Questathon personal token. Set `SYNC_SECRET` to a private random value used to protect the sync endpoint. Keep `.env.local` private; it is excluded from Git.

Optional Upstash settings (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or Vercel Marketplace's `KV_REST_API_URL` and `KV_REST_API_TOKEN`) enable Redis-backed storage. If both are omitted, the app writes its local runtime data under `data/`, which is ignored by Git.

## Run locally

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If port 3000 is already in use, stop the other development server or use the port printed by Next.js. Avoid running two development servers for this checkout at once because both use the same `.next` build directory.

## Initial data sync

The dashboard needs stored account data. To fetch a quick account probe:

```powershell
npm run probe
```

For the initial data sync, keep the app running, then in another terminal run:

```powershell
npm run sync
```

The sync endpoint uses `SYNC_SECRET` and loads account, schema, notes, paperwork, and signal data. MCP calls are rate limited, so the first sync can take several minutes. The Notes page only enables sending after the sync stores the allowed note kinds. Sending a note writes it to FlytBase; drafts remain local until you confirm sending in the app.

To sync against a different local app URL, set `SYNC_BASE_URL` in `.env.local` (for example, `http://localhost:3001`).

## Pages

- **Dashboard** (`/`): account summaries and prioritized actions
- **Account detail** (`/accounts/A`, `/accounts/B`): pipeline, renewal health, risks, stakeholders, and signals
- **Actions** (`/actions`): proposed next steps with evidence links
- **Evidence** (`/evidence`): stored source records
- **Notes** (`/notes`): save local drafts and send supported note kinds
- **Debug** (`/debug`): data and service diagnostics

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Build the production app |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest test suite |
| `npm run probe` | Fetch and save the account probe response |
| `npm run sync` | Call the protected initial sync endpoint |
| `npm run intel:summary` | Print an intelligence summary from stored data |
| `npm run audit:security` | Scan the configured token against source, `.next`, and Git history |
| `npm run smoke -- <url>` | Smoke-test a deployment without sending notes or starting sync |

## VS Code MCP connection

The workspace MCP configuration prompts for the Questathon token at connection time. Enter the token in the prompt; do not replace the placeholder in `.vscode/mcp.json` with a literal token.

## Deploy to Vercel

### Checklist

1. In Vercel, choose **Add New → Project**, import `madhuswapnika23/flyt-CRM`, and keep the detected Next.js framework and repository root.
2. From the project’s **Storage** or Marketplace page, add an Upstash Redis database and connect it to this project. The app accepts either `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` or Vercel Marketplace's `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
3. In **Settings → Environment Variables**, add `AQ_TOKEN`, `SYNC_SECRET`, and whichever Redis variable pair the integration provides: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` or legacy `KV_REST_API_URL` / `KV_REST_API_TOKEN`. Add them for Production, and to Preview only if previews need real Questathon data. Keep them server-side; never prefix them with `NEXT_PUBLIC_`.
4. Deploy. If you changed environment variables after the first deployment, redeploy so the new deployment receives them.
5. Before syncing, run `npm run audit:security` locally to check that the configured token is absent from source, build output, and Git history.
6. Run the first sync against the deployed protected route from a trusted terminal where `SYNC_SECRET` is available locally:

   ```powershell
   npm run sync -- https://your-project.vercel.app
   ```

   The script sends the secret in the `x-sync-secret` request header and resumes after each MCP rate-limit window. Each request checkpoints fetched data in Upstash, so the sync can continue across Vercel function invocations and data remains available across deployments.
7. Run the deployment smoke check from a trusted terminal with `AQ_TOKEN` available locally (for example, in `.env.local`):

   ```powershell
   npm run smoke -- https://your-project.vercel.app
   ```

   It checks every page, the read APIs, evidence lookup, the expected guards on write routes, and response bodies/headers for the token string. It does not write a note, acknowledge a signal, or start a sync.
8. Open the deployment in an incognito/private window. Check the dashboard and account pages, `/api/health` (`redisConfigured` should be `true`), Notes, and the sync result. A refresh or new deployment should retain synced data.

The `/api/sync` route requires `x-sync-secret` and is not callable without `SYNC_SECRET`. The route stops on MCP rate limits and returns a `Retry-After` response instead of sleeping through multiple windows inside one serverless invocation. The `vercel.json` function duration setting is 300 seconds; the sync flow is designed so an invocation only performs the next available MCP call.

**Access control:** the app does not currently implement user sign-in. Its pages and read APIs are public at the deployment URL. Before putting non-public customer records on a public deployment, enable Vercel Deployment Protection or add application authentication.

## Security and local data

- Never commit `.env.local`, API tokens, or sync secrets.
- Runtime records under `data/` may contain customer or draft-note content and are ignored by Git.
- Rotate any token that has been pasted into a shared file or published repository.
