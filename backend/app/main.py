import json
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from bson import ObjectId
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from openai import OpenAI

from .config import settings
from .db import get_apply_journal_collection, journal_storage_configured
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
    ApplyJournalListResponse,
    ApplyJournalUpdateRequest,
    CompareResumeJobMatchRequest,
    CompareResumeJobMatchResponse,
    CompilePdfRequest,
    GenerateApplicationTextRequest,
    GenerateApplicationTextResponse,
    GenerateRequest,
    GenerateResponse,
)

APPLICATION_TEXT_SYSTEM = (
    "You help candidates write compelling job application prose: cover letters, "
    "answers to employer questions, cold outreach emails, LinkedIn messages, team "
    "intros, and any other application writing. Ground every claim in the resume "
    "and job description only—do not invent employers, titles, skills, credentials, "
    "or metrics.\n\n"
    "Universal writing rules (apply to every output type):\n"
    "Never use bullet points, dashes, or any list formatting. Write in clean, "
    "flowing prose only. Every paragraph must connect the candidate's specific "
    "experience to the company's exact stated needs—not vague praise or generic "
    "claims. Build trust through concrete specifics: named tools, quantified "
    "outcomes, real project details from the resume. Cut all filler without "
    "exception: 'passionate about', 'results-driven', 'team player', 'great fit', "
    "'I look forward to hearing from you', 'hardworking', 'detail-oriented', "
    "'please find attached'. These are noise.\n\n"
    "Cover letters and cold emails:\n"
    "Open with a powerful, specific sentence that hooks the reader immediately. "
    "Never start with 'I am applying for', 'I am writing to', 'My name is', "
    "'I would like to express my interest', or any other generic opener. Lead with "
    "a concrete achievement, a sharp insight about the role or company, or the "
    "candidate's single most compelling differentiator for this position. "
    "Target 150–200 words unless the user specifies a different length. Brevity "
    "signals confidence; padding signals insecurity.\n\n"
    "LinkedIn messages and short outreach:\n"
    "Keep it conversational and brief—2–4 sentences maximum. Open with a specific "
    "reason for reaching out tied to the person's work or the company's product. "
    "One clear ask at the end. No sales pitch, no 'picking your brain'.\n\n"
    "Employer questions:\n"
    "Answer directly and specifically. Lead with the most relevant evidence from "
    "the resume. No throat-clearing, no restating the question.\n\n"
    "When the resume includes a portfolio, project links, or a personal site, "
    "include them when they strengthen the answer.\n\n"
    "Output only the requested text—no title line, no preamble, no markdown fences "
    "unless the user explicitly asked for formatted output or code."
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

MATCH_RESUME_JOB_SYSTEM = (
    "You score how well TWO resume versions align with the SAME job description. "
    "The OLD version is plain text from the candidate before tailoring. "
    "The NEW version is LaTeX from a tailored resume—read visible text, section titles, "
    "and bullets; ignore LaTeX syntax noise.\n\n"
    "Score each axis from 0–100 (integers only):\n"
    "- job_match: holistic recruiter scan fit for this posting.\n"
    "- keywords_alignment: required/preferred skills and JD vocabulary reflected with honest evidence.\n"
    "- role_fit: seniority, scope, and domain match.\n"
    "- evidence_clarity: concrete outcomes, tools, and credibility (not generic filler).\n\n"
    "Respond with ONLY a JSON object with these exact keys:\n"
    "job_match_score_old, job_match_score_new (integers),\n"
    "keywords_alignment_old, keywords_alignment_new,\n"
    "role_fit_old, role_fit_new,\n"
    "evidence_clarity_old, evidence_clarity_new,\n"
    "headline (one punchy line celebrating the delta or honest outcome),\n"
    "summary (2–4 sentences comparing before vs after),\n"
    "what_improved (array of up to 6 short strings—specific wins in the NEW resume vs OLD),\n"
    "still_watch (array of up to 5 short strings—remaining gaps or risks; empty if none).\n"
    "Output rules: reply with a single JSON object only—no markdown code fences, no "
    "explanation before or after. The first character of your reply must be { and the "
    "last must be }."
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


def _parse_llm_json_object(raw: str) -> dict:
    """Parse a JSON object from model text; tolerate ``` fences and brief preamble/epilogue."""
    t = _strip_llm_json_fence(raw.strip())
    try:
        out = json.loads(t)
        if isinstance(out, dict):
            return out
    except json.JSONDecodeError:
        pass
    start = t.find("{")
    end = t.rfind("}")
    if start >= 0 and end > start:
        try:
            out = json.loads(t[start : end + 1])
            if isinstance(out, dict):
                return out
        except json.JSONDecodeError:
            pass
    raise ValueError("Model did not return a parseable JSON object.")


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


def _clamp_int_score(v: object, default: int = 50) -> int:
    if isinstance(v, bool):
        return default
    if isinstance(v, int):
        return max(0, min(100, v))
    if isinstance(v, float) and not isinstance(v, bool):
        return max(0, min(100, int(v)))
    if isinstance(v, str):
        s = v.strip()
        if s.lstrip("-").isdigit():
            return max(0, min(100, int(s)))
    return default


def _str_list_short(val: object, max_items: int, max_len: int) -> list[str]:
    if not isinstance(val, list):
        return []
    out: list[str] = []
    for item in val:
        if not isinstance(item, str):
            continue
        t = " ".join(item.split()).strip()[:max_len]
        if len(t) < 2:
            continue
        out.append(t)
        if len(out) >= max_items:
            break
    return out


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


def _require_journal_collection():
    collection = get_apply_journal_collection()
    if collection is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Apply journal storage is not configured. "
                "Set MONGODB_URI to enable saving entries."
            ),
        )
    return collection


DEFAULT_TEMPLATE = _load_default_template()


def _gateway_configured() -> bool:
    return bool(settings.ai_gateway_api_key.strip())


def _require_gateway() -> None:
    if not _gateway_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "AI_GATEWAY_API_KEY is not set on the server. "
                "Add it to backend/.env — see https://vercel.com/docs/ai-gateway"
            ),
        )


def _gateway_client() -> OpenAI:
    base = settings.ai_gateway_base_url.strip().rstrip("/")
    return OpenAI(
        api_key=settings.ai_gateway_api_key.strip(),
        base_url=base,
    )


def _effective_model(override: str | None) -> str:
    t = (override or "").strip()
    if t:
        return t
    d = settings.ai_default_model.strip()
    return d or "gpt-5.4"


app = FastAPI(
    title="AI Assisted Apply API",
    description="Tailor resume content via Vercel AI Gateway (OpenAI-compatible API).",
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


@app.get("/api/ai-status")
def ai_status() -> dict[str, str | bool | list[str]]:
    """Whether the gateway API key is set and which default model the server uses."""
    ok = _gateway_configured()
    return {
        "configured": ok,
        "mode": "gateway",
        "default_model": settings.ai_default_model.strip() or "gpt-5.4",
        "providers": ["gateway"] if ok else [],
    }


@app.get("/api/models")
def list_gateway_models() -> dict[str, object]:
    """Proxy gateway GET /v1/models — full catalog for the home page picker."""
    default_model = settings.ai_default_model.strip() or "gpt-5.4"
    if not _gateway_configured():
        return {"items": [], "default_model": default_model}

    base = settings.ai_gateway_base_url.strip().rstrip("/")
    url = f"{base}/models"
    try:
        r = httpx.get(
            url,
            headers={
                "Authorization": f"Bearer {settings.ai_gateway_api_key.strip()}",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )
        r.raise_for_status()
        payload = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not list gateway models: {e!s}",
        ) from e
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Invalid models response JSON: {e!s}",
        ) from e

    items: list[dict[str, str]] = []
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, list):
        for row in data:
            if not isinstance(row, dict):
                continue
            mid = row.get("id")
            if not isinstance(mid, str) or not mid.strip():
                continue
            mid = mid.strip()
            prov = mid.split("/", 1)[0] if "/" in mid else "openai"
            name = row.get("name")
            if not isinstance(name, str) or not name.strip():
                name = mid.split("/")[-1]
            desc = row.get("description")
            if not isinstance(desc, str):
                desc = ""
            items.append(
                {
                    "id": mid,
                    "name": name.strip(),
                    "provider": prov,
                    "description": desc,
                }
            )

    return {"items": items, "default_model": default_model}


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
    _require_gateway()

    template_text = (
        DEFAULT_TEMPLATE if body.use_default_template else body.template.strip()
    )
    if not body.use_default_template and not template_text:
        raise HTTPException(
            status_code=400,
            detail="Provide a custom LaTeX template or enable the default.",
        )

    model_id = _effective_model(body.model)

    user_content = (
        "## Job description\n"
        f"{body.job_description.strip()}\n\n"
        "## Original resume\n"
        f"{body.resume.strip()}\n\n"
        "The candidate applies only to roles they are qualified for. Tailor for "
        "maximum truthful alignment with the job above—resume text is the only "
        "source of facts. Replace every responsibility-framed bullet with a "
        "measurable achievement. Eliminate everything generic. Make this candidate's "
        "value impossible to ignore for this specific role. "
        "Preserve the original experience order from the source "
        "resume (no reordering of jobs/projects/education). Keep portfolio-related "
        "content from the resume: portfolio sections, project or personal-site links, "
        "GitHub, and similar URLs—do not remove or strip them when tailoring. You may rewrite and "
        "re-prioritize bullet wording to align with required skills when supported "
        "by resume evidence, but never invent unsupported hard requirements.\n\n"
        "## LaTeX template to fill\n"
        "Use this as the structural guide. Preserve document class, packages, "
        "defined commands/macros, colors, and section structure. Replace "
        "placeholder text (YOUR NAME, YOUR TITLE, example bullets, tabular "
        "rows, etc.) with content derived only from the resume. Output must "
        "compile with pdfLaTeX. Keep the final resume to a single page whenever "
        "possible by prioritizing the most role-relevant content and concise bullets.\n\n"
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

    client = _gateway_client()
    try:
        completion = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": body.ai_instructions.strip()},
                {"role": "user", "content": user_content},
            ],
            temperature=0.35,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI Gateway request failed: {e!s}",
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

    used_model = getattr(completion, "model", None) or model_id
    if not isinstance(used_model, str):
        used_model = model_id

    return GenerateResponse(
        latex=latex,
        model=used_model,
    )


@app.post("/api/generate-application-text", response_model=GenerateApplicationTextResponse)
def generate_application_text(
    body: GenerateApplicationTextRequest,
) -> GenerateApplicationTextResponse:
    _require_gateway()

    model_id = _effective_model(body.model)

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

    client = _gateway_client()
    try:
        completion = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": APPLICATION_TEXT_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.45,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI Gateway request failed: {e!s}",
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

    used_model = getattr(completion, "model", None) or model_id
    if not isinstance(used_model, str):
        used_model = model_id

    return GenerateApplicationTextResponse(
        text=text,
        model=used_model,
    )


@app.post("/api/compare-resume-job-match", response_model=CompareResumeJobMatchResponse)
def compare_resume_job_match(body: CompareResumeJobMatchRequest) -> CompareResumeJobMatchResponse:
    """Score JD alignment for original vs tailored resume (typically the smaller gateway model)."""
    _require_gateway()
    model_id = _effective_model(body.model)

    jd = body.job_description.strip()[:28_000]
    old_r = body.resume_original.strip()[:36_000]
    new_tex = body.resume_new_latex.strip()[:52_000]
    user_content = (
        "## Job description\n"
        f"{jd}\n\n"
        "## OLD resume (plain text, before tailoring)\n"
        f"{old_r}\n\n"
        "## NEW resume (LaTeX tailored output — judge visible content only)\n"
        f"{new_tex}\n"
    )

    client = _gateway_client()
    try:
        completion = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": MATCH_RESUME_JOB_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI Gateway request failed: {e!s}",
        ) from e

    raw = (completion.choices[0].message.content or "").strip()
    try:
        parsed = _parse_llm_json_object(raw)
    except ValueError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not parse match analysis JSON: {e!s}",
        ) from e

    jm_o = _clamp_int_score(parsed.get("job_match_score_old"))
    jm_n = _clamp_int_score(parsed.get("job_match_score_new"))
    kw_o = _clamp_int_score(parsed.get("keywords_alignment_old"))
    kw_n = _clamp_int_score(parsed.get("keywords_alignment_new"))
    rf_o = _clamp_int_score(parsed.get("role_fit_old"))
    rf_n = _clamp_int_score(parsed.get("role_fit_new"))
    ev_o = _clamp_int_score(parsed.get("evidence_clarity_old"))
    ev_n = _clamp_int_score(parsed.get("evidence_clarity_new"))

    headline = parsed.get("headline", "")
    if not isinstance(headline, str):
        headline = ""
    headline = headline.strip()[:400]

    summary = parsed.get("summary", "")
    if not isinstance(summary, str):
        summary = ""
    summary = summary.strip()[:2000]

    what = _str_list_short(parsed.get("what_improved"), 6, 320)
    watch = _str_list_short(parsed.get("still_watch"), 5, 320)

    used_model = getattr(completion, "model", None) or model_id
    if not isinstance(used_model, str):
        used_model = model_id

    return CompareResumeJobMatchResponse(
        job_match_old=jm_o,
        job_match_new=jm_n,
        keywords_old=kw_o,
        keywords_new=kw_n,
        role_fit_old=rf_o,
        role_fit_new=rf_n,
        evidence_old=ev_o,
        evidence_new=ev_n,
        match_lift=jm_n - jm_o,
        headline=headline,
        summary=summary,
        what_improved=what,
        still_watch=watch,
        model=used_model,
    )


@app.post("/api/analyze-keyword-gaps", response_model=AnalyzeKeywordGapsResponse)
def analyze_keyword_gaps(body: AnalyzeKeywordGapsRequest) -> AnalyzeKeywordGapsResponse:
    _require_gateway()

    model_id = _effective_model(body.model)

    jd_for_analysis, used_subset = _extract_requirements_sections(body.job_description)
    source_label = "requirements/preferred sections only" if used_subset else "full job description (fallback)"
    user_content = (
        f"## Job description source ({source_label})\n"
        f"{jd_for_analysis}\n\n"
        "## Resume\n"
        f"{body.resume.strip()}\n"
    )

    client = _gateway_client()
    try:
        completion = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": ANALYZE_KEYWORD_GAPS_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI Gateway request failed: {e!s}",
        ) from e

    raw = (completion.choices[0].message.content or "").strip()
    try:
        parsed = _parse_llm_json_object(raw)
    except ValueError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not parse keyword analysis JSON: {e!s}",
        ) from e

    missing, matched = _normalize_keyword_gap_lists(parsed)
    used_model = getattr(completion, "model", None) or model_id
    if not isinstance(used_model, str):
        used_model = model_id
    return AnalyzeKeywordGapsResponse(
        missing_keywords=missing,
        matched_keywords=matched,
        model=used_model,
    )


@app.get("/api/apply-journal/status")
def apply_journal_status() -> dict[str, bool]:
    return {"enabled": journal_storage_configured()}


@app.get("/api/apply-journal", response_model=ApplyJournalListResponse)
def list_apply_journal(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ApplyJournalListResponse:
    collection = get_apply_journal_collection()
    if collection is None:
        return ApplyJournalListResponse(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
        )
    skip = (page - 1) * page_size
    total = collection.count_documents({})
    docs = collection.find().sort("created_at", -1).skip(skip).limit(page_size)
    return ApplyJournalListResponse(
        items=[_journal_doc_to_entry(doc) for doc in docs],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.get("/api/apply-journal/{entry_id}", response_model=ApplyJournalEntry)
def get_apply_journal(entry_id: str) -> ApplyJournalEntry:
    collection = _require_journal_collection()
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
    collection = _require_journal_collection()
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
    collection = _require_journal_collection()
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
    collection = _require_journal_collection()
    result = collection.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return {"ok": True}
