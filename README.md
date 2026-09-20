# Lumi

Native Next.js talent desk. Turn a job link into a submitted application and an interview.

This is a rebuild of the previous Lumi auto-bid system: App Router first, deployable on Vercel, new UI.

## Run locally

```bat
cd lumi
copy .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open http://localhost:3000

| Username | Password | Desk |
|---|---|---|
| admin | LumiAdmin!26 | Full desk |
| bidder | LumiBidder!26 | Apply loop |
| manager | LumiManager!26 | Profiles |
| caller | LumiCaller!26 | Interviews |
| developer | LumiDev!26 | Roster |

Change these after first login. They are not the passwords from the old zip.

## Deploy on Vercel

1. Import the `lumi` folder as the project root.
2. Set `DATABASE_URL` to a Postgres URL and `JWT_SECRET` to a new secret.
3. Change `prisma/schema.prisma` `provider` from `sqlite` to `postgresql` before the first production migrate, or start a fresh Neon database and run `npx prisma migrate deploy`.
4. Build command: `prisma generate && next build`

SQLite is for local only. Vercel’s filesystem is ephemeral.

## What shipped

- Auth and five roles
- Candidate profiles and assignments
- Job links with optional page fetch
- Resume / answers package
- Applications, bid courses, interviews
- Demo inbox for OTP
- Extension-friendly APIs: `/api/auth/login`, `/api/auth/me`, `/api/user/profiles`, `/api/applications`

The Chrome extension from the previous project can be pointed at this origin once you add the new API base URL.
