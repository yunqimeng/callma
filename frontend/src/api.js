const BASE = '/api';

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const options = { method, headers: {} };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${BASE}${path}`, options);
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      /* 忽略非 JSON 错误体 */
    }
    throw new Error(message);
  }
  if (raw) return response;
  return response.json();
}

export const api = {
  health: () => request('/health'),

  // 点名台
  context: (className = '') => request(`/draw/context?class=${encodeURIComponent(className)}`),
  draw: (mode = 'random', className = '') => request('/draw', { method: 'POST', body: { mode, className } }),
  score: (payload) => request('/score', { method: 'POST', body: payload }),
  undo: () => request('/undo', { method: 'POST' }),
  transfer: (payload) => request('/draw/transfer', { method: 'POST', body: payload }),
  feed: (limit = 8) => request(`/feed?limit=${limit}`),

  // 学生名单
  students: ({ search = '', major = '', className = '', sort = 'no' } = {}) =>
    request(
      `/students?search=${encodeURIComponent(search)}&major=${encodeURIComponent(major)}&className=${encodeURIComponent(className)}&sort=${sort}`,
    ),
  majors: () => request('/students/majors'),
  classes: () => request('/classes'),
  resetStudents: () => request('/students/reset', { method: 'POST', body: { confirm: 'RESET' } }),
  createStudent: (payload) => request('/students', { method: 'POST', body: payload }),
  updateStudent: (id, payload) => request(`/students/${id}`, { method: 'PUT', body: payload }),
  removeStudent: (id) => request(`/students/${id}`, { method: 'DELETE' }),
  importStudents: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/students/import', { method: 'POST', body: form });
  },

  // 看板 / 学生端
  board: () => request('/board'),
  portal: (keyword) => request(`/portal/${encodeURIComponent(keyword)}`),

  // 规则
  rules: () => request('/rules'),
  saveRules: (rules) => request('/rules', { method: 'PUT', body: { rules } }),
  simulate: (draws = 3000) => request('/rules/simulate', { method: 'POST', body: { draws } }),
};

/** 下载类接口走浏览器原生下载，避免把二进制读进内存 */
export function downloadUrl(path) {
  return `${BASE}${path}`;
}
