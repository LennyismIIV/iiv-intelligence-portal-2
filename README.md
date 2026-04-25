# IIV Intelligence Portal

A real-time portfolio intelligence portal for **Insight Innovation Ventures**. Search, compare, and evaluate companies across 8 strategic lenses — IIC, Thesis Fit, Competitive, Market, GRIT, Diligence, AI-Native Efficiency, and Valuation.

- **Stack:** React + Vite + Tailwind + shadcn/ui (frontend) · Express + Drizzle ORM + SQLite (backend)
- **Branding:** dark navy `#032958`, primary blue `#3b82f6`, Inter typography
- **Seed data:** 289 companies from the IIV portfolio bundled in `data.db`

---

## Deploying to Render (recommended path)

You'll do this once. Roughly 5 minutes of clicking after the GitHub push.

### 1. Push this repo to GitHub

```bash
# from inside the unzipped project folder
git init
git add .
git commit -m "Initial commit: IIV Intelligence Portal"
git branch -M main
git remote add origin https://github.com/<your-user>/iiv-intelligence-portal.git
git push -u origin main
```

> The seed database file `data.db` **is** committed on purpose so the first deploy comes up with all 289 companies populated. After the first boot on Render, the live database lives on the persistent disk at `/data/iiv.db` and is no longer affected by what's in git.

### 2. Connect to Render via Blueprint

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint**
2. Connect your GitHub account if you haven't, then select the `iiv-intelligence-portal` repo
3. Render reads `render.yaml` and proposes:
   - One web service (`iiv-intelligence-portal`) on the **Starter** plan
   - One 1 GB persistent disk (`iiv-data`) mounted at `/data`
   - Build: `npm install && npm run build`
   - Start: `npm start`
   - Env vars: `NODE_ENV=production`, `DB_PATH=/data/iiv.db`, `NODE_VERSION=20.18.0`
4. Click **Apply**. First build takes ~3–5 minutes.

When the build finishes, Render gives you a URL like `https://iiv-intelligence-portal.onrender.com`. That's your live portal.

### 3. (Optional) Custom domain

In the Render dashboard → your service → **Settings → Custom Domains**, add `portal.insight-innovation.vc` (or whatever you choose) and follow the DNS instructions.

---

## How the database works on Render

| Where                | What lives there                                      |
| -------------------- | ----------------------------------------------------- |
| `data.db` in the repo | The committed seed file (289 companies). Never touched on Render at runtime. |
| `/data/iiv.db` on the persistent disk | The live database the running app reads/writes to. |

**On the very first boot,** the server detects that `/data/iiv.db` doesn't exist yet and copies the seed `data.db` into the persistent disk. Every boot after that uses the live disk file directly — so any companies you add, scores you record, or edits you make through the UI persist across redeploys, restarts, and code pushes.

If you ever want to **reset** the live database back to the seed, SSH into the Render service shell and run:

```bash
rm /data/iiv.db && exit
```

Then trigger a manual redeploy. The next boot will reseed from the bundled `data.db`.

---

## Local development

Requires Node.js 20+.

```bash
npm install
npm run dev          # starts Express + Vite together on http://localhost:5000
```

To run the production build locally:

```bash
npm run build
npm start            # http://localhost:5000
```

The default `DB_PATH` is `./data.db` (relative to the project root) — same file that's committed and used as the seed.

---

## Project structure

```
client/              React frontend
  src/pages/         Route-level pages (Dashboard, Companies, Evaluations, Compare, Search, ...)
  src/components/    Reusable UI (AppSidebar, LensSelector, AddCompanyDialog, ...)
server/              Express backend
  index.ts           Entry point — listens on $PORT
  routes.ts          API routes (mounted under /api)
  storage.ts         Drizzle ORM data access + DB initialization
shared/
  schema.ts          Drizzle table definitions, Zod insert schemas, shared types
data.db              Seed SQLite database (289 companies)
render.yaml          Render Blueprint — service, disk, env vars
```

---

## Plan & cost notes

- **Render Starter ($7/mo)** is what `render.yaml` requests. Always-on, supports the persistent disk that SQLite needs.
- **Render Free** would spin down after 15 minutes of inactivity AND does **not** support persistent disks — so the database would be wiped on every restart. Don't use Free for this app.
- **Disk size:** 1 GB is far more than the SQLite file will need. You can shrink to the minimum on first apply if you want; expanding later is one click.

---

## Updating the deployed site

Any push to `main` triggers an automatic redeploy on Render (because `autoDeploy: true` is set in `render.yaml`). Workflow:

```bash
# make changes locally
git add .
git commit -m "Add momentum lens dimensions"
git push
```

Render detects the push, runs `npm install && npm run build`, restarts the service. Your live database on `/data/iiv.db` is untouched.

---

## Troubleshooting

**"no such table: evaluation_scores"** — shouldn't happen (the server creates these tables idempotently on startup), but if it does, restart the service from the Render dashboard.

**Build fails with `better-sqlite3` native module error** — usually a Node version mismatch. Make sure `NODE_VERSION` is `20.x` in Render env vars (already set in `render.yaml`).

**Port binding error** — make sure you haven't set `REUSE_PORT=true` on Render; that flag is for specific Linux multi-process setups and isn't supported on most cloud hosts.

**Database changes not persisting between deploys** — check that the disk is actually mounted: Render dashboard → service → **Disks**. You should see `iiv-data` mounted at `/data`. If `DB_PATH` env var doesn't point inside that mount path, data lives on the ephemeral filesystem and gets wiped.

---

Built for Lenny Murphy / Insight Innovation Ventures.
