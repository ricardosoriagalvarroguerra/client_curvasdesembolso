import React, { useState, Suspense, lazy } from 'react'
import { MACROSECTOR_LABELS, MODALITY_LABELS } from './labels'
const FiltersPanel = lazy(() => import('./components/FiltersPanel.jsx'))
const CurveWorkbench = lazy(() => import('./components/CurveWorkbench.jsx'))

export default function App() {
  const [filters, setFilters] = useState({
    macrosectors: [11,22,33,44,55,66],
    modalities: [111],
    countries: [],
    mdbs: [],
    ticketMin: 0,
    ticketMax: 1000000000,
    yearFrom: 2010,
    yearTo: 2024,
    onlyExited: true,
    fromFirstDisbursement: false,
  })
  const [compareItems, setCompareItems] = useState([]) // up to 7 curves
  const [showActivePoints, setShowActivePoints] = useState(true)
  const [showPointCloud, setShowPointCloud] = useState(false)

  const filtersEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const hideMainCurve = compareItems.some(ci => filtersEqual(ci.filters, filters))

  function addCurrentAsCompare(filtersArg) {
    if (compareItems.length >= 7) return
    // Accept either raw filters or { filters, label }
    const f = (filtersArg && filtersArg.filters) ? filtersArg.filters : (filtersArg || filters)
    const macro = f.macrosectors.length === 1
      ? (MACROSECTOR_LABELS[f.macrosectors[0]] ?? f.macrosectors[0])
      : 'Global'
    const modality = f.modalities.length === 1
      ? (MODALITY_LABELS[f.modalities[0]] ?? f.modalities[0])
      : 'Todas'
    const country = (() => {
      if (f.countries.length === 1) return f.countries[0]
      if (f.countries.length > 1) {
        const [first, ...rest] = f.countries
        return `${first}+${rest.length}`
      }
      return 'Global'
    })()
    const mdb = (Array.isArray(f.mdbs) && f.mdbs.length === 1) ? f.mdbs[0] : null
    // Default compact label; allow override via filtersArg.label
    const base = `${country} · ${macro} · ${modality}`
    const computedLabel = mdb ? `${mdb} · ${base}` : base
    const yearsSuffix = `${f.yearFrom}\u2013${f.yearTo}`
    const defaultLabel = `${computedLabel} · ${yearsSuffix}`

    // Deep-clone filters to freeze state at add time
    const frozenFilters = {
      macrosectors: [...(f.macrosectors || [])],
      modalities: [...(f.modalities || [])],
      countries: [...(f.countries || [])],
      mdbs: [...(f.mdbs || [])],
      ticketMin: f.ticketMin,
      ticketMax: f.ticketMax,
      yearFrom: f.yearFrom,
      yearTo: f.yearTo,
      onlyExited: f.onlyExited,
      fromFirstDisbursement: f.fromFirstDisbursement,
    }

    const label = (filtersArg && filtersArg.label) ? filtersArg.label : defaultLabel
    const item = {
      id: Date.now().toString(),
      label,
      // Persist the filter state including the time interval at add time
      filters: frozenFilters,
    }
    setCompareItems(prev => [...prev, item])
  }

  function removeCompare(id) {
    setCompareItems(prev => prev.filter(i => i.id !== id))
  }

  function clearCompare() {
    setCompareItems([])
  }

  function combineSelected(ids) {
    const picks = compareItems.filter(i => ids.includes(i.id))
    if (picks.length < 2) return
    // Union countries; macrosector rule: if all have the same single macrosector -> keep it, else Global
    const countriesUnion = Array.from(new Set(picks.flatMap(p => p.filters?.countries || [])))
    const mdbsUnion = Array.from(new Set(picks.flatMap(p => p.filters?.mdbs || [])))
    const macroIds = Array.from(new Set(picks.map(p => (p.filters?.macrosectors?.length===1 ? p.filters.macrosectors[0] : 'GLOBAL'))))
    const macroCombined = (macroIds.length===1 && macroIds[0] !== 'GLOBAL') ? [macroIds[0]] : [11,22,33,44,55,66]
    const yearFrom = Math.min(...picks.map(p => p.filters?.yearFrom ?? 2010))
    const yearTo = Math.max(...picks.map(p => p.filters?.yearTo ?? 2024))
    const ticketMin = Math.min(...picks.map(p => p.filters?.ticketMin ?? 0))
    const ticketMax = Math.max(...picks.map(p => p.filters?.ticketMax ?? 1_000_000_000))
    const modalities = [111] // fijo por ahora

    const combinedFilters = {
      macrosectors: macroCombined,
      modalities,
      countries: countriesUnion,
      mdbs: mdbsUnion,
      ticketMin,
      ticketMax,
      yearFrom,
      yearTo,
      onlyExited: true,
      fromFirstDisbursement: picks.every(p => p.filters?.fromFirstDisbursement),
    }
    // Build compact combined label: "MDB · AR+BO+BR+2 · Macro · Modality"
    const mdbPart = (mdbsUnion.length === 1)
      ? mdbsUnion[0]
      : (mdbsUnion.length > 1 ? `${mdbsUnion[0]}+${mdbsUnion.length-1}` : 'Global')
    const countriesPart = (countriesUnion.length <= 1)
      ? (countriesUnion[0] || 'Global')
      : (() => {
          const shown = countriesUnion.slice(0, 3)
          const rest = countriesUnion.length - shown.length
          return rest > 0 ? `${shown.join('+')}+${rest}` : shown.join('+')
        })()
    const macroPart = (macroCombined.length === 1)
      ? (MACROSECTOR_LABELS[macroCombined[0]] || 'Global')
      : 'Global'
    const modalityPart = (modalities.length === 1)
      ? (MODALITY_LABELS[modalities[0]] || 'Todas')
      : 'Todas'
    const label = `${mdbPart} · ${countriesPart} · ${macroPart} · ${modalityPart} · ${yearFrom}\u2013${yearTo}`
    addCurrentAsCompare({ filters: combinedFilters, label })
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Curvas de Desembolso</h1>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <Suspense fallback={<div>Cargando filtros...</div>}>
            <FiltersPanel
              filters={filters}
              onChange={setFilters}
              onAddCompare={addCurrentAsCompare}
              canAdd={compareItems.length < 7}
              onClearCompare={clearCompare}
              compareItems={compareItems}
              onRemoveCompare={removeCompare}
              showActivePoints={showActivePoints}
              onToggleActivePoints={setShowActivePoints}
              showPointCloud={showPointCloud}
              onTogglePointCloud={setShowPointCloud}
              onCombine={combineSelected}
            />
          </Suspense>
        </aside>
        <main className="content">
          <Suspense fallback={<div>Cargando curvas...</div>}>
            <CurveWorkbench
              filters={filters}
              compareItems={compareItems}
              showActivePoints={showActivePoints}
              showPointCloud={showPointCloud}
              hideMainCurve={hideMainCurve}
            />
          </Suspense>
        </main>
      </div>
    </div>
  )
}


