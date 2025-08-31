const isDev = !!import.meta.env.DEV
// En desarrollo, forzamos rutas relativas para usar el proxy de Vite.
// En producción, permitimos configurar API_BASE vía VITE_API_BASE.
const API_BASE = (!isDev
  ? (import.meta.env.VITE_API_BASE || 'https://curvasdesembolsoserver-production.up.railway.app')
  : ''
).replace(/\/$/, '')

async function request(path, options = {}) {
  const url = API_BASE ? `${API_BASE}${path}` : path
  const isGet = !options.method || options.method.toUpperCase() === 'GET'
  const headers = isGet ? undefined : { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const res = await fetch(url, { headers, ...options })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch (e) { data = text }
  if (!res.ok) {
    const message = data?.detail || data?.message || res.statusText || 'Error'
    const err = new Error(message)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export function getFilters() {
  return request('/api/filters')
}

export function postCurveFit(filters, opts = {}) {
  return request('/api/curves/fit', {
    method: 'POST',
    body: JSON.stringify(filters),
    ...opts,
  })
}

export function getProjectTimeseries(iatiidentifier, params = {}) {
  const qs = new URLSearchParams(params)
  return request(`/api/projects/${encodeURIComponent(iatiidentifier)}/timeseries?${qs}`)
}

export function getPredictionBands(projectId, params = {}) {
  const { method = 'bootstrap', level = 90, smooth = true } = params
  const qs = new URLSearchParams({ method, level, smooth })
  return request(`/api/curves/${encodeURIComponent(projectId)}/prediction-bands?${qs}`)
}

export function getHealth() { return request('/api/health') }


