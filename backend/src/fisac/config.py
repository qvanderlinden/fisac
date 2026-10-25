from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-chat-v3-0324:free"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="")

    database_url: str = "postgresql+asyncpg://fisac:fisac@localhost:5432/fisac"

    # Sign-in is done by the shared oauth2-proxy in front of the app, which
    # passes an ID token of the qv-auth issuer on (see auth.py). Admin e-mails
    # are comma-separated. On unless AUTH_DISABLED (local development, tests).
    auth_issuer: str = ""
    auth_audience: str = "oauth2-proxy"
    auth_admin_emails: str = ""
    auth_disabled: bool = False

    # OpenRouter (LLM-assisted flow generation). Key lives only in .env; the
    # default model is a free-tier slug (rotates - override via
    # OPENROUTER_MODEL if it disappears). base_url is overridable so
    # verification can point at a local stub.
    openrouter_api_key: str = ""
    openrouter_model: str = _DEFAULT_OPENROUTER_MODEL
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Comma-separated OpenRouter provider slugs (e.g. "deepseek,novita"). When
    # set, routing is restricted to exactly these providers (provider.only in
    # the request) - some providers mangle the JSON-by-instruction output.
    # Empty = let OpenRouter route freely.
    openrouter_providers: str = ""

    @field_validator("openrouter_model", mode="before")
    @classmethod
    def _model_default_on_empty(cls, value: object) -> object:
        # An env source that always sets the variable passes an empty string
        # when it has no value; that must not override the default.
        if isinstance(value, str) and value.strip() == "":
            return _DEFAULT_OPENROUTER_MODEL
        return value


settings = Settings()
