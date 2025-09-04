// Todas las peticiones apuntan a rutas relativas. En desarrollo Vite redirige
// mediante su proxy y en producción el Nginx del contenedor reenvía las
// solicitudes al backend. De esta forma evitamos llamadas "cross‑origin" que
// disparaban errores de CORS cuando se configuraba un API base absoluto.
const API_BASE = ''

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`
  const isGet = !options.method || options.method.toUpperCase() === 'GET'
  const headers = isGet ? undefined : { 'Content-Type': 'application/json', ...(options.headers || {}) }
  let res
  try {
    res = await fetch(url, { headers, ...options })
  } catch (networkErr) {
    const err = new Error('Network request failed')
    err.cause = networkErr
    err.status = 0
    throw err
  }
  if (!res.ok) {
    let data = {}
    try { data = await res.json() } catch {}
    const msg = data?.detail || data?.message || res.statusText || `HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.payload = data
    throw err
  }
  let data
  try { data = await res.json() } catch { data = await res.text() }
  return data
}

export function getFilters() {
  return request('/api/filters')
}

export function postCurveFit(filters, opts = {}) {
  const { fromFirstDisbursement, ...rest } = filters
  const qs = new URLSearchParams()
  if (fromFirstDisbursement) qs.set('fromFirstDisbursement', 'true')
  const query = qs.toString()
  const path = query ? `/api/curves/fit?${query}` : '/api/curves/fit'
  return request(path, {
    method: 'POST',
    body: JSON.stringify(rest),
    ...opts,
  })
}

export function getProjectTimeseries(iatiidentifier, params = {}) {
  const { fromFirstDisbursement, ...rest } = params
  const qs = new URLSearchParams(rest)
  if (fromFirstDisbursement) qs.set('fromFirstDisbursement', 'true')
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
    method = 'historical_quantiles',  // método por defecto
    level = 80,
    smooth = true,
    fromFirstDisbursement,
    ...filters
  } = params
  const qs = new URLSearchParams({ method, level, smooth })
  if (iatiidentifier) qs.set('iatiidentifier', iatiidentifier)
  if (fromFirstDisbursement) qs.set('fromFirstDisbursement', 'true')
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


