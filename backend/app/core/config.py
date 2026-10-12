from pydantic import Field, SecretStr, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Production Incident Propagation System"
    NEO4J_URI: str = "bolt://localhost:7687"
    # Aura's downloaded credentials commonly use NEO4J_USERNAME, while the
    # application convention is NEO4J_USER. Support both so either source can
    # configure the production service.
    NEO4J_USER: str = Field(
        default="neo4j",
        validation_alias=AliasChoices("NEO4J_USER", "NEO4J_USERNAME"),
    )
    NEO4J_PASSWORD: str = "incidentpassword123"
    DECAY_RATE: float = Field(default=0.75, ge=0, le=1)
    MAX_HOPS: int = Field(default=4, ge=1)

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
    INAV_AI_MODE: str = "knowledge"
    INAV_DATA_POLICY: str = "local_only"
    INAV_LLM_MODEL: str = "gemini-3.5-flash"
    INAV_GEMINI_API_KEY: SecretStr = Field(default=SecretStr(""), validation_alias=AliasChoices("INAV_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"))
    INAV_GEMINI_ENDPOINT: str = "https://generativelanguage.googleapis.com"
    INAV_LLM_TIMEOUT: float = Field(default=30, gt=0, le=60)
    INAV_STORE_PATH: str = ".data/demo.sqlite3"
    INAV_TICK_SECONDS: float = Field(default=2, gt=0, le=10)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
