# AI Assisted Apply

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-ai--assissted--apply-181717?logo=github)](https://github.com/fkvivid/ai-assissted-apply)

Open-source web app to **tailor your resume to a specific job**. The API talks to an **OpenAI-compatible** LLM endpoint (configured for **[Vercel AI Gateway](https://vercel.com/docs/ai-gateway)** by default). The **Home** page takes a **job description**; **Settings** stores your **resume**, **LaTeX template** preferences, and **AI instructions** in the browser (`localStorage`). You can **pick a model** from the gateway catalog, run **missing-keyword** hints, generate **cover letter / extra application text**, and after each resume generation get a **job-fit scorecard** (original vs tailored vs posting). Then **copy LaTeX**, **download a PDF** (server runs `pdflatex` or **Tectonic** when installed), or **download the `.tex`** source.

**Repository:** [github.com/fkvivid/ai-assissted-apply](https://github.com/fkvivid/ai-assissted-apply) · **Feedback / issues:** [GitHub Issues](https://github.com/fkvivid/ai-assissted-apply/issues)

**Stack:** React (Vite) + Tailwind CSS + React Router · FastAPI · OpenAI-compatible Chat Completions (via gateway `base_url`).

> **Disclaimer:** You are responsible for the accuracy of your applications. The model must not invent facts — review every line before you submit.

## Features

- **Home:** job description → tailored LaTeX (redirects to **Settings** until a resume is saved)
- **Model picker:** loads models from the gateway; default UI model **`gpt-5.4`** (override with **`AI_DEFAULT_MODEL`** on the server)
- **Missing keywords:** optional scan vs your saved resume
- **Output workspace:** LaTeX + PDF preview, extra tabs for application text (cover letter, etc.)
- **Job fit overview:** after each successful resume generation, optional scoring vs the posting (same selected model)
- **Settings:** original resume, default or custom LaTeX template, AI instructions (persisted locally)
- **Theme:** under **Settings → Appearance** — System (default), Light, or Dark — stored in the browser; follows OS dark mode when set to System
- **About** (`/about`): motivation for the project, not a sales pitch
- **History / apply journal:** optional — set **`MONGODB_URI`** on the API to persist entries; without it, generation and the rest of the app still work
- Default LaTeX template served by the API (Charter-style) or paste your own
- Footer links to **About** and **Feedback** (GitHub Issues)

## Prerequisites

- **Node.js** 20+ (frontend)
- **Python** 3.11+ (API)
- An **LLM API key** on the server (**`AI_GATEWAY_API_KEY`** for the default gateway setup — see [backend/.env.example](./backend/.env.example))
- **Optional — PDF:** **`pdflatex`** on your `PATH`, **or** run the API in **Docker** with the **[`pandoc/latex`](https://hub.docker.com/r/pandoc/latex)**-based image, **or** set **`PDF_REMOTE_COMPILE_URL`** to an HTTP service that accepts multipart field `latex`. Without any engine, generation and `.tex` download still work; PDF export returns a clear error.

### LaTeX by operating system (native install, no Docker)

| OS | Typical distribution | Notes |
|----|------------------------|--------|
| **macOS** | [**MacTeX**](https://tug.org/mactex/) | Full TeX Live for Mac; install once, then `pdflatex` is on your `PATH`. |
| **Linux / Unix** | [**TeX Live**](https://www.tug.org/texlive/) | Use your distro packages or the official installer; ensure `pdflatex` works (`which pdflatex`). |
| **Windows** | [**MiKTeX**](https://miktex.org/) or **TeX Live** | Install so `pdflatex` is available where you run the API. |

**Three supported setups:**

- **Docker Compose (recommended for self-hosting)** — **`web`** (nginx + built SPA) on port **8080** proxies `/api` to **`api`** (FastAPI + TeX Live). One command: `docker compose up --build -d`, then open [http://localhost:8080](http://localhost:8080). Push images with `IMAGE_PREFIX=yourdockeruser/ docker compose build && docker compose push`. **Kubernetes:** see [deploy/k8s/README.md](./deploy/k8s/README.md) — *update secrets/env names there to match `backend/.env.example` if you still see `OPENAI_*` examples.*
- **Docker Compose API only** — Run **`api`** alone (port 8000) and use `npm run dev` for the UI if you prefer.
- **Native Python (no container)** — Install **MacTeX** / **TeX Live** / **MiKTeX** so **`pdflatex`** is on your `PATH`. Leave **`PDF_REMOTE_COMPILE_URL`** unset unless you use a remote compile service.

## Local development

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set AI_GATEWAY_API_KEY (and optional AI_GATEWAY_BASE_URL, AI_DEFAULT_MODEL)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) · PDF support: [http://127.0.0.1:8000/api/pdf-status](http://127.0.0.1:8000/api/pdf-status) · Model catalog (requires key): [http://127.0.0.1:8000/api/models](http://127.0.0.1:8000/api/models)

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The dev server proxies `/api` to the FastAPI backend.

### 3. Build the frontend

```bash
cd frontend
npm run build
```

Output is in `frontend/dist/`.

### 4. Run everything in Docker (UI + API)

From the repo root, copy `backend/.env.example` to `backend/.env` and set **`AI_GATEWAY_API_KEY`**.

```bash
docker compose up --build -d
```

To run the bundled **MongoDB** service as well, use the Compose profile **`mongo`** and set **`MONGODB_URI`** (for example in `backend/.env`) to `mongodb://mongo:27017/ai_assisted_apply`:

```bash
docker compose --profile mongo up --build -d
```

Open **[http://localhost:8080](http://localhost:8080)** (override with `WEB_PORT=80` if you want host port 80 mapped to container **8080**).

- **Network:** Compose attaches **`api`** and **`web`** to a named bridge network **`ai-assisted-apply_net`** (DNS name **`api`** for the backend). No extra volumes on **`api`**: LaTeX uses normal **`/tmp`** and **`$HOME`** inside the container (fast, stateless across restarts).
- **`api`** image: **[`pandoc/latex:latest-ubuntu`](https://hub.docker.com/r/pandoc/latex)** + Python; runs as **`appuser` (uid 10001)**. Dockerfiles use **BuildKit cache mounts** for faster rebuilds (`pip` / `npm`).
- **`web`** image: multi-stage Node build → unprivileged **nginx** on **8080**, proxying **`/api`** to **`http://api:8000`** (same pattern as in Kubernetes).

**Push to Docker Hub (or any registry) for Kubernetes / CI:**

```bash
export IMAGE_PREFIX=yourdockeruser/   # e.g. docker.io/janedoe/ or ghcr.io/org/
docker compose build
docker login
docker compose push
```

Images are tagged **`${IMAGE_PREFIX}ai-assisted-apply-api:${TAG:-latest}`** and **`${IMAGE_PREFIX}ai-assisted-apply-web:${TAG:-latest}`** (`TAG` optional).

**Sanity-check the default template:**

```bash
docker compose exec api /opt/venv/bin/python scripts/verify_default_template_pdf.py
```

Expect `OK — default template PDF: … bytes`. If that passes but a tailored resume fails, the generated LaTeX is usually invalid — edit the source or regenerate.

**Homelab Kubernetes:** edit image names in [deploy/k8s/kustomization.yaml](./deploy/k8s/kustomization.yaml), create secrets per [deploy/k8s/README.md](./deploy/k8s/README.md) **using the same variable names as `backend/.env.example`**, then `kubectl apply -k deploy/k8s`.

## Configuration

| Variable | Description |
|----------|-------------|
| **`AI_GATEWAY_API_KEY`** | **Required** for LLM calls. Set in `backend/.env` or the environment. |
| **`AI_GATEWAY_BASE_URL`** | Optional. Default `https://ai-gateway.vercel.sh/v1` (OpenAI-compatible root URL). |
| **`AI_DEFAULT_MODEL`** | Server default when the UI does not send a model id (browser default is `gpt-5.4`; use a full gateway id if your catalog requires a provider prefix, e.g. `openai/gpt-5.4`). |
| **`CORS_ORIGINS`** | Comma-separated browser origins allowed to call the API. Docker Compose sets defaults that include localhost (dev + **`web`** on 8080). |
| **`PDF_REMOTE_COMPILE_URL`** | Optional. If set, the API POSTs the `.tex` to this URL (multipart field `latex`) instead of local `pdflatex`. **Default empty** in Docker Compose (compile inside the `pandoc/latex`-based image). |
| **`MONGODB_URI`** | **Optional.** MongoDB connection string for apply journal (include DB name in the path, e.g. `mongodb://mongo:27017/ai_assisted_apply`). If unset or empty, the API does not connect to MongoDB; journal endpoints return an empty list and writes respond with 503. |
| **`IMAGE_PREFIX`** | Optional. Docker Compose image prefix for registry push (e.g. `youruser/` or `ghcr.io/org/`). |
| **`TAG`** | Optional image tag (default `latest`). |
| **`WEB_PORT`** | Host port mapped to the **`web`** container (default **8080** → container **8080**). |
| **`API_HOST_PORT`** | Host port for direct **`api`** access (default **8000**). Use the **`web`** URL for the app; **8000** is for health checks and scripts such as `verify_default_template_pdf.py`. |
| (Compose) | Network **`ai-assisted-apply_net`** only — no backend volume by default. |

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

[Issues](https://github.com/fkvivid/ai-assissted-apply/issues) and pull requests are welcome. Please keep changes focused and match existing code style.
