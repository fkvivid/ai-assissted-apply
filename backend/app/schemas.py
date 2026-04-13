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
