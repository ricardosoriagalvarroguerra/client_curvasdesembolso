import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { MACROSECTOR_LABELS, MODALITY_LABELS } from '../labels'

export default function ProjectPopover({ open, onClose, data }) {
  const ref = useRef(null)

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
    const isDate = pts.some(d => d.t instanceof Date)
    const xDomain = d3.extent(pts, d => d.t)
    const x = isDate ? d3.scaleUtc().domain(xDomain).range([0, innerW]) : d3.scaleLinear().domain(xDomain).range([0, innerW])

    const yVals = pts.map(p => p.y)
    const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(yVals) || 1)]).range([innerH, 0])

    const line = d3.line().defined(d => d.y != null).x(d => x(d.t)).y(d => y(d.y))

    g.append('g').attr('transform', `translate(0,${innerH})`).call((isDate ? d3.axisBottom(x).ticks(Math.max(3, Math.round(innerW / 120))) : d3.axisBottom(x).ticks(Math.max(3, Math.round(innerW / 120)))))
    g.append('g').call(d3.axisLeft(y).ticks(4))

    g.append('path')
      .datum(pts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--line-main)')
      .attr('stroke-width', 2)
      .attr('d', line)
  }, [open, data])

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
        <div ref={ref} style={{ marginTop:10, width:'100%' }} />
      </div>
    </div>
  )
}


