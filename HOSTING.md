# Hosting this live via GitHub

This app is a single Node.js server (it serves the frontend *and* the API),
so "hosting on GitHub" in practice means two steps:

1. **Push the code to GitHub** (for version control / source).
2. **Deploy it to a Node hosting platform that builds straight from your
   GitHub repo** — GitHub itself only hosts static files (GitHub Pages),
   which can't run our Express backend. Render, Railway, and Fly.io all
   offer free/cheap tiers that redeploy automatically every time you push.

Below is the Render.com path (free tier, no credit card required, easiest
to set up). Railway/Fly.io steps are nearly identical if you prefer those.

## 1. Push to GitHub

```bash
cd prompt-injection-lab
git init
git add .
git commit -m "Initial commit"
gh repo create prompt-injection-lab --public --source=. --push
# no GitHub CLI? create a repo on github.com instead, then:
# git remote add origin https://github.com/<you>/prompt-injection-lab.git
# git branch -M main
# git push -u origin main
```

`.env` is already git-ignored, so your `SESSION_SECRET` / `FLAG_SEED` won't
be committed — good, you'll set those directly on the hosting platform.

## 2. Deploy on Render

1. Go to [render.com](https://render.com) and sign up (GitHub login is fine).
2. **New → Web Service** → connect your GitHub account → select the
   `prompt-injection-lab` repo.
3. Configure the service:
   | Setting | Value |
   |---|---|
   | Root Directory | `backend` |
   | Environment | `Node` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | Free |
4. Add environment variables (Render's "Environment" tab):
   | Key | Value |
   |---|---|
   | `SESSION_SECRET` | any long random string |
   | `FLAG_SEED` | any long random string (this becomes your live deployment's unique flags) |
   | `NODE_ENV` | `production` |
5. Click **Create Web Service**. Render builds and starts it, and gives you
   a public URL like `https://prompt-injection-lab.onrender.com`.
6. That's it — open the URL, the dashboard and every lab work exactly like
   they did locally. Every future `git push` to `main` auto-redeploys.

> Free-tier Render services "sleep" after ~15 minutes of no traffic and take
> a few seconds to wake back up on the next request — fine for a training
> tool, just expect a short delay on the first request after idling.

## Alternative: Railway.app

Same idea, slightly different UI:

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. Set the root/service directory to `backend`.
3. Railway auto-detects `npm install` / `npm start` from `package.json`.
4. Add the same environment variables (`SESSION_SECRET`, `FLAG_SEED`, `NODE_ENV=production`).
5. Railway gives you a public URL under **Settings → Networking → Generate Domain**.

## Alternative: Fly.io

Fly needs a `Dockerfile` or uses its buildpacks; if you want this route, add
a minimal Dockerfile to `backend/`:

```dockerfile
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

Then:
```bash
fly launch    # from inside backend/, follow the prompts
fly secrets set SESSION_SECRET=... FLAG_SEED=... NODE_ENV=production
fly deploy
```

## Notes on running this "live" for a group

- Every visitor gets their own session cookie, so scores/progress/chat
  history don't collide between players — the in-memory scoreboard on the
  server is shared and public (`GET /api/scoreboard`).
- Because state lives in server memory (not a database), a redeploy or
  restart wipes everyone's progress and the scoreboard. That's fine for a
  short workshop/CTF; if you want progress to survive restarts, swap the
  in-memory `Map`/session store for something like SQLite or Redis — the
  rest of the app (routes, bot logic, frontend) doesn't need to change.
- Rotate `FLAG_SEED` before a public event if you'd previously shared flags
  from local testing, so nobody can reuse an old flag against the live copy.
