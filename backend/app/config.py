from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # If set (e.g. http://pdf-engine:8080), compile PDF via HTTP multipart POST
    # instead of a local engine. Matches 4teamwork/pdflatex and similar images.
    pdf_remote_compile_url: str = ""
    # Optional: apply journal (MongoDB). Leave empty to run without journal storage.
    mongodb_uri: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
