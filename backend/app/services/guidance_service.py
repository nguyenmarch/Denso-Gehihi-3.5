"""Gemini narrates or answers from the incident's reviewed guidance; it never decides scope."""
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
from app.services.recommendation_service import GRAPH_ID

SAFETY_TEXT = 'Gemini diễn đạt lại hướng dẫn. Containment là đề xuất. Quyết định cuối cùng thuộc người phụ trách.'
FAILURE_LABELS = {
    'disabled': 'AI chưa được bật.', 'not_configured': 'Chưa cấu hình khóa Gemini.',
    'policy_blocked': 'Chính sách không cho phép gửi dữ liệu.',
    'origin_blocked': 'Chỉ dữ liệu synthetic được phép gửi.',
    'host_blocked': 'Địa chỉ provider không được phép.', 'model_blocked': 'Model demo không hợp lệ.',
    'timeout': 'Gemini quá thời gian chờ.', 'network': 'Không kết nối được Gemini.',
    'upstream_http': 'Gemini tạm thời không khả dụng.', 'refusal': 'Gemini không trả nội dung.',
    'schema_violation': 'Nội dung Gemini không đáp ứng kiểm tra an toàn.',
    'no_guidance': 'Chưa có hướng dẫn cho ngữ cảnh này nên không có gì để Gemini diễn đạt.',
}
# Provider overload/rate limits are often transient; retry them within the total INAV_LLM_TIMEOUT.
RETRYABLE_STATUS = {429, 500, 502, 503, 504}
RETRY_DELAYS = (1.0, 2.0)


class NarratedStep(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    text: str = Field(min_length=1, max_length=1500)
    citations: list[str] = Field(min_length=1, max_length=8)


class Narrative(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    summary: str = Field(min_length=1, max_length=1500)
    citations: list[str] = Field(min_length=1, max_length=8)
    steps: dict[str, NarratedStep]


class Answer(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    answer: str = Field(min_length=1, max_length=2000)
    citations: list[str] = Field(min_length=1, max_length=8)


def context_for(incident):
    # Only reviewed text: playbook steps, expert-accepted lessons and evidence labels built by the
    # server. Never technician reports, graph IDs, raw topology or decisions.
    lessons = [{'ref': f'l{i + 1}', 'text': GRAPH_ID.sub('thiết bị liên quan', lesson['text'])}
               for i, lesson in enumerate(incident.get('lessons', []))]
    evidence = incident.get('evidence') or [{'ref': 'e1', 'label': 'Sự cố được tạo bởi mô phỏng synthetic', 'source': 'machine_event'}]
    return {'incident_type': incident['incident_type'], 'steps': incident['steps'], 'lessons': lessons, 'evidence': evidence}


def references(context):
    return {*(e['ref'] for e in context['evidence']), *(s['id'] for s in context['steps']), *(l['ref'] for l in context['lessons'])}


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


def check_text(value):
    text = json.dumps(value, ensure_ascii=False)
    # Prevent provider echoes of secrets/internal identifiers and absolute authority.
    key = settings.INAV_GEMINI_API_KEY.get_secret_value()
    if (key and key in text) or re.search(r'\b(?:EQ_|STEP_|DEP_|BATCH_)\w+|https?://|AIza[\w-]+', text, re.I):
        raise ValueError('internal data')
    if re.search(r'đã xác nhận nguyên nhân|chắc chắn phải|root cause is confirmed|must isolate|approval granted', text, re.I):
        raise ValueError('decision claim')


def validate_narrative(value, context):
    narrative = Narrative.model_validate(value)
    if set(narrative.steps) != {s['id'] for s in context['steps']}:
        raise ValueError('step mismatch')
    allowed = references(context)
    if not set(narrative.citations) <= allowed:
        raise ValueError('summary citation mismatch')
    for ident, step in narrative.steps.items():
        if ident not in step.citations or not set(step.citations) <= allowed:
            raise ValueError('uncited step')
    check_text(narrative.model_dump())
    return narrative.model_dump()


def validate_answer(value, context):
    answer = Answer.model_validate(value)
    if not set(answer.citations) <= references(context):
        raise ValueError('answer citation mismatch')
    check_text(answer.model_dump())
    return answer.model_dump()


async def post_gemini(instruction, payload, schema):
    async with httpx.AsyncClient(timeout=settings.INAV_LLM_TIMEOUT, follow_redirects=False, trust_env=False) as client:
        response = await client.post(
            settings.INAV_GEMINI_ENDPOINT.rstrip('/') + '/v1beta/models/gemini-3.5-flash:generateContent',
            headers={'x-goog-api-key': settings.INAV_GEMINI_API_KEY.get_secret_value()},
            json={'systemInstruction': {'parts': [{'text': instruction}]},
                  'contents': [{'role': 'user', 'parts': [{'text': json.dumps(payload, ensure_ascii=False)}]}],
                  'generationConfig': {'temperature': 0, 'responseMimeType': 'application/json',
                                       'responseJsonSchema': schema}},
        )
        response.raise_for_status()
        data = response.json()
        candidates = data.get('candidates', [])
        if not candidates or candidates[0].get('finishReason') != 'STOP':
            return None
        parts = candidates[0].get('content', {}).get('parts', [])
        text = ''.join(p.get('text', '') for p in parts if not p.get('thought'))
        return json.loads(text) if text.strip() else None


async def call_gemini(context):
    instruction = (
        'Diễn đạt lại bằng tiếng Việt CHỈ các bước đã cung cấp. Không bổ sung thao tác, '
        'kết luận nguyên nhân, scope, containment, phê duyệt hoặc quyết định. '
        'Tóm tắt phải có citations; mỗi bước giữ đúng id và citations chứa chính id đó. '
        'Chỉ dùng evidence ref, lesson ref hoặc step id được cung cấp. Không nêu mã graph. '
        'Nêu rõ hướng dẫn cần người phụ trách xem xét. Trả JSON theo schema.'
    )
    return await post_gemini(instruction, context, Narrative.model_json_schema())


async def call_gemini_ask(context, question):
    instruction = (
        'Trả lời bằng tiếng Việt câu hỏi của kỹ thuật viên CHỈ dựa trên các bước, bài học và evidence được cung cấp. '
        'Nếu thông tin không có trong đó, nói rõ là hướng dẫn hiện có không đề cập. Không kết luận nguyên nhân, '
        'scope, containment, phê duyệt hoặc quyết định. citations chỉ gồm step id, lesson ref hoặc evidence ref đã dùng. '
        'Không nêu mã graph. Trả JSON theo schema.'
    )
    return await post_gemini(instruction, {**context, 'question': question}, Answer.model_json_schema())


async def with_retry(call, state):
    for delay in (0, *RETRY_DELAYS):
        if delay:
            await asyncio.sleep(delay)
        state['attempts'] += 1
        try:
            return await call()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in RETRYABLE_STATUS or state['attempts'] > len(RETRY_DELAYS):
                raise


async def run(kind, incident, context, call, validate, store):
    """Call the provider under guard, retry and total timeout; audit every outcome."""
    started = time.monotonic()
    state = {'attempts': 0}
    failure = 'no_guidance' if not context['steps'] and not context['lessons'] else guard(incident)
    result = None
    if not failure:
        try:
            value = await asyncio.wait_for(with_retry(lambda: call(context), state), timeout=settings.INAV_LLM_TIMEOUT)
            if value is None:
                failure = 'refusal'
            else:
                result = validate(value, context)
        except (TimeoutError, httpx.TimeoutException):
            failure = 'timeout'
        except httpx.HTTPStatusError:
            failure = 'upstream_http'
        except httpx.RequestError:
            failure = 'network'
        except (ValidationError, ValueError, TypeError, KeyError, AttributeError):
            failure = 'schema_violation'
    store.put('audit', str(uuid4()), {'incident_id': incident['id'], 'kind': kind, 'at': now(),
              'model': settings.INAV_LLM_MODEL, 'latency_ms': round((time.monotonic() - started) * 1000),
              'attempts': state['attempts'], 'mode': 'llm' if result else 'knowledge', 'failure_category': failure})
    return result, failure


async def explain(incident, store):
    context = context_for(incident)
    narrative, failure = await run('explain', incident, context, call_gemini, validate_narrative, store)
    return {'mode': 'llm' if narrative else 'knowledge', 'model': settings.INAV_LLM_MODEL, 'narrative': narrative,
            'steps': incident['steps'], 'safety': SAFETY_TEXT,
            'evidence': [{'label': e['label'], 'source': e['source']} for e in context['evidence']],
            'failure_category': failure, 'failure_reason': FAILURE_LABELS.get(failure)}


async def ask(incident, question, store):
    context = context_for(incident)
    answer, failure = await run('ask', incident, context, lambda c: call_gemini_ask(c, question), validate_answer, store)
    labels = {**{s['id']: f'Bước {s["id"][1:]}' for s in context['steps']},
              **{l['ref']: f'Bài học {l["ref"][1:]}' for l in context['lessons']},
              **{e['ref']: e['label'] for e in context['evidence']}}
    return {'mode': 'llm' if answer else 'knowledge', 'model': settings.INAV_LLM_MODEL,
            'answer': answer['answer'] if answer else None,
            'citations': [{'alias': c, 'label': labels[c]} for c in answer['citations']] if answer else [],
            'safety': SAFETY_TEXT, 'failure_category': failure, 'failure_reason': FAILURE_LABELS.get(failure)}
