import { useEffect, useState } from 'react';

// The incident list is the only data that refreshes on its own (IncidentBoard polls every 5 s),
// so freshness is the time of the last successful poll, not a server heartbeat.
const STALE_MS = 15000;

export function SyncStatus({ lastSync }: { lastSync?: number }) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  const stale = lastSync !== undefined && clock - lastSync > STALE_MS;
  const tone = lastSync === undefined ? 'idle' : stale ? 'bad' : 'good';
  const label = lastSync === undefined ? 'Đang đồng bộ' : stale ? 'Mất đồng bộ' : 'Đã đồng bộ';
  return <div className="connection-state" aria-live="polite">
    <div className={`live-pill ${tone}`}><span className="live-dot" />{label}</div>
    <small>{lastSync ? `Danh sách sự cố cập nhật lúc ${new Date(lastSync).toLocaleTimeString('vi-VN')} · tự làm mới mỗi 5 giây` : 'Chưa tải được danh sách sự cố'}</small>
    {stale && <small role="alert">Không cập nhật được quá 15 giây; số liệu có thể đã cũ.</small>}
  </div>;
}
