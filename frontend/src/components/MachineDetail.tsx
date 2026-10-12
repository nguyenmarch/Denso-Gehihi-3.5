import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Inbox, LoaderCircle } from 'lucide-react';
import { Actor, getTelemetry, listMachineEvents, MachineAnomaly, MachineTelemetry, toApiError } from '../services/api';
import { formatClock, formatDuration, formatValue } from './labels';
import { MachineStatePill, POLL_MS, STATE_ICONS } from './MachineList';
import { SignalChart } from './SignalChart';

const RANGES = [[15, '15 phút'], [60, '1 giờ'], [120, '2 giờ']] as const;

interface MachineDetailProps { actor: Actor; machineId: string; onBack: () => void; onOpenIncident: (id: string) => void; }

const eventTitle = (e: MachineAnomaly) => e.kind === 'stop' ? 'Dừng máy' : `${e.label} vượt ngưỡng ${e.level === 'critical' ? 'nguy hiểm' : 'cảnh báo'}`;

export function MachineDetail({ actor, machineId, onBack, onOpenIncident }: MachineDetailProps) {
  const [minutes, setMinutes] = useState<number>(15);
  const [data, setData] = useState<MachineTelemetry>();
  const [events, setEvents] = useState<MachineAnomaly[]>();
  const [error, setError] = useState('');
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    let active = true;
    const load = () => Promise.all([getTelemetry(machineId, minutes, actor), listMachineEvents(machineId, actor)])
      .then(([telemetry, anomalies]) => { if (active) { setData(telemetry); setEvents(anomalies); setError(''); } })
      .catch(err => { if (active) setError(toApiError(err).message); });
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [actor, machineId, minutes]);

  const end = data ? Date.parse(data.now) : Date.now();
  const start = end - minutes * 60000;
  const selected = events?.find(e => e.id === selectedId);
  const highlight = selected ? { start: Date.parse(selected.started_at), end: selected.ended_at ? Date.parse(selected.ended_at) : end } : null;

  // Selecting an anomaly older than the window widens the window so its band is on the chart.
  const select = (event: MachineAnomaly) => {
    if (event.id === selectedId) { setSelectedId(''); return; }
    setSelectedId(event.id);
    const age = (end - Date.parse(event.started_at)) / 60000;
    const fit = RANGES.find(([m]) => m >= age + 1)?.[0] ?? 120;
    if (fit > minutes) setMinutes(fit);
  };

  return <>
    <div className="machine-toolbar">
      <button type="button" className="ghost-button" onClick={onBack}><ArrowLeft size={14} /> Danh sách máy</button>
      {data && <div className="machine-title"><h2>{data.machine.name}</h2><small>{data.machine.id} · {data.machine.step}</small><MachineStatePill state={data.machine.state} /></div>}
    </div>
    {error && <div className="error-banner top-banner" role="alert"><span>{data ? `Mất kết nối, đang hiển thị dữ liệu cũ: ${error}` : error}</span></div>}

    <div className="machine-layout">
      <section className="panel machine-signals">
        <div className="panel-heading">
          <div><h2>Tín hiệu hoạt động</h2><p>Mẫu mỗi {data?.step_seconds ?? 2} giây. Vùng xám là lúc máy dừng; vùng hồng là bất thường đang chọn.</p></div>
          <div className="range-tabs" role="group" aria-label="Khoảng thời gian">
            {RANGES.map(([m, text]) => <button key={m} type="button" className={m === minutes ? 'active' : ''} aria-pressed={m === minutes} onClick={() => setMinutes(m)}>{text}</button>)}
          </div>
        </div>
        {!data && !error && <div className="state-box"><LoaderCircle size={20} className="spin" /><p>Đang tải tín hiệu…</p></div>}
        {data && data.signals.map(s => {
          const series = data.series[s.key];
          const latest = series[series.length - 1];
          return <div className="signal-block" key={s.key}>
            <div className="signal-head"><strong>{s.label}</strong><span>{latest === null && !data.running[data.running.length - 1] ? 'Máy dừng' : formatValue(latest, s.decimals, s.unit)}</span></div>
            <SignalChart signal={s} t={data.t} values={series} running={data.running} start={start} end={end}
              hoverT={hoverT} onHover={setHoverT} highlight={highlight} />
          </div>;
        })}
      </section>

      <section className="panel anomaly-panel">
        <div className="panel-heading"><div><h2>Nhật ký bất thường</h2><p>Phát hiện từ dữ liệu máy. Chọn một dòng để xem trên biểu đồ.</p></div></div>
        <div className="anomaly-list">
          {events && events.length === 0 && <div className="state-box compact"><Inbox size={18} /><p>Chưa ghi nhận bất thường nào trên máy này.</p></div>}
          {events?.map(e => {
            const Icon = STATE_ICONS[e.kind === 'stop' ? 'stopped' : e.level];
            const ongoing = e.ended_at === null;
            const duration = (ongoing ? end : Date.parse(e.ended_at!)) - Date.parse(e.started_at);
            return <div key={e.id} className={`anomaly-item ${e.kind === 'stop' ? 'stopped' : e.level} ${e.id === selectedId ? 'selected' : ''}`}>
              <button type="button" className="anomaly-main" aria-pressed={e.id === selectedId} onClick={() => select(e)}>
                <Icon size={16} />
                <span>
                  <strong>{eventTitle(e)}</strong>
                  <small>{formatClock(e.started_at)} → {ongoing ? 'đang diễn ra' : formatClock(e.ended_at!)} · {formatDuration(duration)}</small>
                  {e.kind === 'threshold' && <small>Đỉnh {formatValue(e.peak, 1, e.unit)} · ngưỡng {e.threshold}</small>}
                </span>
                {ongoing && <em>ĐANG MỞ</em>}
              </button>
              {e.incident_ids.length > 0 && <div className="anomaly-links">
                {e.incident_ids.map((id, i) => <button key={id} type="button" className="link-button" onClick={() => onOpenIncident(id)}>
                  <ExternalLink size={12} /> Sự cố liên quan{e.incident_ids.length > 1 ? ` ${i + 1}` : ''}</button>)}
              </div>}
            </div>;
          })}
        </div>
      </section>
    </div>
  </>;
}
