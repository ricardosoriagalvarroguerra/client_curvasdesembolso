import React, { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import * as d3 from 'd3'
import { MACROSECTOR_LABELS, MODALITY_LABELS } from '../labels'
import { getPredictionBands } from '../api/client'

export default function ProjectPopover({ open, onClose, data }) {
  const ref = useRef(null)
  const tooltipRef = useRef(null)
  const [showBands, setShowBands] = useState(false)
  const [method, setMethod] = useState('bootstrap')
  const [level, setLevel] = useState('90')

  // Sync state with query params on mount
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    setShowBands(qs.get('pb') === '1')
    setMethod(qs.get('pb_m') || 'bootstrap')
    setLevel(qs.get('pb_l') || '90')
  }, [])

  // Persist params for deep linking
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    if (showBands) qs.set('pb', '1'); else qs.delete('pb')
    qs.set('pb_m', method)
    qs.set('pb_l', level)
    const newUrl = `${window.location.pathname}?${qs.toString()}${window.location.hash}`
    window.history.replaceState(null, '', newUrl)
  }, [showBands, method, level])

  // Tooltip element
  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'tooltip'
    el.style.display = 'none'
    document.body.appendChild(el)
    tooltipRef.current = el
    return () => { el.remove() }
  }, [])

  const pid = data?.project?.iatiidentifier
  const [debKey, setDebKey] = useState(null)
  useEffect(() => {
    if (!open || !showBands || !pid) { setDebKey(null); return }
    const h = setTimeout(() => setDebKey({ pid, method, level }), 300)
    return () => clearTimeout(h)
  }, [open, showBands, pid, method, level])

  const { data: bandResp, error: bandError, isValidating: bandLoading } = useSWR(
    debKey ? ['pb', debKey.pid, debKey.method, debKey.level] : null,
    ([, projectId, m, l]) => getPredictionBands(projectId, { method: m, level: l, smooth: true }),
    { revalidateOnFocus: false }
  )

  const bands = useMemo(() => {
    const arr = Array.isArray(bandResp?.series) ? bandResp.series : Array.isArray(bandResp) ? bandResp : []
    return arr.map(p => ({
      t: p.t ? new Date(p.t) : p.k,
      lower: p.lower,
      upper: p.upper,
      y_hat: p.y_hat
    }))
  }, [bandResp])

  useEffect(() => {
    if (!open || !data) return
    const series = Array.isArray(data?.series) ? data.series : []
    const wrap = ref.current
    if (!wrap) return
    wrap.innerHTML = ''

    const containerWidth = Math.max(280, Math.min(820, wrap.clientWidth || 760))
    const width = containerWidth
    const height = Math.max(160, Math.min(280, Math.round(containerWidth * 0.35)))
    const margin = { top: 10, right: 20, bottom: 30, left: 40 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const svg = d3.select(wrap).append('svg').attr('width', width).attr('height', height)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const pts = series.map(p => ({ t: p.t ? new Date(p.t) : p.k, y: p.y ?? p.d }))
    const xItems = [...pts]
    if (showBands && bands.length) bands.forEach(b => xItems.push(b))
    const isDate = xItems.some(d => d.t instanceof Date)
    const xDomain = d3.extent(xItems, d => d.t)
    const x = isDate ? d3.scaleUtc().domain(xDomain).range([0, innerW]) : d3.scaleLinear().domain(xDomain).range([0, innerW])

    const yVals = pts.map(p => p.y)
    if (showBands && bands.length) bands.forEach(b => { yVals.push(b.lower, b.upper) })
    const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(yVals) || 1)]).range([innerH, 0])

    const line = d3.line().defined(d => d.y != null).x(d => x(d.t)).y(d => y(d.y))

    g.append('g').attr('transform', `translate(0,${innerH})`).call((isDate ? d3.axisBottom(x).ticks(Math.max(3, Math.round(innerW / 120))) : d3.axisBottom(x).ticks(Math.max(3, Math.round(innerW / 120)))))
    g.append('g').call(d3.axisLeft(y).ticks(4))

    if (showBands && bands.length) {
      const area = d3.area()
        .x(d => x(d.t))
        .y0(d => y(d.lower))
        .y1(d => y(d.upper))
      g.append('path')
        .datum(bands)
        .attr('fill', 'var(--line-main)')
        .attr('fill-opacity', 0.15)
        .attr('stroke', 'none')
        .attr('d', area)
      const yhatLine = d3.line().x(d => x(d.t)).y(d => y(d.y_hat))
      g.append('path')
        .datum(bands)
        .attr('fill', 'none')
        .attr('stroke', 'var(--line-main)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 4')
        .attr('d', yhatLine)

      const bisect = d3.bisector(d => d.t).left
      svg.on('mousemove', e => {
        const [mx] = d3.pointer(e, g.node())
        const x0 = x.invert(mx)
        const idx = bisect(bands, x0)
        const d0 = bands[Math.min(bands.length - 1, Math.max(0, idx))]
        const t = tooltipRef.current
        if (!t) return
        t.style.display = 'block'
        t.style.left = (e.clientX + 12) + 'px'
        t.style.top = (e.clientY + 12) + 'px'
        t.style.color = 'var(--text)'
        t.style.border = '1px solid var(--border)'
        t.style.background = 'var(--input-bg)'
        const label = isDate && d0.t instanceof Date ? d0.t.toISOString().slice(0,10) : d0.t
        t.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${label}</div>` +
          `<div style="color:var(--muted)">[${d0.lower.toFixed(3)}, ${d0.y_hat.toFixed(3)}, ${d0.upper.toFixed(3)}]</div>`
      })
      svg.on('mouseleave', () => { const t = tooltipRef.current; if (t) t.style.display = 'none' })
    }

    g.append('path')
      .datum(pts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--line-main)')
      .attr('stroke-width', 2)
      .attr('d', line)
  }, [open, data, bands, showBands])

  if (!open || !data) return null

  const p = data.project || {}
  const macroName = p.macrosector_id != null ? (MACROSECTOR_LABELS[p.macrosector_id] || p.macrosector_id) : '-'
  const modalityName = p.modality_id != null ? (MODALITY_LABELS[p.modality_id] || p.modality_id) : '-'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ justifyContent:'space-between', alignItems:'start' }}>
          <div>
            <div style={{ fontWeight:600, marginBottom:6 }}>{p.iatiidentifier}</div>
            <div style={{ color:'var(--muted)' }}>
              País: {p.country_id || '-'} · Macrosector: {macroName} · Modalidad: {modalityName} · Aprobado: {p.approved_amount?.toLocaleString?.() || '-'}
            </div>
          </div>
          <div>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(p.iatiidentifier || '')}>Copiar ID</button>
            <button className="btn" style={{ marginLeft:8 }} onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div className="row" style={{ marginTop:10, gap:8, alignItems:'center' }}>
          <label className="row" style={{ gap:4 }}>
            <input type="checkbox" checked={showBands} onChange={e => setShowBands(e.target.checked)} /> Bandas de predicción
          </label>
          {showBands && (
            <>
              <select value={method} onChange={e => setMethod(e.target.value)}>
                <option value="rolling_std">rolling_std</option>
                <option value="bootstrap">bootstrap</option>
                <option value="quantile_reg">quantile_reg</option>
              </select>
              <select value={level} onChange={e => setLevel(e.target.value)}>
                <option value="80">80%</option>
                <option value="90">90%</option>
                <option value="95">95%</option>
              </select>
            </>
          )}
        </div>
        {showBands && bandLoading && <div style={{ color:'var(--muted)', marginTop:4 }}>Cargando bandas...</div>}
        {showBands && bandError && <div style={{ color:'var(--danger)', marginTop:4 }}>Error al cargar bandas</div>}
        {showBands && !bandLoading && !bandError && !bands.length && (
          <div style={{ color:'var(--muted)', marginTop:4 }}>Sin bandas disponibles</div>
        )}
        {showBands && !bandLoading && !bandError && bands.length > 0 && (
          <div style={{ color:'var(--muted)', marginTop:4 }}>Banda ({level}%) método: {method}</div>
        )}
        <div ref={ref} style={{ marginTop:10, width:'100%' }} />
      </div>
    </div>
  )
}


