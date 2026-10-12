import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.services import guidance_service as guidance
from app.services.demo_store import DemoStore


@pytest.fixture
def store():
    value = DemoStore(':memory:')
    yield value
    value.db.close()


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, 'INAV_AI_MODE', 'gemini')
    monkeypatch.setattr(settings, 'INAV_DATA_POLICY', 'external_approved_synthetic')
    monkeypatch.setattr(settings, 'INAV_GEMINI_API_KEY', SecretStr('secret-test-token'))
    monkeypatch.setattr(settings, 'INAV_GEMINI_ENDPOINT', 'https://generativelanguage.googleapis.com')
    monkeypatch.setattr(settings, 'INAV_LLM_MODEL', 'gemini-3.5-flash')
    monkeypatch.setattr(guidance, 'RETRY_DELAYS', (0, 0))
