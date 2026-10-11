import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import { Inbox, RefreshCw, Zap } from 'lucide-react';
import { Actor, command, Incident, listIncidents, listScenarios, Scenario, toApiError } from '../services/api';
import { GraphNode, INCIDENT_TYPES, IncidentType, ORIGIN_TYPES, SEVERITY_MAX, SEVERITY_MIN } from '../types';
import { NodeSelect, TYPE_LABELS } from './IncidentTrigger';
import { actorName, formatAt, STATE_LABELS } from './labels';

interface IncidentBoardProps {
  actor: Actor; actors: Actor[];
  incidents: Incident[]; onIncidentsChange: Dispatch<SetStateAction<Incident[]>>;
  selectedId: string; onSelect: (id: string) => void;
  nodes: GraphNode[]; nodeId: string; incidentType: IncidentType; severity: number;
  // The manual fault shares node/type/severity with the simulation form on the graph screen.
  onNodeChange: (nodeId: string) => void; onIncidentTypeChange: (type: IncidentType) => void; onSeverityChange: (severity: number) => void;
  // Called after each successful poll so the top bar can show how fresh the list is.
  onSynced?: (at: number) => void;
}

export function IncidentBoard({ actor, actors, incidents, onIncidentsChange, selectedId, onSelect, nodes, nodeId, incidentType, severity, onNodeChange, onIncidentTypeChange, onSeverityChange, onSynced }: IncidentBoardProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [busy, setBusy] = useState(false);
  // A list error clears on the next successful poll; a command error stays until the next command.
  const [listError, setListError] = useState('');
  const [commandError, setCommandError] = useState('');
  const [reload, setReload] = useState(0);
  const operator = actor.role === 'operator';

  useEffect(() => {
    let active = true;
    const load = () => listIncidents(actor)
      .then(data => { if (active) { onIncidentsChange(data); setListError(''); onSynced?.(Date.now()); } })
      .catch(err => { if (active) setListError(toApiError(err).message); });
    load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [actor, reload, onIncidentsChange, onSynced]);

  useEffect(() => {
    if (!operator) return;
    let active = true;
    listScenarios(actor).then(data => { if (active) setScenarios(data); }).catch(err => { if (active) setListError(toApiError(err).message); });
    return () => { active = false; };
  }, [actor, operator]);

  const create = async (path: string, body: object) => {
    setBusy(true); setCommandError('');
    try {
      const incident = await command<Incident>(path, body, actor);
      onIncidentsChange(prev => [incident, ...prev.filter(i => i.id !== incident.id)]);
      onSelect(incident.id);
    } catch (err) { setCommandError(toApiError(err).message); }
    finally { setBusy(false); }
  };

  // The backend rejects an incident whose origin type does not fit its incident type, so only fitting nodes are offered.
  const originNodes = useMemo(() => nodes.filter(n => ORIGIN_TYPES[incidentType].includes(n.label)), [nodes, incidentType]);
  const faultNode = originNodes.find(n => n.id === nodeId);
  const alerts = incidents.filter(i => i.state === 'alert').length;
  return <section className="panel workflow">
    <div className="panel-heading"><div><div className="heading-row"><h2>{operator ? 'Sự cố' : actor.role === 'technician' ? 'Việc của tôi' : 'Hồ sơ sự cố'}</h2>{incidents.length > 0 && <span className="tag blue-tag">{incidents.length}</span>}{alerts > 0 && <span className="tag alert-tag">{alerts} CẢNH BÁO</span>}</div><p>Dữ liệu synthetic. Không có đường điều khiển tới máy.</p></div></div>
    {operator && <div className="board-tools">
      {scenarios.length > 0 && <>
        <p className="tool-label">KÍCH HOẠT KỊCH BẢN</p>
        <div className="scenario-list">
          {scenarios.map(s => <button key={s.id} type="button" className="scenario-chip" disabled={busy} onClick={() => create(`/scenarios/${s.id}/trigger`, {})}>
            <Zap size={14} /><span><b>{s.event.label}</b><small>{s.asset.name}</small></span></button>)}
        </div>
      </>}
      <details className="fault-form">
        <summary>Gây lỗi thủ công (synthetic)<small>{faultNode ? `${String(faultNode.properties.name ?? faultNode.id)} · ${TYPE_LABELS[incidentType]} · mức ${severity.toFixed(1)}` : `Chọn node loại ${ORIGIN_TYPES[incidentType].join(' / ')}`}</small></summary>
        <div className="fault-grid">
          <label className="field-label">NODE<NodeSelect nodes={originNodes} value={nodeId} onChange={onNodeChange} disabled={busy} /></label>
          <label className="field-label">LOẠI SỰ CỐ<select value={incidentType} disabled={busy} onChange={e => onIncidentTypeChange(e.target.value as IncidentType)}>{INCIDENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select></label>
          <label className="severity-control"><span className="field-label">MỨC ĐỘ <b>{severity.toFixed(1)}</b></span><input type="range" min={SEVERITY_MIN} max={SEVERITY_MAX} step="0.1" value={severity} disabled={busy} onChange={e => onSeverityChange(Number(e.target.value))} /></label>
        </div>
        <button type="button" className="run-button" disabled={busy || !faultNode} onClick={() => create('/incidents/fault', { node_id: nodeId, incident_type: incidentType, severity })}>{busy ? 'Đang xử lý…' : 'Gây lỗi ngay'}</button>
      </details>
    </div>}
    {listError && <div className="error-banner" role="alert"><span>{listError}</span><button type="button" className="ghost-button" onClick={() => setReload(n => n + 1)}><RefreshCw size={13} /> Tải lại</button></div>}
    {commandError && <div className="error-banner" role="alert"><span>{commandError}</span></div>}
    <div className="order-list">
      {incidents.length === 0 && <div className="state-box compact"><Inbox size={20} /><p>{operator ? 'Chưa có sự cố. Kích hoạt một kịch bản để bắt đầu.' : actor.role === 'technician' ? 'Chưa có việc nào được giao cho bạn.' : 'Chưa có sự cố.'}</p></div>}
      {incidents.map(incident => <button type="button" key={incident.id} className={`order-card ${incident.state} ${incident.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(incident.id)}>
        <div><strong>{incident.asset.name} · {TYPE_LABELS[incident.incident_type]}</strong>
          <p>{incident.event?.label ?? 'Gây lỗi thủ công'} · alarm {formatAt(incident.alarm_at)}</p>
          <p>{incident.assignee ? `Giao cho ${actorName(actors, incident.assignee.id)}` : 'Chưa giao'}</p></div>
        <span className={`state-pill ${incident.state}`}>{STATE_LABELS[incident.state]}</span>
      </button>)}
    </div>
  </section>;
}
