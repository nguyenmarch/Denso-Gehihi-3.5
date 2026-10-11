"""Synthetic local-demo workflow layered on the existing deterministic services."""
import asyncio
import hashlib
import json
import re
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.api.v1.incidents import simulate_incident
from app.core.config import settings
from app.core.database import get_db_driver
from app.schemas.incident import SimulationRequest
from app.services.demo_store import get_demo_store, now
from app.services.guidance_service import explain
from app.services.recommendation_service import RecommendationService

router = APIRouter()
Role = Literal['operator', 'technician', 'expert', 'admin']


def demo_role(x_demo_role: Role = Header(default='technician')):
    # Presentation mode, not authentication. Bound to local-only demo use.
    return x_demo_role


def require(role, allowed):
    if role not in allowed:
        raise HTTPException(403, detail='Vai trò demo không được phép thực hiện thao tác này.')


def incident_or_404(store, ident):
    incident = store.get('incident', ident)
    if incident is None:
        raise HTTPException(404, detail='Không tìm thấy sự cố.')
    return incident


def public_incident(incident, role):
    result = {k: v for k, v in incident.items() if k not in ('simulation', 'node_id')}
    if role in ('expert', 'admin'):
        result['simulation'] = incident['simulation']
        result['node_id'] = incident['node_id']
    return result


def fingerprint(path, payload):
    return hashlib.sha256(json.dumps([path, payload], sort_keys=True).encode()).hexdigest()


def command_key(idempotency_key: str = Header(..., min_length=8, max_length=128)):
    return idempotency_key


class Command(BaseModel):
    model_config = ConfigDict(extra='forbid')
    assignee: str = Field(default='Kỹ thuật viên demo', min_length=1, max_length=80)
    report: str = Field(default='', max_length=2000)


@router.get('/incidents')
async def list_incidents(role=Depends(demo_role), store=Depends(get_demo_store)):
    return [public_incident(i, role) for i in store.all('incident')]


@router.post('/incidents/fault', status_code=201)
async def create_fault(payload: SimulationRequest, role=Depends(demo_role), key=Depends(command_key),
                       store=Depends(get_demo_store), driver=Depends(get_db_driver)):
    require(role, ('admin', 'operator'))
    mark = fingerprint('fault:' + role, payload.model_dump())
    async with store.lock:
        cached = store.get('command', key)
        if cached:
            return store.command(key, mark, lambda: None)
        simulation = await simulate_incident(payload, driver)
        # Guidance authority remains the original static playbook. Remove raw IDs.
        actions = RecommendationService().get_actions(payload.incident_type)
        steps = [{'id': f's{i+1}', 'text': re.sub(r'\b(?:EQ_|STEP_|DEP_|BATCH_)\w+', 'thiết bị trong playbook', text)}
                 for i, text in enumerate(actions.values())]
        incident = {'id': str(uuid4()), 'origin': 'synthetic', 'node_id': payload.node_id,
                    'incident_type': payload.incident_type, 'state': 'alert', 'created_at': now(),
                    'steps': steps, 'simulation': simulation.model_dump(),
                    'containment': {'status': 'proposal', 'human_review_required': True,
                                    'text': actions.get('DEP_QA', actions.get('DEP_PROD', ''))},
                    'history': [{'state': 'alert', 'at': now()}]}
        incident['containment']['text'] = re.sub(r'\b(?:EQ_|STEP_|DEP_|BATCH_)\w+', 'thiết bị trong playbook', incident['containment']['text'])
        def action():
            store.write_incident(incident)
            return public_incident(incident, role)
        return store.command(key, mark, action)


@router.get('/incidents/{ident}')
async def get_incident(ident: str, role=Depends(demo_role), store=Depends(get_demo_store)):
    return public_incident(incident_or_404(store, ident), role)


@router.post('/incidents/{ident}/{operation}')
async def transition(ident: str, operation: Literal['dispatch', 'start', 'resolve'], payload: Command,
                     role=Depends(demo_role), key=Depends(command_key), store=Depends(get_demo_store)):
    require(role, ('operator', 'admin') if operation == 'dispatch' else ('technician', 'admin'))
    mark = fingerprint(f'{role}:{ident}:{operation}', payload.model_dump())
    async with store.lock:
        def action():
            incident = incident_or_404(store, ident)
            before, after = {'dispatch': ('alert', 'dispatched'), 'start': ('dispatched', 'in_progress'),
                             'resolve': ('in_progress', 'resolved')}[operation]
            if incident['state'] != before:
                raise HTTPException(409, detail='Trạng thái sự cố không cho phép thao tác này.')
            if operation == 'resolve' and not payload.report.strip():
                raise HTTPException(422, detail='Cần báo cáo kết quả trước khi đóng sự cố.')
            incident['state'] = after
            if operation == 'dispatch':
                incident['assignee'] = payload.assignee
            if operation == 'resolve':
                incident['report'] = payload.report.strip()
            incident['history'].append({'state': after, 'at': now()})
            store.write_incident(incident)
            return public_incident(incident, role)
        return store.command(key, mark, action)


@router.post('/incidents/{ident}/guidance/explain')
async def guidance(ident: str, role=Depends(demo_role), store=Depends(get_demo_store)):
    require(role, ('technician', 'expert', 'admin'))
    incident = incident_or_404(store, ident)
    if incident['state'] not in ('dispatched', 'in_progress', 'resolved'):
        raise HTTPException(409, detail='Hãy dispatch sự cố trước khi mở work order.')
    return await explain(incident, store)


@router.get('/demo/audit')
async def audit(role=Depends(demo_role), store=Depends(get_demo_store)):
    require(role, ('expert', 'admin'))
    return store.all('audit')


class Learning(BaseModel):
    model_config = ConfigDict(extra='forbid')
    incident_id: str
    node_id: str = Field(min_length=2, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')
    note: str = Field(min_length=1, max_length=2000)


@router.get('/demo/learning')
async def learning_history(role=Depends(demo_role), store=Depends(get_demo_store)):
    require(role, ('expert', 'admin'))
    return store.all('learning')


@router.post('/demo/learning', status_code=201)
async def add_learning(payload: Learning, role=Depends(demo_role), store=Depends(get_demo_store),
                       driver=Depends(get_db_driver)):
    require(role, ('expert', 'admin'))
    incident = incident_or_404(store, payload.incident_id)
    if incident['state'] != 'resolved':
        raise HTTPException(409, detail='Field learning cần một sự cố đã đóng.')
    from app.api.v1.graph import get_node_details
    await get_node_details(payload.node_id, driver)
    record = {**payload.model_dump(), 'id': str(uuid4()), 'at': now(), 'reviewed_by': role}
    # Human-reviewed annotation separate from topology and deterministic rules.
    store.put('learning', record['id'], record)
    return record


@router.get('/events')
async def events(request: Request):
    async def stream():
        while not await request.is_disconnected():
            # Heartbeat for synthetic demo service, not a physical-machine metric.
            yield 'event: plant_tick\ndata: ' + json.dumps({'at': now(), 'origin': 'synthetic'}) + '\n\n'
            await asyncio.sleep(settings.INAV_TICK_SECONDS)
    return StreamingResponse(stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
