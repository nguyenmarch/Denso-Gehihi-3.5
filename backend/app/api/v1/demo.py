"""Synthetic demo workflow: scenario incidents, assignment, reports, impact, guidance and lessons."""
import asyncio
import hashlib
import json
from datetime import datetime
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.api.v1.incidents import simulate_incident
from app.core.actors import ACTORS, lookup
from app.core.config import settings
from app.core.database import get_db_driver
from app.models.playbooks import ORIGIN_TYPES
from app.schemas.incident import SimulationRequest
from app.services import guidance_service
from app.services.demo_store import get_demo_store, now
from app.services.impact_service import RULE, load_impact, summary
from app.services.recommendation_service import RecommendationService
from app.services.root_cause_service import RootCauseService

router = APIRouter()
# Incidents of the earlier contract stay in the store under 'incident' and are not served.
INCIDENTS = 'incident_v2'

NODE_QUERY = 'MATCH (n {id: $id}) RETURN n.id AS id, labels(n)[0] AS type, coalesce(n.name, n.id) AS name'
SCENARIO_QUERY = '''
MATCH (v:MachineEvent)-[:RAISED_BY]->(a)
RETURN v.scenario AS id, v.id AS event_id, v.name AS label, v.at AS at, v.incident_type AS incident_type,
       coalesce(v.severity, 1.0) AS severity, a.id AS asset_id, labels(a)[0] AS asset_type, coalesce(a.name, a.id) AS asset_name
ORDER BY id
'''


def fail(status, code, message, fields=None):
    detail = {'code': code, 'message': message}
    if fields:
        detail['fields'] = fields
    raise HTTPException(status, detail=detail)


def current_actor(x_demo_actor: str | None = Header(default=None)):
    # Presentation mode, not authentication. Bound to local-only demo use.
    actor = lookup(x_demo_actor)
    if actor is None:
        fail(400, 'unknown_actor', 'Chọn actor demo hợp lệ (X-Demo-Actor).')
    return actor


def require(actor, *roles):
    if actor['role'] not in roles:
        fail(403, 'forbidden_role', 'Vai trò demo không được phép thực hiện thao tác này.')


def command_key(idempotency_key: str = Header(..., min_length=8, max_length=128)):
    return idempotency_key


def fingerprint(*parts):
    return hashlib.sha256(json.dumps(parts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def incident_or_404(store, ident):
    incident = store.get(INCIDENTS, ident)
    if incident is None:
        fail(404, 'incident_not_found', 'Không tìm thấy sự cố.')
    return incident


def visible(incident, actor):
    if actor['role'] == 'technician' and (incident['assignee'] or {}).get('id') != actor['id']:
        fail(403, 'not_assignee', 'Sự cố này không được giao cho bạn.')
    return incident


def public(incident, actor):
    # Technicians get the asset and impact items, not the raw propagation graph.
    if actor['role'] == 'technician':
        return {k: v for k, v in incident.items() if k != 'simulation'}
    if not incident.get('simulation'):
        return incident
    # Playbook actions come from static rules; resolve them on read so records stored before a rule fix
    # never show another asset's steps.
    actions = RecommendationService().get_actions(incident['incident_type'], {'node_id': incident['asset']['id']})
    return {**incident, 'simulation': {**incident['simulation'], 'actions_by_department': actions}}


def entry(actor, action, before, after, note=None):
    return {'at': now(), 'actor_id': actor['id'], 'action': action, 'from': before, 'to': after, 'note': note}


async def graph_rows(driver, query, **params):
    try:
        async with driver.session() as session:
            return await (await session.run(query, **params)).data()
    except Exception:
        fail(503, 'graph_store_unavailable', 'Graph store không sẵn sàng. Hãy thử lại.')


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Empty(Strict):
    pass


class Dispatch(Strict):
    assignee_id: str
    decision_note: str = Field(min_length=1, max_length=1000)


Item = Annotated[str, Field(min_length=1, max_length=300)]


class Check(Strict):
    text: str = Field(min_length=1, max_length=300)
    result: str = Field(min_length=1, max_length=300)


class Report(Strict):
    checks: list[Check] = Field(default_factory=list, max_length=20)
    actions: list[Item] = Field(default_factory=list, max_length=20)
    outcome: Literal['fixed', 'not_fixed']
    summary: str = Field(min_length=1, max_length=2000)
    next_step: str = Field(default='', max_length=1000)
    open_items: list[Item] = Field(default_factory=list, max_length=20)


class Ask(Strict):
    question: str = Field(min_length=1, max_length=500)


class LessonText(Strict):
    text: str = Field(min_length=1, max_length=1000)


class Reject(Strict):
    reason: str = Field(min_length=1, max_length=500)


@router.get('/demo/actors')
async def actors():
    return [{'id': ident, **actor} for ident, actor in ACTORS.items()]


@router.get('/scenarios')
async def scenarios(actor=Depends(current_actor), driver=Depends(get_db_driver)):
    rows = await graph_rows(driver, SCENARIO_QUERY)
    return [{'id': r['id'], 'event': {'id': r['event_id'], 'at': r['at'], 'label': r['label']},
             'asset': {'id': r['asset_id'], 'type': r['asset_type'], 'name': r['asset_name']},
             'incident_type': r['incident_type'], 'severity': r['severity']} for r in rows]


async def create_incident(store, driver, actor, key, mark, *, asset, incident_type, severity, alarm_at=None, event=None, scenario_id=None):
    simulation = await simulate_incident(SimulationRequest(node_id=asset['id'], incident_type=incident_type, severity=severity), driver)
    created = now()
    incident = {'id': str(uuid4()), 'origin': 'synthetic', 'source': 'scenario' if scenario_id else 'fault',
                'scenario_id': scenario_id, 'event': event, 'asset': asset, 'incident_type': incident_type, 'severity': severity,
                'alarm_at': alarm_at or created, 'state': 'alert', 'created_at': created, 'created_by': actor['id'],
                'assignee': None, 'decision_note': None, 'next_step': None, 'reports': [],
                'simulation': simulation.model_dump(), 'history': [entry(actor, 'create', None, 'alert')]}

    def action():
        store.write(INCIDENTS, incident)
        return public(incident, actor)
    return store.command(key, mark, action)


@router.post('/scenarios/{scenario_id}/trigger', status_code=201)
async def trigger(scenario_id: str, response: Response, actor=Depends(current_actor), key=Depends(command_key),
                  store=Depends(get_demo_store), driver=Depends(get_db_driver)):
    require(actor, 'operator')
    mark = fingerprint('trigger', actor['id'], scenario_id)
    async with store.lock:
        if store.get('command', key):
            return store.command(key, mark, lambda: None)
        scenario = next((s for s in await scenarios(actor, driver) if s['id'] == scenario_id), None)
        if scenario is None:
            fail(404, 'scenario_not_found', 'Không có kịch bản này trong dữ liệu demo.')
        # One incident per event: sending the same event again returns the existing incident.
        existing = next((i for i in store.all(INCIDENTS) if (i['event'] or {}).get('id') == scenario['event']['id']), None)
        if existing:
            response.status_code = 200
            return public(existing, actor)
        return await create_incident(store, driver, actor, key, mark, asset=scenario['asset'], incident_type=scenario['incident_type'],
                                     severity=scenario['severity'], alarm_at=scenario['event']['at'], event=scenario['event'],
                                     scenario_id=scenario_id)


@router.post('/incidents/fault', status_code=201)
async def create_fault(payload: SimulationRequest, actor=Depends(current_actor), key=Depends(command_key),
                       store=Depends(get_demo_store), driver=Depends(get_db_driver)):
    require(actor, 'operator')
    mark = fingerprint('fault', actor['id'], payload.model_dump())
    async with store.lock:
        if store.get('command', key):
            return store.command(key, mark, lambda: None)
        rows = await graph_rows(driver, NODE_QUERY, id=payload.node_id)
        if not rows:
            fail(404, 'node_not_found', 'Node origin không tồn tại trong graph.')
        asset = rows[0]
        if asset['type'] not in ORIGIN_TYPES[payload.incident_type]:
            fail(422, 'origin_type_mismatch', f'{payload.incident_type} cần origin loại {", ".join(sorted(ORIGIN_TYPES[payload.incident_type]))}, không phải {asset["type"]}.',
                 {'node_id': 'Loại node không phù hợp loại sự cố.'})
        return await create_incident(store, driver, actor, key, mark, asset=asset, incident_type=payload.incident_type, severity=payload.severity)


@router.get('/incidents')
async def list_incidents(actor=Depends(current_actor), store=Depends(get_demo_store)):
    incidents = store.all(INCIDENTS)
    if actor['role'] == 'technician':
        incidents = [i for i in incidents if (i['assignee'] or {}).get('id') == actor['id']]
    return [public(i, actor) for i in incidents]


@router.get('/incidents/{ident}')
async def get_incident(ident: str, actor=Depends(current_actor), store=Depends(get_demo_store)):
    return public(visible(incident_or_404(store, ident), actor), actor)


async def transition(store, key, mark, ident, actor, action_name, allowed_from, mutate):
    async with store.lock:
        def action():
            incident = visible(incident_or_404(store, ident), actor)
            before = incident['state']
            if before not in allowed_from:
                fail(409, 'invalid_transition', 'Trạng thái sự cố không cho phép thao tác này.')
            note = mutate(incident)
            incident['history'].append(entry(actor, action_name, before, incident['state'], note))
            store.write(INCIDENTS, incident)
            return public(incident, actor)
        return store.command(key, mark, action)


@router.post('/incidents/{ident}/dispatch')
async def dispatch(ident: str, payload: Dispatch, actor=Depends(current_actor), key=Depends(command_key), store=Depends(get_demo_store)):
    require(actor, 'operator')
    assignee = lookup(payload.assignee_id)
    if assignee is None or assignee['role'] != 'technician':
        fail(422, 'validation_error', 'Người nhận phải là kỹ thuật viên demo.', {'assignee_id': 'Không phải kỹ thuật viên.'})

    def mutate(incident):
        incident.update(state='dispatched', assignee={'id': assignee['id'], 'name': assignee['name']}, decision_note=payload.decision_note)
        return payload.decision_note
    return await transition(store, key, fingerprint('dispatch', actor['id'], ident, payload.model_dump()), ident, actor,
                            'dispatch', ('alert', 'unresolved'), mutate)


@router.post('/incidents/{ident}/start')
async def start(ident: str, payload: Empty, actor=Depends(current_actor), key=Depends(command_key), store=Depends(get_demo_store)):
    require(actor, 'technician')

    def mutate(incident):
        incident['state'] = 'in_progress'
    return await transition(store, key, fingerprint('start', actor['id'], ident), ident, actor, 'start', ('dispatched',), mutate)


@router.post('/incidents/{ident}/report')
async def report(ident: str, payload: Report, actor=Depends(current_actor), key=Depends(command_key), store=Depends(get_demo_store)):
    require(actor, 'technician')
    if payload.outcome == 'not_fixed' and not payload.next_step.strip():
        fail(422, 'validation_error', 'Kết quả chưa khắc phục cần bước tiếp theo.', {'next_step': 'Bắt buộc khi chưa khắc phục.'})

    def mutate(incident):
        record = {**payload.model_dump(), 'index': len(incident['reports']), 'at': now(), 'actor_id': actor['id']}
        incident['reports'].append(record)
        # The machine result never changes batch impact; affected/unknown batches stay to be verified.
        incident['state'] = 'resolved' if payload.outcome == 'fixed' else 'unresolved'
        incident['next_step'] = payload.next_step.strip() if payload.outcome == 'not_fixed' else None
        return payload.summary
    return await transition(store, key, fingerprint('report', actor['id'], ident, payload.model_dump()), ident, actor,
                            'report', ('in_progress',), mutate)


async def impact_of(incident, driver):
    if incident['asset']['type'] != 'Equipment':
        return {'rule': RULE, 'status': 'not_applicable', 'window': None, 'items': [],
                'message': 'Quy tắc hiện chỉ xét sự cố thiết bị; phạm vi lô của sự cố này chưa được xác định.'}
    try:
        impact = await load_impact(driver, incident['asset']['id'], datetime.fromisoformat(incident['alarm_at']))
    except Exception:
        fail(503, 'graph_store_unavailable', 'Graph store không sẵn sàng. Hãy thử lại.')
    return {**impact, 'status': 'evaluated'}


@router.get('/incidents/{ident}/impact')
async def impact(ident: str, actor=Depends(current_actor), store=Depends(get_demo_store), driver=Depends(get_db_driver)):
    incident = visible(incident_or_404(store, ident), actor)
    result = {'incident_id': ident, **await impact_of(incident, driver)}
    if actor['role'] != 'technician':
        try:
            upstream = await RootCauseService(driver).trace_root_causes(incident['asset']['id'])
        except Exception:
            fail(503, 'graph_store_unavailable', 'Graph store không sẵn sàng. Hãy thử lại.')
        result['propagation'] = {'basis': 'heuristic_hops', 'impacted_nodes': incident['simulation']['impacted_nodes']}
        result['upstream_candidates'] = {'basis': 'investigation_only', 'nodes': upstream}
    return result


def guidance_of(incident, store):
    matched = RecommendationService().get_context_guidance(incident['asset'], incident['incident_type'])
    context = {'asset_id': incident['asset']['id'], 'incident_type': incident['incident_type']}
    lessons = [{'id': l['id'], 'text': l['text'], 'source_incident_id': l['source']['incident_id'],
                'accepted_by': l['review']['by'], 'accepted_at': l['review']['at']}
               for l in store.all('lesson') if l['status'] == 'accepted' and l['context'] == context]
    return {'match': {**context, 'source': matched['source']} if matched else None,
            'steps': matched['steps'] if matched else [],
            'containment': {'status': 'proposal', 'human_review_required': True, 'text': matched['containment']}
            if matched and matched['containment'] else None,
            'lessons': lessons,
            'gap': None if matched else {'code': 'knowledge_gap',
                                         'message': f'Chưa có hướng dẫn cho {incident["asset"]["name"]} / {incident["incident_type"]}.'}}


@router.get('/incidents/{ident}/guidance')
async def guidance(ident: str, actor=Depends(current_actor), store=Depends(get_demo_store)):
    require(actor, 'technician', 'expert', 'operator')
    return guidance_of(visible(incident_or_404(store, ident), actor), store)


async def llm_view(incident, store, driver):
    """What the provider may see: reviewed steps/lessons and server-built evidence labels, no IDs."""
    view = guidance_of(incident, store)
    event = incident['event']['label'] if incident['event'] else 'Sự cố tạo từ thao tác gây lỗi synthetic'
    evidence = [{'ref': 'e1', 'label': event, 'source': 'machine_event'}]
    try:
        found = await impact_of(incident, driver)
        if found['status'] == 'evaluated':
            evidence.append({'ref': 'e2', 'label': summary(found), 'source': 'impact_rule'})
    except HTTPException:
        pass  # Impact is optional context; guidance is still explained without it.
    return {'id': incident['id'], 'origin': incident['origin'], 'incident_type': incident['incident_type'],
            'steps': view['steps'], 'lessons': view['lessons'], 'evidence': evidence}


@router.post('/incidents/{ident}/guidance/explain')
async def explain(ident: str, actor=Depends(current_actor), store=Depends(get_demo_store), driver=Depends(get_db_driver)):
    require(actor, 'technician', 'expert')
    incident = visible(incident_or_404(store, ident), actor)
    if incident['state'] == 'alert':
        fail(409, 'invalid_transition', 'Hãy giao việc trước khi mở hướng dẫn.')
    return await guidance_service.explain(await llm_view(incident, store, driver), store)


@router.post('/incidents/{ident}/assistant/ask')
async def ask(ident: str, payload: Ask, actor=Depends(current_actor), store=Depends(get_demo_store), driver=Depends(get_db_driver)):
    require(actor, 'technician')
    incident = visible(incident_or_404(store, ident), actor)
    return await guidance_service.ask(await llm_view(incident, store, driver), payload.question, store)


def lesson_or_404(store, ident):
    lesson = store.get('lesson', ident)
    if lesson is None:
        fail(404, 'lesson_not_found', 'Không tìm thấy bài học.')
    return lesson


@router.post('/incidents/{ident}/lessons', status_code=201)
async def propose_lesson(ident: str, payload: LessonText, actor=Depends(current_actor), key=Depends(command_key), store=Depends(get_demo_store)):
    require(actor, 'technician')
    async with store.lock:
        def action():
            incident = visible(incident_or_404(store, ident), actor)
            if not incident['reports']:
                fail(409, 'report_required', 'Cần có report trước khi đề xuất bài học.')
            lesson = {'id': str(uuid4()), 'status': 'pending', 'text': payload.text, 'original_text': payload.text,
                      'context': {'asset_id': incident['asset']['id'], 'incident_type': incident['incident_type']},
                      'source': {'incident_id': ident, 'report_index': incident['reports'][-1]['index'], 'author_id': actor['id']},
                      'created_at': now(), 'review': None}
            store.write('lesson', lesson)
            return lesson
        return store.command(key, fingerprint('lesson', actor['id'], ident, payload.model_dump()), action)


@router.get('/lessons')
async def list_lessons(status: Literal['pending', 'accepted', 'rejected'] | None = None, actor=Depends(current_actor), store=Depends(get_demo_store)):
    require(actor, 'expert')
    return [l for l in store.all('lesson') if status is None or l['status'] == status]


async def review(store, key, mark, ident, mutate):
    async with store.lock:
        def action():
            lesson = lesson_or_404(store, ident)
            if lesson['status'] != 'pending':
                fail(409, 'invalid_transition', 'Bài học đã được xem xét.')
            mutate(lesson)
            store.write('lesson', lesson)
            return lesson
        return store.command(key, mark, action)


@router.patch('/lessons/{ident}')
async def edit_lesson(ident: str, payload: LessonText, actor=Depends(current_actor), key=Depends(command_key), store=Depends(get_demo_store)):
    require(actor, 'expert')
    return await review(store, key, fingerprint('edit', actor['id'], ident, payload.model_dump()), ident,
                        lambda lesson: lesson.update(text=payload.text))


@router.post('/lessons/{ident}/accept')
async def accept_lesson(ident: str, payload: Empty, actor=Depends(current_actor), key=Depends(command_key), store=Depends(get_demo_store)):
    require(actor, 'expert')
    return await review(store, key, fingerprint('accept', actor['id'], ident), ident,
                        lambda lesson: lesson.update(status='accepted', review={'decision': 'accepted', 'by': actor['id'], 'at': now(), 'reason': None}))


@router.post('/lessons/{ident}/reject')
async def reject_lesson(ident: str, payload: Reject, actor=Depends(current_actor), key=Depends(command_key), store=Depends(get_demo_store)):
    require(actor, 'expert')
    return await review(store, key, fingerprint('reject', actor['id'], ident, payload.model_dump()), ident,
                        lambda lesson: lesson.update(status='rejected', review={'decision': 'rejected', 'by': actor['id'], 'at': now(), 'reason': payload.reason}))


@router.get('/demo/audit')
async def audit(actor=Depends(current_actor), store=Depends(get_demo_store)):
    require(actor, 'expert')
    return store.all('audit')


@router.get('/events')
async def events(request: Request):
    async def stream():
        while not await request.is_disconnected():
            # Heartbeat for synthetic demo service, not a physical-machine metric.
            yield 'event: plant_tick\ndata: ' + json.dumps({'at': now(), 'origin': 'synthetic'}) + '\n\n'
            await asyncio.sleep(settings.INAV_TICK_SECONDS)
    return StreamingResponse(stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
