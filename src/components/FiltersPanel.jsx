import React, { useEffect, useState } from 'react'
import useSWR from 'swr'
import { getFilters } from '../api/client'

const FIVE_FP = ['AR', 'BO', 'BR', 'PY', 'UY']

export default function FiltersPanel({ filters, onChange, onAddCompare, canAdd, onClearCompare, compareItems, onRemoveCompare, showActivePoints, onToggleActivePoints, showPointCloud, onTogglePointCloud, onCombine }) {
  const { data, error } = useSWR('/api/filters', getFilters, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
    focusThrottleInterval: 10 * 60 * 1000,
    revalidateIfStale: false,
  })
  const [local, setLocal] = useState(filters)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selected, setSelected] = useState([])

  useEffect(() => setLocal(filters), [JSON.stringify(filters)])

  useEffect(() => {
    const t = setTimeout(() => onChange(local), 150)
    return () => clearTimeout(t)
  }, [JSON.stringify(local)])

  if (error) return <div className="chip" style={{ color:'var(--below)' }}>Error cargando filtros</div>
  if (!data) return <div className="chip">Cargando filtros…</div>

  const allMacros = data.macrosectors?.map(o => o.id) || []
  const allMods = data.modalities?.map(o => o.id) || []

  function toggleExclusive(field, value, allValues) {
    setLocal(prev => {
      const current = prev[field]
      const isExclusive = current.length===1 && current[0]===value
      // Si ya está exclusivo → volver al global (todos)
      if (isExclusive) return { ...prev, [field]: allValues }
      // Si no, dejar solo ese valor
      return { ...prev, [field]: [value] }
    })
  }

  function setRange(fieldMin, fieldMax, min, max) {
    setLocal(prev => ({ ...prev, [fieldMin]: min, [fieldMax]: max }))
  }

  function reset() {
    setLocal({
      macrosectors: allMacros,
      modalities: allMods,
      countries: [],
      mdbs: [],
      ticketMin: data.ticketMin || 0,
      ticketMax: data.ticketMax || 0,
      yearFrom: Math.max(2010, data.yearMin || 2010),
      yearTo: Math.min(2024, data.yearMax || 2024),
      onlyExited: true,
    })
    if (typeof onToggleActivePoints === 'function') onToggleActivePoints(true)
  }

  const isFiveFP = FIVE_FP.every(c => local.countries.includes(c)) && local.countries.length === FIVE_FP.length
  const summary = [
    local.macrosectors.length===1 ? `Macrosector: ${data.macrosectors.find(m=>m.id===local.macrosectors[0])?.name}` : 'Macrosector: Global',
    local.modalities.length===1 ? `Modalidad: ${data.modalities.find(m=>m.id===local.modalities[0])?.name}` : 'Modalidad: Global',
    isFiveFP ? 'País: 5-FP' : (local.countries.length===1 ? `País: ${local.countries[0]}` : 'País: Global'),
    (local.mdbs?.length===1 ? `MDB: ${data.mdbs.find(m=>m.id===local.mdbs[0])?.name || local.mdbs[0]}` : 'MDB: Global'),
  ]

  return (
    <div>
      <div className="panel-title">Filtros</div>
      <div className="summary">
        {summary.map((s,i)=>(<span key={i} className="chip chip--accent">{s}</span>))}
      </div>

      <div className="field">
        <label className="hint">Macrosector</label>
        <select className="select" value={local.macrosectors.length===1 ? local.macrosectors[0] : ''} onChange={e => {
          const v = e.target.value
          setLocal(prev => ({ ...prev, macrosectors: v ? [Number(v)] : allMacros }))
        }}>
          <option value="">Global (Todos)</option>
          {data.macrosectors.map(ms => (
            <option key={ms.id} value={ms.id}>{ms.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="hint">Modalidad</label>
        <select className="select" value={111} onChange={()=>{}}>
          {data.modalities.map(m => (
            <option key={m.id} value={m.id} disabled={m.id!==111}>{m.name}{m.id!==111?' (próx.)':''}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="hint">País</label>
        <select
          className="select"
          value={isFiveFP ? '5-FP' : (local.countries[0] || '')}
          onChange={e => {
            const v = e.target.value
            setLocal(prev => ({
              ...prev,
              countries: v === '' ? [] : (v === '5-FP' ? [...FIVE_FP] : [v]),
            }))
          }}
        >
          <option value="">Global (Todos)</option>
          {data.countries.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="5-FP">5-FP</option>
        </select>
      </div>

      <div className="field">
        <label className="hint">MDB</label>
        <select className="select" value={(local.mdbs && local.mdbs[0]) || ''} onChange={e => {
          const v = e.target.value
          setLocal(prev => ({ ...prev, mdbs: v ? [v] : [] }))
        }}>
          <option value="">Global (Todos)</option>
          {(data.mdbs || []).map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="hint">Ticket promedio (millones USD, aprobado por proyecto)</label>
        <div className="row">
          <input
            className="input"
            type="number"
            step="0.1"
            min={(data.ticketMin || 0) / 1_000_000}
            max={(local.ticketMax || 0) / 1_000_000}
            value={(local.ticketMin || 0) / 1_000_000}
            onChange={e => setLocal(prev => ({ ...prev, ticketMin: Number(e.target.value) * 1_000_000 }))}
          />
          <input
            className="input"
            type="number"
            step="0.1"
            min={(local.ticketMin || 0) / 1_000_000}
            max={(data.ticketMax || 0) / 1_000_000}
            value={(local.ticketMax || 0) / 1_000_000}
            onChange={e => setLocal(prev => ({ ...prev, ticketMax: Number(e.target.value) * 1_000_000 }))}
          />
        </div>
      </div>

      <div className="field">
        <label className="hint">Años</label>
        <div className="row">
          <input className="input" type="number" min={data.yearMin} max={local.yearTo} value={local.yearFrom} onChange={e => setLocal(prev => ({ ...prev, yearFrom: Number(e.target.value) }))} />
          <input className="input" type="number" min={local.yearFrom} max={data.yearMax} value={local.yearTo} onChange={e => setLocal(prev => ({ ...prev, yearTo: Number(e.target.value) }))} />
        </div>
      </div>

      <div className="field row">
        <input id="activePts" type="checkbox" checked={!!showActivePoints} onChange={e => onToggleActivePoints?.(e.target.checked)} />
        <label htmlFor="activePts" className="hint">Mostrar puntos ACTIVE</label>
      </div>

      <div className="field row">
        <input id="pointCloud" type="checkbox" checked={!!showPointCloud} onChange={e => onTogglePointCloud?.(e.target.checked)} />
        <label htmlFor="pointCloud" className="hint">Mostrar Nube de Puntos</label>
      </div>

      <div className="row" style={{ justifyContent:'space-between' }}>
        <div className="row" style={{ gap:8 }}>
          <button className="btn btn--accent" onClick={() => onAddCompare(local)} disabled={!canAdd} title={canAdd ? 'Agregar esta curva a la comparación' : 'Límite 7 curvas'}>Agregar a comparación</button>
          <button className="btn btn--ghost" onClick={onClearCompare} disabled={!compareItems?.length}>Limpiar comparaciones</button>
        </div>
      </div>

      {compareItems?.length ? (
        <div className="field">
          <label style={{ fontSize:12, color:'var(--muted)' }}>Curvas en comparación</label>
          <div className="btn-group" style={{ gap:6 }}>
            {compareItems.map(item => (
              <span key={item.id} className="chip" style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                <input type="checkbox" checked={selected.includes(item.id)} onChange={e => {
                  setSelected(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id!==item.id))
                }} />
                {item.label}
                <button className="btn" onClick={() => onRemoveCompare(item.id)} aria-label="Quitar">✕</button>
              </span>
            ))}
          </div>
          <div className="row" style={{ marginTop:8 }}>
            <button className="btn btn--accent" disabled={selected.length < 2} onClick={() => { onCombine?.(selected); setSelected([]) }}>Combinar seleccionadas</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}


