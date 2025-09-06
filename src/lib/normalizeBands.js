// Normaliza la respuesta de bandas del backend a un objeto de arrays paralelos.
// Soporta inputs como array de objetos [{k,p10,...}] o bien objeto de arrays
// {k:[], p10:[], ...}. Devuelve {k:[], p2_5:[], p10:[], p50:[], p90:[], p97_5:[],
// low_sample_p80?:[], low_sample_p95?:[]} ordenado por k ascendente y con
// cuantiles clamped de forma creciente para evitar renders rotos.
export function normalizeBands(raw = []) {
  let arr = []
  if (Array.isArray(raw)) {
    arr = raw
  } else if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw)
    const len = Math.max(...keys.map(k => Array.isArray(raw[k]) ? raw[k].length : 0))
    for (let i = 0; i < len; i++) {
      const obj = {}
      for (const k of keys) {
        const val = Array.isArray(raw[k]) ? raw[k][i] : undefined
        if (val !== undefined) obj[k] = val
      }
      arr.push(obj)
    }
  }

  const pick = (obj, keys) => {
    for (const k of keys) if (obj?.[k] != null) return obj[k]
    return undefined
  }
  const toNum = v => (v == null ? undefined : Number(v))

  // Convertimos a array de objetos con llaves estandarizadas
  const cleaned = arr
    .map((b) => ({
      k:     Number(b.k ?? b.month ?? b.x ?? NaN),
      p2_5:  toNum(pick(b, ["p2_5", "p_2_5", "p025"])),
      p10:   toNum(pick(b, ["p10", "p_10"])),
      p50:   toNum(pick(b, ["p50", "p_50", "median", "hd"])),
      p90:   toNum(pick(b, ["p90", "p_90"])),
      p97_5: toNum(pick(b, ["p97_5", "p_97_5", "p975"])),
      p_low:  toNum(pick(b, ["p_low", "pLow", "lower", "hd_dn", "p10", "p_10", "p2_5", "p_2_5"])),
      p_high: toNum(pick(b, ["p_high", "pHigh", "upper", "hd_up", "p90", "p_90", "p97_5", "p_97_5"])),
      n:      toNum(pick(b, ["n", "n_k", "count"])),
      low_sample_p80: toNum(pick(b, ["low_sample_p80"])),
      low_sample_p95: toNum(pick(b, ["low_sample_p95"]))
    }))
    .filter(p => Number.isFinite(p.k))
    .sort((a,b) => a.k - b.k)

  const out = { k:[], p2_5:[], p10:[], p50:[], p90:[], p97_5:[], p_low:[], p_high:[], n:[], low_sample_p80:[], low_sample_p95:[] }
  for (const b of cleaned) {
    out.k.push(b.k)
    out.p2_5.push(b.p2_5)
    out.p10.push(b.p10)
    out.p50.push(b.p50)
    out.p90.push(b.p90)
    out.p97_5.push(b.p97_5)
    out.p_low.push(b.p_low)
    out.p_high.push(b.p_high)
    out.n.push(b.n)
    if (b.low_sample_p80 != null) out.low_sample_p80.push(b.low_sample_p80)
    if (b.low_sample_p95 != null) out.low_sample_p95.push(b.low_sample_p95)
  }

  // Validamos longitudes (recortamos al mínimo sólo entre series presentes)
  const lens = [
    out.k.length,
    out.p_low.length,
    out.p_high.length,
    out.p2_5.length,
    out.p10.length,
    out.p50.length,
    out.p90.length,
    out.p97_5.length
  ].filter(l => l > 0)
  const minLen = lens.length ? Math.min(...lens) : 0
  if (lens.length && !lens.every(l => l === minLen)) {
    console.warn('normalizeBands: longitudes inconsistentes', lens)
    for (const k of ['k','p2_5','p10','p50','p90','p97_5','p_low','p_high','n','low_sample_p80','low_sample_p95']) {
      if (Array.isArray(out[k])) out[k] = out[k].slice(0, minLen)
    }
  }

  // Clamp de cuantiles para mantener orden p2_5 ≤ p10 ≤ p50 ≤ p90 ≤ p97_5
  for (let i = 0; i < out.k.length; i++) {
    let prev = -Infinity
    const keys = ['p2_5','p10','p50','p90','p97_5']
    for (const key of keys) {
      let v = out[key][i]
      if (!isFinite(v)) continue
      if (v < prev) {
        console.warn('Quantile inversion at k', out.k[i], 'for', key)
        v = prev
        out[key][i] = v
      }
      prev = v
    }

    const med = out.p50[i]
    const low = out.p_low[i]
    const high = out.p_high[i]
    if (isFinite(med)) {
      if (isFinite(low) && low > med) {
        console.warn('Low above median at k', out.k[i])
        out.p_low[i] = med
      }
      if (isFinite(high) && high < med) {
        console.warn('High below median at k', out.k[i])
        out.p_high[i] = med
      }
    }
  }

  return out
}

