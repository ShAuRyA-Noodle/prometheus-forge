"""Centralized config. Loads from environment, validates, exposes typed settings."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

Env = Literal["dev", "staging", "prod"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # === Environment ===
    env: Env = "dev"
    log_level: str = "INFO"
    secret_key: str = Field(default="dev-only-change-me")

    # === Google Cloud ===
    google_cloud_project: str = "prometheus-prod"
    google_cloud_region: str = "us-central1"
    google_application_credentials: str | None = None

    # === Gemini / Vertex ===
    gemini_api_key: str = ""
    vertex_ai_location: str = "us-central1"
    vertex_agent_engine_id: str = ""
    vertex_safety_enabled: bool = True

    model_pro: str = "gemini-2.5-pro"
    model_flash: str = "gemini-2.5-flash"

    # === Firestore / Firebase ===
    firestore_database: str = "(default)"
    firebase_project_id: str = "prometheus-prod"

    # === Backend ===
    backend_url: str = "http://localhost:8080"
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # === Cloud Tasks ===
    cloud_tasks_queue: str = "prometheus-pipeline"
    cloud_tasks_location: str = "us-central1"
    cloud_tasks_worker_url: str = ""
    cloud_tasks_invoker_sa: str = ""

    # === Stripe ===
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_founder: str = ""
    stripe_price_founder_pro: str = ""
    stripe_price_team: str = ""

    # === External APIs ===
    deepgram_api_key: str = ""
    uspto_api_key: str = ""
    domainr_api_key: str = ""
    crunchbase_api_key: str = ""
    statista_api_key: str = ""
    similarweb_api_key: str = ""
    imagen_location: str = "us-central1"
    recraft_api_key: str = ""

    # === Deploy / hosting ===
    cloudflare_api_token: str = ""
    cloudflare_account_id: str = ""
    cloudflare_zone_id: str = ""
    namecheap_api_user: str = ""
    namecheap_api_key: str = ""

    # === Notifications ===
    resend_api_key: str = ""
    sendgrid_api_key: str = ""
    fcm_server_key: str = ""

    # === Analytics (PostHog) ===
    posthog_key: str = ""
    posthog_host: str = "https://app.posthog.com"

    # === Share tokens ===
    share_token_secret: str = ""  # falls back to secret_key when blank
    share_token_ttl_days: int = 30

    # === Notion / Linear ===
    notion_api_version: str = "2022-06-28"

    # === Cost guardrails ===
    max_tokens_per_session: int = 120_000
    max_cost_usd_per_session: float = 2.50
    daily_free_generations: int = 1
    hourly_rate_limit_per_uid: int = 3
    daily_rate_limit_per_uid: int = 20
    input_length_cap_chars: int = 2000

    # === Pipeline tuning ===
    agent_max_retries: int = 1
    wave_timeout_seconds: int = 90
    pipeline_timeout_seconds: int = 240


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
