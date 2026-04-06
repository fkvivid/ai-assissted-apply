# AI Assisted Apply

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-ai--assissted--apply-181717?logo=github)](https://github.com/fkvivid/ai-assissted-apply)

Open-source web app to **tailor your resume to a specific job** using your own **OpenAI API key** (bring-your-own-key on the server). The **Home** page asks only for a **job description**; **Settings** stores your **resume**, **LaTeX template** preferences, and **AI instructions** in the browser (`localStorage`). After generation you can **copy LaTeX**, **download a PDF** (server runs `pdflatex` or **Tectonic** when installed), or **download the `.tex`** source.

**Repository:** [github.com/fkvivid/ai-assissted-apply](https://github.com/fkvivid/ai-assissted-apply) · **Feedback / issues:** [GitHub Issues](https://github.com/fkvivid/ai-assissted-apply/issues)

**Stack:** React (Vite) + Tailwind CSS + React Router · FastAPI · OpenAI Chat Completions API.

> **Disclaimer:** You are responsible for the accuracy of your applications. The model must not invent facts — review every line before you submit.

## Features

- **Home:** job description → generate tailored LaTeX — only available after a **saved** original resume (otherwise you are redirected to Settings)
- **Match estimate:** after each run, **Original match** and **Tailored match** percentages (model-based alignment hint — review the output yourself)
- **Settings:** original resume, default or custom LaTeX template, AI instructions (persisted locally)
- **Theme:** Under **Settings → Appearance** — System (default), Light, or Dark — stored in the browser; follows OS dark mode when set to System
- **About** (`/about`): why the project exists — motivation, not a sales pitch
- Default LaTeX template served by the API (Charter-style layout) or paste your own
- LaTeX preview with **Copy**, **Download PDF**, and **Download .tex**
- Footer links to **About** and **Feedback** (GitHub Issues)

## Prerequisites

- **Node.js** 20+ (for the frontend)
- **Python** 3.11+ (for the API)
- An **OpenAI API key** set on the server (see below)
- **Optional — PDF download:** Install **`pdflatex`** on your `PATH` (see below), **or** run the API in **Docker** using the **[`pandoc/latex`](https://hub.docker.com/r/pandoc/latex)**-based image (TeX Live + extra fonts for the default template). You can also set **`PDF_REMOTE_COMPILE_URL`** to any HTTP service that accepts multipart `latex`. Without any engine, generation and `.tex` download still work; PDF export returns a clear error.

### LaTeX by operating system (native install, no Docker)

| OS | Typical distribution | Notes |
|----|----------------------|--------|
| **macOS** | [**MacTeX**](https://tug.org/mactex/) | Full TeX Live for Mac; install once, then `pdflatex` is on your `PATH`. |
| **Linux / Unix** | [**TeX Live**](https://www.tug.org/texlive/) | Use your distro packages or the official installer; ensure `pdflatex` works (`which pdflatex`). |
| **Windows** | [**MiKTeX**](https://miktex.org/) or **TeX Live** | Install so `pdflatex` is available in the environment where you run the API. |

**Three supported setups:**

- **Docker Compose (recommended for self-hosting)** — **`web`** (nginx + built SPA) on port **8080** proxies `/api` to **`api`** (FastAPI + TeX Live). One command: `docker compose up --build -d`, then open [http://localhost:8080](http://localhost:8080). Push images with `IMAGE_PREFIX=yourdockeruser/ docker compose build && docker compose push`. **Kubernetes:** see [deploy/k8s/README.md](./deploy/k8s/README.md).
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
# Edit .env and set OPENAI_API_KEY
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) · PDF support probe: [http://127.0.0.1:8000/api/pdf-status](http://127.0.0.1:8000/api/pdf-status) (`pdflatex_available`, `tectonic_available`, `remote_compile_configured`, `compile_available`)

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

From the repo root, copy `backend/.env.example` to `backend/.env` and set **`OPENAI_API_KEY`**.

```bash
docker compose up --build -d
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

**Homelab Kubernetes:** edit image names in [deploy/k8s/kustomization.yaml](./deploy/k8s/kustomization.yaml), create the secret per [deploy/k8s/README.md](./deploy/k8s/README.md), then `kubectl apply -k deploy/k8s`.

## Configuration

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | **Required** for generation. Set in `backend/.env` or the environment. |
| `OPENAI_MODEL` | Model for resume tailoring and **job match %** scoring (default `gpt-4o-mini`). |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API. Docker Compose sets defaults that include localhost (dev + **`web`** on 8080). |
| `PDF_REMOTE_COMPILE_URL` | Optional. If set, the API POSTs the `.tex` to this URL (multipart field `latex`) instead of local `pdflatex`. **Default empty** in Docker Compose (compile inside the `pandoc/latex`-based image). |
| `IMAGE_PREFIX` | Optional. Docker Compose image prefix for registry push (e.g. `youruser/` or `ghcr.io/org/`). |
| `TAG` | Optional image tag (default `latest`). |
| `WEB_PORT` | Host port mapped to the **`web`** container (default **8080** → container **8080**). |
| `API_HOST_PORT` | Host port for direct **`api`** access (default **8000**). Use the **`web`** URL for the app; **8000** is for health checks and scripts such as `verify_default_template_pdf.py`. |
| (Compose) | Network **`ai-assisted-apply_net`** only — no backend volume by default. |

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

[Issues](https://github.com/fkvivid/ai-assissted-apply/issues) and pull requests are welcome. Please keep changes focused and match existing code style.
