from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    resume: str = Field(..., min_length=1, description="Original resume text")
    job_description: str = Field(
        ...,
        min_length=1,
        description="Target role job description",
    )
    template: str = Field(
        default="",
        description="Custom LaTeX template when use_default_template is false",
    )
    use_default_template: bool = True
    ai_instructions: str = Field(
        ...,
        min_length=1,
        description="User-editable system-style instructions",
    )
    additional_instructions: str = Field(
        default="",
        description="Optional per-job extra instructions from homepage",
    )
    model: str = Field(
        default="",
        description="Gateway model id for resume + keyword gaps; empty uses AI_DEFAULT_MODEL",
    )


class GenerateResponse(BaseModel):
    latex: str
    model: str


class GenerateApplicationTextRequest(BaseModel):
    resume: str = Field(..., min_length=1, description="Original resume text (source of facts)")
    job_description: str = Field(
        ...,
        min_length=1,
        description="Target role job description",
    )
    additional_instructions: str = Field(
        default="",
        description="Optional per-job notes (same as homepage extra instructions)",
    )
    task_prompt: str = Field(
        ...,
        min_length=1,
        description="What to write: cover letter brief, employer question, or pasted prompt",
    )
    model: str = Field(
        default="",
        description="Gateway model id for application prose; empty uses AI_DEFAULT_MODEL",
    )


class GenerateApplicationTextResponse(BaseModel):
    text: str
    model: str


class CompilePdfRequest(BaseModel):
    latex: str = Field(
        ...,
        min_length=1,
        max_length=500_000,
        description="Full LaTeX document to compile (remote HTTP, pdflatex, or tectonic)",
    )


class AnalyzeKeywordGapsRequest(BaseModel):
    job_description: str = Field(..., min_length=1, description="Target job posting text")
    resume: str = Field(..., min_length=1, description="Candidate resume (compare for coverage)")
    model: str = Field(
        default="",
        description="Optional gateway model id; empty uses server AI_DEFAULT_MODEL",
    )


class AnalyzeKeywordGapsResponse(BaseModel):
    missing_keywords: list[str] = Field(
        default_factory=list,
        description="JD skills/terms not clearly evidenced in the resume",
    )
    matched_keywords: list[str] = Field(
        default_factory=list,
        description="JD skills/terms that clearly appear or are honest equivalents in the resume",
    )
    model: str


class CompareResumeJobMatchRequest(BaseModel):
    job_description: str = Field(..., min_length=1, description="Target job posting")
    resume_original: str = Field(
        ...,
        min_length=1,
        description="Pre-tailoring resume text (source of truth for 'before')",
    )
    resume_new_latex: str = Field(
        ...,
        min_length=1,
        description="Generated tailored resume (LaTeX; model should read visible content)",
    )
    model: str = Field(
        default="",
        description="Gateway model id for JD match scoring; empty uses AI_DEFAULT_MODEL",
    )


class CompareResumeJobMatchResponse(BaseModel):
    """JD alignment scores for original vs tailored resume (0–100 per axis)."""

    job_match_old: int = Field(..., ge=0, le=100)
    job_match_new: int = Field(..., ge=0, le=100)
    keywords_old: int = Field(..., ge=0, le=100)
    keywords_new: int = Field(..., ge=0, le=100)
    role_fit_old: int = Field(..., ge=0, le=100)
    role_fit_new: int = Field(..., ge=0, le=100)
    evidence_old: int = Field(..., ge=0, le=100)
    evidence_new: int = Field(..., ge=0, le=100)
    match_lift: int = Field(
        ...,
        description="job_match_new minus job_match_old (can be negative)",
    )
    headline: str = ""
    summary: str = ""
    what_improved: list[str] = Field(default_factory=list)
    still_watch: list[str] = Field(default_factory=list)
    model: str = ""


ApplicationStatus = Literal[
    "applied",
    "interviewing",
    "rejected",
    "ghosted",
    "offer",
    "withdrawn",
]


class ApplyJournalQuestionAnswer(BaseModel):
    question: str = Field(default="")
    answer: str = Field(default="")


class ApplyJournalCreateRequest(BaseModel):
    date: str = Field(default="")
    company_name: str = Field(default="")
    position: str = Field(default="")
    salary: str = Field(default="")
    location: str = Field(default="")
    job_source: str = Field(default="")
    link: str = Field(default="")
    expected_salary: str = Field(default="")
    job_description: str = Field(default="")
    resume_latex: str = Field(default="")
    question_answers: list[ApplyJournalQuestionAnswer] = Field(default_factory=list)
    status: ApplicationStatus = Field(default="applied")


class ApplyJournalUpdateRequest(BaseModel):
    date: str | None = None
    company_name: str | None = None
    position: str | None = None
    salary: str | None = None
    location: str | None = None
    job_source: str | None = None
    link: str | None = None
    expected_salary: str | None = None
    job_description: str | None = None
    resume_latex: str | None = None
    question_answers: list[ApplyJournalQuestionAnswer] | None = None
    status: ApplicationStatus | None = None


class ApplyJournalEntry(BaseModel):
    id: str
    date: str = ""
    company_name: str = ""
    position: str = ""
    salary: str = ""
    location: str = ""
    job_source: str = ""
    link: str = ""
    expected_salary: str = ""
    job_description: str = ""
    resume_latex: str = ""
    question_answers: list[ApplyJournalQuestionAnswer] = Field(default_factory=list)
    status: ApplicationStatus = "applied"
    created_at: datetime
    updated_at: datetime


class ApplyJournalListResponse(BaseModel):
    items: list[ApplyJournalEntry] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
