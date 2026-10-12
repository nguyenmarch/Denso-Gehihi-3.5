import { tr, locale } from '../i18n';
import type { Actor, ImpactCategory, IncidentState, MachineState, Role } from '../services/api';

export const ROLE_LABELS: Record<Role, string> = { operator: 'Điều phối', technician: 'Kỹ thuật viên', expert: 'Chuyên gia' };
export const STATE_LABELS: Record<IncidentState, string> = {
  alert: 'Cảnh báo', dispatched: 'Đã giao việc', in_progress: 'Đang xử lý', unresolved: 'Chưa khắc phục', resolved: 'Đã khắc phục',
};
export const CATEGORY_LABELS: Record<ImpactCategory, string> = { affected: 'Bị ảnh hưởng', unaffected: 'Không bị ảnh hưởng', unknown: 'Chưa rõ' };
export const ACTION_LABELS: Record<string, string> = { create: 'Tạo sự cố', dispatch: 'Giao việc', start: 'Nhận xử lý', report: 'Báo cáo' };

export const formatAt = (value: string | null | undefined) => value ? new Date(value).toLocaleString(locale()) : '—';
export const actorName = (actors: Actor[], id: string | null | undefined) => actors.find(a => a.id === id)?.name ?? id ?? '—';

export const MACHINE_STATE_LABELS: Record<MachineState, string> = { normal: 'Bình thường', warning: 'Cảnh báo', critical: 'Nguy hiểm', stopped: 'Dừng máy' };
export const formatClock = (value: string | number) => new Date(value).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return h ? tr("{0} giờ {1} phút", h, m) : m ? tr("{0} phút {1} giây", m, s) : tr("{0} giây", s);
};
export const formatValue = (value: number | null | undefined, decimals: number, unit?: string | null) =>
  value === null || value === undefined ? '—' : `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
