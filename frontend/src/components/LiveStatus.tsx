import { useEffect, useState } from 'react';
import { API_BASE } from '../services/api';

const RECONNECT_MS = 5000;

export function LiveStatus() {
  const [state, setState] = useState<'connecting' | 'live' | 'retrying' | 'disconnected'>('connecting');
  const [last, setLast] = useState<number>();
  const [clock, setClock] = useState(Date.now());
  const staleMs = Number(import.meta.env.VITE_STALE_MS) || 10000;
  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: number | undefined;
    const connect = () => {
      window.clearTimeout(retryTimer);
      source?.close();
      const current = new EventSource(`${API_BASE}/events`);
      source = current;
      current.onopen = () => setState('connecting');
      current.addEventListener('plant_tick', () => { setLast(Date.now()); setState('live'); });
      current.onerror = () => {
        if (current.readyState !== EventSource.CLOSED) { setState('retrying'); return; }
        setState('disconnected');
        // The browser stops retrying after an HTTP error response (e.g. backend restarting behind a proxy).
        if (navigator.onLine) retryTimer = window.setTimeout(() => { setState('retrying'); connect(); }, RECONNECT_MS);
      };
    };
    connect();
    const tick = window.setInterval(() => setClock(Date.now()), 1000);
    const offline = () => { window.clearTimeout(retryTimer); source?.close(); setState('disconnected'); };
    const online = () => { setState('retrying'); connect(); };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => { window.clearTimeout(retryTimer); source?.close(); window.clearInterval(tick); window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  }, []);
  const stale = last !== undefined && clock - last > staleMs;
  const label = stale && state === 'live' ? 'Dữ liệu đã cũ' : ({ live: 'Live', connecting: 'Đang kết nối', retrying: 'Đang kết nối lại', disconnected: 'Mất kết nối' })[state];
  return <div className="connection-state" aria-live="polite"><div className={`live-pill ${state === 'live' && !stale ? 'good' : state === 'connecting' ? 'idle' : 'bad'}`}><span className="live-dot" />{label}</div><small>Heartbeat synthetic · {last ? `event cuối ${new Date(last).toLocaleTimeString('vi-VN')}` : 'chưa nhận event'}</small>{stale && <small role="alert">Không nhận plant_tick mới. Số liệu không còn live.</small>}</div>;
}
