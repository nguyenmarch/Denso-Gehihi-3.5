import { useEffect, useState } from 'react';
import { demoCommand, DemoRole, explainGuidance, Guidance, listWorkOrders, toApiError, WorkOrder } from '../services/api';
import { GraphNode, SimulationResult } from '../types';

// Deduplicate the natural work-order request even under React StrictMode remounts.
const guidanceRequests = new Map<string, Promise<Guidance>>();
function GuidancePanel({ order, role }: { order: WorkOrder; role: DemoRole }) {
  const [guidance, setGuidance] = useState<Guidance>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setGuidance(undefined); setError('');
    const key = `${order.id}:${role}:${retry}`;
    let promise = guidanceRequests.get(key);
    if (!promise) {
      promise = explainGuidance(order.id, role); guidanceRequests.set(key, promise);
      promise.then(() => guidanceRequests.delete(key), () => guidanceRequests.delete(key));
    }
    promise.then(data => { if (current) setGuidance(data); }).catch(err => { if (current) setError(toApiError(err).message); });
    return () => { current = false; };
  }, [order.id, role, retry]);
  return <div className="guidance-panel">
    {!guidance && !error && <p role="status">Đang tải hướng dẫn và diễn đạt Gemini…</p>}
    {error && <div className="error-banner" role="alert">{error}<button className="ghost-button" onClick={() => setRetry(n => n + 1)}>Tải lại hướng dẫn</button></div>}
    {guidance?.mode === 'llm' && guidance.narrative && <div className="narrative"><span className="tag blue-tag">Diễn đạt bởi Gemini</span><p>{guidance.narrative.summary}</p><ol>{order.steps.map(step => <li key={step.id}>{guidance.narrative!.steps[step.id]?.text}</li>)}</ol><small>{guidance.model} · Có đối chiếu bước và evidence</small></div>}
    {guidance?.mode === 'knowledge' && <div className="fallback" role="status"><strong>Đang dùng hướng dẫn xác định từ knowledge base</strong><p>{guidance.failure_reason}</p></div>}
    <h3>Các bước xác định từ playbook</h3><ol>{order.steps.map(step => <li key={step.id}>{step.text}</li>)}</ol>
    {guidance && <div><h3>Evidence</h3>{guidance.evidence.map((e, i) => <p key={i}>{e.label} <small>({e.source})</small></p>)}</div>}
    <div className="containment"><strong>Containment proposal · Cần người phụ trách xem xét</strong><p>{order.containment.text}</p></div>
    <p className="safety-copy">Gemini diễn đạt lại hướng dẫn. Containment là đề xuất. Quyết định cuối cùng thuộc người phụ trách.</p>
  </div>;
}

export function WorkFlow({ nodes, nodeId, onSimulation, onRoleChange }: { nodes: GraphNode[]; nodeId: string; onSimulation: (result: SimulationResult) => void; onRoleChange: (role: DemoRole) => void }) {
  const [role, setRole] = useState<DemoRole>('operator');
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [opened, setOpened] = useState('');
  const [report, setReport] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => listWorkOrders(role).then(data => { if (active) setOrders(data); }).catch(err => { if (active) setError(toApiError(err).message); });
    setOrders([]); setOpened(''); setError(''); load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [role, reload]);
  const command = async (path: string, body: object) => {
    setBusy(true); setError('');
    try {
      const order = await demoCommand(path, body, role);
      setOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
      if (order.simulation) onSimulation(order.simulation);
      if (order.state === 'resolved') setReport('');
    } catch (err) { setError(toApiError(err).message); }
    finally { setBusy(false); }
  };
  const selected = orders.find(o => o.id === opened);
  return <section className="panel workflow" id="work-orders"><div className="panel-heading"><div><h2>Incident Navigator · Demo local</h2><p>Fault synthetic → alert → dispatch → work order → resolve → expert learning</p></div><label>Vai trò demo <select aria-label="Vai trò demo" value={role} onChange={e => { const next = e.target.value as DemoRole; setOpened(''); setOrders([]); setReport(''); setError(''); setRole(next); onRoleChange(next); }} disabled={busy}><option value="operator">Operator</option><option value="admin">Admin</option><option value="technician">Technician</option><option value="expert">Expert</option></select></label></div>
    <p className="safety-copy">Dữ liệu synthetic. Chọn vai trò để trình diễn; đây không phải xác thực người dùng. Không có đường điều khiển tới máy.</p>
    {(role === 'admin' || role === 'operator') && <button className="ghost-button" disabled={busy || !nodes.length} onClick={() => command('/incidents/fault', { node_id: nodeId, incident_type: 'MACHINE_BREAKDOWN', severity: 1 })}>{busy ? 'Đang xử lý…' : 'Gây lỗi ngay (synthetic)'}</button>}
    {error && <div className="error-banner" role="alert">{error}<button className="ghost-button" onClick={() => setReload(n => n + 1)}>Tải lại danh sách</button></div>}
    <div className="order-list">{orders.length === 0 && <p>Chưa có sự cố. Operator/Admin tạo fault synthetic để bắt đầu.</p>}{orders.map(order => <div className={`order-card ${order.state === 'alert' ? 'alert' : ''}`} key={order.id}><div><strong>{order.state === 'alert' ? '🔴 Alert · ' : ''}{order.incident_type}</strong><p>{order.state} · {new Date(order.created_at).toLocaleTimeString('vi-VN')} · {order.assignee || 'Chưa dispatch'}</p></div>{order.state === 'alert' && (role === 'operator' || role === 'admin') && <button className="ghost-button" disabled={busy} onClick={() => command(`/incidents/${order.id}/dispatch`, {})}>Dispatch technician</button>}{order.state !== 'alert' && (role === 'technician' || role === 'expert' || role === 'admin') && <button className="ghost-button" disabled={busy} onClick={() => { setOpened(order.id); setReport(''); }}>Mở work order</button>}</div>)}</div>
    {selected && <div className="work-order"><h3>Work order · {selected.state}</h3><GuidancePanel key={`${selected.id}:${role}`} order={selected} role={role} />{selected.state === 'dispatched' && (role === 'technician' || role === 'admin') && <button className="ghost-button" disabled={busy} onClick={() => command(`/incidents/${selected.id}/start`, {})}>Bắt đầu xử lý</button>}{selected.state === 'in_progress' && (role === 'technician' || role === 'admin') && <div className="report-form"><label>Báo cáo kết quả<textarea value={report} onChange={e => setReport(e.target.value)} maxLength={2000} disabled={busy} /></label><button className="ghost-button" disabled={busy || !report.trim()} onClick={() => command(`/incidents/${selected.id}/resolve`, { report })}>{busy ? 'Đang gửi…' : 'Resolve incident'}</button></div>}{selected.report && <p>Báo cáo: {selected.report}</p>}<details><summary>Lịch sử work order</summary>{selected.history.map((h, i) => <p key={i}>{h.state} · {new Date(h.at).toLocaleString('vi-VN')}</p>)}</details></div>}
  </section>;
}
