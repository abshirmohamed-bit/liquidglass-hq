"""Every knob the Engine has, read from the environment once."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # auth: comma separated so keys can be rotated without downtime
    engine_api_keys: str = "dev-key"

    # webhooks
    webhook_url: str = ""
    webhook_secret: str = "dev-secret"

    # storage
    storage_backend: str = "local"  # local | s3
    data_dir: Path = Path("./data")
    public_base_url: str = "http://localhost:8080"
    s3_endpoint: str = ""
    s3_bucket: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_public_base_url: str = ""
    # Fly's `fly storage create` sets these names; read them so Tigris needs no
    # extra wiring, and so the same image works on any S3-compatible host.
    bucket_name: str = ""
    aws_endpoint_url_s3: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # How long to let an in-flight render finish when asked to shut down.
    # Fly sends SIGTERM then SIGKILL after kill_timeout; keep this under it.
    shutdown_grace_s: float = 120.0

    # transcription
    transcribe_provider: str = "faster-whisper"  # faster-whisper | fake
    whisper_model: str = "small"
    whisper_device: str = "auto"

    # moment finding
    finder_provider: str = "claude"  # claude | rules
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-5"

    # limits
    max_upload_bytes: int = 4 * 1024**3
    # 0 means "no quota"; the app shows a bar only when a limit is set.
    storage_limit_bytes: int = 0
    # "ytdlp" reads real links; "fake" keeps tests offline.
    analyze_provider: str = "ytdlp"
    min_source_seconds: int = 10
    max_source_seconds: int = 10800
    concurrent_jobs: int = 3
    concurrent_renders: int = 4
    retention_days: int = 30

    # test/dev
    engine_mock: bool = False

    @property
    def keys(self) -> set[str]:
        return {k.strip() for k in self.engine_api_keys.split(",") if k.strip()}

    @property
    def media_root(self) -> Path:
        return self.data_dir / "media"

    def resolve_finder(self) -> str:
        """Without a key there is nothing to call, so fall back rather than fail."""
        if self.finder_provider == "claude" and not self.anthropic_api_key:
            return "rules"
        return self.finder_provider


    def _adopt_fly_storage(self) -> None:
        """A bucket in the environment means object storage, with no other config."""
        if not self.s3_bucket and self.bucket_name:
            self.s3_bucket = self.bucket_name
        if not self.s3_endpoint and self.aws_endpoint_url_s3:
            self.s3_endpoint = self.aws_endpoint_url_s3
        if not self.s3_access_key and self.aws_access_key_id:
            self.s3_access_key = self.aws_access_key_id
        if not self.s3_secret_key and self.aws_secret_access_key:
            self.s3_secret_key = self.aws_secret_access_key
        if self.s3_bucket and self.s3_access_key and self.storage_backend == "local":
            self.storage_backend = "s3"


@lru_cache
def settings() -> Settings:
    s = Settings()
    s._adopt_fly_storage()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    s.media_root.mkdir(parents=True, exist_ok=True)
    return s
