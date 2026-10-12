"""Demo contract (docs/api.md, "Contract dự kiến"): impact rule, context guidance, LLM retry/ask and HTTP workflow."""
from datetime import datetime
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio

from app.api.v1 import demo
from app.core.config import settings
from app.core.database import get_db_driver
from app.main import app
from app.schemas.incident import SimulationResponse
from app.services import guidance_service as guidance
from app.services import impact_service
from app.services.demo_store import get_demo_store
from app.services.recommendation_service import GRAPH_ID, RecommendationService

ALARM = datetime.fromisoformat('2026-10-05T08:20:00+07:00')
OVEN = {'id': 'EQ_OVEN_01', 'type': 'Equipment', 'name': 'Reflow Oven Alpha'}
PACK = {'id': 'EQ_PACK_01', 'type': 'Equipment', 'name': 'Packaging Cell 01'}
CHECK = {'id': 'CHK_OVEN_0730', 'at': '2026-10-05T07:30:00+07:00', 'result': 'PASS'}


def at(clock):
    return clock and f'2026-10-05T{clock}:00+07:00'


def batch(ident, step_seq, record=None, inspection=None):
    return {'id': ident, 'name': ident, 'product_code': 'PRD-A', 'step_seq': step_seq, 'step_name': f'step {step_seq}',
            'record': record, 'inspection': inspection}


def record(start, end):
    return {'id': f'REC_{start}', 'start': at(start), 'end': at(end)}


# Case from docs/demo-script.md: the oven is step 3; 001 entered it at 07:50 and is still there, 002 is at SMT,
# 003 left at 07:20 (before the 07:30 passing check) and passed AOI, 004 entered at 07:10 with no end time.
BATCHES = [batch('BATCH_2026_001', 3, record('07:50', None)), batch('BATCH_2026_002', 2),
           batch('BATCH_2026_003', 5, record('06:40', '07:20'), {'id': 'AOI_003', 'result': 'PASS', 'at': at('07:45')}),
           batch('BATCH_2026_004', 4, record('07:10', None))]


def categories(result):
    return {i['object_id']: i['category'] for i in result['items']}


def test_impact_rule_main_case():
    result = impact_service.classify(BATCHES, [CHECK], ALARM, 3)
    assert categories(result) == {'BATCH_2026_001': 'affected', 'BATCH_2026_002': 'unaffected',
                                  'BATCH_2026_003': 'unaffected', 'BATCH_2026_004': 'unknown'}
    assert result['window']['start_basis'] == 'CHK_OVEN_0730'
    reasons = {i['object_id']: i['reasons'][0] for i in result['items']}
    assert reasons['BATCH_2026_001']['code'] == 'in_equipment_at_alarm'
    assert 'CHK_OVEN_0730' in reasons['BATCH_2026_003']['refs']
    assert reasons['BATCH_2026_004']['code'] == 'missing_end_time'


@pytest.mark.parametrize('checks', [[], [{**CHECK, 'result': 'FAIL'}], [{**CHECK, 'at': at('09:00')}]])
def test_impact_changes_with_evidence(checks):
    # No passing check before the alarm: 003 can no longer be excluded; 001 is still in the oven at the alarm.
    result = categories(impact_service.classify(BATCHES, checks, ALARM, 3))
    assert result['BATCH_2026_003'] == 'unknown'
    assert result['BATCH_2026_001'] == 'affected'


def test_processing_inside_window_is_affected():
    assert categories(impact_service.classify([batch('LATE', 4, record('07:35', '08:05'))], [CHECK], ALARM, 3)) == {'LATE': 'affected'}


def test_missing_data_is_never_unaffected():
    rows = [batch('NO_LOCATION', None), batch('PASSED_WITHOUT_RECORD', 4), batch('NO_TIMES', 4, record(None, None))]
    assert set(categories(impact_service.classify(rows, [CHECK], ALARM, 3)).values()) == {'unknown'}


def test_guidance_matches_asset_not_only_incident_type():
    service = RecommendationService()
    oven = service.get_context_guidance(OVEN, 'MACHINE_BREAKDOWN')
    assert oven['source'] == 'playbook:EQ_OVEN_01/MACHINE_BREAKDOWN'
    assert any('heater' in step['text'] for step in oven['steps'])
    assert 'Reflow Oven Alpha' in oven['steps'][0]['text']
    assert not any(GRAPH_ID.search(step['text']) for step in oven['steps'])
    assert service.get_context_guidance(PACK, 'MACHINE_BREAKDOWN') is None
    assert service.get_context_guidance(OVEN, 'CYCLE_TIME_SPIKE') is None


LLM_INCIDENT = {'id': 'inc', 'origin': 'synthetic', 'incident_type': 'MACHINE_BREAKDOWN',
                'steps': [{'id': 's1', 'text': 'Kiểm tra heater của Reflow Oven Alpha.'}],
                'lessons': [{'text': 'Kiểm tra SSR của EQ_OVEN_01 trước khi thay heater.'}],
                'evidence': [{'ref': 'e1', 'label': 'Lệch nhiệt độ vùng gia nhiệt', 'source': 'machine_event'}]}


def http_error(status):
    response = httpx.Response(status, request=httpx.Request('POST', 'https://provider'))
    return httpx.HTTPStatusError('provider error', request=response.request, response=response)


@pytest.mark.asyncio
async def test_transient_provider_error_is_retried(configured, store, monkeypatch):
    calls = []

    async def provider(context):
        calls.append(context)
        if len(calls) == 1:
            raise http_error(503)
        return {'summary': 'Cần người phụ trách xem xét.', 'citations': ['e1', 'l1'],
                'steps': {s['id']: {'text': s['text'], 'citations': [s['id']]} for s in context['steps']}}
    monkeypatch.setattr(guidance, 'call_gemini', provider)
    result = await guidance.explain(LLM_INCIDENT, store)
    assert result['mode'] == 'llm' and len(calls) == 2
    assert store.all('audit')[0]['attempts'] == 2
    # Lesson text reaches the provider with graph IDs masked.
    assert calls[0]['lessons'] == [{'ref': 'l1', 'text': 'Kiểm tra SSR của thiết bị liên quan trước khi thay heater.'}]


@pytest.mark.asyncio
async def test_client_error_is_not_retried(configured, store, monkeypatch):
    calls = []

    async def provider(_):
        calls.append(1)
        raise http_error(400)
    monkeypatch.setattr(guidance, 'call_gemini', provider)
    assert (await guidance.explain(LLM_INCIDENT, store))['failure_category'] == 'upstream_http'
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_knowledge_gap_never_calls_provider(configured, store, monkeypatch):
    async def forbidden(*_): pytest.fail('nothing to narrate')
    monkeypatch.setattr(guidance, 'call_gemini', forbidden)
    monkeypatch.setattr(guidance, 'call_gemini_ask', forbidden)
    gap = {**LLM_INCIDENT, 'steps': [], 'lessons': []}
    assert (await guidance.explain(gap, store))['failure_category'] == 'no_guidance'
    assert (await guidance.ask(gap, 'Kiểm tra gì?', store))['failure_category'] == 'no_guidance'


@pytest.mark.asyncio
async def test_ask_returns_cited_answer(configured, store, monkeypatch):
    async def provider(context, question):
        assert question == 'Nên kiểm tra gì trước?'
        return {'answer': 'Theo bước 1 và bài học 1, kiểm tra SSR trước khi thay heater.', 'citations': ['s1', 'l1']}
    monkeypatch.setattr(guidance, 'call_gemini_ask', provider)
    result = await guidance.ask(LLM_INCIDENT, 'Nên kiểm tra gì trước?', store)
    assert result['mode'] == 'llm'
    assert result['citations'] == [{'alias': 's1', 'label': 'Bước 1'}, {'alias': 'l1', 'label': 'Bài học 1'}]
    assert store.all('audit')[0]['kind'] == 'ask'


@pytest.mark.asyncio
@pytest.mark.parametrize('answer', [{'answer': 'Kiểm tra heater.', 'citations': ['x9']},
                                    {'answer': 'Kiểm tra EQ_OVEN_01.', 'citations': ['s1']},
                                    {'answer': 'Đã xác nhận nguyên nhân là heater.', 'citations': ['s1']}])
async def test_ask_rejects_unsafe_answers(configured, store, monkeypatch, answer):
    async def provider(*_): return answer
    monkeypatch.setattr(guidance, 'call_gemini_ask', provider)
    result = await guidance.ask(LLM_INCIDENT, 'Kiểm tra gì?', store)
    assert result['failure_category'] == 'schema_violation'
    assert result['answer'] is None


SCENARIO_ROWS = [
    {'id': 'SCN_OVEN_TEMP', 'event_id': 'EVT_OVEN_TEMP_0820', 'label': 'Lệch nhiệt độ vùng gia nhiệt', 'at': at('08:20'),
     'incident_type': 'MACHINE_BREAKDOWN', 'severity': 1.0, 'asset_id': 'EQ_OVEN_01', 'asset_type': 'Equipment', 'asset_name': 'Reflow Oven Alpha'},
    {'id': 'SCN_PACK_JAM', 'event_id': 'EVT_PACK_JAM_0905', 'label': 'Kẹt cơ cấu đóng gói', 'at': at('09:05'),
     'incident_type': 'MACHINE_BREAKDOWN', 'severity': 1.0, 'asset_id': 'EQ_PACK_01', 'asset_type': 'Equipment', 'asset_name': 'Packaging Cell 01'},
]
NODES = [OVEN, PACK, {'id': 'BATCH_2026_001', 'type': 'Batch', 'name': 'Production Batch 001'}]


@pytest.fixture
def graph(monkeypatch):
    """Neo4j stand-in with the demo-script rows; the impact rule itself runs unchanged."""
    async def rows(_driver, query, **params):
        if query == demo.SCENARIO_QUERY:
            return SCENARIO_ROWS
        return [n for n in NODES if n['id'] == params['id']]

    async def simulate(payload, _):
        return SimulationResponse(origin_id=payload.node_id, incident_type=payload.incident_type, impacted_nodes=[], actions_by_department={})

    async def impact(_driver, asset_id, alarm_at):
        return impact_service.classify(BATCHES if asset_id == 'EQ_OVEN_01' else [], [CHECK], alarm_at, 3)

    class Upstream:
        def __init__(self, _): pass
        async def trace_root_causes(self, _): return [{'node_id': 'STEP_SMT', 'type': 'ProcessStep', 'name': 'SMT', 'distance': 1}]
    monkeypatch.setattr(demo, 'graph_rows', rows)
    monkeypatch.setattr(demo, 'simulate_incident', simulate)
    monkeypatch.setattr(demo, 'load_impact', impact)
    monkeypatch.setattr(demo, 'RootCauseService', Upstream)
    monkeypatch.setattr(settings, 'INAV_AI_MODE', 'knowledge')  # never reach a real provider from these tests


@pytest_asyncio.fixture
async def client(store, graph):
    app.dependency_overrides[get_demo_store] = lambda: store
    app.dependency_overrides[get_db_driver] = lambda: None
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test/api/v1') as value:
            yield value
    finally:
        app.dependency_overrides.clear()


def as_actor(actor, key=None):
    headers = {'X-Demo-Actor': actor}
    if key:
        headers['Idempotency-Key'] = key
    return headers


def mutate(actor):
    return as_actor(actor, str(uuid4()))


@pytest.mark.asyncio
async def test_actor_and_origin_validation(client):
    assert (await client.get('/incidents')).json()['detail']['code'] == 'unknown_actor'
    assert (await client.get('/incidents', headers=as_actor('nobody'))).status_code == 400
    denied = await client.post('/scenarios/SCN_OVEN_TEMP/trigger', headers=mutate('tech-01'))
    assert denied.status_code == 403 and denied.json()['detail']['code'] == 'forbidden_role'
    wrong = await client.post('/incidents/fault', json={'node_id': 'BATCH_2026_001', 'incident_type': 'MACHINE_BREAKDOWN'}, headers=mutate('op-01'))
    assert wrong.status_code == 422 and wrong.json()['detail']['code'] == 'origin_type_mismatch'
    missing = await client.post('/incidents/fault', json={'node_id': 'EQ_NONE', 'incident_type': 'MACHINE_BREAKDOWN'}, headers=mutate('op-01'))
    assert missing.status_code == 404
    assert (await client.post('/scenarios/SCN_NONE/trigger', headers=mutate('op-01'))).status_code == 404
    assert (await client.get('/incidents', headers=as_actor('op-01'))).json() == []


@pytest.mark.asyncio
async def test_main_case_workflow(client, store):
    created = await client.post('/scenarios/SCN_OVEN_TEMP/trigger', headers=mutate('op-01'))
    assert created.status_code == 201
    incident = created.json()
    ident = incident['id']
    assert incident['state'] == 'alert' and incident['event']['id'] == 'EVT_OVEN_TEMP_0820' and incident['asset'] == OVEN
    # The same event never creates a second incident.
    again = await client.post('/scenarios/SCN_OVEN_TEMP/trigger', headers=mutate('op-01'))
    assert again.status_code == 200 and again.json()['id'] == ident
    assert len(store.all(demo.INCIDENTS)) == 1

    impact = (await client.get(f'/incidents/{ident}/impact', headers=as_actor('op-01'))).json()
    assert categories(impact) == {'BATCH_2026_001': 'affected', 'BATCH_2026_002': 'unaffected',
                                  'BATCH_2026_003': 'unaffected', 'BATCH_2026_004': 'unknown'}
    assert impact['propagation']['basis'] == 'heuristic_hops' and impact['upstream_candidates']['basis'] == 'investigation_only'

    bad = await client.post(f'/incidents/{ident}/dispatch', json={'assignee_id': 'exp-01', 'decision_note': 'x'}, headers=mutate('op-01'))
    assert bad.status_code == 422 and 'assignee_id' in bad.json()['detail']['fields']
    dispatch_key = mutate('op-01')
    body = {'assignee_id': 'tech-01', 'decision_note': 'Giữ lô affected/unknown, giao tech-01'}
    dispatched = (await client.post(f'/incidents/{ident}/dispatch', json=body, headers=dispatch_key)).json()
    assert dispatched['assignee'] == {'id': 'tech-01', 'name': 'Kỹ thuật viên 1'}
    assert dispatched['history'][-1]['actor_id'] == 'op-01' and dispatched['history'][-1]['note'] == body['decision_note']
    assert (await client.post(f'/incidents/{ident}/dispatch', json=body, headers=dispatch_key)).json() == dispatched
    reused_key = await client.post(f'/incidents/{ident}/dispatch', json={**body, 'decision_note': 'khác'}, headers=dispatch_key)
    assert reused_key.status_code == 409 and reused_key.json()['detail']['code'] == 'idempotency_conflict'

    # Only the assignee sees and acts on the work order; technicians never get the propagation graph.
    assert (await client.get('/incidents', headers=as_actor('tech-02'))).json() == []
    assert (await client.get(f'/incidents/{ident}', headers=as_actor('tech-02'))).json()['detail']['code'] == 'not_assignee'
    assert (await client.post(f'/incidents/{ident}/start', json={}, headers=mutate('tech-02'))).status_code == 403
    mine = (await client.get('/incidents', headers=as_actor('tech-01'))).json()
    assert [i['id'] for i in mine] == [ident] and 'simulation' not in mine[0]
    tech_impact = (await client.get(f'/incidents/{ident}/impact', headers=as_actor('tech-01'))).json()
    assert 'propagation' not in tech_impact and len(tech_impact['items']) == 4
    assert (await client.post(f'/incidents/{ident}/start', json={}, headers=mutate('tech-01'))).json()['state'] == 'in_progress'

    guidance_view = (await client.get(f'/incidents/{ident}/guidance', headers=as_actor('tech-01'))).json()
    assert guidance_view['match']['source'] == 'playbook:EQ_OVEN_01/MACHINE_BREAKDOWN' and guidance_view['gap'] is None
    assert guidance_view['containment']['human_review_required'] is True
    explained = (await client.post(f'/incidents/{ident}/guidance/explain', headers=as_actor('tech-01'))).json()
    assert explained['mode'] == 'knowledge' and explained['steps'] == guidance_view['steps']
    assert [e['source'] for e in explained['evidence']] == ['machine_event', 'impact_rule']

    not_fixed = {'checks': [{'text': 'Đo thermocouple vùng 3', 'result': 'Sai lệch 12°C'}], 'actions': ['Thay SSR vùng 3'],
                 'outcome': 'not_fixed', 'summary': 'Chờ thermocouple', 'next_step': '', 'open_items': []}
    missing_next = await client.post(f'/incidents/{ident}/report', json=not_fixed, headers=mutate('tech-01'))
    assert missing_next.status_code == 422 and 'next_step' in missing_next.json()['detail']['fields']
    report_key = mutate('tech-01')
    not_fixed['next_step'] = 'Lắp thermocouple mới khi kho xác nhận'
    unresolved = (await client.post(f'/incidents/{ident}/report', json=not_fixed, headers=report_key)).json()
    assert unresolved['state'] == 'unresolved' and unresolved['next_step'] == not_fixed['next_step']
    assert (await client.post(f'/incidents/{ident}/report', json=not_fixed, headers=report_key)).json() == unresolved
    assert len(store.get(demo.INCIDENTS, ident)['reports']) == 1
    # A machine result never releases batches.
    assert categories((await client.get(f'/incidents/{ident}/impact', headers=as_actor('op-01'))).json())['BATCH_2026_001'] == 'affected'

    assert (await client.post(f'/incidents/{ident}/dispatch', json={'assignee_id': 'tech-01', 'decision_note': 'Đã có linh kiện'},
                              headers=mutate('op-01'))).json()['state'] == 'dispatched'
    await client.post(f'/incidents/{ident}/start', json={}, headers=mutate('tech-01'))
    fixed = {**not_fixed, 'outcome': 'fixed', 'summary': 'Đã thay thermocouple, profile đạt', 'next_step': ''}
    resolved = (await client.post(f'/incidents/{ident}/report', json=fixed, headers=mutate('tech-01'))).json()
    assert resolved['state'] == 'resolved' and resolved['next_step'] is None and len(resolved['reports']) == 2
    assert [h['action'] for h in resolved['history']] == ['create', 'dispatch', 'start', 'report', 'dispatch', 'start', 'report']
    assert (await client.post(f'/incidents/{ident}/report', json=fixed, headers=mutate('tech-01'))).json()['detail']['code'] == 'invalid_transition'


async def resolved_incident(client, source='SCN_OVEN_TEMP'):
    ident = (await client.post(f'/scenarios/{source}/trigger', headers=mutate('op-01'))).json()['id']
    await client.post(f'/incidents/{ident}/dispatch', json={'assignee_id': 'tech-01', 'decision_note': 'Giao'}, headers=mutate('op-01'))
    await client.post(f'/incidents/{ident}/start', json={}, headers=mutate('tech-01'))
    await client.post(f'/incidents/{ident}/report', json={'outcome': 'fixed', 'summary': 'Đã sửa'}, headers=mutate('tech-01'))
    return ident


@pytest.mark.asyncio
async def test_lesson_review_and_reuse(client):
    source = await resolved_incident(client)
    proposed = await client.post(f'/incidents/{source}/lessons', json={'text': 'Kiểm tra SSR trước khi thay heater'}, headers=mutate('tech-01'))
    assert proposed.status_code == 201
    lesson = proposed.json()
    assert lesson['status'] == 'pending' and lesson['source'] == {'incident_id': source, 'report_index': 0, 'author_id': 'tech-01'}
    assert (await client.get('/lessons', headers=as_actor('tech-01'))).status_code == 403

    # Pending knowledge is not guidance.
    fresh = (await client.post('/incidents/fault', json={'node_id': 'EQ_OVEN_01', 'incident_type': 'MACHINE_BREAKDOWN'}, headers=mutate('op-01'))).json()
    assert (await client.get(f'/incidents/{fresh["id"]}/guidance', headers=as_actor('op-01'))).json()['lessons'] == []

    edited = (await client.patch(f'/lessons/{lesson["id"]}', json={'text': 'Đo SSR vùng lỗi trước khi thay heater'}, headers=mutate('exp-01'))).json()
    assert edited['text'] != edited['original_text'] and edited['status'] == 'pending'
    accepted = (await client.post(f'/lessons/{lesson["id"]}/accept', json={}, headers=mutate('exp-01'))).json()
    assert accepted['status'] == 'accepted' and accepted['review']['by'] == 'exp-01'
    assert (await client.post(f'/lessons/{lesson["id"]}/reject', json={'reason': 'x'}, headers=mutate('exp-01'))).status_code == 409

    reused = (await client.get(f'/incidents/{fresh["id"]}/guidance', headers=as_actor('op-01'))).json()['lessons']
    assert [(l['text'], l['source_incident_id']) for l in reused] == [('Đo SSR vùng lỗi trước khi thay heater', source)]

    rejected_source = await resolved_incident(client, 'SCN_PACK_JAM')
    other = (await client.post(f'/incidents/{rejected_source}/lessons', json={'text': 'Gõ nhẹ cơ cấu'}, headers=mutate('tech-01'))).json()
    rejected = (await client.post(f'/lessons/{other["id"]}/reject', json={'reason': 'Không an toàn'}, headers=mutate('exp-01'))).json()
    assert rejected['status'] == 'rejected' and rejected['review']['reason'] == 'Không an toàn'
    pack = (await client.get(f'/incidents/{rejected_source}/guidance', headers=as_actor('op-01'))).json()
    assert pack['lessons'] == [] and pack['steps'] == [] and pack['gap']['code'] == 'knowledge_gap'
    assert [l['status'] for l in (await client.get('/lessons', params={'status': 'pending'}, headers=as_actor('exp-01'))).json()] == []


@pytest.mark.asyncio
async def test_lesson_requires_report(client):
    ident = (await client.post('/scenarios/SCN_OVEN_TEMP/trigger', headers=mutate('op-01'))).json()['id']
    await client.post(f'/incidents/{ident}/dispatch', json={'assignee_id': 'tech-01', 'decision_note': 'Giao'}, headers=mutate('op-01'))
    early = await client.post(f'/incidents/{ident}/lessons', json={'text': 'Sớm'}, headers=mutate('tech-01'))
    assert early.status_code == 409 and early.json()['detail']['code'] == 'report_required'


@pytest.mark.asyncio
async def test_default_store_persists_across_restart(tmp_path, monkeypatch, graph):
    from app.services import demo_store
    monkeypatch.setattr(settings, 'INAV_STORE_PATH', str(tmp_path / 'demo.sqlite'))
    monkeypatch.setattr(demo_store, '_store', None)
    app.dependency_overrides[get_db_driver] = lambda: None
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test/api/v1') as client:
            ident = (await client.post('/scenarios/SCN_OVEN_TEMP/trigger', headers=mutate('op-01'))).json()['id']
        demo_store._store.db.close()
        monkeypatch.setattr(demo_store, '_store', None)  # simulated backend restart
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test/api/v1') as client:
            assert (await client.get(f'/incidents/{ident}', headers=as_actor('op-01'))).json()['state'] == 'alert'
        demo_store._store.db.close()
    finally:
        app.dependency_overrides.clear()
