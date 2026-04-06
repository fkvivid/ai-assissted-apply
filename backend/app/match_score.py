"""Estimate job ↔ resume alignment as a single 0–100 score (LLM)."""

from __future__ import annotations

import re

from openai import OpenAI

_MAX_JOB_CHARS = 14_000
_MAX_RESUME_CHARS = 22_000
_WORD_RE = re.compile(r"[a-z0-9][a-z0-9+.#/-]{1,}")
_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "your",
    "have",
    "has",
    "you",
    "our",
    "are",
    "will",
    "not",
    "but",
    "job",
    "role",
    "work",
    "team",
    "years",
    "year",
    "using",
    "use",
    "required",
    "preferred",
    "experience",
}


def _clamp(n: int) -> int:
    return max(0, min(100, n))


def parse_match_percent(text: str) -> int | None:
    """Extract a 0–100 integer from model output."""
    if not text or not text.strip():
        return None
    for m in re.finditer(r"\b(\d{1,3})\b", text.strip()):
        v = int(m.group(1))
        if 0 <= v <= 100:
            return _clamp(v)
    return None


def _token_set(text: str) -> set[str]:
    tokens = {m.group(0).lower() for m in _WORD_RE.finditer(text)}
    return {t for t in tokens if t not in _STOPWORDS and len(t) >= 3}


def _fallback_overlap_score(job_description: str, resume_text: str) -> int:
    """Cheap lexical fallback so UI still gets a score when model scoring fails."""
    job_tokens = _token_set(job_description)
    resume_tokens = _token_set(resume_text)
    if not job_tokens or not resume_tokens:
        return 0
    overlap = len(job_tokens & resume_tokens)
    ratio = overlap / len(job_tokens)
    # Map overlap to a practical ATS-style band; cap to avoid fake 100s.
    return _clamp(int(round(20 + ratio * 70)))


def compute_job_resume_match_percent(
    client: OpenAI,
    *,
    model: str,
    job_description: str,
    resume_text: str,
    resume_label: str = "Resume",
    ignore_latex_markup: bool = False,
) -> int | None:
    """Return 0–100 or None if the scorer call fails or is disabled."""
    model = model.strip()
    if not model:
        return None
    jd = job_description.strip()[:_MAX_JOB_CHARS]
    resume = resume_text.strip()[:_MAX_RESUME_CHARS]
    if not jd or not resume:
        return None

    substance_instruction = (
        "Judge substance only—ignore LaTeX commands and markup. "
        if ignore_latex_markup
        else ""
    )
    user = (
        "Compare the job description to the resume below. "
        f"{substance_instruction}Consider "
        "required and preferred skills, tools, responsibilities, and overall "
        "fit for ATS and recruiter screening.\n\n"
        "Reply with exactly one line: a single integer from 0 to 100. "
        "No words, labels, or punctuation—digits only.\n\n"
        "## Job description\n"
        f"{jd}\n\n"
        f"## {resume_label}\n"
        f"{resume}"
    )

    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You output only a single integer from 0 to 100 "
                        "representing resume-to-job match strength."
                    ),
                },
                {"role": "user", "content": user},
            ],
            temperature=0,
            max_tokens=16,
        )
    except Exception:
        return _fallback_overlap_score(jd, resume)

    raw = (completion.choices[0].message.content or "").strip()
    parsed = parse_match_percent(raw)
    if parsed is not None:
        return parsed
    return _fallback_overlap_score(jd, resume)
