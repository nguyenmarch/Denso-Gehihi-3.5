/// <reference types="vite/client" />
import axios, { AxiosError } from 'axios';
import { ApiErrorInfo, GraphTopology, HealthStatus, IncidentType, SimulationRequest, SimulationResult } from '../types';

// Override with VITE_API_BASE (e.g. in frontend/.env.local) when the backend is not on localhost:8000.
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1';
const HEALTH_URL = API_BASE.replace(/\/api\/v1\/?$/, '') + '/health';

const http = axios.create({ baseURL: API_BASE, timeout: 15000 });

export class ApiError extends Error implements ApiErrorInfo {
  kind: ApiErrorInfo['kind'];
  status?: number;
  code?: string;

  constructor(info: ApiErrorInfo) {
    super(info.message);
    this.name = 'ApiError';
    this.kind = info.kind;
    this.status = info.status;
    this.code = info.code;
  }
}

type FastApiDetail = string | { code?: string; message?: string } | Array<{ loc?: unknown[]; msg?: string }>;

// FastAPI returns `detail` as a string, as {code, message} (our HTTPExceptions) or as a list (422 validation).
const describeDetail = (detail: FastApiDetail | undefined): { code?: string; message?: string } => {
  if (!detail) return {};
  if (typeof detail === 'string') return { message: detail };
  if (Array.isArray(detail)) {
    const message = detail.map(d => `${(d.loc ?? []).filter(p => p !== 'body').join('.')}: ${d.msg}`).join('; ');
    return { code: 'validation_error', message };
  }
  return { code: detail.code, message: detail.message };
};

export const toApiError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err;
  const axiosErr = err as AxiosError<{ detail?: FastApiDetail }>;
  if (!axiosErr?.isAxiosError) return new ApiError({ kind: 'server', message: String((err as Error)?.message ?? err) });

  // No response: backend down, wrong host, CORS rejected, or an unhandled 500 (Starlette sends it without CORS headers).
  if (!axiosErr.response) {
    return new ApiError({ kind: 'network', message: `Không kết nối được backend tại ${API_BASE}. Kiểm tra backend (port 8000) và Neo4j.` });
  }

  const { status, data } = axiosErr.response;
  const { code, message } = describeDetail(data?.detail);
  if (status === 422) return new ApiError({ kind: 'validation', status, code, message: `Dữ liệu không hợp lệ: ${message ?? 'request bị từ chối'}` });
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
