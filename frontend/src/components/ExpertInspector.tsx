import { useEffect, useState } from 'react';
import { fetchNodeDetails, Learning, listLearning, listWorkOrders, saveLearning, toApiError, WorkOrder } from '../services/api';

export function ExpertInspector({ nodeId }: { nodeId: string }) {
  const [tab, setTab] = useState<'detail' | 'history'>('detail');
  const [detail, setDetail] = useState<Record<string, unknown>>();
  const [learning, setLearning] = useState<Learning[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [incidentId, setIncidentId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true; setDetail(undefined); setError('');
    if (nodeId) fetchNodeDetails(nodeId).then(data => { if (current) setDetail(data); }).catch(err => { if (current) setError(toApiError(err).message); });
    Promise.all([listLearning(), listWorkOrders('expert')]).then(([history, incidents]) => { if (current) { setLearning(history); setOrders(incidents.filter(o => o.state === 'resolved')); } }).catch(err => { if (current) setError(toApiError(err).message); });
    return () => { current = false; };
  }, [nodeId]);
  const save = async () => {
    setBusy(true); setError('');
    try { const record = await saveLearning({ incident_id: incidentId, node_id: nodeId, note }); setLearning(prev => [record, ...prev]); setNote(''); setTab('history'); }
    catch (err) { setError(toApiError(err).message); }
    finally { setBusy(false); }
  };
  return <section className="panel expert-inspector"><div className="panel-heading"><h2>Expert · Knowledge inspector</h2><div><button className="ghost-button" onClick={() => setTab('detail')}>Chi tiết</button> <button className="ghost-button" onClick={() => setTab('history')}>Lịch sử learning</button></div></div>{error && <p className="error-banner" role="alert">{error}</p>}{tab === 'detail' ? <><h3>{nodeId || 'Chọn node trên graph'}</h3>{detail && <dl>{Object.entries((detail.properties ?? {}) as Record<string, unknown>).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>}{detail && <details><summary>Quan hệ của node</summary>{((detail.relations ?? []) as {type: string; direction: string; node: Record<string, unknown>}[]).map((relation, index) => <p key={index}>{relation.direction === 'out' ? '→' : '←'} {relation.type} · {String(relation.node.name ?? relation.node.id)}</p>)}</details>}<p>Field learning do expert ghi nhận; không tự thay đổi rule hay topology.</p><label>Sự cố đã resolve<select value={incidentId} onChange={e => setIncidentId(e.target.value)}><option value="">Chọn sự cố</option>{orders.map(o => <option key={o.id} value={o.id}>{o.incident_type} · {o.id.slice(0, 8)}</option>)}</select></label><label>Ghi chú knowledge<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></label><button className="ghost-button" disabled={busy || !incidentId || !nodeId || !note.trim()} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu field learning'}</button></> : <div>{learning.filter(n => n.node_id === nodeId).map(n => <article key={n.id}><p>{n.note}</p><small>{new Date(n.at).toLocaleString('vi-VN')}</small></article>)}{!learning.some(n => n.node_id === nodeId) && <p>Chưa có field learning cho node này.</p>}</div>}</section>;
}
