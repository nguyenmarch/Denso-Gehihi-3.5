import type { Actor, ImpactCategory, IncidentState, Role } from '../services/api';

export const ROLE_LABELS: Record<Role, string> = { operator: 'Điều phối', technician: 'Kỹ thuật viên', expert: 'Chuyên gia' };
export const STATE_LABELS: Record<IncidentState, string> = {
  alert: 'Cảnh báo', dispatched: 'Đã giao việc', in_progress: 'Đang xử lý', unresolved: 'Chưa khắc phục', resolved: 'Đã khắc phục',
};
export const CATEGORY_LABELS: Record<ImpactCategory, string> = { affected: 'Bị ảnh hưởng', unaffected: 'Không bị ảnh hưởng', unknown: 'Chưa rõ' };
export const ACTION_LABELS: Record<string, string> = { create: 'Tạo sự cố', dispatch: 'Giao việc', start: 'Nhận xử lý', report: 'Báo cáo' };

export const formatAt = (value: string | null | undefined) => value ? new Date(value).toLocaleString('vi-VN') : '—';
export const actorName = (actors: Actor[], id: string | null | undefined) => actors.find(a => a.id === id)?.name ?? id ?? '—';
