# Manipulate Google Fit Data

A local web app (**Next.js**, **Bun**) that connects to your Google account, **previews** synthetic daily step totals for a date range, then **writes** them to Google Fit via the [Fitness REST API](https://developers.google.com/fit/rest). It stores an encrypted refresh token and job history in **SQLite** (Prisma) so you can **revert** a run using saved snapshots.

**Warning:** This tool changes health data in your Google account. Use a test Google account or small date ranges first. Read the risks in [Safety](#safety) before using it.

---

## What you need

| Requirement | Notes |
|-------------|--------|
| [Bun](https://bun.sh) | Runtime and package manager (`bun --version`). |
| Google account | The account whose Fit data you want to edit. |
| [Google Cloud](https://console.cloud.google.com/) project | You create OAuth credentials and enable APIs here. |

---

## Google Cloud setup (one-time)

Do this in the [Google Cloud Console](https://console.cloud.google.com/).

### 1. Create or select a project

Use an existing project or **Create project** and pick a name (e.g. `g-fit-data`).

### 2. Enable the Fitness API

1. Open **APIs & Services** → **Library**:  
   [https://console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)
2. Search for **Fitness API**.
3. Open it and click **Enable**.

### 3. OAuth consent screen

1. Go to **APIs & Services** → **OAuth consent screen**:  
   [https://console.cloud.google.com/apis/credentials/consent](https://console.cloud.google.com/apis/credentials/consent)
2. Choose **External** (typical for personal use) unless you use Workspace internal only.
3. Fill **App name**, **User support email**, **Developer contact email**.
4. Under **Scopes**, click **Add or remove scopes** and include at least:

   | Scope | Purpose |
   |-------|--------|
   | `openid` | OpenID Connect |
   | `.../auth/userinfo.email` | Know your email after sign-in |
   | `.../auth/userinfo.profile` | Basic profile |
   | `.../auth/fitness.activity.read` | Read step aggregates for preview |
   | `.../auth/fitness.activity.write` | Create a writable data source and patch step datasets |

   You can search for “Fitness” and “userinfo” in the scope picker.

5. If the app is in **Testing**, add your Google account under **Test users** so you can sign in.

### 4. OAuth 2.0 Client ID (Web application)

1. Go to **APIs & Services** → **Credentials**:  
   [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. **Create credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. **Authorized redirect URIs** — add exactly (for local dev):

   `http://localhost:3000/api/auth/google/callback`

5. **Authorized JavaScript origins** (recommended for local dev):

   `http://localhost:3000`

6. Create the client and copy the **Client ID** and **Client secret**.

### 5. Production / other hosts

If you deploy elsewhere, add that origin and redirect URI (must match the app’s `APP_BASE_URL` and `GOOGLE_OAUTH_REDIRECT_URL` exactly, including `http` vs `https` and path).

---

## Environment variables

In **`apps/web`**, copy the example file and edit it:

```bash
cd apps/web
copy .env.example .env.local
```

On macOS/Linux: `cp .env.example .env.local`

### Required variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite file for Prisma. Default: `file:./prisma/dev.db` (relative to `apps/web`). |
| `GOOGLE_CLIENT_ID` | OAuth **Web client** ID from Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | OAuth **Client secret**. |
| `GOOGLE_OAUTH_REDIRECT_URL` | Must match the redirect URI in Cloud Console, e.g. `http://localhost:3000/api/auth/google/callback`. |
| `APP_BASE_URL` | Public base URL of the app, e.g. `http://localhost:3000`. |
| `APP_ENCRYPTION_KEY` | At least **32 characters**; used to encrypt the Google refresh token at rest. Generate a random string (do not commit real keys). |

### Optional

| Variable | Description |
|----------|-------------|
| `FIT_MAX_RANGE_DAYS` | Max **inclusive** days for preview/apply (default **1095**, hard cap **3650**). |

See [`apps/web/.env.example`](apps/web/.env.example) for a template.

---

## Install and run

### Option A — scripts from the repo root

**Windows**

```bat
run.bat
```

**macOS / Linux** (make executable once: `chmod +x run.sh`)

```bash
./run.sh
```

These scripts `cd` into `apps/web`, sync `.env.local` → `.env` (so Prisma CLI sees `DATABASE_URL`), run `bun install`, `prisma generate`, `prisma migrate deploy`, then `bun run dev`.

### Option B — manual commands

```bash
cd apps/web
bun install
bun run prisma:generate
bunx prisma migrate deploy
bun run dev
```

Open **http://localhost:3000**.

To create a **new** migration after changing `prisma/schema.prisma`, use `bun run prisma:migrate` (runs `prisma migrate dev` interactively). For a normal clone, `migrate deploy` is enough.

---

## Using the app

1. **Connect Google account** — Completes OAuth; the app stores an encrypted refresh token.
2. Set **startDate** and **endDate** (inclusive, `YYYY-MM-DD`).
3. Configure **global** min/max steps and **weekday** / **weekend** bands, **variance**, **randomSeed**, optional **monthlyPattern** and **customDailyOverrides** (JSON object of date → steps).
4. Click **Dry-run Preview** — Shows per-day **Old** (from Fit aggregate read), **New** (generated), **Delta**.
5. If the preview looks right, click **Apply Overwrite** — Writes daily `com.google.step_count.delta` points to a **raw data source** created for this app (not Google’s internal “estimated steps” stream).
6. **History / Revert** — Completed apply jobs can be reverted from stored snapshots when available.

### Understanding “Old” = 0

If **Old** is often **0**, Google’s aggregate for that day returned no step total (no data or not visible to the API). The app still proposes **New** values; applying will add data from this app’s source. If you expected real steps, check Fit on your phone and that **read** scope and API access are correct.

### Weekend vs global min

If **weekend** min/max are **below** `globalMinSteps`, the generator maps weekends into a lower slice of the global range so values do not all clamp to the same number. For predictable “lighter weekends”, set weekend min/max so they overlap your global range (e.g. weekend `5000–7000` with global `5000–12000`).

---

## Safety

- **Health data** — Overwriting or adding steps affects records that may sync to other apps or services.
- **Secrets** — Never commit `.env`, `.env.local`, or `client_secret*.json`. Rotate OAuth client secrets if they leak.
- **Scope** — Prefer **short date ranges** first; very large ranges are slower and hit API limits (the app chunks aggregate reads).
- **Revert** — Use **Revert** on a job only when you trust the snapshot; test on a throwaway account first.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| OAuth redirect mismatch | Redirect URI in Cloud Console must match `GOOGLE_OAUTH_REDIRECT_URL` character-for-character. |
| `oauth_failed` / profile errors | Add `openid`, email, profile, and Fitness read/write scopes; add yourself as a **Test user**; disconnect and sign in again. |
| `Cannot read data of type com.google.step_count.delta` | Ensure **`fitness.activity.read`** is granted (and in consent screen). Reconnect. |
| `aggregate duration too large` | The app reads in chunks; if it still fails, shorten the range or increase chunking in code. |
| `Unable to fetch DataSource` for derived GMS stream | Fixed in current code by creating a **raw** app data source; use latest `client.ts` and retry **Apply**. |
| Prisma / database errors | Run commands from **`apps/web`** so `DATABASE_URL` points at `prisma/dev.db`. Ensure `bun run prisma:generate` and migrations ran. |

---

## Project layout (high level)

- **`apps/web`** — Next.js App Router UI and API routes (`/api/auth/*`, `/api/fit/*`, `/api/jobs/*`).
- **`apps/web/prisma`** — SQLite schema and migrations.
- **`run.bat` / `run.sh`** — Local dev bootstrap from repo root.

---

## License

See [LICENSE](LICENSE) in the repository.
