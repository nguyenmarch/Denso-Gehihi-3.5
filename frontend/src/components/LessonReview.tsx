import { useCallback, useEffect, useState } from 'react';
import { Actor, command, Incident, Lesson, LessonStatus, listLessons, toApiError } from '../services/api';
import { TYPE_LABELS } from './IncidentTrigger';
import { actorName, formatAt } from './labels';

const STATUS_LABELS: Record<LessonStatus, string> = { pending: 'Chờ duyệt', accepted: 'Đã chấp nhận', rejected: 'Đã từ chối' };

function PendingLesson({ lesson, actor, actors, source, onChange }: { lesson: Lesson; actor: Actor; actors: Actor[]; source?: Incident; onChange: (lesson: Lesson) => void }) {
  const [text, setText] = useState(lesson.text);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (path: string, body: object, method: 'post' | 'patch' = 'post') => {
    setBusy(true); setError('');
    try { onChange(await command<Lesson>(path, body, actor, method)); }
    catch (err) { setError(toApiError(err).message); }
    finally { setBusy(false); }
  };
  const report = source?.reports[lesson.source.report_index];
  return <article className="lesson-card">
    <p className="muted">{lesson.context.asset_id} · {TYPE_LABELS[lesson.context.incident_type]} · đề xuất bởi {actorName(actors, lesson.source.author_id)} lúc {formatAt(lesson.created_at)}</p>
    <details><summary>Nguồn: sự cố {lesson.source.incident_id.slice(0, 8)}, báo cáo #{lesson.source.report_index + 1}</summary>
      {report ? <><p>{report.outcome === 'fixed' ? 'Đã khắc phục' : 'Chưa khắc phục'}: {report.summary}</p>
        {report.checks.length > 0 && <ul>{report.checks.map((c, i) => <li key={i}>{c.text}: {c.result}</li>)}</ul>}</> : <p>Không tải được báo cáo nguồn.</p>}
    </details>
    {lesson.text !== lesson.original_text && <p className="muted">Bản gốc: {lesson.original_text}</p>}
    <label>Nội dung bài học<textarea value={text} maxLength={1000} onChange={e => setText(e.target.value)} disabled={busy} /></label>
    <div className="lesson-actions">
      <button className="ghost-button" disabled={busy || !text.trim() || text.trim() === lesson.text} onClick={() => run(`/lessons/${lesson.id}`, { text: text.trim() }, 'patch')}>Lưu chỉnh sửa</button>
      <button className="ghost-button" disabled={busy || text.trim() !== lesson.text} onClick={() => run(`/lessons/${lesson.id}/accept`, {})}>Chấp nhận</button>
      <input aria-label="Lý do từ chối" placeholder="Lý do từ chối" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} disabled={busy} />
      <button className="ghost-button" disabled={busy || !reason.trim()} onClick={() => run(`/lessons/${lesson.id}/reject`, { reason: reason.trim() })}>Từ chối</button>
    </div>
    {text.trim() !== lesson.text && <small className="muted">Lưu chỉnh sửa trước khi chấp nhận.</small>}
    {error && <p className="error-banner" role="alert">{error}</p>}
  </article>;
}

export function LessonReview({ actor, actors, incidents }: { actor: Actor; actors: Actor[]; incidents: Incident[] }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => listLessons(actor).then(data => { setLessons(data); setError(''); }).catch(err => setError(toApiError(err).message)), [actor]);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  const update = (lesson: Lesson) => setLessons(prev => prev.map(l => l.id === lesson.id ? lesson : l));
  const pending = lessons.filter(l => l.status === 'pending');
  const reviewed = lessons.filter(l => l.status !== 'pending');
  return <section className="panel lesson-review" aria-label="Duyệt bài học">
    <div className="panel-heading"><div><h2>Duyệt bài học</h2><p>Chỉ bài học đã chấp nhận mới xuất hiện trong hướng dẫn của sự cố cùng thiết bị và loại lỗi.</p></div></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {pending.length === 0 && <p>Không có bài học chờ duyệt.</p>}
    {pending.map(l => <PendingLesson key={l.id} lesson={l} actor={actor} actors={actors} source={incidents.find(i => i.id === l.source.incident_id)} onChange={update} />)}
    {reviewed.length > 0 && <><h3>Đã xem xét</h3>{reviewed.map(l => <article key={l.id} className={`lesson-card ${l.status}`}>
      <strong>{STATUS_LABELS[l.status]}</strong> · {l.text}
      <p className="muted">{l.context.asset_id} · {TYPE_LABELS[l.context.incident_type]} · {actorName(actors, l.review?.by)} lúc {formatAt(l.review?.at)}{l.review?.reason ? ` · lý do: ${l.review.reason}` : ''}</p>
    </article>)}</>}
  </section>;
}
