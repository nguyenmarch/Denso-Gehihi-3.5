import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Boxes, BrainCircuit, CheckCircle2, GitBranch, LoaderCircle, RefreshCw, Target, Wifi, WifiOff, Zap } from 'lucide-react';
import { IncidentTrigger } from './components/IncidentTrigger';
import { GraphCanvas } from './components/GraphCanvas';
import { ActionMatrix } from './components/ActionMatrix';
import { ImpactTable } from './components/ImpactTable';
import { ErrorBoundary } from './components/ErrorBoundary';
import { API_BASE, fetchHealth, fetchTopology, toApiError, triggerSimulation } from './services/api';
import { ApiErrorInfo, GraphTopology, HealthStatus, IncidentType, SimulationResult } from './types';
import { LiveStatus } from './components/LiveStatus';
import { WorkFlow } from './components/WorkFlow';
import { ExpertInspector } from './components/ExpertInspector';
import { DemoRole, WorkOrder } from './services/api';
import './app.css';

type Remote<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: ApiErrorInfo };

interface SimulationRun {
  id: number;
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

const formatTime = (d: Date) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const App: React.FC = () => {
  const [topology, setTopology] = useState<Remote<GraphTopology>>({ status: 'loading' });
  const [health, setHealth] = useState<Remote<HealthStatus>>({ status: 'loading' });
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [simLoading, setSimLoading] = useState(false);
  const [demoRole, setDemoRole] = useState<DemoRole>('operator');
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [incidentType, setIncidentType] = useState<IncidentType>('MACHINE_BREAKDOWN');
  const [severity, setSeverity] = useState(1);
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

  useEffect(() => { loadTopology(); }, [loadTopology]);
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
    const run: SimulationRun = { id: Date.now(), at: new Date(), nodeId, type, severity };
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

  // Mark the newest active alert on the graph, whether it came from this tab's fault command or from polling.
  useEffect(() => {
    const alert = orders.find(o => o.state === 'alert' && o.simulation);
    if (!alert || alert.id === shownAlertId.current) return;
    shownAlertId.current = alert.id;
    setRuns(prev => [{ id: Date.now(), at: new Date(alert.created_at), nodeId: alert.simulation!.origin_id, type: alert.incident_type, severity: alert.severity ?? 1, result: alert.simulation }, ...prev].slice(0, 8));
  }, [orders]);

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

  const departmentNames = useMemo(() => Object.fromEntries(nodes.filter(n => n.label === 'Department').map(n => [n.id, String(n.properties.name ?? n.id)])), [nodes]);
  const nodeName = (id: string) => { const n = nodes.find(x => x.id === id); return n && typeof n.properties.name === 'string' ? n.properties.name : id; };

  const backendDown = health.status === 'error';
  const dbDown = health.status === 'ready' && health.data.status !== 'ok';
  const statusText = health.status === 'loading' ? 'Đang kiểm tra backend…' : backendDown ? 'Không kết nối được backend' : dbDown ? 'Neo4j không sẵn sàng' : 'Backend & Neo4j đã kết nối';
  const statusTone = health.status === 'loading' ? 'idle' : backendDown || dbDown ? 'bad' : 'good';

  const disabledReason =
    topology.status === 'loading' ? 'Đang tải topology…'
    : topology.status === 'error' ? 'Cần tải được topology trước khi mô phỏng.'
    : nodes.length === 0 ? 'Graph trống — hãy chạy migration và seed Neo4j.'
    : undefined;

  const peak = shown?.impacted_nodes.reduce((m, n) => Math.max(m, n.impact_score), 0);
  const maxHop = shown?.impacted_nodes.reduce((m, n) => Math.max(m, n.distance), 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><BrainCircuit size={22} /></div><div><strong>Incident<span>Navigator</span></strong><small>Demo dữ liệu synthetic</small></div></div>
        <nav><p className="nav-label">KHÔNG GIAN LÀM VIỆC</p><a className="nav-item active" href="#top"><Activity size={17} /> Trung tâm điều phối</a><a className="nav-item" href="#topology"><Boxes size={17} /> Knowledge graph {graph && <span className="nav-count">{graph.nodes.length}</span>}</a><a className="nav-item" href="#simulate"><Zap size={17} /> Mô phỏng what-if</a></nav>
        <div className={`sidebar-status ${statusTone}`}><div className={`status-dot ${statusTone === 'good' ? 'pulse' : ''}`} /><div><strong>{statusText}</strong><small>{API_BASE.replace(/^https?:\/\//, '')}</small></div></div>
        <div className="user-card"><div className="avatar">DM</div><div><strong>Chế độ demo</strong><small>Không điều khiển máy thật</small></div></div>
      </aside>
      <main className="main-content" id="top">
        <header className="topbar">
          <div><p className="eyebrow">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</p><h1>Trung tâm điều phối sự cố <span>✦</span></h1><p className="subheading">Theo dõi sự cố lan truyền qua graph chuỗi sản xuất.</p></div>
          <div className="top-actions"><LiveStatus /></div>
        </header>

        {(backendDown || dbDown) && (
          <div className="error-banner top-banner" role="alert"><WifiOff size={16} />
            <span>{backendDown ? health.error.message : 'Backend đang chạy nhưng Neo4j chưa sẵn sàng (/health = degraded). Topology và mô phỏng sẽ lỗi cho tới khi Neo4j kết nối lại.'}</span>
            <button type="button" className="ghost-button" onClick={() => { loadHealth(); loadTopology(); }}><RefreshCw size={13} /> Thử lại</button>
          </div>
        )}

        <WorkFlow nodes={nodes} nodeId={selectedNodeId} incidentType={incidentType} severity={severity} role={demoRole} onRoleChange={setDemoRole} orders={orders} onOrdersChange={setOrders} />
        {demoRole !== 'technician' && <>
        <section className="kpi-grid">
          <div className="kpi-card blue"><div className="kpi-icon"><Boxes size={19} /></div><span>NODE TRONG GRAPH</span><strong>{stats ? graph!.nodes.length : '—'}</strong><small>{stats ? `${stats.byLabel.ProcessStep ?? 0} công đoạn · ${stats.byLabel.Equipment ?? 0} thiết bị · ${stats.byLabel.Batch ?? 0} lô` : 'Chưa tải topology'}</small></div>
          <div className="kpi-card"><div className="kpi-icon violet"><GitBranch size={19} /></div><span>QUAN HỆ</span><strong>{stats ? graph!.edges.length : '—'}</strong><small>{stats ? <><b>{stats.propagationEdges}</b> đường lan truyền</> : 'Chưa tải topology'}</small></div>
          <div className="kpi-card"><div className="kpi-icon amber"><AlertTriangle size={19} /></div><span>NODE BỊ ẢNH HƯỞNG</span><strong>{shown ? shown.impacted_nodes.length : '—'}</strong><small>{shown ? (shown.impacted_nodes.length ? <>tối đa <b className="warning">{maxHop}</b> bước từ {shown.origin_id}</> : `không lan xuống sau ${shown.origin_id}`) : 'Chưa có sự cố hoặc mô phỏng'}</small></div>
          <div className="kpi-card"><div className="kpi-icon green"><Target size={19} /></div><span>ĐIỂM ẢNH HƯỞNG CAO NHẤT</span><strong>{shown && shown.impacted_nodes.length ? peak!.toFixed(3) : '—'}</strong><small>{shown ? <>mức <b>{latest.severity.toFixed(1)}</b> · {shown.incident_type}</> : 'Chưa có sự cố hoặc mô phỏng'}</small></div>
        </section>

        <section className="content-grid">
          <div className="panel graph-panel" id="topology">
            <div className="panel-heading">
              <div><div className="heading-row"><h2>Topology lan truyền</h2><span className="tag blue-tag">NEO4J</span></div><p>Click một node để chọn làm điểm phát sinh sự cố.</p></div>
              <div className="graph-legend"><span><i className="legend-dot process" />Công đoạn</span><span><i className="legend-dot equipment" />Thiết bị</span><span><i className="legend-dot batch" />Lô</span><span><i className="legend-dot department" />Bộ phận</span><span><i className="legend-dot incident" />Sự kiện</span><span><i className="legend-dot impacted" />Bị ảnh hưởng</span><span><i className="legend-dot fault" />Lỗi</span><span><i className="legend-dot part" />Linh kiện</span><span><i className="legend-dot document" />Tài liệu</span></div>
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
              <span>Đang chọn <b>{selectedNodeId || '—'}</b></span>
              {shown && <span>Đang hiển thị <b>{shown.origin_id}</b> · {shown.incident_type}</span>}
            </div>
          </div>

          <div className="panel activity-panel">
            <div className="panel-heading"><div><h2>Nhật ký sự cố & mô phỏng</h2><p>Trong phiên trình duyệt này</p></div></div>
            <div className="activity-list">
              {runs.length === 0 && <div className="state-box compact"><p>Chưa có sự cố hay lần mô phỏng nào.</p></div>}
              {runs.map(r => (
                <div className="activity-item" key={r.id}>
                  <div className={`event-icon ${r.error ? 'red' : 'green'}`}>{r.error ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}</div>
                  <div><strong>{r.type} · {r.nodeId}</strong><p>{r.error ? r.error.message : `${r.result!.impacted_nodes.length} node bị ảnh hưởng · mức ${r.severity.toFixed(1)}`}</p></div>
                  <time>{formatTime(r.at)}</time>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="simulation-section" id="simulate">
          <div className="section-title"><div><p className="eyebrow">PHÂN TÍCH WHAT-IF</p><h2>Mô phỏng sự cố</h2><p>Chỉ tính phạm vi ảnh hưởng, không tạo sự cố hay work order. Node, loại và mức độ chọn ở đây cũng được dùng cho nút “Gây lỗi ngay”.</p></div><div className={`engine-state ${disabledReason ? 'idle' : ''}`}><span className="status-dot" /> {disabledReason ? 'Engine đang chờ' : 'Engine sẵn sàng'}</div></div>
          <IncidentTrigger nodes={nodes} nodeId={selectedNodeId} incidentType={incidentType} severity={severity} onNodeChange={setSelectedNodeId} onIncidentTypeChange={setIncidentType} onSeverityChange={value => setSeverity(Math.round(value * 10) / 10)} onRunSimulation={handleSimulate} loading={simLoading} disabledReason={disabledReason} />
          {latest?.error && (
            <div className="error-banner" role="alert"><AlertTriangle size={16} />
              <span><b>Mô phỏng thất bại{latest.error.status ? ` (HTTP ${latest.error.status}${latest.error.code ? ` · ${latest.error.code}` : ''})` : ''}:</b> {latest.error.message}{lastSuccess ? ' Kết quả thành công gần nhất vẫn hiển thị trong log.' : ''}</span>
            </div>
          )}
        </section>

        {shown && (
          <section className="results-section">
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
        {demoRole === 'expert' && <ExpertInspector nodeId={selectedNodeId} orders={orders} />}
        </>}
      </main>
    </div>
  );
};

export default App;
