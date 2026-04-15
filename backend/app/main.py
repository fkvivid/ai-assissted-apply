import json
import re
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from bson import ObjectId
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from openai import OpenAI

from .config import settings
from .db import get_apply_journal_collection
from .pdf_compile import (
    PdfCompileError,
    compile_latex_to_pdf,
    latex_compile_available,
    pdflatex_available,
    remote_compile_configured,
    tectonic_available,
)
from .schemas import (
    AnalyzeKeywordGapsRequest,
    AnalyzeKeywordGapsResponse,
    ApplyJournalCreateRequest,
    ApplyJournalEntry,
    ApplyJournalUpdateRequest,
    CompilePdfRequest,
    GenerateApplicationTextRequest,
    GenerateApplicationTextResponse,
    GenerateRequest,
    GenerateResponse,
)

APPLICATION_TEXT_SYSTEM = (
    "You help candidates write job application prose: cover letters, answers to "
    "employer questions, short intro messages, and similar. Ground every claim in "
    "the resume and job description only—do not invent employers, titles, skills, "
    "or credentials. When the resume includes a portfolio, project links, or a "
    "personal site, keep those references accurate when they fit the task—do not "
    "drop them only to shorten. Match the tone the user asks for when they specify "
    "it; otherwise use clear, professional, human-sounding prose. Output only the "
    "requested text—no preamble, no markdown fences unless the user explicitly "
    "asked for code."
)

ANALYZE_KEYWORD_GAPS_SYSTEM = (
    "You compare a job description to a candidate resume. Extract concrete skills, "
    "tools, frameworks, platforms, methodologies, and domain keywords the posting "
    "treats as important (required or preferred).\n"
    "Prioritize keywords explicitly listed in sections/headings such as "
    "Qualifications, Minimum Qualifications, Basic Qualifications, Requirements, "
    "Must Have, Preferred Qualifications, Preferred Skills, Nice to Have, and Key "
    "Responsibilities. Use other sections only as secondary context.\n"
    "- missing_keywords: phrases important in the job but NOT clearly supported by "
    "the resume—omit items already evidenced or strong honest equivalents "
    "(e.g. React vs React.js).\n"
    "- matched_keywords: phrases clearly present or equivalent in the resume.\n"
    "Use short phrases (usually 1–4 words), wording similar to the job when sensible. "
    "Each list: unique items, no full sentences, max 25 items each.\n"
    "Respond with ONLY a JSON object with keys missing_keywords and matched_keywords "
    "(arrays of strings). No markdown or commentary."
)


def _strip_llm_json_fence(raw: str) -> str:
    t = raw.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


def _normalize_keyword_gap_lists(data: dict) -> tuple[list[str], list[str]]:
    def clean_arr(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        out: list[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str):
                continue
            s = " ".join(item.split()).strip()
            if len(s) < 2 or len(s) > 80:
                continue
            low = s.lower()
            if low in seen:
                continue
            seen.add(low)
            out.append(s)
            if len(out) >= 25:
                break
        return out

    missing = clean_arr(data.get("missing_keywords", []))
    matched = clean_arr(data.get("matched_keywords", []))
    matched_lower = {m.lower() for m in matched}
    missing = [m for m in missing if m.lower() not in matched_lower]
    return missing, matched


def _extract_requirements_sections(job_description: str) -> tuple[str, bool]:
    """
    Return only requirement/preferred-like sections when headings exist.
    If nothing is recognized, return original text with used_subset=False.
    """
    text = job_description.strip()
    if not text:
        return "", False

    heading_re = re.compile(r"^\s{0,3}(#{1,6}\s*)?([A-Za-z][A-Za-z /&\-\(\)]{2,80}):?\s*$")
    target_heading_re = re.compile(
        r"(qualification|requirement|preferred|nice to have|must have|must-have|"
        r"key responsibilities|responsibilit(y|ies)|what you('|’)ll bring|"
        r"what we('|’)re looking for|skills)",
        re.IGNORECASE,
    )

    lines = text.splitlines()
    blocks: list[str] = []
    current_heading: str | None = None
    current_lines: list[str] = []

    def flush():
        nonlocal current_heading, current_lines
        if current_heading and target_heading_re.search(current_heading):
            body = "\n".join(current_lines).strip()
            if body:
                blocks.append(f"{current_heading}\n{body}")
        current_heading = None
        current_lines = []

    for line in lines:
        m = heading_re.match(line)
        if m:
            flush()
            current_heading = m.group(2).strip()
            continue
        if current_heading is not None:
            current_lines.append(line)
    flush()

    if blocks:
        return "\n\n".join(blocks), True
    return text, False


def _load_default_template() -> str:
    p = Path(__file__).resolve().parent / "default_template.tex"
    return p.read_text(encoding="utf-8")


def _journal_doc_to_entry(doc: dict) -> ApplyJournalEntry:
    return ApplyJournalEntry(
        id=str(doc["_id"]),
        date=doc.get("date", ""),
        company_name=doc.get("company_name", ""),
        position=doc.get("position", ""),
        salary=doc.get("salary", ""),
        location=doc.get("location", ""),
        job_source=doc.get("job_source", ""),
        link=doc.get("link", ""),
        expected_salary=doc.get("expected_salary", ""),
        job_description=doc.get("job_description", ""),
        resume_latex=doc.get("resume_latex", ""),
        question_answers=doc.get("question_answers", []),
        status=doc.get("status", "applied"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


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
        "The candidate applies only to roles they are qualified for. Tailor for "
        "maximum truthful alignment with the job above—resume text is the only "
        "source of facts. Preserve the original experience order from the source "
        "resume (no reordering of jobs/projects/education). Keep portfolio-related "
        "content from the resume: portfolio sections, project or personal-site links, "
        "GitHub, and similar URLs—do not remove or strip them when tailoring. You may rewrite and "
        "re-prioritize bullet wording to align with required skills when supported "
        "by resume evidence, but never invent unsupported hard requirements.\n\n"
        "## LaTeX template to fill\n"
        "Use this as the structural guide. Preserve document class, packages, "
        "macros (e.g. \\name, \\headline, \\contact, \\summarytext, \\skillline, "
        "\\jobheading, \\projectheading), colors, and section structure. Replace "
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
    if body.additional_instructions.strip():
        user_content += (
            "\n\n## Additional user instructions\n"
            f"{body.additional_instructions.strip()}\n"
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


@app.post("/api/generate-application-text", response_model=GenerateApplicationTextResponse)
def generate_application_text(
    body: GenerateApplicationTextRequest,
) -> GenerateApplicationTextResponse:
    if not settings.openai_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail=(
                "OPENAI_API_KEY is not set on the server. "
                "Add it to your environment or backend/.env — see README."
            ),
        )

    user_content = (
        "## Job description\n"
        f"{body.job_description.strip()}\n\n"
        "## Resume (only source of facts about the candidate)\n"
        f"{body.resume.strip()}\n\n"
        "## What to write\n"
        f"{body.task_prompt.strip()}\n"
    )
    if body.additional_instructions.strip():
        user_content += (
            "\n\n## Additional notes for this application\n"
            f"{body.additional_instructions.strip()}\n"
        )
    user_content += (
        "\n\nRespond with only the text for the task above—no title line like "
        '"Cover letter" unless the format requires it.'
    )

    client = OpenAI(api_key=settings.openai_api_key)
    try:
        completion = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": APPLICATION_TEXT_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.45,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI request failed: {e!s}",
        ) from e

    choice = completion.choices[0]
    text = (choice.message.content or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    return GenerateApplicationTextResponse(
        text=text,
        model=settings.openai_model,
    )


@app.post("/api/analyze-keyword-gaps", response_model=AnalyzeKeywordGapsResponse)
def analyze_keyword_gaps(body: AnalyzeKeywordGapsRequest) -> AnalyzeKeywordGapsResponse:
    if not settings.openai_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail=(
                "OPENAI_API_KEY is not set on the server. "
                "Add it to your environment or backend/.env — see README."
            ),
        )

    jd_for_analysis, used_subset = _extract_requirements_sections(body.job_description)
    source_label = "requirements/preferred sections only" if used_subset else "full job description (fallback)"
    user_content = (
        f"## Job description source ({source_label})\n"
        f"{jd_for_analysis}\n\n"
        "## Resume\n"
        f"{body.resume.strip()}\n"
    )

    client = OpenAI(api_key=settings.openai_api_key)
    try:
        completion = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": ANALYZE_KEYWORD_GAPS_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI request failed: {e!s}",
        ) from e

    raw = (completion.choices[0].message.content or "").strip()
    raw = _strip_llm_json_fence(raw)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not parse keyword analysis JSON: {e!s}",
        ) from e
    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=502,
            detail="Keyword analysis response was not a JSON object.",
        )

    missing, matched = _normalize_keyword_gap_lists(parsed)
    return AnalyzeKeywordGapsResponse(
        missing_keywords=missing,
        matched_keywords=matched,
        model=settings.openai_model,
    )


@app.get("/api/apply-journal", response_model=list[ApplyJournalEntry])
def list_apply_journal() -> list[ApplyJournalEntry]:
    collection = get_apply_journal_collection()
    docs = collection.find().sort("updated_at", -1)
    return [_journal_doc_to_entry(doc) for doc in docs]


@app.get("/api/apply-journal/{entry_id}", response_model=ApplyJournalEntry)
def get_apply_journal(entry_id: str) -> ApplyJournalEntry:
    collection = get_apply_journal_collection()
    try:
        obj_id = ObjectId(entry_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid journal id.") from e
    doc = collection.find_one({"_id": obj_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return _journal_doc_to_entry(doc)


@app.post("/api/apply-journal", response_model=ApplyJournalEntry)
def create_apply_journal(body: ApplyJournalCreateRequest) -> ApplyJournalEntry:
    now = datetime.now(UTC)
    doc = {
        "date": body.date,
        "company_name": body.company_name,
        "position": body.position,
        "salary": body.salary,
        "location": body.location,
        "job_source": body.job_source,
        "link": body.link,
        "expected_salary": body.expected_salary,
        "job_description": body.job_description,
        "resume_latex": body.resume_latex,
        "question_answers": [qa.model_dump() for qa in body.question_answers],
        "status": body.status or "applied",
        "created_at": now,
        "updated_at": now,
    }
    collection = get_apply_journal_collection()
    result = collection.insert_one(doc)
    created = collection.find_one({"_id": result.inserted_id})
    if created is None:
        raise HTTPException(status_code=500, detail="Failed to load created entry.")
    return _journal_doc_to_entry(created)


@app.patch("/api/apply-journal/{entry_id}", response_model=ApplyJournalEntry)
def update_apply_journal(
    entry_id: str,
    body: ApplyJournalUpdateRequest,
) -> ApplyJournalEntry:
    try:
        obj_id = ObjectId(entry_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid journal id.") from e
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(UTC)
    collection = get_apply_journal_collection()
    result = collection.update_one({"_id": obj_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    doc = collection.find_one({"_id": obj_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return _journal_doc_to_entry(doc)


@app.delete("/api/apply-journal/{entry_id}")
def delete_apply_journal(entry_id: str) -> dict[str, bool]:
    try:
        obj_id = ObjectId(entry_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid journal id.") from e
    collection = get_apply_journal_collection()
    result = collection.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return {"ok": True}
