"""Read-only machine screen: synthetic telemetry and the anomaly log detected from it."""
from fastapi import APIRouter, Depends, Query

from app.api.v1.demo import current_actor, fail
from app.models.machines import MACHINES
from app.services.telemetry_service import Telemetry, get_telemetry, iso

router = APIRouter()
# The chart never needs more points than it has pixels; buckets keep each one's highest value so a spike survives.
MAX_POINTS = 720
SPARK_MINUTES, SPARK_POINTS = 15, 60


def machine_or_404(ident):
    if ident not in MACHINES:
        fail(404, 'machine_not_found', 'Không có máy này trong dữ liệu demo.')
    return MACHINES[ident]


def signal_meta(s):
    return {k: s[k] for k in ('key', 'label', 'unit', 'warn', 'crit', 'decimals')}


def downsample(points, size):
    if len(points) <= size:
        return points
    span = len(points) / size
    out = []
    for i in range(size):
        bucket = points[int(i * span):int((i + 1) * span)]
        values = {k: max((v[k] for _, _, v in bucket if v[k] is not None), default=None) for k in bucket[0][2]}
        out.append((bucket[-1][0], all(r for _, r, _ in bucket), values))
    return out


@router.get('')
async def list_machines(actor=Depends(current_actor), telemetry: Telemetry = Depends(get_telemetry)):
    events = telemetry.events()
    result = []
    for ident, spec in MACHINES.items():
        points = telemetry.series(ident, SPARK_MINUTES)
        latest = points[-1] if points else None
        main = spec['signals'][0]['key']
        mine = [e for e in events if e['machine_id'] == ident]
        result.append({'id': ident, 'name': spec['name'], 'step': spec['step'], 'state': telemetry.state(ident),
                       'running': latest[1] if latest else None,
                       'signals': [{**signal_meta(s), 'value': latest and latest[2][s['key']],
                                    'level': telemetry.channels[ident][s['key']].level} for s in spec['signals']],
                       'spark': {'signal': main, 'values': [v[main] for _, _, v in downsample(points, SPARK_POINTS)]},
                       'open_events': sum(e['ended_at'] is None for e in mine),
                       'last_event': mine[0] if mine else None})
    return result


@router.get('/{ident}/telemetry')
async def machine_telemetry(ident: str, minutes: int = Query(15, ge=5, le=120), actor=Depends(current_actor),
                            telemetry: Telemetry = Depends(get_telemetry)):
    spec = machine_or_404(ident)
    points = downsample(telemetry.series(ident, minutes), MAX_POINTS)
    return {'machine': {'id': ident, 'name': spec['name'], 'step': spec['step'], 'state': telemetry.state(ident)},
            'minutes': minutes, 'step_seconds': telemetry.step, 'now': iso(telemetry.clock()),
            'signals': [signal_meta(s) for s in spec['signals']],
            't': [round(t * 1000) for t, _, _ in points], 'running': [r for _, r, _ in points],
            'series': {s['key']: [v[s['key']] for _, _, v in points] for s in spec['signals']}}


@router.get('/{ident}/events')
async def machine_events(ident: str, limit: int = Query(100, ge=1, le=500), actor=Depends(current_actor),
                         telemetry: Telemetry = Depends(get_telemetry)):
    machine_or_404(ident)
    return telemetry.events(ident)[:limit]
