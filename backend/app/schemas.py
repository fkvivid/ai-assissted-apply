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


class GenerateResponse(BaseModel):
    latex: str
    model: str
    match_percent: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Estimated job-description alignment (0–100); null if unscored",
    )


class CompilePdfRequest(BaseModel):
    latex: str = Field(
        ...,
        min_length=1,
        max_length=500_000,
        description="Full LaTeX document to compile (remote HTTP, pdflatex, or tectonic)",
    )
