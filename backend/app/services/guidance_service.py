"""Gemini narrates immutable, role-filtered playbook steps; never decides scope."""
import asyncio
import json
import re
import time
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.config import settings
from app.services.demo_store import now

SAFETY_TEXT = 'Gemini diễn đạt lại hướng dẫn. Containment là đề xuất. Quyết định cuối cùng thuộc người phụ trách.'
FAILURE_LABELS = {
    'disabled': 'AI chưa được bật.', 'not_configured': 'Chưa cấu hình khóa Gemini.',
    'policy_blocked': 'Chính sách không cho phép gửi dữ liệu.',
    'origin_blocked': 'Chỉ dữ liệu synthetic được phép gửi.',
    'host_blocked': 'Địa chỉ provider không được phép.', 'model_blocked': 'Model demo không hợp lệ.',
    'timeout': 'Gemini quá thời gian chờ.', 'network': 'Không kết nối được Gemini.',
    'upstream_http': 'Gemini tạm thời không khả dụng.', 'refusal': 'Gemini không trả nội dung.',
    'schema_violation': 'Nội dung Gemini không đáp ứng kiểm tra an toàn.',
}


class NarratedStep(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    text: str = Field(min_length=1, max_length=1500)
    citations: list[str] = Field(min_length=1, max_length=8)


class Narrative(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    summary: str = Field(min_length=1, max_length=1500)
    citations: list[str] = Field(min_length=1, max_length=8)
    steps: dict[str, NarratedStep]


def context_for(incident):
    # Copy only reviewed playbook text. Never send user reports, graph IDs, raw
    # topology, scope, evidence from a real factory, or arbitrary client text.
    steps = incident['steps']
    return {'incident_type': incident['incident_type'], 'steps': steps,
            'evidence': [{'ref': 'e1', 'label': 'Sự cố được tạo bởi mô phỏng synthetic', 'source': 'machine_event'}]}


def guard(incident):
    if settings.INAV_AI_MODE != 'gemini':
        return 'disabled'
    if settings.INAV_DATA_POLICY != 'external_approved_synthetic':
        return 'policy_blocked'
    if incident.get('origin') != 'synthetic':
        return 'origin_blocked'
    try:
        url = urlsplit(settings.INAV_GEMINI_ENDPOINT)
        port = url.port
    except ValueError:
        return 'host_blocked'
    if (url.scheme != 'https' or url.hostname != 'generativelanguage.googleapis.com'
            or port not in (None, 443) or url.username or url.password
            or url.path not in ('', '/') or url.query or url.fragment):
        return 'host_blocked'
    if settings.INAV_LLM_MODEL != 'gemini-3.5-flash':
        return 'model_blocked'
    if not settings.INAV_GEMINI_API_KEY.get_secret_value():
        return 'not_configured'
    return None


def validate_narrative(value, context):
    narrative = Narrative.model_validate(value)
    if set(narrative.steps) != {s['id'] for s in context['steps']}:
        raise ValueError('step mismatch')
    references = {'e1', *(s['id'] for s in context['steps'])}
    if not set(narrative.citations) <= references:
        raise ValueError('summary citation mismatch')
    for ident, step in narrative.steps.items():
        if ident not in step.citations or not set(step.citations) <= references:
            raise ValueError('uncited step')
    text = json.dumps(narrative.model_dump(), ensure_ascii=False)
    # Prevent provider echoes of secrets/internal identifiers and absolute authority.
    key = settings.INAV_GEMINI_API_KEY.get_secret_value()
    if (key and key in text) or re.search(r'\b(?:EQ_|STEP_|DEP_|BATCH_)\w+|https?://|AIza[\w-]+', text, re.I):
        raise ValueError('internal data')
    if re.search(r'đã xác nhận nguyên nhân|chắc chắn phải|root cause is confirmed|must isolate|approval granted', text, re.I):
        raise ValueError('decision claim')
    return narrative.model_dump()


async def call_gemini(context):
    instruction = (
        'Diễn đạt lại bằng tiếng Việt CHỈ các bước đã cung cấp. Không bổ sung thao tác, '
        'kết luận nguyên nhân, scope, containment, phê duyệt hoặc quyết định. '
        'Tóm tắt phải có citations; mỗi bước giữ đúng id và citations chứa chính id đó. '
        'Chỉ dùng evidence ref hoặc step id được cung cấp. Không nêu mã graph. '
        'Nêu rõ hướng dẫn cần người phụ trách xem xét. Trả JSON theo schema.'
    )
    async with httpx.AsyncClient(timeout=settings.INAV_LLM_TIMEOUT, follow_redirects=False, trust_env=False) as client:
        response = await client.post(
            settings.INAV_GEMINI_ENDPOINT.rstrip('/') + '/v1beta/models/gemini-3.5-flash:generateContent',
            headers={'x-goog-api-key': settings.INAV_GEMINI_API_KEY.get_secret_value()},
            json={'systemInstruction': {'parts': [{'text': instruction}]},
                  'contents': [{'role': 'user', 'parts': [{'text': json.dumps(context, ensure_ascii=False)}]}],
                  'generationConfig': {'temperature': 0, 'responseMimeType': 'application/json',
                                       'responseJsonSchema': Narrative.model_json_schema()}},
        )
        response.raise_for_status()
        data = response.json()
        candidates = data.get('candidates', [])
        if not candidates or candidates[0].get('finishReason') != 'STOP':
            return None
        parts = candidates[0].get('content', {}).get('parts', [])
        text = ''.join(p.get('text', '') for p in parts if not p.get('thought'))
        return json.loads(text) if text.strip() else None


async def explain(incident, store):
    started = time.monotonic()
    failure = guard(incident)
    narrative = None
    context = context_for(incident)
    if not failure:
        try:
            value = await asyncio.wait_for(call_gemini(context), timeout=settings.INAV_LLM_TIMEOUT)
            if value is None:
                failure = 'refusal'
            else:
                narrative = validate_narrative(value, context)
        except (TimeoutError, httpx.TimeoutException):
            failure = 'timeout'
        except httpx.HTTPStatusError:
            failure = 'upstream_http'
        except httpx.RequestError:
            failure = 'network'
        except (ValidationError, ValueError, TypeError, KeyError, AttributeError):
            failure = 'schema_violation'
    mode = 'llm' if narrative else 'knowledge'
    store.put('audit', str(uuid4()), {'incident_id': incident['id'], 'at': now(),
              'model': settings.INAV_LLM_MODEL, 'latency_ms': round((time.monotonic() - started) * 1000),
              'mode': mode, 'failure_category': failure})
    return {'mode': mode, 'model': settings.INAV_LLM_MODEL, 'narrative': narrative,
            'steps': incident['steps'], 'safety': SAFETY_TEXT,
            'evidence': [{'label': e['label'], 'source': e['source']} for e in context['evidence']],
            'failure_category': failure, 'failure_reason': FAILURE_LABELS.get(failure)}
