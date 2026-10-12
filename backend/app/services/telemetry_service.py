"""Synthetic machine telemetry and the anomaly log detected from it.

Each sample is a pure function of (machine, time, incidents): a steady baseline with deterministic noise plus the
effect of every incident open on that machine (app/models/machines.py). An incident is created by a person; its
effect starts at `created_at` and fades once a technician reports it fixed. Anomalies are never written from the
incident itself: the detector only sees the samples, the way it would see a real PLC stream.
"""
import math
import time
import zlib
from collections import deque
from datetime import datetime, timezone

from app.core.config import settings
from app.models.machines import MACHINES, SCENARIO_EFFECTS, TYPE_EFFECTS
from app.services.demo_store import get_demo_store

INCIDENTS = 'incident_v2'
EVENTS = 'machine_event'
HISTORY_SECONDS = 2 * 3600
# A level must hold for this many consecutive samples before it opens or closes an anomaly.
CONFIRM = 3
LEVELS = ('normal', 'warning', 'critical')


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def epoch(value):
    return datetime.fromisoformat(value).timestamp()


def jitter(*parts):
    # Deterministic noise in [-1, 1]: the same machine and instant give the same value after a restart.
    return zlib.crc32(':'.join(map(str, parts)).encode()) / 0x7FFFFFFF - 1


def faults_by_machine(incidents):
    """Equipment incidents in the catalog, as {machine: [fault]} with their active interval."""
    faults = {}
    for incident in incidents:
        machine = incident['asset']['id']
        effect = SCENARIO_EFFECTS.get(incident.get('scenario_id')) or TYPE_EFFECTS.get(incident['incident_type'])
        if machine not in MACHINES or effect is None:
            continue
        resolved = next((h['at'] for h in incident['history'] if h['to'] == 'resolved'), None)
        faults.setdefault(machine, []).append({'incident_id': incident['id'], 'effect': effect, 'severity': incident['severity'],
                                               'start': epoch(incident['created_at']), 'end': resolved and epoch(resolved)})
    return faults


def weight(fault, t):
    """How much of the fault's effect is present at t: ramps up from the start, fades out after it is fixed."""
    ramp = fault['effect'].get('ramp', 1)
    rise = lambda at: min(1.0, max(0.0, (at - fault['start']) / ramp))
    if fault['end'] is None or t < fault['end']:
        return rise(t)
    return rise(fault['end']) * max(0.0, 1 - (t - fault['end']) / (ramp / 2))


def active(fault, t):
    return fault['start'] <= t and (fault['end'] is None or t < fault['end'])


def sample(machine, t, faults):
    """One reading of every signal at t; values are None while the machine is stopped."""
    spec = MACHINES[machine]
    running = not any(f['effect']['kind'] == 'stop' and active(f, t) for f in faults)
    values = {}
    for s in spec['signals']:
        if not running:
            values[s['key']] = None
            continue
        phase = jitter(machine, s['key']) * math.pi
        value = s['base'] + s['noise'] * (0.75 * math.sin(t / 90 + phase) + 0.25 * jitter(machine, s['key'], int(t)))
        for f in faults:
            effect = f['effect']
            if effect.get('signal') != s['key']:
                continue
            w = weight(f, t) * f['severity']
            value += w * (effect['amount'] if effect['kind'] == 'drift' else effect['factor'] * s['base'])
        values[s['key']] = round(value, s['decimals'])
    return running, values


def classify(value, current, s):
    """Level of a value, with hysteresis: leaving a level needs the value `hyst` below its threshold."""
    if value is None:
        return 'normal'
    margin = lambda level: s['hyst'] if LEVELS.index(current) >= LEVELS.index(level) else 0
    if value >= s['crit'] - margin('critical'):
        return 'critical'
    if value >= s['warn'] - margin('warning'):
        return 'warning'
    return 'normal'


class Channel:
    """Debounced level of one signal (or of the run state) and the anomaly it has open."""

    def __init__(self, machine, kind, s=None, event=None):
        self.machine, self.kind, self.s = machine, kind, s
        self.event = event
        self.level = event['current_level'] if event else 'normal'
        self.pending, self.since, self.count = None, None, 0

    def feed(self, t, target, value, incident_ids):
        """Feed one sample; returns the open/closed event when it changed."""
        changed = False
        if target == self.level:
            self.pending, self.count = None, 0
        else:
            if target != self.pending:
                self.pending, self.since, self.count = target, t, 0
            self.count += 1
            if self.count >= CONFIRM:
                changed = self.switch(target)
        if self.event and self.event['ended_at'] is None:
            fresh = [i for i in incident_ids if i not in self.event['incident_ids']]
            if fresh:
                self.event['incident_ids'] += fresh
                changed = True
            if value is not None and (self.event['peak'] is None or value > self.event['peak']):
                self.event['peak'] = value
                changed = True
        return self.event if changed else None

    def switch(self, target):
        self.level, self.pending, self.count = target, None, 0
        if target == 'normal':
            self.event.update(ended_at=iso(self.since), current_level='normal')
            return True
        if self.event is None or self.event['ended_at'] is not None:
            start = int(self.since)
            key = self.s['key'] if self.s else 'run'
            self.event = {'id': f'{self.machine}:{key}:{start}', 'machine_id': self.machine, 'kind': self.kind,
                          'signal': self.s and self.s['key'], 'label': self.s['label'] if self.s else 'Dừng máy',
                          'unit': self.s and self.s['unit'], 'level': target, 'current_level': target,
                          'threshold': self.s and self.s['crit' if target == 'critical' else 'warn'],
                          'peak': None, 'started_at': iso(start), 'ended_at': None, 'incident_ids': []}
            return True
        if LEVELS.index(target) > LEVELS.index(self.event['level']):
            self.event.update(level=target, threshold=self.s['crit'])
        self.event['current_level'] = target
        return True


class Telemetry:
    def __init__(self, store, clock=time.time, step=None):
        self.store, self.clock = store, clock
        self.step = step or settings.INAV_TICK_SECONDS
        self.size = int(HISTORY_SECONDS / self.step)
        self.buffers = {m: deque(maxlen=self.size) for m in MACHINES}
        self.channels = None
        self.cursor = None

    def load_channels(self):
        # An anomaly still open before a restart continues instead of being opened twice.
        open_events = {(e['machine_id'], e['signal']): e for e in self.store.all(EVENTS) if e['ended_at'] is None}
        self.channels = {m: {'run': Channel(m, 'stop', event=open_events.get((m, None))),
                             **{s['key']: Channel(m, 'threshold', s, open_events.get((m, s['key']))) for s in spec['signals']}}
                         for m, spec in MACHINES.items()}

    def advance(self):
        """Compute and detect every sample up to one tick ago (so an incident written this instant is never missed)."""
        last = math.floor(self.clock() / self.step) - 1
        first = last - self.size + 1 if self.cursor is None else max(self.cursor + 1, last - self.size + 1)
        if first > last:
            return
        if self.channels is None:
            self.load_channels()
        faults = faults_by_machine(self.store.all(INCIDENTS))
        dirty = {}
        for index in range(first, last + 1):
            t = index * self.step
            for machine, spec in MACHINES.items():
                mine = faults.get(machine, [])
                running, values = sample(machine, t, mine)
                self.buffers[machine].append((t, running, values))
                # An anomaly is linked to the incidents whose effect on that channel is present at t.
                causes = lambda key: [f['incident_id'] for f in mine if (f['effect'].get('signal', 'run') == key)
                                      and (active(f, t) or weight(f, t) > 0)]
                channels = self.channels[machine]
                changes = [channels['run'].feed(t, 'normal' if running else 'critical', None, causes('run'))]
                changes += [channels[s['key']].feed(t, classify(values[s['key']], channels[s['key']].level, s), values[s['key']],
                                                    causes(s['key'])) for s in spec['signals']]
                dirty.update({e['id']: e for e in changes if e})
        self.cursor = last
        if dirty:
            with self.store.db:
                for event in dirty.values():
                    self.store.write(EVENTS, dict(event))

    def series(self, machine, minutes):
        self.advance()
        since = self.clock() - minutes * 60
        return [p for p in self.buffers[machine] if p[0] >= since]

    def state(self, machine):
        """Current data-derived state: stopped, or the worst level among the signals."""
        self.advance()
        channels = self.channels[machine]
        if channels['run'].level != 'normal':
            return 'stopped'
        levels = [c.level for key, c in channels.items() if key != 'run']
        return max(levels, key=LEVELS.index)

    def events(self, machine=None):
        self.advance()
        events = [e for e in self.store.all(EVENTS) if machine is None or e['machine_id'] == machine]
        return sorted(events, key=lambda e: e['started_at'], reverse=True)


_telemetry = None


async def get_telemetry():
    global _telemetry
    if _telemetry is None:
        _telemetry = Telemetry(await get_demo_store())
    return _telemetry
