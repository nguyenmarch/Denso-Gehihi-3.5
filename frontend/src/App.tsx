import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Boxes, BrainCircuit, CheckCircle2, ClipboardList, GitBranch, GraduationCap, LoaderCircle, Network, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { IncidentTrigger } from './components/IncidentTrigger';
import { GraphCanvas } from './components/GraphCanvas';
import { ActionMatrix } from './components/ActionMatrix';
import { ImpactTable } from './components/ImpactTable';
import { ErrorBoundary } from './components/ErrorBoundary';
import { API_BASE, fetchHealth, fetchTopology, toApiError, triggerSimulation } from './services/api';
import { ApiErrorInfo, GraphTopology, HealthStatus, IncidentType, SimulationResult } from './types';
import { SyncStatus } from './components/SyncStatus';
import { IncidentBoard } from './components/IncidentBoard';
import { IncidentDetail } from './components/IncidentDetail';
import { LessonReview } from './components/LessonReview';
import { ExpertInspector } from './components/ExpertInspector';
import { MachineList } from './components/MachineList';
import { MachineDetail } from './components/MachineDetail';
import { ROLE_LABELS } from './components/labels';
import { Actor, Incident, listActors, Role } from './services/api';
import './app.css';

type Remote<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: ApiErrorInfo };
type View = 'incidents' | 'machines' | 'graph' | 'lessons';

interface SimulationRun {
  id: number;
  // An alert raised by an incident, or a what-if simulation run from this tab.
  kind: 'alert' | 'simulation';
  at: Date;
  nodeId: string;
  type: IncidentType;
  severity: number;
  result?: SimulationResult;
  error?: ApiErrorInfo;
}

const HEALTH_POLL_MS = 15000;
const DEFAULT_ORIGIN = 'EQ_OVEN_01';
const PROPAGATION_RELATIONS = new Set(['OPERATES_IN', 'FLOWS_TO', 'AFFECTS']);
// Graph label → legend swatch. Only labels present in the topology are listed; GraphCanvas matches fault/part/document case-insensitively.
const LEGEND: [label: string, swatch: string, text: string][] = [
  ['processstep', 'process', 'Công đoạn'], ['equipment', 'equipment', 'Thiết bị'], ['batch', 'batch', 'Lô'],
  ['department', 'department', 'Bộ phận'], ['incidentevent', 'incident', 'Kiểu lỗi đã biết'], ['machineevent', 'machine-event', 'Event máy'],
  ['profilecheck', 'profile-check', 'Kiểm tra profile'], ['fault', 'fault', 'Lỗi'], ['part', 'part', 'Linh kiện'], ['document', 'document', 'Tài liệu'],
];

const ACTOR_KEY = 'inav-actor';
// Per-viewer convenience only: storage may be unavailable (private window), so every access is guarded.
const readActorId = () => { try { return localStorage.getItem(ACTOR_KEY) ?? ''; } catch { return ''; } };
const writeActorId = (id: string) => { try { localStorage.setItem(ACTOR_KEY, id); } catch { /* not remembered */ } };
// The open incident and view live in the URL so a reload reopens the same screen.
const readParam = (name: string) => new URLSearchParams(window.location.search).get(name) ?? '';
const writeParam = (name: string, value: string) => {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value); else url.searchParams.delete(name);
  window.history.replaceState(null, '', url);
};
const readView = (): View => { const v = readParam('view'); return v === 'machines' || v === 'graph' || v === 'lessons' ? v : 'incidents'; };

const formatTime = (d: Date) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase();

export const App: React.FC = () => {
  const [topology, setTopology] = useState<Remote<GraphTopology>>({ status: 'loading' });
  const [health, setHealth] = useState<Remote<HealthStatus>>({ status: 'loading' });
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [simLoading, setSimLoading] = useState(false);
  const [actors, setActors] = useState<Remote<Actor[]>>({ status: 'loading' });
  const [actorId, setActorId] = useState(readActorId);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentId, setIncidentId] = useState(() => readParam('incident'));
  const [incidentType, setIncidentType] = useState<IncidentType>('MACHINE_BREAKDOWN');
  const [severity, setSeverity] = useState(1);
  const [requestedView, setRequestedView] = useState<View>(readView);
  const [machineId, setMachineId] = useState(() => readParam('machine'));
  const [lastSync, setLastSync] = useState<number>();
  const shownAlertId = useRef('');

  const loadTopology = useCallback(async () => {
    setTopology({ status: 'loading' });
    try {
      setTopology({ status: 'ready', data: await fetchTopology() });
    } catch (err) {
      setTopology({ status: 'error', error: toApiError(err) });
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      setHealth({ status: 'ready', data: await fetchHealth() });
    } catch (err) {
      setHealth({ status: 'error', error: toApiError(err) });
    }
  }, []);

  const loadActors = useCallback(async () => {
    setActors({ status: 'loading' });
    try {
      setActors({ status: 'ready', data: await listActors() });
    } catch (err) {
      setActors({ status: 'error', error: toApiError(err) });
    }
  }, []);

  useEffect(() => { loadTopology(); }, [loadTopology]);
  useEffect(() => { loadActors(); }, [loadActors]);
  useEffect(() => {
    loadHealth();
    const timer = window.setInterval(loadHealth, HEALTH_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadHealth]);

  const graph = topology.status === 'ready' ? topology.data : undefined;
  const nodes = graph?.nodes ?? [];

  // Default origin once the real topology arrives: the demo node if present, otherwise the first node.
  useEffect(() => {
    if (!graph || graph.nodes.some(n => n.id === selectedNodeId)) return;
    setSelectedNodeId(graph.nodes.find(n => n.id === DEFAULT_ORIGIN)?.id ?? graph.nodes[0]?.id ?? '');
  }, [graph, selectedNodeId]);

  const handleSimulate = useCallback(async (nodeId: string, type: IncidentType, severity: number) => {
    const run: SimulationRun = { id: Date.now(), kind: 'simulation', at: new Date(), nodeId, type, severity };
    setSimLoading(true);
    try {
      run.result = await triggerSimulation(nodeId, type, severity);
    } catch (err) {
      run.error = toApiError(err);
    } finally {
      setRuns(prev => [run, ...prev].slice(0, 8));
      setSimLoading(false);
    }
  }, []);

  const actorList = actors.status === 'ready' ? actors.data : [];
  const actor = actorList.find(a => a.id === actorId) ?? actorList.find(a => a.role === 'operator');
  const role = actor?.role;
  const changeActor = (id: string) => { setIncidents([]); setLastSync(undefined); setActorId(id); writeActorId(id); };
  const selectIncident = useCallback((id: string) => { setIncidentId(id); writeParam('incident', id); }, []);
  const upsertIncident = useCallback((incident: Incident) => setIncidents(prev => prev.map(i => i.id === incident.id ? incident : i)), []);
  const selectedIncident = incidents.find(i => i.id === incidentId);
  const changeSeverity = useCallback((value: number) => setSeverity(Math.round(value * 10) / 10), []);

  // Technicians have no graph; only experts review lessons.
  const views: View[] = role === 'technician' ? ['incidents'] : role === 'expert' ? ['incidents', 'machines', 'graph', 'lessons'] : ['incidents', 'machines', 'graph'];
  const view = views.includes(requestedView) ? requestedView : 'incidents';
  const openView = (next: View) => { setRequestedView(next); writeParam('view', next === 'incidents' ? '' : next); };
  const openMachine = (id: string) => { setMachineId(id); writeParam('machine', id); };
  const openIncident = (id: string) => { selectIncident(id); openView('incidents'); };

  // Mark the newest active alert on the graph, whether it came from this tab's command or from polling.
  useEffect(() => {
    const alert = incidents.find(i => i.state === 'alert' && i.simulation);
    if (!alert || alert.id === shownAlertId.current) return;
    shownAlertId.current = alert.id;
    setRuns(prev => [{ id: Date.now(), kind: 'alert' as const, at: new Date(alert.created_at), nodeId: alert.simulation!.origin_id, type: alert.incident_type, severity: alert.severity, result: alert.simulation }, ...prev].slice(0, 8));
  }, [incidents]);

  const latest = runs[0];
  const lastSuccess = runs.find(r => r.result)?.result;
  // Only highlight the graph for the latest run; a failed run clears the highlight instead of showing stale impact.
  const shown = latest?.result;

  const stats = useMemo(() => {
    if (!graph) return undefined;
    const byLabel: Record<string, number> = {};
    graph.nodes.forEach(n => { byLabel[n.label] = (byLabel[n.label] ?? 0) + 1; });
    return { byLabel, propagationEdges: graph.edges.filter(e => PROPAGATION_RELATIONS.has(e.type)).length };
  }, [graph]);
  const legend = useMemo(() => {
    const present = new Set(nodes.map(n => n.label.toLowerCase()));
    return LEGEND.filter(([label]) => present.has(label));
  }, [nodes]);

  const departmentNames = useMemo(() => Object.fromEntries(nodes.filter(n => n.label === 'Department').map(n => [n.id, String(n.properties.name ?? n.id)])), [nodes]);
  const nodeName = (id: string) => { const n = nodes.find(x => x.id === id); return n && typeof n.properties.name === 'string' ? n.properties.name : id; };

  const backendDown = health.status === 'error';
  const dbDown = health.status === 'ready' && health.data.status !== 'ok';
  const statusText = health.status === 'loading' ? 'Đang kiểm tra backend…' : backendDown ? 'Không kết nối được backend' : dbDown ? 'Neo4j không sẵn sàng' : 'Backend & Neo4j đã kết nối';
  const statusTone = health.status === 'loading' ? 'idle' : backendDown || dbDown ? 'bad' : 'good';

  const disabledReason =
    backendDown || dbDown ? 'Backend hoặc Neo4j chưa sẵn sàng.'
    : topology.status === 'loading' ? 'Đang tải topology…'
    : topology.status === 'error' ? 'Cần tải được topology trước khi mô phỏng.'
    : nodes.length === 0 ? 'Graph trống — hãy chạy migration và seed Neo4j.'
    : undefined;

  const maxHop = shown?.impacted_nodes.reduce((m, n) => Math.max(m, n.distance), 0);
  const openIncidents = incidents.filter(i => i.state !== 'resolved');
  const alertCount = incidents.filter(i => i.state === 'alert').length;
  // Badge = records waiting on this role: operators dispatch alerts and unresolved incidents, technicians work on their assignments.
  const waiting = role === 'operator' ? incidents.filter(i => i.state === 'alert' || i.state === 'unresolved').length
    : role === 'technician' ? incidents.filter(i => i.state === 'dispatched' || i.state === 'in_progress').length : 0;

  const heading: Record<View, [string, string]> = {
    incidents: [
      role === 'technician' ? 'Việc của tôi' : role === 'expert' ? 'Hồ sơ sự cố' : 'Điều phối sự cố',
      role === 'technician' ? 'Nhận việc, làm theo hướng dẫn và báo cáo kết quả.' : 'Theo dõi sự cố trên dây chuyền và quyết định xử lý.',
    ],
    machines: machineId ? ['Hoạt động máy', 'Tín hiệu theo thời gian thực và các lần bất thường phát hiện từ dữ liệu.'] : ['Giám sát máy', 'Trạng thái từng máy, tính từ dữ liệu tín hiệu. Chọn một máy để xem chi tiết.'],
    graph: ['Knowledge graph & mô phỏng', 'Theo dõi sự cố lan truyền qua graph chuỗi sản xuất.'],
    lessons: ['Duyệt bài học', 'Bài học từ báo cáo kỹ thuật chỉ vào hướng dẫn sau khi chuyên gia chấp nhận.'],
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><BrainCircuit size={22} /></div><div><strong>Incident<span>Navigator</span></strong><small>Demo dữ liệu synthetic</small></div></div>
        <nav aria-label="Không gian làm việc">
          <p className="nav-label">KHÔNG GIAN LÀM VIỆC</p>
          <button type="button" className={`nav-item ${view === 'incidents' ? 'active' : ''}`} onClick={() => openView('incidents')}>
            <ClipboardList size={17} /> {heading.incidents[0]}
            {waiting > 0 && <span className="nav-count alert" title={`${waiting} sự cố đang chờ bạn xử lý`}>{waiting}</span>}
          </button>
          {views.includes('machines') && <button type="button" className={`nav-item ${view === 'machines' ? 'active' : ''}`} onClick={() => { openView('machines'); openMachine(''); }}>
            <Activity size={17} /> Giám sát máy
          </button>}
          {views.includes('graph') && <button type="button" className={`nav-item ${view === 'graph' ? 'active' : ''}`} onClick={() => openView('graph')}>
            <Network size={17} /> Graph & mô phỏng
          </button>}
          {views.includes('lessons') && <button type="button" className={`nav-item ${view === 'lessons' ? 'active' : ''}`} onClick={() => openView('lessons')}>
            <GraduationCap size={17} /> Duyệt bài học
          </button>}
        </nav>

        <div className="sidebar-bottom">
          <div className={`sidebar-status ${statusTone}`}><div className={`status-dot ${statusTone === 'good' ? 'pulse' : ''}`} /><div><strong>{statusText}</strong><small>{API_BASE.replace(/^https?:\/\//, '')}</small></div></div>
          <div className="user-card">
            <div className="avatar">{actor ? initials(actor.name) : 'DM'}</div>
            {actor
              ? <label className="actor-picker"><small>Vai trò demo</small><select aria-label="Actor demo" value={actor.id} onChange={e => changeActor(e.target.value)}>
                  {(Object.keys(ROLE_LABELS) as Role[]).map(r => <optgroup key={r} label={ROLE_LABELS[r]}>{actorList.filter(a => a.role === r).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
                </select></label>
              : <div><strong>Chế độ demo</strong><small>{actors.status === 'loading' ? 'Đang tải actor…' : 'Chưa có actor'}</small></div>}
          </div>
          <p className="sidebar-note">Chế độ trình diễn, không đăng nhập · không điều khiển máy thật.</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</p><h1>{heading[view][0]}</h1><p className="subheading">{heading[view][1]}</p></div>
          <div className="top-actions"><SyncStatus lastSync={lastSync} /></div>
        </header>

        {(backendDown || dbDown) && (
          <div className="error-banner top-banner" role="alert"><WifiOff size={16} />
            <span>{backendDown ? health.error.message : 'Backend đang chạy nhưng Neo4j chưa sẵn sàng (/health = degraded). Topology và mô phỏng sẽ lỗi cho tới khi Neo4j kết nối lại.'}</span>
            <button type="button" className="ghost-button" onClick={() => { loadHealth(); loadTopology(); }}><RefreshCw size={13} /> Thử lại</button>
          </div>
        )}
        {actors.status === 'loading' && <div className="state-box compact"><LoaderCircle size={18} className="spin" /><p>Đang tải danh sách actor demo…</p></div>}
        {actors.status === 'error' && <div className="error-banner top-banner" role="alert"><AlertTriangle size={16} /><span>{actors.error.message}</span><button type="button" className="ghost-button" onClick={loadActors}><RefreshCw size={13} /> Thử lại</button></div>}

        {/* Stays mounted while hidden: the board's polling feeds alerts to the graph, and open forms keep their input. */}
        {actor && <div className="workspace-grid" hidden={view !== 'incidents'}>
          <IncidentBoard actor={actor} actors={actorList} incidents={incidents} onIncidentsChange={setIncidents} selectedId={incidentId} onSelect={selectIncident}
            nodes={nodes} nodeId={selectedNodeId} incidentType={incidentType} severity={severity}
            onNodeChange={setSelectedNodeId} onIncidentTypeChange={setIncidentType} onSeverityChange={changeSeverity} onSynced={setLastSync} />
          {selectedIncident ? <IncidentDetail key={`${selectedIncident.id}:${actor.id}`} incident={selectedIncident} actor={actor} actors={actorList} onChange={upsertIncident} />
            : <section className="panel incident-detail empty"><div className="state-box"><ClipboardList size={26} /><strong>{incidentId && incidents.length ? 'Sự cố đang mở không thuộc danh sách của vai trò này' : 'Chưa chọn sự cố'}</strong><p>Chọn một sự cố ở danh sách bên trái để xem tác động, hướng dẫn và thao tác.</p></div></section>}
        </div>}

        {actor && view === 'machines' && (machineId
          ? <MachineDetail key={machineId} actor={actor} machineId={machineId} onBack={() => openMachine('')} onOpenIncident={openIncident} />
          : <MachineList actor={actor} onOpen={openMachine} />)}

        {actor && role === 'expert' && <div hidden={view !== 'lessons'}><LessonReview actor={actor} actors={actorList} incidents={incidents} /></div>}

        {view === 'graph' && <>
          <section className="kpi-grid">
            <div className="kpi-card"><div className="kpi-icon"><Boxes size={18} /></div><span>NODE TRONG GRAPH</span><strong>{stats ? graph!.nodes.length : '—'}</strong><small>{stats ? `${stats.byLabel.ProcessStep ?? 0} công đoạn · ${stats.byLabel.Equipment ?? 0} thiết bị · ${stats.byLabel.Batch ?? 0} lô` : 'Chưa tải topology'}</small></div>
            <div className="kpi-card"><div className="kpi-icon violet"><GitBranch size={18} /></div><span>QUAN HỆ</span><strong>{stats ? graph!.edges.length : '—'}</strong><small>{stats ? <><b>{stats.propagationEdges}</b> đường lan truyền</> : 'Chưa tải topology'}</small></div>
            <div className="kpi-card"><div className="kpi-icon amber"><AlertTriangle size={18} /></div><span>NODE BỊ ẢNH HƯỞNG</span><strong>{shown ? shown.impacted_nodes.length : '—'}</strong><small>{shown ? (shown.impacted_nodes.length ? <>tối đa <b className="warning">{maxHop}</b> bước từ {shown.origin_id}</> : `không lan xuống sau ${shown.origin_id}`) : 'Chưa có sự cố hoặc mô phỏng'}</small></div>
            <div className="kpi-card"><div className="kpi-icon green"><ClipboardList size={18} /></div><span>SỰ CỐ ĐANG MỞ</span><strong>{lastSync ? openIncidents.length : '—'}</strong><small>{lastSync ? <><b className={alertCount ? 'warning' : ''}>{alertCount}</b> cảnh báo chưa giao việc</> : 'Chưa tải danh sách sự cố'}</small></div>
          </section>

          <section className="panel graph-panel">
            <div className="panel-heading">
              <div><div className="heading-row"><h2>Topology lan truyền</h2><span className="tag blue-tag">NEO4J</span></div><p>Click một node để chọn làm điểm phát sinh sự cố.</p></div>
              <div className="graph-legend">
                {legend.map(([label, swatch, text]) => <span key={label}><i className={`legend-dot ${swatch}`} />{text}</span>)}
                {shown && shown.impacted_nodes.length > 0 && <span><i className="legend-dot impacted" />Bị ảnh hưởng</span>}
              </div>
            </div>
            <div className="graph-wrap">
              {topology.status === 'loading' && <div className="state-box"><LoaderCircle size={22} className="spin" /><strong>Đang tải topology…</strong><p>GET /graph/topology</p></div>}
              {topology.status === 'error' && <div className="state-box error" role="alert"><AlertTriangle size={22} /><strong>Không tải được topology</strong><p>{topology.error.message}</p><button type="button" className="ghost-button" onClick={loadTopology}><RefreshCw size={13} /> Thử lại</button></div>}
              {graph && graph.nodes.length === 0 && <div className="state-box"><Boxes size={22} /><strong>Graph chưa có dữ liệu</strong><p>Chạy migration và seed trong <code>backend/data/</code> (xem docs/runbook.md), rồi tải lại.</p><button type="button" className="ghost-button" onClick={loadTopology}><RefreshCw size={13} /> Tải lại</button></div>}
              {graph && graph.nodes.length > 0 && (
                <ErrorBoundary title="Không thể vẽ graph">
                  <GraphCanvas topology={graph} impactedNodes={shown?.impacted_nodes} originId={shown?.origin_id} selectedId={selectedNodeId} onNodeClick={setSelectedNodeId} />
                </ErrorBoundary>
              )}
            </div>
            <div className="graph-footer">
              <span>{graph ? <><Wifi size={14} /> {graph.nodes.length} node · {graph.edges.length} quan hệ từ API</> : <><WifiOff size={14} /> Chưa đồng bộ</>}</span>
              <span>Đang chọn <b>{selectedNodeId ? nodeName(selectedNodeId) : '—'}</b></span>
              {shown && <span>Đang hiển thị <b>{shown.origin_id}</b> · {shown.incident_type}</span>}
            </div>
          </section>

          <div className="analysis-grid">
            <section className="panel simulation-section">
              <div className="section-title"><div><p className="eyebrow">PHÂN TÍCH WHAT-IF</p><h2>Mô phỏng sự cố</h2><p>Chỉ tính phạm vi ảnh hưởng, không tạo sự cố hay work order.</p></div><div className={`engine-state ${disabledReason ? 'idle' : ''}`}><span className="status-dot" /> {disabledReason ? 'Chưa thể mô phỏng' : 'Sẵn sàng mô phỏng'}</div></div>
              <IncidentTrigger nodes={nodes} nodeId={selectedNodeId} incidentType={incidentType} severity={severity} onNodeChange={setSelectedNodeId} onIncidentTypeChange={setIncidentType} onSeverityChange={changeSeverity} onRunSimulation={handleSimulate} loading={simLoading} disabledReason={disabledReason} />
              {latest?.error && (
                <div className="error-banner" role="alert"><AlertTriangle size={16} />
                  <span><b>Mô phỏng thất bại{latest.error.status ? ` (HTTP ${latest.error.status}${latest.error.code ? ` · ${latest.error.code}` : ''})` : ''}:</b> {latest.error.message}{lastSuccess ? ' Kết quả thành công gần nhất vẫn hiển thị trong nhật ký.' : ''}</span>
                </div>
              )}
            </section>

            <div className="side-stack">
              {role === 'expert' && <ExpertInspector nodeId={selectedNodeId} />}
              <section className="panel activity-panel">
                <div className="panel-heading"><div><h2>Nhật ký</h2><p>Sự cố & mô phỏng trong phiên này</p></div></div>
                <div className="activity-list">
                  {runs.length === 0 && <p className="empty-note">Chưa có sự cố hay lần mô phỏng nào.</p>}
                  {runs.map(r => (
                    <div className="activity-item" key={r.id}>
                      <div className={`event-icon ${r.error ? 'red' : r.kind === 'alert' ? 'amber' : 'green'}`}>{r.error || r.kind === 'alert' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}</div>
                      <div><strong>{r.kind === 'alert' ? 'Cảnh báo' : 'Mô phỏng'} · {r.type} · {r.nodeId}</strong><p>{r.error ? r.error.message : `${r.result!.impacted_nodes.length} node bị ảnh hưởng · mức ${r.severity.toFixed(1)}`}</p></div>
                      <time>{formatTime(r.at)}</time>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {shown && (
            <section className="panel results-section">
              <div className="result-banner">
                <div className="result-icon"><BrainCircuit size={20} /></div>
                <div><strong>Phạm vi ảnh hưởng · {nodeName(shown.origin_id)} ({shown.origin_id})</strong><p>{shown.incident_type} · mức {latest.severity.toFixed(1)} · {shown.impacted_nodes.length} node phía sau bị ảnh hưởng · {formatTime(latest.at)}</p></div>
                <span className={`severity-badge ${shown.impacted_nodes.length ? '' : 'muted'}`}>{shown.impacted_nodes.length ? 'ĐÃ XÁC ĐỊNH ẢNH HƯỞNG' : 'KHÔNG LAN TRUYỀN'}</span>
              </div>
              <ErrorBoundary title="Không thể hiển thị kết quả">
                {shown.impacted_nodes.length > 0
                  ? <ImpactTable nodes={shown.impacted_nodes} onSelect={setSelectedNodeId} />
                  : <div className="state-box compact"><CheckCircle2 size={18} /><strong>Không có node downstream bị ảnh hưởng</strong><p>{shown.origin_id} không có quan hệ OPERATES_IN / FLOWS_TO / AFFECTS đi ra trong phạm vi max hops.</p></div>}
                <ActionMatrix key={latest.id} actions={shown.actions_by_department} departmentNames={departmentNames} />
              </ErrorBoundary>
            </section>
          )}
        </>}
      </main>
    </div>
  );
};

export default App;
