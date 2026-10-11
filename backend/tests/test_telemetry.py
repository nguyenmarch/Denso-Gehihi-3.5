"""Machine telemetry: an incident disturbs the data, the anomaly log is detected from the data, a fix restores it."""
import httpx
import pytest
import pytest_asyncio

from app.main import app
from app.models.machines import MACHINES
from app.services import telemetry_service as ts
from app.services.telemetry_service import EVENTS, INCIDENTS, Telemetry, iso

T0 = 1_791_000_000.0  # 2026-10-03, a whole multiple of the 2 s tick


class Clock:
    def __init__(self):
        self.now = T0

    def __call__(self):
        return self.now


def incident(store, ident, machine, incident_type, at, severity=1.0, scenario=None):
    record = {'id': ident, 'asset': {'id': machine, 'type': 'Equipment', 'name': machine}, 'incident_type': incident_type,
              'scenario_id': scenario, 'severity': severity, 'created_at': iso(at), 'state': 'alert',
              'history': [{'at': iso(at), 'to': 'alert'}]}
    store.put(INCIDENTS, ident, record)
    return record


def fix(store, record, at):
    record['history'].append({'at': iso(at), 'to': 'resolved'})
    record['state'] = 'resolved'
    store.put(INCIDENTS, record['id'], record)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def telemetry(store, clock):
    return Telemetry(store, clock=clock, step=2)


def values(telemetry, machine, key, minutes=1):
    return [v[key] for _, _, v in telemetry.series(machine, minutes)]


def test_steady_plant_has_no_anomalies(telemetry):
    assert all(telemetry.state(m) == 'normal' for m in MACHINES)
    assert telemetry.events() == []
    temps = values(telemetry, 'EQ_OVEN_01', 'temperature', 120)
    assert len(temps) == 3600 and min(temps) > 233 and max(temps) < 237
    # Same instant, same reading: the stream is reproducible after a restart.
    assert temps == values(Telemetry(telemetry.store, clock=telemetry.clock, step=2), 'EQ_OVEN_01', 'temperature', 120)


def test_oven_drift_is_detected_from_data_and_cleared_by_fix(store, clock, telemetry):
    telemetry.advance()
    record = incident(store, 'inc-oven', 'EQ_OVEN_01', 'MACHINE_BREAKDOWN', T0, scenario='SCN_OVEN_TEMP')
    clock.now = T0 + 40
    assert telemetry.state('EQ_OVEN_01') == 'normal'  # the drift has not crossed a threshold yet
    clock.now = T0 + 300
    assert telemetry.state('EQ_OVEN_01') == 'critical'
    assert max(values(telemetry, 'EQ_OVEN_01', 'temperature', 5)) > 250
    [event] = telemetry.events('EQ_OVEN_01')
    assert event['signal'] == 'temperature' and event['level'] == 'critical' and event['ended_at'] is None
    assert event['incident_ids'] == ['inc-oven'] and event['peak'] > 250
    # Opened by the data (warning at about 47 s with the 120 s ramp), not at the click.
    assert T0 + 40 < ts.epoch(event['started_at']) < T0 + 60
    assert telemetry.events('EQ_SMT_01') == []

    fix(store, record, T0 + 400)
    clock.now = T0 + 600
    assert telemetry.state('EQ_OVEN_01') == 'normal'
    [event] = telemetry.events('EQ_OVEN_01')
    assert event['ended_at'] is not None and T0 + 400 < ts.epoch(event['ended_at']) < T0 + 520
    assert store.get(EVENTS, event['id'])['ended_at'] == event['ended_at']


def test_not_fixed_keeps_the_machine_abnormal(store, clock, telemetry):
    record = incident(store, 'inc-oven', 'EQ_OVEN_01', 'MACHINE_BREAKDOWN', T0, scenario='SCN_OVEN_TEMP')
    record['history'].append({'at': iso(T0 + 200), 'to': 'unresolved'})
    store.put(INCIDENTS, record['id'], record)
    clock.now = T0 + 900
    assert telemetry.state('EQ_OVEN_01') == 'critical'


def test_breakdown_stops_the_machine(store, clock, telemetry):
    telemetry.advance()
    record = incident(store, 'inc-pack', 'EQ_PACK_01', 'MACHINE_BREAKDOWN', T0)
    clock.now = T0 + 60
    assert telemetry.state('EQ_PACK_01') == 'stopped'
    assert values(telemetry, 'EQ_PACK_01', 'cycle_time', 0.5) == [None] * 15
    [event] = telemetry.events('EQ_PACK_01')
    assert event['kind'] == 'stop' and event['label'] == 'Dừng máy' and event['incident_ids'] == ['inc-pack']
    fix(store, record, T0 + 120)
    clock.now = T0 + 180
    assert telemetry.state('EQ_PACK_01') == 'normal'
    [event] = telemetry.events('EQ_PACK_01')
    assert event['ended_at'] == iso(T0 + 120)


def test_severity_scales_the_deviation(store, clock, telemetry):
    telemetry.advance()
    incident(store, 'inc-aoi', 'EQ_AOI_01', 'CYCLE_TIME_SPIKE', T0, severity=0.3)
    clock.now = T0 + 120
    assert telemetry.state('EQ_AOI_01') == 'warning'
    [event] = telemetry.events('EQ_AOI_01')
    assert event['signal'] == 'cycle_time' and event['level'] == 'warning' and event['threshold'] == 15.0


def test_material_defect_never_reaches_machine_data(store, clock, telemetry):
    store.put(INCIDENTS, 'inc-mat', {'id': 'inc-mat', 'asset': {'id': 'STEP_SMT', 'type': 'ProcessStep', 'name': 'SMT'},
                                     'incident_type': 'MATERIAL_DEFECT', 'scenario_id': None, 'severity': 1.0,
                                     'created_at': iso(T0), 'state': 'alert', 'history': []})
    clock.now = T0 + 300
    assert telemetry.events() == [] and all(telemetry.state(m) == 'normal' for m in MACHINES)


def test_restart_continues_an_open_anomaly(store, clock, telemetry):
    incident(store, 'inc-oven', 'EQ_OVEN_01', 'MACHINE_BREAKDOWN', T0, scenario='SCN_OVEN_TEMP')
    clock.now = T0 + 300
    [before] = telemetry.events('EQ_OVEN_01')
    clock.now = T0 + 3 * 3600  # back after more than the 2 h history: the open event is resumed, not reopened
    [after] = Telemetry(store, clock=clock, step=2).events('EQ_OVEN_01')
    assert after['id'] == before['id'] and after['ended_at'] is None


def test_hysteresis_holds_a_level_near_its_threshold():
    oven = MACHINES['EQ_OVEN_01']['signals'][0]
    assert ts.classify(244.5, 'normal', oven) == 'warning'
    assert ts.classify(244.5, 'critical', oven) == 'critical'
    assert ts.classify(243.4, 'critical', oven) == 'warning'
    assert ts.classify(241.0, 'warning', oven) == 'warning'
    assert ts.classify(240.4, 'warning', oven) == 'normal'


def test_a_short_excursion_is_not_an_anomaly():
    channel = ts.Channel('EQ_OVEN_01', 'threshold', MACHINES['EQ_OVEN_01']['signals'][0])
    for t, target in enumerate(['warning', 'warning', 'normal', 'warning', 'warning', 'normal']):
        assert channel.feed(t, target, 243.0, []) is None
    assert channel.level == 'normal'


@pytest_asyncio.fixture
async def client(store, telemetry):
    app.dependency_overrides[ts.get_telemetry] = lambda: telemetry
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test/api/v1') as value:
            yield value
    finally:
        app.dependency_overrides.clear()


OPERATOR = {'X-Demo-Actor': 'op-01'}


@pytest.mark.asyncio
async def test_machine_http_contract(store, clock, telemetry, client):
    telemetry.advance()
    incident(store, 'inc-oven', 'EQ_OVEN_01', 'MACHINE_BREAKDOWN', T0, scenario='SCN_OVEN_TEMP')
    clock.now = T0 + 300

    machines = (await client.get('/machines', headers=OPERATOR)).json()
    assert [m['id'] for m in machines] == list(MACHINES)
    oven = next(m for m in machines if m['id'] == 'EQ_OVEN_01')
    assert oven['state'] == 'critical' and oven['open_events'] == 1 and oven['last_event']['incident_ids'] == ['inc-oven']
    assert oven['signals'][0]['key'] == 'temperature' and oven['signals'][0]['level'] == 'critical'
    assert len(oven['spark']['values']) == 60

    data = (await client.get('/machines/EQ_OVEN_01/telemetry?minutes=120', headers=OPERATOR)).json()
    assert data['machine']['state'] == 'critical' and len(data['t']) == 720
    assert len(data['series']['temperature']) == len(data['running']) == 720
    assert max(data['series']['temperature']) > 250  # downsampling keeps the peak

    events = (await client.get('/machines/EQ_OVEN_01/events', headers={'X-Demo-Actor': 'tech-01'})).json()
    assert [e['id'] for e in events] == [oven['last_event']['id']]

    assert (await client.get('/machines/EQ_NOPE/telemetry', headers=OPERATOR)).status_code == 404
    assert (await client.get('/machines', headers={'X-Demo-Actor': 'nobody'})).status_code == 400
    assert (await client.get('/machines/EQ_OVEN_01/telemetry?minutes=500', headers=OPERATOR)).status_code == 422
