import React, { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { MACROSECTOR_LABELS, MODALITY_LABELS } from '../labels'

export default function ProjectPopover({ open, onClose, data }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open || !data) return
    const { series } = data
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

    const maxK = d3.max(series, d => d.k) || 0
    const x = d3.scaleLinear().domain([0, maxK]).range([0, innerW])
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0])

    const line = d3.line().x(d => x(d.k)).y(d => y(d.d))

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.round(innerW / 120))))
    g.append('g').call(d3.axisLeft(y).ticks(4))

    g.append('path')
      .datum(series)
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


