import React, { useMemo, useState } from 'react';
import { ArrowRight, Flame, Gauge, LoaderCircle, MousePointerClick, PackageSearch } from 'lucide-react';
import { GraphNode, INCIDENT_TYPES, IncidentType, SEVERITY_MAX, SEVERITY_MIN } from '../types';

// Demo presets. Each is only enabled when its node exists in the live topology.
const SCENARIOS: { nodeId: string; type: IncidentType; title: string; hint: string; icon: React.ReactNode; tone: string }[] = [
  { nodeId: 'EQ_OVEN_01', type: 'MACHINE_BREAKDOWN', title: 'Machine breakdown', hint: 'Reflow oven heater failure', icon: <Flame size={18} />, tone: 'orange' },
  { nodeId: 'STEP_SMT', type: 'MATERIAL_DEFECT', title: 'Material quality defect', hint: 'Capacitor tolerance drift', icon: <PackageSearch size={18} />, tone: 'purple' },
  { nodeId: 'STEP_AOI', type: 'CYCLE_TIME_SPIKE', title: 'Inspection bottleneck', hint: 'AOI cycle-time spike', icon: <Gauge size={18} />, tone: 'blue' },
];

const TYPE_LABELS: Record<IncidentType, string> = {
  MACHINE_BREAKDOWN: 'Machine breakdown',
  MATERIAL_DEFECT: 'Material defect',
  CYCLE_TIME_SPIKE: 'Cycle-time spike',
};

const LABEL_ORDER = ['Equipment', 'ProcessStep', 'Batch', 'IncidentEvent', 'Department'];

interface IncidentTriggerProps {
  nodes: GraphNode[];
  nodeId: string;
  onNodeChange: (nodeId: string) => void;
  onRunSimulation: (nodeId: string, type: IncidentType, severity: number) => void;
  loading?: boolean;
  disabledReason?: string;
}

export const IncidentTrigger: React.FC<IncidentTriggerProps> = ({ nodes, nodeId, onNodeChange, onRunSimulation, loading = false, disabledReason }) => {
  const [incidentType, setIncidentType] = useState<IncidentType>('MACHINE_BREAKDOWN');
  const [severity, setSeverity] = useState(1);

  const nodeIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);
  const groups = useMemo(() => {
    const byLabel = new Map<string, GraphNode[]>();
    nodes.forEach(n => byLabel.set(n.label, [...(byLabel.get(n.label) ?? []), n]));
    const rank = (label: string) => (LABEL_ORDER.indexOf(label) + 1 || LABEL_ORDER.length + 1);
    return [...byLabel.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([label, list]) => [label, [...list].sort((a, b) => a.id.localeCompare(b.id))] as const);
  }, [nodes]);

  const validationError =
    !nodeId ? 'Chọn origin node (dropdown hoặc click trên graph).'
    : !nodeIds.has(nodeId) ? `Node ${nodeId} không có trong topology.`
    : !INCIDENT_TYPES.includes(incidentType) ? 'Incident type không hợp lệ.'
    : !(severity >= SEVERITY_MIN && severity <= SEVERITY_MAX) ? `Severity phải trong khoảng ${SEVERITY_MIN}–${SEVERITY_MAX}.`
    : '';
  const blocked = !!disabledReason || !!validationError || loading;

  const run = () => { if (!blocked) onRunSimulation(nodeId, incidentType, Math.round(severity * 10) / 10); };

  return (
    <div className="trigger-card">
      <div className="scenario-grid">
        {SCENARIOS.map(s => {
          const available = nodeIds.has(s.nodeId);
          const selected = nodeId === s.nodeId && incidentType === s.type;
          return (
            <button key={s.nodeId} type="button" disabled={!available || loading} title={available ? `${s.nodeId} · ${s.type}` : `${s.nodeId} không có trong graph`}
              className={`scenario-option ${selected ? 'selected' : ''}`} onClick={() => { onNodeChange(s.nodeId); setIncidentType(s.type); }}>
              <span className={`scenario-icon ${s.tone}`}>{s.icon}</span>
              <span><b>{s.title}</b><small>{s.hint} · {s.nodeId}</small></span><i />
            </button>
          );
        })}
      </div>
      <div className="trigger-controls">
        <label className="field-label">ORIGIN NODE
          <select value={nodeIds.has(nodeId) ? nodeId : ''} disabled={!nodes.length || loading} onChange={e => onNodeChange(e.target.value)}>
            <option value="" disabled>{nodes.length ? 'Select a node…' : 'No nodes loaded'}</option>
            {groups.map(([label, list]) => (
              <optgroup key={label} label={label}>
                {list.map(n => <option key={n.id} value={n.id}>{n.id}{typeof n.properties.name === 'string' ? ` — ${n.properties.name}` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field-label">INCIDENT TYPE
          <select value={incidentType} disabled={loading} onChange={e => setIncidentType(e.target.value as IncidentType)}>
            {INCIDENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="severity-control"><span className="field-label">SEVERITY <b>{severity.toFixed(1)}</b></span>
          <input type="range" min={SEVERITY_MIN} max={SEVERITY_MAX} step="0.1" value={severity} disabled={loading} onChange={e => setSeverity(Number(e.target.value))} />
        </label>
        <button type="button" className="run-button" disabled={blocked} onClick={run}>
          {loading ? <><LoaderCircle size={16} className="spin" /> Analyzing…</> : <>Run simulation <ArrowRight size={17} /></>}
        </button>
      </div>
      {(disabledReason || validationError) && (
        <p className="field-hint"><MousePointerClick size={13} /> {disabledReason || validationError}</p>
      )}
    </div>
  );
};
