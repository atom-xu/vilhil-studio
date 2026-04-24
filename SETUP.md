# VilHil Studio — Setup

## Prerequisites

- [Bun](https://bun.sh/) 1.3+
- A [Supabase](https://supabase.com/) project (free tier works)

## Quick Start

```bash
bun install
cp .env.example .env.local   # fill in required vars (see below)
bun dev
```

The editor will be running at **http://localhost:3000**.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values.

### Required

| Variable | Description |
|----------|-------------|
| `POSTGRES_URL` | PostgreSQL connection string — use Supabase Transaction Pooler URL (port 6543) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (Settings → API → service_role) |
| `BETTER_AUTH_SECRET` | Random secret for session signing — generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | — | Enables address search in the editor |
| `RESEND_API_KEY` | — | Email delivery for password reset / verification |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Base URL for auth callbacks and share link generation |
| `PORT` | `3000` | Dev server port |

### Supabase setup (one-time)

1. Create a new project at [supabase.com](https://supabase.com).
2. Run the Drizzle migration to create tables:
   ```bash
   bun run db:push
   ```
3. Copy the **Transaction Pooler** connection string from Settings → Database → Connection string (port 6543, not 5432).

---

## Monorepo Structure

```
vilhil-studio/
├── apps/
│   └── editor/              # Next.js 16 app (editor + proposal UI + API routes)
├── packages/
│   ├── core/                # @pascal-app/core — schemas, scene state, systems
│   ├── viewer/              # @pascal-app/viewer — 3D rendering
│   ├── smarthome/           # @vilhil/smarthome — device catalog + tools
│   └── editor/              # @pascal-app/editor — shared editor UI components
└── tooling/                 # TypeScript config, ESLint config
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start the development server (Turbopack) |
| `bun build` | Build all packages |
| `bun check` | Lint and format check (Biome) |
| `bun check:fix` | Auto-fix lint and format issues |
| `bun check-types` | TypeScript type checking |
| `bun run db:push` | Push Drizzle schema to database |

### Note on `bun dev`

`bun dev` starts **only the Next.js dev server** via Turbopack. Packages are compiled from source through `transpilePackages` in `next.config.ts` — there are no separate `tsc --watch` processes. This keeps memory usage low and avoids competing file watchers.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on submitting PRs and reporting issues.
