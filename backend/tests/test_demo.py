import asyncio
import copy
import json

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.main import app
from app.services.demo_store import DemoStore
from app.services import guidance_service as guidance


@pytest.fixture
def incident():
    return {'id': 'demo-incident', 'origin': 'synthetic', 'state': 'dispatched', 'incident_type': 'MACHINE_BREAKDOWN',
            'steps': [{'id': 's1', 'text': 'Kiểm tra theo playbook.'}],
            'history': [], 'simulation': {'origin_id': 'EQ_PRIVATE'}, 'node_id': 'EQ_PRIVATE',
            'containment': {'status': 'proposal', 'human_review_required': True, 'text': 'Xem xét playbook.'}}


def valid():
    return {'summary': 'Hướng dẫn cần người phụ trách xem xét.', 'citations': ['e1'],
            'steps': {'s1': {'text': 'Xem lại hướng dẫn trong playbook.', 'citations': ['s1', 'e1']}}}


@pytest.mark.asyncio
async def test_real_provider_http_contract(configured, incident, store, monkeypatch):
    async def handle(request):
        assert request.url.host == 'generativelanguage.googleapis.com'
        assert request.url.path.endswith('/gemini-3.5-flash:generateContent')
        assert request.headers['x-goog-api-key'] == 'secret-test-token'
        assert 'key=' not in str(request.url)
        assert 'EQ_PRIVATE' not in request.content.decode()
        assert 'secret-test-token' not in request.content.decode()
        body = json.loads(request.content)
        assert body['generationConfig']['responseMimeType'] == 'application/json'
        return httpx.Response(200, json={'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps(valid())}]}}]})
    original = httpx.AsyncClient
    monkeypatch.setattr(guidance.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handle), **kw))
    before = copy.deepcopy(incident)
    result = await guidance.explain(incident, store)
    assert result['mode'] == 'llm'
    assert result['narrative'] == valid()
    assert result['model'] == 'gemini-3.5-flash'
    assert result['evidence'][0]['source'] == 'machine_event'
    assert incident == before
    assert not store.all('lesson')
    assert store.all('audit')[0]['failure_category'] is None
    assert 'secret-test-token' not in json.dumps(result) + json.dumps(store.all('audit'))


@pytest.mark.asyncio
@pytest.mark.parametrize('category', ['timeout', 'network', 'upstream_http', 'refusal', 'schema_violation'])
async def test_provider_fallbacks(configured, incident, store, monkeypatch, category):
    async def provider(_):
        if category == 'timeout': raise httpx.ReadTimeout('private secret-test-token')
        if category == 'network': raise httpx.ConnectError('private secret-test-token')
        if category == 'upstream_http':
            r = httpx.Response(503, request=httpx.Request('POST', 'https://provider'))
            raise httpx.HTTPStatusError('private secret-test-token', request=r.request, response=r)
        if category == 'refusal': return None
        return {'summary': 'malformed'}
    monkeypatch.setattr(guidance, 'call_gemini', provider)
    before = copy.deepcopy(incident)
    result = await guidance.explain(incident, store)
    assert result['mode'] == 'knowledge'
    assert result['steps'] == before['steps']
    assert result['narrative'] is None
    assert result['failure_category'] == category
    assert incident == before
    assert 'secret-test-token' not in json.dumps(result) + json.dumps(store.all('audit'))
    assert store.all('audit')[0]['latency_ms'] >= 0
    assert not store.all('lesson')


@pytest.mark.asyncio
@pytest.mark.parametrize('status', [400, 401, 403, 429, 500, 503])
async def test_upstream_status_fallback(configured, incident, store, monkeypatch, status):
    original = httpx.AsyncClient
    monkeypatch.setattr(guidance.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(lambda _: httpx.Response(status, text='private secret-test-token')), **kw))
    result = await guidance.explain(incident, store)
    assert result['failure_category'] == 'upstream_http'
    assert result['steps'] == incident['steps']


@pytest.mark.asyncio
@pytest.mark.parametrize('field,value,category', [
    ('INAV_AI_MODE', 'knowledge', 'disabled'), ('INAV_DATA_POLICY', 'local_only', 'policy_blocked'),
    ('INAV_GEMINI_API_KEY', SecretStr(''), 'not_configured'),
    ('INAV_GEMINI_ENDPOINT', 'https://evil.example', 'host_blocked'),
    ('INAV_GEMINI_ENDPOINT', 'https://generativelanguage.googleapis.com.evil.example', 'host_blocked'),
    ('INAV_GEMINI_ENDPOINT', 'http://generativelanguage.googleapis.com', 'host_blocked'),
    ('INAV_GEMINI_ENDPOINT', 'https://generativelanguage.googleapis.com?key=leak', 'host_blocked'),
    ('INAV_GEMINI_ENDPOINT', 'https://generativelanguage.googleapis.com:invalid', 'host_blocked'),
    ('INAV_GEMINI_ENDPOINT', 'https://generativelanguage.googleapis.com:8443', 'host_blocked'),
    ('INAV_GEMINI_ENDPOINT', 'https://user:password@generativelanguage.googleapis.com', 'host_blocked'),
    ('INAV_LLM_MODEL', 'unapproved-model', 'model_blocked')])
async def test_egress_guard(configured, incident, store, monkeypatch, field, value, category):
    monkeypatch.setattr(settings, field, value)
    async def forbidden(_): pytest.fail('egress must not happen')
    monkeypatch.setattr(guidance, 'call_gemini', forbidden)
    result = await guidance.explain(incident, store)
    assert result['failure_category'] == category


@pytest.mark.asyncio
@pytest.mark.parametrize('origin', ['real', 'unknown', None])
async def test_non_synthetic_origin_blocked(configured, incident, store, monkeypatch, origin):
    incident['origin'] = origin
    async def forbidden(_): pytest.fail('egress must not happen')
    monkeypatch.setattr(guidance, 'call_gemini', forbidden)
    assert (await guidance.explain(incident, store))['failure_category'] == 'origin_blocked'


@pytest.mark.asyncio
@pytest.mark.parametrize('mutation', ['extra_step', 'missing_step', 'uncited', 'foreign_citation', 'decision', 'secret', 'graph_id', 'extra_field'])
async def test_invalid_narrative_never_saved(configured, incident, store, monkeypatch, mutation):
    data = valid()
    if mutation == 'extra_step': data['steps']['s2'] = {'text': 'Extra', 'citations': ['s2']}
    if mutation == 'missing_step': data['steps'] = {}
    if mutation == 'uncited': data['steps']['s1']['citations'] = ['e1']
    if mutation == 'foreign_citation': data['citations'] = ['private-id']
    if mutation == 'decision': data['summary'] = 'Đã xác nhận nguyên nhân'
    if mutation == 'secret': data['summary'] = 'secret-test-token'
    if mutation == 'graph_id': data['summary'] = 'EQ_PRIVATE'
    if mutation == 'extra_field': data['containment'] = 'approved'
    async def provider(_): return data
    monkeypatch.setattr(guidance, 'call_gemini', provider)
    result = await guidance.explain(incident, store)
    assert result['failure_category'] == 'schema_violation'
    assert result['narrative'] is None
    assert store.all('lesson') == []


@pytest.mark.asyncio
async def test_total_timeout(configured, incident, store, monkeypatch):
    monkeypatch.setattr(settings, 'INAV_LLM_TIMEOUT', .01)
    async def slow(_): await asyncio.sleep(1)
    monkeypatch.setattr(guidance, 'call_gemini', slow)
    assert (await guidance.explain(incident, store))['failure_category'] == 'timeout'


@pytest.mark.asyncio
async def test_health_never_calls_provider(configured, monkeypatch):
    async def forbidden(_): pytest.fail('health must not call Gemini')
    async def connected(): return True
    from app.core.database import db_pool
    monkeypatch.setattr(guidance, 'call_gemini', forbidden)
    monkeypatch.setattr(db_pool, 'verify_connectivity', connected)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = (await client.get('/health')).json()
    assert response['capabilities']['synthetic_ingestion'] == 'enabled'
    assert response['dependencies']['ai'] == {'mode': 'gemini', 'configured': True, 'policy': 'external_approved_synthetic'}
    assert 'secret-test-token' not in json.dumps(response)


def test_persistence_and_atomic_command(tmp_path):
    path = str(tmp_path / 'store.sqlite')
    first = DemoStore(path)
    def action():
        first.write('incident', {'id': 'one', 'state': 'resolved'})
        return {'id': 'one'}
    first.command('key-123456', 'fingerprint', action)
    first.db.close()
    second = DemoStore(path)
    assert second.get('incident', 'one')['state'] == 'resolved'
    assert second.command('key-123456', 'fingerprint', lambda: pytest.fail('duplicate action')) == {'id': 'one'}
    def failure():
        second.write('incident', {'id': 'two'})
        raise ValueError('interrupt')
    with pytest.raises(ValueError): second.command('failure-key', 'mark', failure)
    assert second.get('incident', 'two') is None
    second.db.close()
