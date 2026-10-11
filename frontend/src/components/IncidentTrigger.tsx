import React, { useMemo } from 'react';
import { ArrowRight, Flame, Gauge, LoaderCircle, MousePointerClick, PackageSearch } from 'lucide-react';
import { GraphNode, INCIDENT_TYPES, IncidentType, SEVERITY_MAX, SEVERITY_MIN } from '../types';

// Demo presets. Each is only enabled when its node exists in the live topology.
const SCENARIOS: { nodeId: string; type: IncidentType; title: string; hint: string; icon: React.ReactNode; tone: string }[] = [
  { nodeId: 'EQ_OVEN_01', type: 'MACHINE_BREAKDOWN', title: 'Hỏng máy', hint: 'Lỗi bộ gia nhiệt lò reflow', icon: <Flame size={18} />, tone: 'orange' },
  { nodeId: 'STEP_SMT', type: 'MATERIAL_DEFECT', title: 'Lỗi chất lượng vật liệu', hint: 'Sai lệch dung sai tụ điện', icon: <PackageSearch size={18} />, tone: 'purple' },
  { nodeId: 'EQ_AOI_01', type: 'CYCLE_TIME_SPIKE', title: 'Nghẽn kiểm tra', hint: 'Cycle time AOI tăng đột biến', icon: <Gauge size={18} />, tone: 'blue' },
];

export const TYPE_LABELS: Record<IncidentType, string> = {
  MACHINE_BREAKDOWN: 'Hỏng máy',
  MATERIAL_DEFECT: 'Lỗi vật liệu',
  CYCLE_TIME_SPIKE: 'Tăng cycle time',
};

const LABEL_ORDER = ['Equipment', 'ProcessStep', 'Batch', 'IncidentEvent', 'Department'];

// Node dropdown grouped by graph label; shared by the simulation form and the operator's manual fault form.
export const NodeSelect: React.FC<{ nodes: GraphNode[]; value: string; onChange: (nodeId: string) => void; disabled?: boolean }> = ({ nodes, value, onChange, disabled }) => {
  const groups = useMemo(() => {
    const byLabel = new Map<string, GraphNode[]>();
    nodes.forEach(n => byLabel.set(n.label, [...(byLabel.get(n.label) ?? []), n]));
    const rank = (label: string) => (LABEL_ORDER.indexOf(label) + 1 || LABEL_ORDER.length + 1);
    return [...byLabel.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([label, list]) => [label, [...list].sort((a, b) => a.id.localeCompare(b.id))] as const);
  }, [nodes]);
  return (
    <select value={nodes.some(n => n.id === value) ? value : ''} disabled={!nodes.length || disabled} onChange={e => onChange(e.target.value)}>
      <option value="" disabled>{nodes.length ? 'Chọn node…' : 'Chưa tải node'}</option>
      {groups.map(([label, list]) => (
        <optgroup key={label} label={label}>
          {list.map(n => <option key={n.id} value={n.id}>{n.id}{typeof n.properties.name === 'string' ? ` — ${n.properties.name}` : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
};

interface IncidentTriggerProps {
  nodes: GraphNode[];
  nodeId: string;
  incidentType: IncidentType;
  severity: number;
  onNodeChange: (nodeId: string) => void;
  onIncidentTypeChange: (type: IncidentType) => void;
  onSeverityChange: (severity: number) => void;
  onRunSimulation: (nodeId: string, type: IncidentType, severity: number) => void;
  loading?: boolean;
  disabledReason?: string;
}

export const IncidentTrigger: React.FC<IncidentTriggerProps> = ({ nodes, nodeId, incidentType, severity, onNodeChange, onIncidentTypeChange, onSeverityChange, onRunSimulation, loading = false, disabledReason }) => {
  const nodeIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);
  const validationError =
    !nodeId ? 'Chọn node gốc (dropdown hoặc click trên graph).'
    : !nodeIds.has(nodeId) ? `Node ${nodeId} không có trong topology.`
    : !INCIDENT_TYPES.includes(incidentType) ? 'Loại sự cố không hợp lệ.'
    : !(severity >= SEVERITY_MIN && severity <= SEVERITY_MAX) ? `Mức độ phải trong khoảng ${SEVERITY_MIN}–${SEVERITY_MAX}.`
    : '';
  const blocked = !!disabledReason || !!validationError || loading;

  const run = () => { if (!blocked) onRunSimulation(nodeId, incidentType, severity); };

  return (
    <div className="trigger-card">
      <div className="scenario-grid">
        {SCENARIOS.map(s => {
          const available = nodeIds.has(s.nodeId);
          const selected = nodeId === s.nodeId && incidentType === s.type;
          return (
            <button key={s.nodeId} type="button" disabled={!available || loading} title={available ? `${s.nodeId} · ${s.type}` : `${s.nodeId} không có trong graph`}
              className={`scenario-option ${selected ? 'selected' : ''}`} onClick={() => { onNodeChange(s.nodeId); onIncidentTypeChange(s.type); }}>
              <span className={`scenario-icon ${s.tone}`}>{s.icon}</span>
              <span><b>{s.title}</b><small>{s.hint} · {s.nodeId}</small></span><i />
            </button>
          );
        })}
      </div>
      <div className="trigger-controls">
        <label className="field-label">NODE GỐC
          <NodeSelect nodes={nodes} value={nodeId} onChange={onNodeChange} disabled={loading} />
        </label>
        <label className="field-label">LOẠI SỰ CỐ
          <select value={incidentType} disabled={loading} onChange={e => onIncidentTypeChange(e.target.value as IncidentType)}>
            {INCIDENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="severity-control"><span className="field-label">MỨC ĐỘ <b>{severity.toFixed(1)}</b></span>
          <input type="range" min={SEVERITY_MIN} max={SEVERITY_MAX} step="0.1" value={severity} disabled={loading} onChange={e => onSeverityChange(Number(e.target.value))} />
        </label>
        <button type="button" className="run-button" disabled={blocked} onClick={run}>
          {loading ? <><LoaderCircle size={16} className="spin" /> Đang phân tích…</> : <>Chạy mô phỏng <ArrowRight size={17} /></>}
        </button>
      </div>
      {(disabledReason || validationError) && (
        <p className="field-hint"><MousePointerClick size={13} /> {disabledReason || validationError}</p>
      )}
    </div>
  );
};
