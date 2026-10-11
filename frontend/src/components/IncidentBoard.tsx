import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { Actor, command, Incident, listIncidents, listScenarios, Scenario, toApiError } from '../services/api';
import { GraphNode, IncidentType } from '../types';
import { TYPE_LABELS } from './IncidentTrigger';
import { actorName, formatAt, STATE_LABELS } from './labels';

interface IncidentBoardProps {
  actor: Actor; actors: Actor[];
  incidents: Incident[]; onIncidentsChange: Dispatch<SetStateAction<Incident[]>>;
  selectedId: string; onSelect: (id: string) => void;
  nodes: GraphNode[]; nodeId: string; incidentType: IncidentType; severity: number;
}

export function IncidentBoard({ actor, actors, incidents, onIncidentsChange, selectedId, onSelect, nodes, nodeId, incidentType, severity }: IncidentBoardProps) {
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
      .then(data => { if (active) { onIncidentsChange(data); setListError(''); } })
      .catch(err => { if (active) setListError(toApiError(err).message); });
    load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [actor, reload, onIncidentsChange]);

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

  const faultNode = nodes.find(n => n.id === nodeId);
  return <section className="panel workflow" id="work-orders">
    <div className="panel-heading"><div><h2>{operator ? 'Sự cố' : actor.role === 'technician' ? 'Việc của tôi' : 'Hồ sơ sự cố'}</h2><p>Dữ liệu synthetic. Không có đường điều khiển tới máy.</p></div></div>
    {operator && <div className="scenario-actions">
      {scenarios.map(s => <button key={s.id} className="ghost-button" disabled={busy} onClick={() => create(`/scenarios/${s.id}/trigger`, {})}>
        Kích hoạt: {s.event.label} · {s.asset.name}</button>)}
      <div className="fault-control"><button className="ghost-button" disabled={busy || !faultNode} onClick={() => create('/incidents/fault', { node_id: nodeId, incident_type: incidentType, severity })}>{busy ? 'Đang xử lý…' : 'Gây lỗi ngay (synthetic)'}</button><small>{faultNode ? `${String(faultNode.properties.name ?? faultNode.id)} · ${TYPE_LABELS[incidentType]} · mức ${severity.toFixed(1)}` : 'Chọn node trên graph'} — đổi trên graph hoặc ở phần mô phỏng bên dưới.</small></div>
    </div>}
    {listError && <div className="error-banner" role="alert">{listError}<button className="ghost-button" onClick={() => setReload(n => n + 1)}>Tải lại danh sách</button></div>}
    {commandError && <div className="error-banner" role="alert">{commandError}</div>}
    <div className="order-list">
      {incidents.length === 0 && <p>{operator ? 'Chưa có sự cố. Kích hoạt một kịch bản để bắt đầu.' : actor.role === 'technician' ? 'Chưa có việc nào được giao cho bạn.' : 'Chưa có sự cố.'}</p>}
      {incidents.map(incident => <button type="button" key={incident.id} className={`order-card ${incident.state === 'alert' ? 'alert' : ''} ${incident.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(incident.id)}>
        <div><strong>{incident.state === 'alert' ? '🔴 ' : ''}{incident.asset.name} · {TYPE_LABELS[incident.incident_type]}</strong>
          <p>{STATE_LABELS[incident.state]} · {incident.event?.label ?? 'Gây lỗi thủ công'} · {formatAt(incident.created_at)} · {incident.assignee ? actorName(actors, incident.assignee.id) : 'Chưa giao'}</p></div>
        <span className={`state-pill ${incident.state}`}>{STATE_LABELS[incident.state]}</span>
      </button>)}
    </div>
  </section>;
}
