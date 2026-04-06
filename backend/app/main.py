from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from openai import OpenAI

from .config import settings
from .pdf_compile import (
    PdfCompileError,
    compile_latex_to_pdf,
    latex_compile_available,
    pdflatex_available,
    remote_compile_configured,
    tectonic_available,
)
from .schemas import CompilePdfRequest, GenerateRequest, GenerateResponse


def _load_default_template() -> str:
    p = Path(__file__).resolve().parent / "default_template.tex"
    return p.read_text(encoding="utf-8")


DEFAULT_TEMPLATE = _load_default_template()

app = FastAPI(
    title="AI Assisted Apply API",
    description="Tailor resume content to a job description using OpenAI.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/pdf-status")
def pdf_status() -> dict[str, bool]:
    """Whether the server can compile LaTeX to PDF (remote URL, pdflatex, or tectonic)."""
    return {
        "pdflatex_available": pdflatex_available(),
        "tectonic_available": tectonic_available(),
        "remote_compile_configured": remote_compile_configured(),
        "compile_available": latex_compile_available(),
    }


@app.post("/api/compile-pdf")
def compile_pdf(body: CompilePdfRequest) -> Response:
    try:
        pdf_bytes = compile_latex_to_pdf(body.latex)
    except PdfCompileError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="resume.pdf"',
        },
    )


@app.post("/api/generate", response_model=GenerateResponse)
def generate(body: GenerateRequest) -> GenerateResponse:
    if not settings.openai_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail=(
                "OPENAI_API_KEY is not set on the server. "
                "Add it to your environment or backend/.env — see README."
            ),
        )

    template_text = (
        DEFAULT_TEMPLATE if body.use_default_template else body.template.strip()
    )
    if not body.use_default_template and not template_text:
        raise HTTPException(
            status_code=400,
            detail="Provide a custom LaTeX template or enable the default.",
        )

    user_content = (
        "## Job description\n"
        f"{body.job_description.strip()}\n\n"
        "## Original resume\n"
        f"{body.resume.strip()}\n\n"
        "## LaTeX template to fill\n"
        "Use this as the structural guide. Preserve document class, packages, "
        "macros (e.g. \\jobheading), colors, and section structure. Replace "
        "placeholder text (YOUR NAME, YOUR TITLE, example bullets, tabular "
        "rows, etc.) with content derived only from the resume. Output must "
        "compile with pdfLaTeX.\n\n"
        "```latex\n"
        f"{template_text}\n"
        "```\n\n"
        "## Output\n"
        "Return a single valid LaTeX document (full file). "
        "No markdown code fences. No commentary before or after the LaTeX."
    )

    client = OpenAI(api_key=settings.openai_api_key)
    try:
        completion = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": body.ai_instructions.strip()},
                {"role": "user", "content": user_content},
            ],
            temperature=0.35,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI request failed: {e!s}",
        ) from e

    choice = completion.choices[0]
    raw = (choice.message.content or "").strip()
    latex = raw
    if latex.startswith("```"):
        lines = latex.split("\n")
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        latex = "\n".join(lines).strip()

    return GenerateResponse(
        latex=latex,
        model=settings.openai_model,
    )
