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
  const { fromFirstDisbursement, bandCoverage, ...rest } = filters

  // Only fromFirstDisbursement is encoded in the query string. The band
  // coverage must travel in the JSON body so the backend can decide whether to
  // compute prediction bands.
  const qs = new URLSearchParams()
  if (fromFirstDisbursement) qs.set('fromFirstDisbursement', 'true')
  const query = qs.toString()
  const path = query ? `/api/curves/fit?${query}` : '/api/curves/fit'

  const payload = { ...rest }
  if (bandCoverage !== undefined) payload.bandCoverage = bandCoverage

  return request(path, {
    method: 'POST',
    body: JSON.stringify(payload),
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
export function getHealth() { return request('/api/health') }


