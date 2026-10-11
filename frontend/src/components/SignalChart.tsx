import { useEffect, useMemo, useRef, useState } from 'react';
import type { SignalMeta } from '../services/api';
import { formatClock, formatValue } from './labels';

interface SignalChartProps {
  signal: SignalMeta;
  t: number[]; values: (number | null)[]; running: boolean[];
  start: number; end: number;
  // Shared across the machine's charts so one hover reads every signal at the same instant.
  hoverT: number | null; onHover: (t: number | null) => void;
  highlight: { start: number; end: number } | null;
}

const HEIGHT = 168, M = { top: 12, right: 98, bottom: 24, left: 46 };

const niceTicks = (lo: number, hi: number, count = 4) => {
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? raw;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
};

const timeTicks = (start: number, end: number) => {
  const span = (end - start) / 60000, every = (span <= 15 ? 3 : span <= 60 ? 10 : 20) * 60000;
  const ticks = [];
  for (let v = Math.ceil(start / every) * every; v <= end; v += every) ticks.push(v);
  return ticks;
};

const nearest = (t: number[], target: number) => {
  let lo = 0, hi = t.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (t[mid] < target) lo = mid + 1; else hi = mid; }
  return lo > 0 && target - t[lo - 1] < t[lo] - target ? lo - 1 : lo;
};

export function SignalChart({ signal, t, values, running, start, end, hoverT, onHover, highlight }: SignalChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotW = width - M.left - M.right, plotH = HEIGHT - M.top - M.bottom;
  const x = (v: number) => M.left + ((v - start) / (end - start)) * plotW;

  // The domain always includes the critical threshold, so the distance to it is visible even on a quiet signal.
  const { lo, hi, y } = useMemo(() => {
    const present = values.filter((v): v is number => v !== null);
    let lo = Math.min(...present, signal.warn), hi = Math.max(...present, signal.crit);
    if (!present.length) lo = signal.warn - (signal.crit - signal.warn) * 3;
    const pad = (hi - lo) * 0.12 || 1;
    lo -= pad; hi += pad;
    return { lo, hi, y: (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * plotH };
  }, [values, signal, plotH]);

  // About one point per 2 px; each bucket keeps its highest reading so a threshold crossing is never smoothed away.
  // Gaps (machine stopped) break the line instead of drawing a slope to zero.
  const path = useMemo(() => {
    const per = Math.max(1, Math.ceil(values.length / (plotW / 2)));
    let d = '', open = false;
    for (let i = 0; i < values.length; i += per) {
      const bucket = values.slice(i, i + per).filter((v): v is number => v !== null);
      const at = t[Math.min(i + per, t.length) - 1];
      if (!bucket.length || at < start) { open = false; continue; }
      d += `${open ? 'L' : 'M'}${x(at).toFixed(1)},${y(Math.max(...bucket)).toFixed(1)}`;
      open = true;
    }
    return d;
  }, [values, t, start, end, plotW, y]); // eslint-disable-line react-hooks/exhaustive-deps

  const stops = useMemo(() => {
    const spans: [number, number][] = [];
    running.forEach((r, i) => {
      if (r) return;
      const last = spans[spans.length - 1];
      if (last && last[1] === t[i - 1]) last[1] = t[i]; else spans.push([t[i], t[i]]);
    });
    return spans;
  }, [running, t]);

  const index = hoverT !== null && t.length && hoverT >= start && hoverT <= end ? nearest(t, hoverT) : -1;
  const hoverValue = index >= 0 ? values[index] : undefined;
  const clampX = (v: number) => Math.min(Math.max(x(v), M.left), M.left + plotW);

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    onHover(px < M.left || px > M.left + plotW ? null : start + ((px - M.left) / plotW) * (end - start));
  };

  const present = values.filter((v): v is number => v !== null);
  const summary = present.length
    ? `${signal.label}: thấp nhất ${Math.min(...present).toFixed(signal.decimals)}, cao nhất ${Math.max(...present).toFixed(signal.decimals)} ${signal.unit}; ngưỡng cảnh báo ${signal.warn}, nguy hiểm ${signal.crit}.`
    : `${signal.label}: không có dữ liệu trong khoảng này.`;

  return <div className="signal-chart" ref={box}>
    <svg width={width} height={HEIGHT} role="img" aria-label={summary} onPointerMove={move} onPointerLeave={() => onHover(null)}>
      {niceTicks(lo, hi).map(v => <g key={v}>
        <line className="chart-grid" x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} />
        <text className="chart-axis" x={M.left - 8} y={y(v) + 4} textAnchor="end">{v}</text>
      </g>)}
      {timeTicks(start, end).map(v => <text key={v} className="chart-axis" x={x(v)} y={HEIGHT - 6} textAnchor="middle">
        {new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</text>)}

      {stops.map(([a, b]) => <rect key={a} className="chart-stopped" x={clampX(a)} y={M.top} width={Math.max(2, clampX(b) - clampX(a))} height={plotH} />)}
      {highlight && <rect className="chart-highlight" x={clampX(highlight.start)} y={M.top} width={Math.max(2, clampX(highlight.end) - clampX(highlight.start))} height={plotH} />}

      {([['crit', 'Nguy hiểm'], ['warn', 'Cảnh báo']] as const).map(([key, text]) => <g key={key}>
        <line className={`chart-threshold ${key}`} x1={M.left} x2={M.left + plotW} y1={y(signal[key])} y2={y(signal[key])} />
        <text className="chart-axis" x={M.left + plotW + 6} y={y(signal[key]) + 4}>{text} {signal[key]}</text>
      </g>)}

      <path className="chart-line" d={path} />

      {index >= 0 && <g>
        <line className="chart-crosshair" x1={x(t[index])} x2={x(t[index])} y1={M.top} y2={M.top + plotH} />
        {hoverValue !== null && hoverValue !== undefined && <circle className="chart-dot" cx={x(t[index])} cy={y(hoverValue)} r={4} />}
      </g>}
    </svg>
    {index >= 0 && <div className="chart-tooltip" style={{ left: Math.min(x(t[index]) + 10, width - 150), top: M.top }}>
      <small>{formatClock(t[index])}</small>
      <strong>{hoverValue === null ? 'Máy dừng' : formatValue(hoverValue, signal.decimals, signal.unit)}</strong>
    </div>}
  </div>;
}

export function Sparkline({ values }: { values: (number | null)[] }) {
  const present = values.filter((v): v is number => v !== null);
  if (!present.length) return <svg className="sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true" />;
  const lo = Math.min(...present), hi = Math.max(...present), span = hi - lo || 1;
  let d = '', open = false;
  values.forEach((v, i) => {
    if (v === null) { open = false; return; }
    d += `${open ? 'L' : 'M'}${((i / Math.max(1, values.length - 1)) * 100).toFixed(2)},${(29 - ((v - lo) / span) * 26).toFixed(2)}`;
    open = true;
  });
  return <svg className="sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path d={d} vectorEffect="non-scaling-stroke" /></svg>;
}
