"""
DataPilot configuration — loaded from environment variables.

All GCP project settings, dataset names, model configs, and limits
are centralized here.
"""

import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()

PROJECT_ID_DEFAULT = os.getenv("PROJECT_ID", "")
ENVIRONMENT_DEFAULT = os.getenv("ENVIRONMENT", "local")


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    # ─── GCP Project ──────────────────────────────────────────
    PROJECT_ID: str = PROJECT_ID_DEFAULT
    REGION: str = os.getenv("REGION", "us-central1")
    BQ_LOCATION: str = os.getenv("BQ_LOCATION", "US")
    ENVIRONMENT: str = ENVIRONMENT_DEFAULT

    # ─── BigQuery Datasets ────────────────────────────────────
    RAW_DATASET: str = "datapilot_raw"
    STAGING_DATASET: str = "datapilot_staging"
    ANALYTICS_DATASET: str = "datapilot_analytics"
    SEMANTIC_DATASET: str = "datapilot_semantic"
    OBSERVABILITY_DATASET: str = "datapilot_observability"

    # ─── Vertex AI / Gemini ───────────────────────────────────
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    # ─── Query Limits ─────────────────────────────────────────
    MAX_BYTES_PROCESSED: int = int(
        os.getenv("MAX_BYTES_PROCESSED", str(10 * 1024 * 1024 * 1024))  # 10 GB
    )
    QUERY_TIMEOUT_SECONDS: int = 60
    MAX_SQL_REPAIR_ATTEMPTS: int = 2
    DEFAULT_ROW_LIMIT: int = 1000

    # ─── Cloud Storage ────────────────────────────────────────
    SNAPSHOT_BUCKET: str = os.getenv("SNAPSHOT_BUCKET", "")

    # ─── CORS ─────────────────────────────────────────────────
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8080"]
    ALLOW_MOCK_AUTH: bool = os.getenv(
        "ALLOW_MOCK_AUTH",
        str(ENVIRONMENT_DEFAULT != "production"),
    ).lower() in {"1", "true", "yes"}

    # ─── Logging ──────────────────────────────────────────────
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


settings = Settings()
