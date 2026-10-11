import { useEffect, useState } from 'react';
import {
  Actor, Answer, askAssistant, command, explainGuidance, Explanation, getGuidance, getImpact, GuidanceView, Impact, Incident, Lesson, toApiError,
} from '../services/api';
import { ApiErrorInfo } from '../types';
import { TYPE_LABELS } from './IncidentTrigger';
import { ACTION_LABELS, actorName, CATEGORY_LABELS, formatAt, STATE_LABELS } from './labels';

type Change = (incident: Incident) => void;

function ImpactPanel({ incident, actor }: { incident: Incident; actor: Actor }) {
  const [impact, setImpact] = useState<Impact>();
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setImpact(undefined); setError('');
    getImpact(incident.id, actor).then(data => { if (current) setImpact(data); }).catch(err => { if (current) setError(toApiError(err).message); });
    return () => { current = false; };
  }, [incident.id, actor]);
  return <div className="detail-block"><h3>Tác động tới lô / sản phẩm</h3>
    {!impact && !error && <p role="status">Đang tính tác động…</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    {impact?.status === 'not_applicable' && <p className="fallback">{impact.message}</p>}
    {impact?.status === 'evaluated' && <>
      <p className="muted">Cửa sổ nghi ngờ từ {impact.window?.start ? `${formatAt(impact.window.start)} (${impact.window.start_basis})` : impact.window?.start_basis} · {impact.window?.end_basis}. Quy tắc {impact.rule}.</p>
      {impact.items.length === 0 && <p>Không có lô nào trong phạm vi xét.</p>}
      <div className="impact-items">{impact.items.map(item => <article key={item.object_id} className={`impact-item ${item.category}`}>
        <div><strong>{item.name} <small>{item.object_id}{item.product_code ? ` · ${item.product_code}` : ''}</small></strong><span className={`category-pill ${item.category}`}>{CATEGORY_LABELS[item.category]}</span></div>
        <ul>{item.reasons.map((r, i) => <li key={i}>{r.text}{r.refs.length > 0 && <small> · {r.refs.join(', ')}</small>}</li>)}</ul>
        {item.verification && <p className="muted">Cần xác minh; sửa máy không tự giải phóng lô.{item.next_check ? ` ${item.next_check}.` : ''}</p>}
        {item.scope_note && <p className="muted">{item.scope_note}.</p>}
      </article>)}</div>
    </>}
    {impact?.upstream_candidates && impact.upstream_candidates.nodes.length > 0 && <p className="muted">Ứng viên điều tra phía trước (chưa phải nguyên nhân đã xác nhận): {impact.upstream_candidates.nodes.map(n => n.name).join(', ')}.</p>}
  </div>;
}

function DispatchForm({ incident, actor, actors, onChange }: { incident: Incident; actor: Actor; actors: Actor[]; onChange: Change }) {
  const technicians = actors.filter(a => a.role === 'technician');
  const [assignee, setAssignee] = useState(incident.assignee?.id ?? technicians[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorInfo>();
  const submit = async () => {
    setBusy(true); setError(undefined);
    try { onChange(await command<Incident>(`/incidents/${incident.id}/dispatch`, { assignee_id: assignee, decision_note: note.trim() }, actor)); setNote(''); }
    catch (err) { setError(toApiError(err)); }
    finally { setBusy(false); }
  };
  return <div className="detail-block form-block"><h3>{incident.state === 'unresolved' ? 'Giao lại việc' : 'Quyết định và giao việc'}</h3>
    <label>Người nhận<select value={assignee} onChange={e => setAssignee(e.target.value)} disabled={busy}>{technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    {error?.fields?.assignee_id && <small className="field-error">{error.fields.assignee_id}</small>}
    <label>Quyết định / ghi chú<textarea value={note} maxLength={1000} onChange={e => setNote(e.target.value)} disabled={busy} placeholder="Ví dụ: giữ lô bị ảnh hưởng và chưa rõ, giao sửa lò" /></label>
    {error && <p className="error-banner" role="alert">{error.message}</p>}
    <button type="button" className="run-button" disabled={busy || !assignee || !note.trim()} onClick={submit}>{busy ? 'Đang gửi…' : 'Giao việc'}</button>
  </div>;
}

// Deduplicate the natural explain request even under React StrictMode remounts.
const explainRequests = new Map<string, Promise<Explanation>>();
function GuidancePanel({ incident, actor }: { incident: Incident; actor: Actor }) {
  const [view, setView] = useState<GuidanceView>();
  const [explanation, setExplanation] = useState<Explanation>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const narrate = actor.role !== 'operator' && incident.state !== 'alert';
  useEffect(() => {
    let current = true;
    setView(undefined); setExplanation(undefined); setError('');
    getGuidance(incident.id, actor).then(data => { if (current) setView(data); }).catch(err => { if (current) setError(toApiError(err).message); });
    if (narrate) {
      const key = `${incident.id}:${actor.id}:${retry}`;
      let promise = explainRequests.get(key);
      if (!promise) {
        promise = explainGuidance(incident.id, actor); explainRequests.set(key, promise);
        promise.then(() => explainRequests.delete(key), () => explainRequests.delete(key));
      }
      promise.then(data => { if (current) setExplanation(data); }).catch(err => { if (current) setError(toApiError(err).message); });
    }
    return () => { current = false; };
  }, [incident.id, actor, narrate, retry]);
  return <div className="detail-block guidance-panel"><h3>Hướng dẫn</h3>
    {error && <div className="error-banner" role="alert">{error}<button className="ghost-button" onClick={() => setRetry(n => n + 1)}>Tải lại hướng dẫn</button></div>}
    {!view && !error && <p role="status">Đang tải hướng dẫn…</p>}
    {view?.gap && <div className="fallback" role="status"><strong>Chưa có hướng dẫn cho ngữ cảnh này</strong><p>{view.gap.message} Cần chuyên gia bổ sung; không dùng hướng dẫn của máy khác.</p></div>}
    {view?.match && <p className="muted">Nguồn: {view.match.source}</p>}
    {narrate && view && !view.gap && !explanation && !error && <p role="status">Đang diễn đạt bằng Gemini…</p>}
    {explanation?.mode === 'llm' && explanation.narrative && <div className="narrative"><span className="tag blue-tag">Diễn đạt bởi Gemini</span><p>{explanation.narrative.summary}</p><ol>{explanation.steps.map(step => <li key={step.id}>{explanation.narrative!.steps[step.id]?.text}</li>)}</ol><small>{explanation.model} · đã kiểm tra trích dẫn với các bước và evidence</small></div>}
    {explanation?.mode === 'knowledge' && view && !view.gap && <div className="fallback" role="status"><strong>Đang dùng hướng dẫn xác định từ knowledge base</strong><p>{explanation.failure_reason}</p></div>}
    {view && view.steps.length > 0 && <><h4>Các bước xác định từ playbook</h4><ol>{view.steps.map(step => <li key={step.id}>{step.text}</li>)}</ol></>}
    {view && view.lessons.length > 0 && <><h4>Bài học đã xác nhận</h4><ul>{view.lessons.map(l => <li key={l.id}>{l.text} <small>· từ sự cố {l.source_incident_id.slice(0, 8)}, xác nhận {formatAt(l.accepted_at)}</small></li>)}</ul></>}
    {explanation && explanation.evidence.length > 0 && <><h4>Evidence</h4>{explanation.evidence.map((e, i) => <p key={i} className="muted">{e.label} ({e.source})</p>)}</>}
    {view?.containment && <div className="containment"><strong>Containment proposal · Cần người phụ trách xem xét</strong><p>{view.containment.text}</p></div>}
    <p className="safety-copy">Gemini diễn đạt lại hướng dẫn. Containment là đề xuất. Quyết định cuối cùng thuộc người phụ trách.</p>
  </div>;
}

function AssistantPanel({ incident, actor }: { incident: Incident; actor: Actor }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ask = async () => {
    setBusy(true); setError(''); setAnswer(undefined);
    try { setAnswer(await askAssistant(incident.id, question.trim(), actor)); }
    catch (err) { setError(toApiError(err).message); }
    finally { setBusy(false); }
  };
  return <div className="detail-block form-block"><h3>Hỏi trợ lý về sự cố này</h3>
    <label>Câu hỏi<textarea value={question} maxLength={500} onChange={e => setQuestion(e.target.value)} disabled={busy} placeholder="Ví dụ: Nên kiểm tra gì trước?" /></label>
    <small className="muted">Chỉ nhập dữ liệu synthetic. Câu hỏi được gửi tới Gemini cùng hướng dẫn của sự cố.</small>
    <button type="button" className="run-button" disabled={busy || !question.trim()} onClick={ask}>{busy ? 'Đang hỏi…' : 'Hỏi'}</button>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {answer?.mode === 'llm' && <div className="narrative assistant-answer"><span className="tag blue-tag">Trả lời bởi Gemini</span><p>{answer.answer}</p><small>Nguồn: {answer.citations.map(c => c.label).join(', ')}</small></div>}
    {answer?.mode === 'knowledge' && <div className="fallback" role="status"><strong>Không có câu trả lời từ Gemini</strong><p>{answer.failure_reason} Hãy dùng các bước hướng dẫn ở trên.</p></div>}
  </div>;
}

const lines = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean);

function ReportForm({ incident, actor, onChange }: { incident: Incident; actor: Actor; onChange: Change }) {
  const [checks, setChecks] = useState([{ text: '', result: '' }]);
  const [actions, setActions] = useState('');
  const [outcome, setOutcome] = useState<'fixed' | 'not_fixed'>('fixed');
  const [summary, setSummary] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [openItems, setOpenItems] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorInfo>();
  const submit = async () => {
    setBusy(true); setError(undefined);
    const body = { checks: checks.filter(c => c.text.trim() && c.result.trim()).map(c => ({ text: c.text.trim(), result: c.result.trim() })),
      actions: lines(actions), outcome, summary: summary.trim(), next_step: outcome === 'not_fixed' ? nextStep.trim() : '', open_items: lines(openItems) };
    // The form keeps its content on error so it can be corrected.
    try { onChange(await command<Incident>(`/incidents/${incident.id}/report`, body, actor)); }
    catch (err) { setError(toApiError(err)); }
    finally { setBusy(false); }
  };
  const setCheck = (i: number, field: 'text' | 'result', value: string) => setChecks(prev => prev.map((c, j) => j === i ? { ...c, [field]: value } : c));
  return <div className="detail-block form-block report-form"><h3>Báo cáo kết quả</h3>
    <h4>Kiểm tra đã làm</h4>
    {checks.map((c, i) => <div className="check-row" key={i}>
      <input aria-label={`Kiểm tra ${i + 1}`} placeholder="Kiểm tra" value={c.text} maxLength={300} onChange={e => setCheck(i, 'text', e.target.value)} disabled={busy} />
      <input aria-label={`Kết quả kiểm tra ${i + 1}`} placeholder="Kết quả" value={c.result} maxLength={300} onChange={e => setCheck(i, 'result', e.target.value)} disabled={busy} />
      {checks.length > 1 && <button className="ghost-button" onClick={() => setChecks(prev => prev.filter((_, j) => j !== i))} disabled={busy}>Xoá</button>}
    </div>)}
    <button className="ghost-button" onClick={() => setChecks(prev => [...prev, { text: '', result: '' }])} disabled={busy || checks.length >= 20}>Thêm kiểm tra</button>
    <label>Thao tác đã làm (mỗi dòng một thao tác)<textarea value={actions} onChange={e => setActions(e.target.value)} disabled={busy} /></label>
    <fieldset disabled={busy}><legend>Kết quả</legend>
      <label className="inline"><input type="radio" name="outcome" checked={outcome === 'fixed'} onChange={() => setOutcome('fixed')} /> Đã khắc phục</label>
      <label className="inline"><input type="radio" name="outcome" checked={outcome === 'not_fixed'} onChange={() => setOutcome('not_fixed')} /> Chưa khắc phục</label>
    </fieldset>
    <label>Tóm tắt<textarea value={summary} maxLength={2000} onChange={e => setSummary(e.target.value)} disabled={busy} /></label>
    {error?.fields?.summary && <small className="field-error">{error.fields.summary}</small>}
    {outcome === 'not_fixed' && <label>Bước tiếp theo (bắt buộc)<textarea value={nextStep} maxLength={1000} onChange={e => setNextStep(e.target.value)} disabled={busy} /></label>}
    {error?.fields?.next_step && <small className="field-error">{error.fields.next_step}</small>}
    <label>Việc còn mở (mỗi dòng một việc)<textarea value={openItems} onChange={e => setOpenItems(e.target.value)} disabled={busy} /></label>
    {error && <p className="error-banner" role="alert">{error.message}</p>}
    <button type="button" className="run-button" disabled={busy || !summary.trim() || (outcome === 'not_fixed' && !nextStep.trim())} onClick={submit}>{busy ? 'Đang gửi…' : 'Gửi báo cáo'}</button>
  </div>;
}

function LessonForm({ incident, actor }: { incident: Incident; actor: Actor }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<Lesson>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try { setSaved(await command<Lesson>(`/incidents/${incident.id}/lessons`, { text: text.trim() }, actor)); setText(''); }
    catch (err) { setError(toApiError(err).message); }
    finally { setBusy(false); }
  };
  return <div className="detail-block form-block"><h3>Đề xuất bài học</h3>
    <label>Bài học rút ra từ báo cáo<textarea value={text} maxLength={1000} onChange={e => setText(e.target.value)} disabled={busy} /></label>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {saved && <p role="status" className="muted">Đã gửi bài học: “{saved.text}” — đang chờ chuyên gia duyệt, chưa phải hướng dẫn đã xác nhận.</p>}
    <button type="button" className="run-button" disabled={busy || !text.trim()} onClick={submit}>{busy ? 'Đang gửi…' : 'Gửi đề xuất'}</button>
  </div>;
}

type Tab = 'impact' | 'guidance' | 'action' | 'records';

// Keyed by incident and actor in App, so panels below reset per record without keys of their own.
export function IncidentDetail({ incident, actor, actors, onChange }: { incident: Incident; actor: Actor; actors: Actor[]; onChange: Change }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const technician = actor.role === 'technician';
  const start = async () => {
    setBusy(true); setError('');
    try { onChange(await command<Incident>(`/incidents/${incident.id}/start`, {}, actor)); }
    catch (err) { setError(toApiError(err).message); }
    finally { setBusy(false); }
  };

  const canDispatch = actor.role === 'operator' && (incident.state === 'alert' || incident.state === 'unresolved');
  const canStart = technician && incident.state === 'dispatched';
  const canReport = technician && incident.state === 'in_progress';
  const canPropose = technician && incident.reports.length > 0;
  const pending = canDispatch || canStart || canReport;
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'action', label: 'Thao tác', show: pending || canPropose },
    { id: 'impact', label: 'Tác động', show: true },
    { id: 'guidance', label: 'Hướng dẫn', show: incident.state !== 'alert' },
    { id: 'records', label: 'Hồ sơ', show: true },
  ];
  const visible = tabs.filter(t => t.show);
  // Open on the step that waits for this actor; fall back when that step disappears (e.g. after dispatching).
  const [tab, setTab] = useState<Tab>(pending ? 'action' : 'impact');
  const active = visible.some(t => t.id === tab) ? tab : 'impact';

  return <section className="panel incident-detail" aria-label="Chi tiết sự cố">
    <div className="panel-heading"><div><h2>{incident.asset.name} · {TYPE_LABELS[incident.incident_type]}</h2>
      <p>{incident.event ? `${incident.event.label} lúc ${formatAt(incident.event.at)}` : `Gây lỗi thủ công lúc ${formatAt(incident.alarm_at)}`} · mã {incident.id.slice(0, 8)}</p></div>
      <span className={`state-pill ${incident.state}`}>{STATE_LABELS[incident.state]}</span></div>
    <dl className="incident-facts">
      <div><dt>Tài sản</dt><dd>{incident.asset.id} ({incident.asset.type})</dd></div>
      <div><dt>Người tạo</dt><dd>{actorName(actors, incident.created_by)}</dd></div>
      <div><dt>Người xử lý</dt><dd>{incident.assignee ? actorName(actors, incident.assignee.id) : 'Chưa giao'}</dd></div>
      {incident.decision_note && <div className="wide"><dt>Quyết định</dt><dd>{incident.decision_note}</dd></div>}
      {incident.next_step && <div className="wide"><dt>Bước tiếp theo</dt><dd>{incident.next_step}</dd></div>}
    </dl>
    <div className="tabs" role="tablist">
      {visible.map(t => <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
        {t.label}{t.id === 'action' && pending && <i className="tab-dot" aria-label="cần thao tác" />}</button>)}
    </div>
    {/* Panels stay mounted while hidden so loaded guidance and half-filled forms survive tab switches. */}
    <div role="tabpanel" hidden={active !== 'action'}>
      {canDispatch && <DispatchForm incident={incident} actor={actor} actors={actors} onChange={onChange} />}
      {canStart && <div className="detail-block form-block"><h3>Nhận việc</h3><p className="muted">Nhận xử lý để bắt đầu làm theo hướng dẫn và gửi báo cáo kết quả.</p>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button type="button" className="run-button" disabled={busy} onClick={start}>{busy ? 'Đang gửi…' : 'Nhận xử lý'}</button></div>}
      {canReport && <ReportForm key={`report-${incident.reports.length}`} incident={incident} actor={actor} onChange={onChange} />}
      {canPropose && <LessonForm incident={incident} actor={actor} />}
    </div>
    <div role="tabpanel" hidden={active !== 'impact'}><ImpactPanel incident={incident} actor={actor} /></div>
    <div role="tabpanel" hidden={active !== 'guidance'}>
      {incident.state !== 'alert' && <GuidancePanel incident={incident} actor={actor} />}
      {technician && incident.state !== 'resolved' && <AssistantPanel incident={incident} actor={actor} />}
    </div>
    <div role="tabpanel" hidden={active !== 'records'}>
      <div className="detail-block"><h3>Báo cáo</h3>
        {incident.reports.length === 0 && <p className="muted">Chưa có báo cáo.</p>}
        {incident.reports.map(r => <article key={r.index} className={`report-record ${r.outcome}`}>
          <strong>{r.outcome === 'fixed' ? 'Đã khắc phục' : 'Chưa khắc phục'} · {actorName(actors, r.actor_id)} · {formatAt(r.at)}</strong>
          <p>{r.summary}</p>
          {r.checks.length > 0 && <ul>{r.checks.map((c, i) => <li key={i}>{c.text}: {c.result}</li>)}</ul>}
          {r.actions.length > 0 && <p className="muted">Thao tác: {r.actions.join('; ')}</p>}
          {r.next_step && <p className="muted">Bước tiếp theo: {r.next_step}</p>}
          {r.open_items.length > 0 && <p className="muted">Việc còn mở: {r.open_items.join('; ')}</p>}
        </article>)}
      </div>
      <div className="detail-block"><h3>Lịch sử</h3><ol className="timeline">{incident.history.map((h, i) => <li key={i}>
        <time>{formatAt(h.at)}</time><span><b>{ACTION_LABELS[h.action] ?? h.action}</b> → {STATE_LABELS[h.to]} · {actorName(actors, h.actor_id)}{h.note ? ` · ${h.note}` : ''}</span></li>)}</ol></div>
    </div>
  </section>;
}
