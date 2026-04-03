# AI Assisted Apply

Open-source web app to **tailor your resume to a specific job** using your own **OpenAI API key** (bring-your-own-key on the server). The **Home** page asks only for a **job description**; **Settings** stores your **resume**, **LaTeX template** preferences, and **AI instructions** in the browser (`localStorage`). After generation you can **copy LaTeX**, **download a PDF** (server runs `pdflatex` or **Tectonic** when installed), or **download the `.tex`** source.

**Stack:** React (Vite) + Tailwind CSS + React Router · FastAPI · OpenAI Chat Completions API.

> **Disclaimer:** You are responsible for the accuracy of your applications. The model must not invent facts — review every line before you submit.

## Features

- **Home:** job description, generate tailored LaTeX, download — only available after a **saved** original resume (otherwise you are redirected to Settings)
- **Settings:** original resume, default or custom LaTeX template, AI instructions (persisted locally)
- **Theme:** Under **Settings → Appearance** — System (default), Light, or Dark — stored in the browser; follows OS dark mode when set to System
- Default LaTeX template served by the API (Charter-style layout) or paste your own
- LaTeX preview with **Copy**, **Download PDF**, and **Download .tex**

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

**Two supported setups:**

- **Docker Compose** — Single **`api`** service built from **[`pandoc/latex:latest-ubuntu`](https://hub.docker.com/r/pandoc/latex)** plus Python and **`texlive-fonts-extra`** so **`pdflatex`** runs inside the same container (no separate PDF microservice).
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

### 4. Run the API in Docker ([`pandoc/latex`](https://hub.docker.com/r/pandoc/latex) + Python)

From the repo root (copy `backend/.env.example` to `backend/.env` and set `OPENAI_API_KEY`):

```bash
docker compose up --build
```

The **`api`** image extends **[`pandoc/latex:latest-ubuntu`](https://hub.docker.com/r/pandoc/latex)** (maintained TeX Live for PDF), adds **Python** in a venv, and **`texlive-fonts-extra`** for Charter in the default template. FastAPI listens on **8000**; PDF compilation uses **`pdflatex`** in-process (`PDF_REMOTE_COMPILE_URL` is empty by default).

**Sanity-check the default template:**

```bash
docker compose exec api python scripts/verify_default_template_pdf.py
```

Expect `OK — default template PDF: … bytes`. If that passes but a tailored resume fails, the generated LaTeX is usually invalid — edit the source or regenerate.

## Configuration

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | **Required** for generation. Set in `backend/.env` or the environment. |
| `OPENAI_MODEL` | Defaults to `gpt-4o-mini`. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API. |
| `PDF_REMOTE_COMPILE_URL` | Optional. If set, the API POSTs the `.tex` to this URL (multipart field `latex`) instead of local `pdflatex`. **Default empty** in Docker Compose (compile inside the `pandoc/latex`-based image). |

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

Issues and pull requests are welcome. Please keep changes focused and match existing code style.
