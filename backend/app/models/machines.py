"""Synthetic machine catalog: the signals each seeded Equipment node reports and how an incident disturbs them.

Ids, names and steps mirror backend/data/seed_scenarios.cypher so the machine screen works without Neo4j.
Thresholds are high-side only: `warn`/`crit` raise an anomaly, `hyst` is how far a value must fall back to clear it.
"""

def signal(key, label, unit, base, noise, warn, crit, hyst, decimals=1):
    return {'key': key, 'label': label, 'unit': unit, 'base': base, 'noise': noise,
            'warn': warn, 'crit': crit, 'hyst': hyst, 'decimals': decimals}


MACHINES = {
    'EQ_PRINTER_01': {'name': 'Solder Paste Printer', 'step': 'STEP_PASTE', 'signals': [
        signal('cycle_time', 'Cycle time', 's', 14.0, 0.3, 17.0, 21.0, 0.6),
        signal('pressure', 'Áp lực dao gạt', 'N', 60.0, 1.2, 66.0, 70.0, 1.0)]},
    'EQ_SMT_01': {'name': 'SMT Pick and Place', 'step': 'STEP_SMT', 'signals': [
        signal('cycle_time', 'Cycle time', 's', 18.0, 0.4, 22.0, 27.0, 0.8),
        signal('vibration', 'Độ rung', 'mm/s', 1.2, 0.12, 2.8, 4.5, 0.2, 2)]},
    'EQ_OVEN_01': {'name': 'Reflow Oven Alpha', 'step': 'STEP_REFLOW', 'signals': [
        signal('temperature', 'Nhiệt độ vùng gia nhiệt', '°C', 235.0, 1.2, 242.0, 245.0, 1.5),
        signal('cycle_time', 'Cycle time', 's', 24.0, 0.4, 28.0, 33.0, 0.8)]},
    'EQ_AOI_01': {'name': 'AOI Station 01', 'step': 'STEP_AOI', 'signals': [
        signal('cycle_time', 'Cycle time', 's', 12.0, 0.3, 15.0, 18.0, 0.6),
        signal('ng_rate', 'Tỉ lệ NG', '%', 0.8, 0.15, 2.0, 4.0, 0.3, 2)]},
    'EQ_PACK_01': {'name': 'Packaging Cell 01', 'step': 'STEP_PACK', 'signals': [
        signal('cycle_time', 'Cycle time', 's', 9.0, 0.25, 11.0, 14.0, 0.5),
        signal('seal_temp', 'Nhiệt độ hàn mép', '°C', 160.0, 1.0, 170.0, 178.0, 1.5)]},
}

# How an incident shows up in the data, scaled by its severity (0.1–1.0):
#   stop  — the machine stops reporting production values until the incident is resolved;
#   drift — `signal` rises by `amount` over `ramp` seconds;
#   spike — `signal` rises by `factor` × its base over `ramp` seconds.
# A scenario uses its own effect; a manual fault uses the one for its incident type.
SCENARIO_EFFECTS = {
    'SCN_OVEN_TEMP': {'kind': 'drift', 'signal': 'temperature', 'amount': 18.0, 'ramp': 120},
    'SCN_PACK_JAM': {'kind': 'stop'},
}
TYPE_EFFECTS = {
    'MACHINE_BREAKDOWN': {'kind': 'stop'},
    'CYCLE_TIME_SPIKE': {'kind': 'spike', 'signal': 'cycle_time', 'factor': 0.9, 'ramp': 20},
}
