/// <reference types="vite/client" />
import axios, { AxiosError } from 'axios';
import { ApiErrorInfo, GraphTopology, HealthStatus, IncidentType, SimulationRequest, SimulationResult } from '../types';

// Override with VITE_API_BASE (e.g. in frontend/.env.local) when the backend is not on localhost:8000.
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1';
const HEALTH_URL = API_BASE.replace(/\/api\/v1\/?$/, '') + '/health';

const REQUEST_TIMEOUT = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS) || 15000;
const http = axios.create({ baseURL: API_BASE, timeout: REQUEST_TIMEOUT });
const EXPLAIN_TIMEOUT = Number(import.meta.env.VITE_EXPLAIN_TIMEOUT_MS) || 65000;

export class ApiError extends Error implements ApiErrorInfo {
  kind: ApiErrorInfo['kind'];
  status?: number;
  code?: string;
  fields?: Record<string, string>;

  constructor(info: ApiErrorInfo) {
    super(info.message);
    this.name = 'ApiError';
    this.kind = info.kind;
    this.status = info.status;
    this.code = info.code;
    this.fields = info.fields;
  }
}

type FastApiDetail = string | { code?: string; message?: string; fields?: Record<string, string> } | Array<{ loc?: unknown[]; msg?: string }>;

// FastAPI returns `detail` as a string, as {code, message, fields?} (our HTTPExceptions) or as a list (422 schema validation).
const describeDetail = (detail: FastApiDetail | undefined): { code?: string; message?: string; fields?: Record<string, string> } => {
  if (!detail) return {};
  if (typeof detail === 'string') return { message: detail };
  if (Array.isArray(detail)) {
    const message = detail.map(d => `${(d.loc ?? []).filter(p => p !== 'body').join('.')}: ${d.msg}`).join('; ');
    const fields = Object.fromEntries(detail.map(d => [String((d.loc ?? []).filter(p => p !== 'body')[0] ?? ''), d.msg ?? '']));
    return { code: 'validation_error', message, fields };
  }
  return { code: detail.code, message: detail.message, fields: detail.fields };
};

export const toApiError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err;
  const axiosErr = err as AxiosError<{ detail?: FastApiDetail }>;
  if (!axiosErr?.isAxiosError) return new ApiError({ kind: 'server', message: String((err as Error)?.message ?? err) });

  // No response: backend down, wrong host, CORS rejected, or an unhandled 500 (Starlette sends it without CORS headers).
  if (!axiosErr.response) {
    if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') return new ApiError({ kind: 'network', code: 'timeout', message: 'Yêu cầu quá thời gian chờ. Hãy thử lại; thao tác sẽ giữ mã chống trùng.' });
    return new ApiError({ kind: 'network', message: `Không kết nối được backend tại ${API_BASE}. Kiểm tra backend (port 8000) và Neo4j.` });
  }

  const { status, data } = axiosErr.response;
  const { code, message, fields } = describeDetail(data?.detail);
  if (status === 422) return new ApiError({ kind: 'validation', status, code, fields, message: `Dữ liệu không hợp lệ: ${message ?? 'request bị từ chối'}` });
  if (status === 404) return new ApiError({ kind: 'not_found', status, code, message: message ?? 'Không tìm thấy node trong graph.' });
  if (status === 503) return new ApiError({ kind: 'unavailable', status, code, message: message ?? 'Graph store (Neo4j) không sẵn sàng.' });
  return new ApiError({ kind: 'server', status, code, message: message ?? `Backend lỗi (HTTP ${status}).` });
};

const badResponse = (what: string) => new ApiError({ kind: 'bad_response', message: `Response ${what} không đúng contract.` });

/**
 * POST /incidents/simulate
 * Request:  { "node_id": "EQ_OVEN_01", "incident_type": "MACHINE_BREAKDOWN", "severity": 1.0 }
 * Response: { origin_id, incident_type, impacted_nodes: [{ node_id, node_type, name, distance, impact_score }],
 *             actions_by_department: { DEP_MAINT, DEP_PROD, DEP_QA, DEP_SCM, CONTEXT } }
 * Errors:   422 validation · 404 node_not_found · 503 graph_store_unavailable (see docs/api.md)
 */
export const triggerSimulation = async (nodeId: string, incidentType: IncidentType, severity = 1.0): Promise<SimulationResult> => {
  const body: SimulationRequest = { node_id: nodeId, incident_type: incidentType, severity };
  try {
    const { data } = await http.post<SimulationResult>('/incidents/simulate', body);
    if (!data || !Array.isArray(data.impacted_nodes) || typeof data.actions_by_department !== 'object') throw badResponse('/incidents/simulate');
    return data;
  } catch (err) {
    throw toApiError(err);
  }
};

/** GET /graph/topology → { nodes: [{ id, label, properties }], edges: [{ source, target, type }] } */
export const fetchTopology = async (): Promise<GraphTopology> => {
  try {
    const { data } = await http.get<GraphTopology>('/graph/topology');
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw badResponse('/graph/topology');
    return data;
  } catch (err) {
    throw toApiError(err);
  }
};

/** GET /health → { status: 'ok' | 'degraded', database: 'connected' | 'unavailable' } */
export const fetchHealth = async (): Promise<HealthStatus> => {
  try {
    const { data } = await axios.get<HealthStatus>(HEALTH_URL, { timeout: 5000 });
    return data;
  } catch (err) {
    throw toApiError(err);
  }
};

// Demo workflow contract: docs/api.md, "Contract dự kiến (PRE-02)".
export type Role = 'operator' | 'technician' | 'expert';
export interface Actor { id: string; name: string; role: Role; }
export interface Asset { id: string; type: string; name: string; }
export interface MachineEvent { id: string; at: string; label: string; }
export type IncidentState = 'alert' | 'dispatched' | 'in_progress' | 'unresolved' | 'resolved';
export interface HistoryEntry { at: string; actor_id: string; action: string; from: IncidentState | null; to: IncidentState; note: string | null; }
export interface ReportRecord {
  index: number; at: string; actor_id: string; outcome: 'fixed' | 'not_fixed'; summary: string; next_step: string;
  checks: { text: string; result: string }[]; actions: string[]; open_items: string[];
}
export interface Incident {
  id: string; origin: 'synthetic'; source: 'scenario' | 'fault'; scenario_id: string | null; event: MachineEvent | null;
  asset: Asset; incident_type: IncidentType; severity: number; alarm_at: string; state: IncidentState;
  created_at: string; created_by: string; assignee: { id: string; name: string } | null;
  decision_note: string | null; next_step: string | null; reports: ReportRecord[]; history: HistoryEntry[];
  // Operator/expert only: heuristic propagation used to mark the graph.
  simulation?: SimulationResult;
}
export interface Scenario { id: string; event: MachineEvent; asset: Asset; incident_type: IncidentType; severity: number; }
export type ImpactCategory = 'affected' | 'unaffected' | 'unknown';
export interface ImpactItem {
  object_id: string; object_type: string; name: string; product_code: string | null; category: ImpactCategory;
  reasons: { code: string; text: string; refs: string[] }[]; verification?: 'needs_verification'; next_check?: string; scope_note?: string;
}
export interface Impact {
  incident_id: string; rule: string; status: 'evaluated' | 'not_applicable'; message?: string;
  window: { start: string | null; start_basis: string; end: string | null; end_basis: string } | null;
  items: ImpactItem[];
  propagation?: { basis: 'heuristic_hops'; impacted_nodes: SimulationResult['impacted_nodes'] };
  upstream_candidates?: { basis: 'investigation_only'; nodes: { node_id: string; type: string; name: string; distance: number }[] };
}
export interface AcceptedLesson { id: string; text: string; source_incident_id: string; accepted_by: string; accepted_at: string; }
export interface GuidanceView {
  match: { asset_id: string; incident_type: IncidentType; source: string } | null;
  steps: { id: string; text: string }[];
  containment: { status: 'proposal'; human_review_required: true; text: string } | null;
  lessons: AcceptedLesson[];
  gap: { code: 'knowledge_gap'; message: string } | null;
}
interface LlmResult { mode: 'llm' | 'knowledge'; model: string; failure_category: string | null; failure_reason: string | null; safety: string; }
export interface Explanation extends LlmResult {
  narrative: { summary: string; citations: string[]; steps: Record<string, { text: string; citations: string[] }> } | null;
  steps: { id: string; text: string }[]; evidence: { label: string; source: string }[];
}
export interface Answer extends LlmResult { answer: string | null; citations: { alias: string; label: string }[]; }
export type LessonStatus = 'pending' | 'accepted' | 'rejected';
export interface Lesson {
  id: string; status: LessonStatus; text: string; original_text: string; created_at: string;
  context: { asset_id: string; incident_type: IncidentType };
  source: { incident_id: string; report_index: number; author_id: string };
  review: { decision: 'accepted' | 'rejected'; by: string; at: string; reason: string | null } | null;
}

const as = (actor: Actor) => ({ headers: { 'X-Demo-Actor': actor.id } });
const request = async <T,>(call: Promise<{ data: T }>): Promise<T> => {
  try { return (await call).data; } catch (err) { throw toApiError(err); }
};
export const listActors = () => request<Actor[]>(http.get('/demo/actors'));
export const listScenarios = (actor: Actor) => request<Scenario[]>(http.get('/scenarios', as(actor)));
export const listIncidents = (actor: Actor) => request<Incident[]>(http.get('/incidents', as(actor)));
export const getIncident = (id: string, actor: Actor) => request<Incident>(http.get(`/incidents/${id}`, as(actor)));
export const getImpact = (id: string, actor: Actor) => request<Impact>(http.get(`/incidents/${id}/impact`, as(actor)));
export const getGuidance = (id: string, actor: Actor) => request<GuidanceView>(http.get(`/incidents/${id}/guidance`, as(actor)));
export const explainGuidance = (id: string, actor: Actor) =>
  request<Explanation>(http.post(`/incidents/${id}/guidance/explain`, {}, { ...as(actor), timeout: EXPLAIN_TIMEOUT }));
export const askAssistant = (id: string, question: string, actor: Actor) =>
  request<Answer>(http.post(`/incidents/${id}/assistant/ask`, { question }, { ...as(actor), timeout: EXPLAIN_TIMEOUT }));
export const listLessons = (actor: Actor) => request<Lesson[]>(http.get('/lessons', as(actor)));

// Mutations keep the exact Idempotency-Key after an ambiguous timeout/network failure, including a reload.
export const command = async <T,>(path: string, body: object, actor: Actor, method: 'post' | 'patch' = 'post'): Promise<T> => {
  const slot = 'inav-command:' + JSON.stringify([method, path, body, actor.id]);
  const key = sessionStorage.getItem(slot) ?? crypto.randomUUID();
  sessionStorage.setItem(slot, key);
  const data = await request<T>(http.request({ method, url: path, data: body, headers: { 'X-Demo-Actor': actor.id, 'Idempotency-Key': key } }));
  sessionStorage.removeItem(slot);
  return data;
};
export const fetchNodeDetails = (id: string) => request<Record<string, unknown>>(http.get(`/graph/node/${encodeURIComponent(id)}`));
