# AIRA

AI-powered educational assistant for teachers. Super Admin uploads materials; teachers query via chat, library, and terminal.

## Local development

```bash
# Terminal 1 — Frontend
npm install
npm run dev

# Terminal 2 — Node API
cd server && npm install && npm run dev

# Terminal 3 — Python RAG service (optional, for real retrieval)
cd rag-service && pip install -r requirements.txt
cp .env.example .env   # add Qdrant Cloud credentials
npm run rag            # from repo root, or: python -m uvicorn main:app --port 8100
```

- App: http://localhost:3000
- API: http://localhost:8000
- RAG: http://localhost:8100/health

Copy `.env.local.example` → `.env.local`, `server/.env.example` → `server/.env`, and set `RAG_SERVICE_URL=http://localhost:8100` in `server/.env`.

## RAG service (`rag-service/`)

Python service: PDF → BGE-M3 embeddings → Qdrant, with Redis query cache.

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Service health |
| `POST /index` | Index uploaded PDF (multipart) |
| `POST /query` | Retrieve chunks for a question |
| `DELETE /books/{id}?school_id=` | Remove vectors for a book |

**Required env** (`rag-service/.env`):

| Variable | Notes |
|----------|-------|
| `QDRANT_CLOUD_URL` | From [Qdrant Cloud](https://cloud.qdrant.io) |
| `QDRANT_API_KEY` | Qdrant API key |
| `REDIS_URL` | Redis Cloud URL (`rediss://...`) — answer + retrieval cache |

The Node API calls this service via `RAG_SERVICE_URL`. Host locally, on **Railway** (recommended), or another Python host.

### Deploy on Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → `me-thanay/RAG-UI`
2. Open the service → **Settings** → **Root Directory** = `rag-service`
3. Railway uses `rag-service/Dockerfile` (CPU PyTorch + BGE-M3)
4. **Variables** (same as `rag-service/.env.example`):

| Variable | Required |
|----------|----------|
| `QDRANT_CLOUD_URL` | Yes |
| `QDRANT_API_KEY` | Yes |
| `QDRANT_USE_CLOUD` | `true` |
| `QDRANT_LEGACY_COLLECTION` | `grade6_computer_science` |
| `REDIS_URL` | Yes (same as API) |
| `RAG_API_KEY` | Optional (match Render `RAG_API_KEY`) |

5. **Settings** → **Networking** → **Generate domain** → copy URL
6. On Render API set `RAG_SERVICE_URL=https://your-rag.up.railway.app`
7. First deploy: build ~5–10 min (PyTorch). `/health` returns immediately; `model_loaded` becomes `true` after BGE-M3 loads.
8. **Resources**: allocate **4–8 GB RAM** for the service (Settings → Resources).

## Deploy on Vercel (frontend)

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. **Root directory:** `.` (project root)
4. **Framework:** Next.js (auto-detected)
5. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = your deployed backend API URL (e.g. `https://your-api.onrender.com`)

> **Note:** Vercel hosts the **Next.js frontend only**. Deploy the Node API in `server/` separately (Render, Railway, Fly.io, etc.) and point `NEXT_PUBLIC_API_URL` to it.

## Backend on Render

1. Create a **Web Service** at [render.com](https://render.com) from this repo.
2. **Root Directory:** `server`
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. **Health check path:** `/api/health`

Or use the included `render.yaml` blueprint (Render Dashboard → New → Blueprint).

### Environment variables (Render)

| Variable | Required | Notes |
|----------|----------|-------|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | Long random string |
| `CORS_ORIGINS` | Yes | Your Vercel URL, e.g. `https://rag-ui.vercel.app` |
| `SUPER_ADMIN_EMAIL` | Yes | First admin login email |
| `SUPER_ADMIN_PASSWORD` | Yes | First admin password |
| `AUTH_SKIP_PASSWORD` | Yes | Set to `false` in production |
| `REDIS_URL` | Yes | Redis Cloud public endpoint (`rediss://...`) |
| `RAG_SERVICE_URL` | No | Python RAG service URL (e.g. your PC via ngrok, or a separate host) |
| `RAG_API_KEY` | No | Shared secret if RAG service has `RAG_API_KEY` set |

`PORT` is set automatically by Render.

After deploy, copy the Render URL (e.g. `https://aira-api.onrender.com`) into Vercel as `NEXT_PUBLIC_API_URL`.

> **Uploads:** Render’s disk is ephemeral. PDFs in `server/uploads/` are lost on redeploy unless you add a [persistent disk](https://render.com/docs/disks) or move storage to S3 later.
