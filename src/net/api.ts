// Network calls for class submission and the teacher view. The editor and
// downloads never need these.
export type ApiError = { status: number; code: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { ...init, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  } catch {
    throw { status: 0, code: 'network' } as ApiError;
  }
  if (!r.ok) {
    let code = 'server';
    try {
      code = ((await r.json()) as { error?: string }).error ?? code;
    } catch {
      /* not json */
    }
    throw { status: r.status, code } as ApiError;
  }
  const type = r.headers.get('content-type') ?? '';
  return (type.includes('json') && !path.endsWith('/project') ? r.json() : r.text()) as Promise<T>;
}

export type ClassMode = 'quick' | 'workshop' | null;
export type ClassInfo = { name: string; open: boolean; material: import('../model/types').MaterialProfile | null; mode?: ClassMode; modeLocked?: boolean; missions?: string[] | null };
export type TeacherClass = { id: string; code: string; name: string; open: boolean; material: import('../model/types').MaterialProfile | null; mode?: ClassMode; modeLocked?: boolean; missions?: string[] | null; createdAt: number; submissions: number; fresh: number };
export type Submission = { id: string; classId: string; displayName: string; title: string; materialId: string; materialKind: string; thickness: number; pieceCount: number; status: 'new' | 'cut'; superseded: boolean; createdAt: number; device: string };

export const api = {
  classInfo: (code: string) => call<ClassInfo>(`/api/class/${encodeURIComponent(code.trim().toUpperCase())}`),
  submit: (code: string, body: { displayName: string; deviceId: string; title: string; project: string; preview: string }) =>
    call<{ id: string }>(`/api/class/${encodeURIComponent(code.trim().toUpperCase())}/submit`, { method: 'POST', body: JSON.stringify(body) }),
  login: (key: string) => call<{ ok: true }>('/api/teacher/login', { method: 'POST', body: JSON.stringify({ key }) }),
  logout: () => call<{ ok: true }>('/api/teacher/logout', { method: 'POST' }),
  classes: () => call<TeacherClass[]>('/api/teacher/classes'),
  createClass: (name: string) => call<TeacherClass>('/api/teacher/classes', { method: 'POST', body: JSON.stringify({ name }) }),
  patchClass: (id: string, patch: { open?: boolean; material?: unknown; mode?: ClassMode; modeLocked?: boolean; missions?: string[] | null }) => call(`/api/teacher/classes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteClass: (id: string) => call(`/api/teacher/classes/${id}`, { method: 'DELETE' }),
  submissions: (classId: string, history = false) => call<Submission[]>(`/api/teacher/classes/${classId}/submissions${history ? '?history=1' : ''}`),
  project: (id: string) => call<string>(`/api/teacher/submissions/${id}/project`),
  preview: (id: string) => call<string>(`/api/teacher/submissions/${id}/preview`),
  setStatus: (ids: string[], status: 'new' | 'cut') => call('/api/teacher/submissions/status', { method: 'POST', body: JSON.stringify({ ids, status }) }),
  deleteSubmission: (id: string) => call(`/api/teacher/submissions/${id}`, { method: 'DELETE' }),
};

/** A stable random id for this browser (newest submission replaces the previous one from it). */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('cutforge.device');
    if (!id) {
      id = 'dev-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('cutforge.device', id);
    }
    return id;
  } catch {
    return 'dev-' + Math.random().toString(16).slice(2, 14);
  }
}
