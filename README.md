# Manipulate-Google-Fit-Data

Google Fit Data Editor web app built with Next.js + Bun.

## Run locally

1. `cd apps/web`
2. Copy `.env.example` to `.env.local` and fill in Google OAuth values.
3. `bun run prisma:generate`
4. `bun run prisma:migrate --name init`
5. `bun run dev`
