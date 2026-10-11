import { useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, LoaderCircle, PauseCircle, RefreshCw } from 'lucide-react';
import { Actor, listMachines, MachineState, MachineSummary, toApiError } from '../services/api';
import { formatClock, formatValue, MACHINE_STATE_LABELS } from './labels';
import { Sparkline } from './SignalChart';

export const POLL_MS = 2000;

export const STATE_ICONS: Record<MachineState, typeof CheckCircle2> = { normal: CheckCircle2, warning: AlertTriangle, critical: AlertOctagon, stopped: PauseCircle };

export function MachineStatePill({ state }: { state: MachineState }) {
  const Icon = STATE_ICONS[state];
  return <span className={`machine-pill ${state}`}><Icon size={13} />{MACHINE_STATE_LABELS[state]}</span>;
}

export function MachineList({ actor, onOpen }: { actor: Actor; onOpen: (id: string) => void }) {
  const [machines, setMachines] = useState<MachineSummary[]>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => listMachines(actor)
      .then(data => { if (active) { setMachines(data); setError(''); } })
      .catch(err => { if (active) setError(toApiError(err).message); });
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [actor, reload]);

  if (!machines) return error
    ? <div className="error-banner top-banner" role="alert"><span>{error}</span><button type="button" className="ghost-button" onClick={() => setReload(n => n + 1)}><RefreshCw size={13} /> Thử lại</button></div>
    : <div className="state-box compact"><LoaderCircle size={18} className="spin" /><p>Đang tải danh sách máy…</p></div>;

  return <>
    {error && <div className="error-banner top-banner" role="alert"><span>Mất kết nối, đang hiển thị dữ liệu cũ: {error}</span></div>}
    <div className="machine-grid">
      {machines.map(m => {
        const main = m.signals.find(s => s.key === m.spark.signal);
        return <button type="button" key={m.id} className={`machine-card ${m.state}`} onClick={() => onOpen(m.id)}>
          <div className="machine-card-head">
            <div><strong>{m.name}</strong><small>{m.id} · {m.step}</small></div>
            <MachineStatePill state={m.state} />
          </div>
          <dl className="machine-values">
            {m.signals.map(s => <div key={s.key} className={s.level}><dt>{s.label}</dt><dd>{formatValue(s.value, s.decimals, s.unit)}</dd></div>)}
          </dl>
          <div className="machine-spark"><Sparkline values={m.spark.values} /><small>{main?.label} · 15 phút</small></div>
          <p className="machine-foot">
            {m.open_events > 0 ? <b>{m.open_events} bất thường đang diễn ra</b>
              : m.last_event ? `Bất thường gần nhất ${formatClock(m.last_event.started_at)}` : 'Chưa ghi nhận bất thường'}
          </p>
        </button>;
      })}
    </div>
  </>;
}
