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
  const query = qs.toString()
  const base = `/api/projects/${encodeURIComponent(iatiidentifier)}/timeseries`
  const path = query ? `${base}?${query}` : base
  return request(path)
}

// Obtener bandas históricas por cuantiles del portafolio filtrado.
// Nota: iatiidentifier es OPCIONAL (si se envía, el backend lo excluye del cálculo).
export function getPredictionBands(params = {}, opts = {}) {
  const {
    iatiidentifier,                   // opcional
    method = 'historical_quantiles',  // nombre claro para el BE actual
    level = 90,
    smooth = true,
    ...filters
  } = params
  const qs = new URLSearchParams({ method, level, smooth })
  if (iatiidentifier) qs.set('iatiidentifier', iatiidentifier)
  for (const [k, v] of Object.entries(filters)) {
    if (Array.isArray(v)) v.forEach(val => qs.append(k, val))
    else if (v !== undefined && v !== null) qs.append(k, v)
  }
  return request(`/api/curves/prediction-bands?${qs.toString()}`, {
    method: 'GET',
    ...opts,
  })
}

export function getHealth() { return request('/api/health') }


